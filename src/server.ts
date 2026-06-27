import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import express, { type RequestHandler } from "express";
import {
  JSON_SHARE_RECORD_VERSION,
  ProtocolError,
  type JsonShareInput,
  type PublicJsonShareSnapshot,
  validateJsonShareId,
  validateJsonShareInput,
} from "./protocol.js";
import { FileJsonShareStore } from "./storage/file-store.js";

type ServerOptions = {
  allowedOrigins?: string[];
  dataDir?: string;
  maxPayloadBytes?: number;
  port?: number;
  rateLimitPerMinute?: number;
};

type RateLimiter = {
  assertAllowed: (key: string) => void;
};

const defaultPort = 3004;
const defaultMaxPayloadBytes = 1024 * 1024;
const defaultRateLimitPerMinute = 120;
const serviceVersion = readPackageVersion();

export function createTabulaJsonServer(options: ServerOptions = {}) {
  const port = options.port ?? numberFromEnv("PORT", defaultPort);
  const dataDir = options.dataDir ?? process.env.TABULA_JSON_DATA_DIR ?? path.join(process.cwd(), ".tabula-json", "data");
  const allowedOrigins = options.allowedOrigins ?? parseAllowedOrigins(process.env.TABULA_JSON_ALLOWED_ORIGINS);
  const maxPayloadBytes =
    options.maxPayloadBytes ?? numberFromEnv("TABULA_JSON_MAX_PAYLOAD_BYTES", defaultMaxPayloadBytes);
  const rateLimitPerMinute =
    options.rateLimitPerMinute ?? numberFromEnv("TABULA_JSON_RATE_LIMIT_PER_MINUTE", defaultRateLimitPerMinute);

  const store = new FileJsonShareStore(dataDir);
  const app = express();
  const server = http.createServer(app);
  const rateLimiter = createRateLimiter({ limit: rateLimitPerMinute });

  app.use(applyCors(allowedOrigins));
  app.use(express.json({ limit: `${maxPayloadBytes}b` }));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "tabula-json",
      version: serviceVersion,
    });
  });

  app.post("/v1/json", async (request, response, next) => {
    try {
      rateLimiter.assertAllowed(`json-share-write:${request.ip}`);
      const input = validateJsonShareInput(request.body, { maxPayloadBytes });
      const jsonId = await generateUniqueJsonShareId(store);
      const timestamp = new Date().toISOString();
      const snapshot = buildPublicJsonShareSnapshot({
        input,
        jsonId,
        createdAt: timestamp,
      });

      await store.writeJsonShare(snapshot);

      response.status(201).json({
        jsonId,
        createdAt: snapshot.createdAt,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/json/:jsonId", async (request, response, next) => {
    try {
      const jsonId = validateJsonShareId(request.params.jsonId);
      const snapshot = await store.getJsonShare(jsonId);
      if (!snapshot) {
        response.status(404).json({ error: "JSON share not found" });
        return;
      }
      response.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof ProtocolError) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof RateLimitError) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (isRequestBodyTooLarge(error)) {
      response.status(413).json({ error: "Request body is too large" });
      return;
    }
    if (isJsonParseError(error)) {
      response.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    response.status(500).json({ error: "Internal server error" });
  });

  return {
    app,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    listen: () =>
      new Promise<void>((resolve) => {
        server.listen(port, () => resolve());
      }),
    port,
    server,
  };
}

async function generateUniqueJsonShareId(store: FileJsonShareStore) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const jsonId = crypto.randomBytes(16).toString("base64url");
    if (!(await store.getJsonShare(jsonId))) {
      return jsonId;
    }
  }
  throw new Error("Unable to allocate JSON share id");
}

function buildPublicJsonShareSnapshot({
  input,
  jsonId,
  createdAt,
}: {
  input: JsonShareInput;
  jsonId: string;
  createdAt: string;
}): PublicJsonShareSnapshot {
  return {
    v: JSON_SHARE_RECORD_VERSION,
    jsonId,
    createdAt,
    encryptedData: input.encryptedData,
    iv: input.iv,
  };
}

function applyCors(allowedOrigins: string[]): RequestHandler {
  const allowedOriginSet = new Set(allowedOrigins);
  return (request, response, next) => {
    const origin = request.headers.origin;
    if (origin && isAllowedOrigin(origin, allowedOriginSet)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Headers", "content-type");
      response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    }
    if (request.method === "OPTIONS") {
      response.status(origin && !isAllowedOrigin(origin, allowedOriginSet) ? 403 : 204).end();
      return;
    }
    if (origin && !isAllowedOrigin(origin, allowedOriginSet)) {
      response.status(403).json({ error: "Origin is not allowed" });
      return;
    }
    next();
  };
}

function isAllowedOrigin(origin: string, allowedOriginSet: Set<string>) {
  if (allowedOriginSet.size === 0) {
    return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
  }
  return allowedOriginSet.has(origin);
}

function parseAllowedOrigins(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

class RateLimitError extends Error {
  readonly statusCode = 429;

  constructor() {
    super("Too many requests");
    this.name = "RateLimitError";
  }
}

function createRateLimiter({ limit }: { limit: number }): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    assertAllowed(key) {
      if (limit <= 0) {
        return;
      }
      const now = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + 60_000 });
        return;
      }
      if (bucket.count >= limit) {
        throw new RateLimitError();
      }
      bucket.count += 1;
    },
  };
}

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isRequestBodyTooLarge(error: unknown) {
  return Boolean(error && typeof error === "object" && "type" in error && error.type === "entity.too.large");
}

function isJsonParseError(error: unknown) {
  return Boolean(error && typeof error === "object" && "type" in error && error.type === "entity.parse.failed");
}

function readPackageVersion() {
  let directory = new URL(".", import.meta.url).pathname;
  for (let depth = 0; depth < 6; depth += 1) {
    const packagePath = path.join(directory, "package.json");
    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { version?: unknown };
      if (typeof packageJson.version === "string" && packageJson.version.length > 0) {
        return packageJson.version;
      }
    }
    directory = path.dirname(directory);
  }
  return "0.0.0";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function registerShutdown(instance: Pick<ReturnType<typeof createTabulaJsonServer>, "close">) {
  const stop = (signal: NodeJS.Signals) => {
    instance
      .close()
      .catch((error) => {
        console.error(`Failed to stop Tabula JSON after ${signal}: ${errorMessage(error)}`);
      })
      .finally(() => process.exit(0));
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const instance = createTabulaJsonServer();
  await instance.listen();
  registerShutdown(instance);
  console.log(`Tabula JSON listening on http://localhost:${instance.port}`);
}

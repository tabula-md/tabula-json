import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import express, { type RequestHandler } from "express";
import {
  defaultMaxPayloadBytes,
  jsonShareApiPrefix,
  jsonShareCacheControl,
  jsonShareContentType,
  jsonSharePostPath,
  ProtocolError,
  validateJsonShareId,
  validateJsonShareBlob,
} from "./protocol.js";
import { servicePageHtml } from "./service-page.js";
import { FileJsonShareStore } from "./storage/file-store.js";
import { R2JsonShareStore } from "./storage/r2-store.js";
import type { JsonShareStore } from "./storage/store.js";

type ServerOptions = {
  allowedOrigins?: string[];
  dataDir?: string;
  maxPayloadBytes?: number;
  port?: number;
};

const defaultPort = 3004;
const serviceVersion = readPackageVersion();

export function createTabulaJsonServer(options: ServerOptions = {}) {
  const port = options.port ?? numberFromEnv("PORT", defaultPort);
  const dataDir = options.dataDir ?? process.env.TABULA_JSON_DATA_DIR ?? path.join(process.cwd(), ".tabula-json", "data");
  const allowedOrigins = options.allowedOrigins ?? parseAllowedOrigins(process.env.TABULA_JSON_ALLOWED_ORIGINS);
  const maxPayloadBytes =
    options.maxPayloadBytes ?? numberFromEnv("TABULA_JSON_MAX_PAYLOAD_BYTES", defaultMaxPayloadBytes);

  const store = createJsonShareStore({ dataDir });
  const app = express();
  const server = http.createServer(app);
  app.enable("strict routing");

  app.get("/", applyOpenCors(), (_request, response) => {
    response.status(200).type("html").send(servicePageHtml());
  });

  app.get("/health", applyOpenCors(), (_request, response) => {
    response.json({
      ok: true,
      service: "tabula-json",
      version: serviceVersion,
    });
  });

  app.options(jsonSharePostPath, applyWriteCors(allowedOrigins));
  app.post(
    jsonSharePostPath,
    applyWriteCors(allowedOrigins),
    express.raw({ limit: `${maxPayloadBytes}b`, type: "*/*" }),
    async (request, response, next) => {
      try {
        if (!request.is(jsonShareContentType)) {
          throw new ProtocolError(415, `JSON share payload must be ${jsonShareContentType}`);
        }
        const snapshot = validateJsonShareBlob(request.body, { maxPayloadBytes });
        const jsonId = await generateUniqueJsonShareId(store);
        const timestamp = new Date().toISOString();

        await store.writeJsonShare(jsonId, snapshot);

        response.status(201).json({
          id: jsonId,
          data: `${getRequestOrigin(request)}${jsonShareApiPrefix}${jsonId}`,
          createdAt: timestamp,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(`${jsonShareApiPrefix}:jsonId`, applyOpenCors(), async (request, response, next) => {
    try {
      const jsonId = validateJsonShareId(request.params.jsonId);
      const snapshot = await store.getJsonShare(jsonId);
      if (!snapshot) {
        response.status(404).json({ error: "JSON share not found" });
        return;
      }
      response
        .status(200)
        .setHeader("Cache-Control", jsonShareCacheControl)
        .setHeader("X-Content-Type-Options", "nosniff")
        .type(jsonShareContentType)
        .send(snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof ProtocolError) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (isRequestBodyTooLarge(error)) {
      response.status(413).json({ error: "Request body is too large" });
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

async function generateUniqueJsonShareId(store: JsonShareStore) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const jsonId = crypto.randomBytes(16).toString("base64url");
    if (!(await store.getJsonShare(jsonId))) {
      return jsonId;
    }
  }
  throw new Error("Unable to allocate JSON share id");
}

function createJsonShareStore({ dataDir }: { dataDir: string }): JsonShareStore {
  const configuredDriver = process.env.TABULA_JSON_STORAGE_DRIVER?.trim().toLowerCase();
  if (!configuredDriver && process.env.NODE_ENV === "production") {
    throw new Error("TABULA_JSON_STORAGE_DRIVER is required in production.");
  }
  const storageDriver = configuredDriver || "file";

  if (storageDriver === "file") {
    return new FileJsonShareStore(dataDir);
  }

  if (storageDriver === "r2") {
    return new R2JsonShareStore({
      accessKeyId: requiredEnv("TABULA_JSON_R2_ACCESS_KEY_ID"),
      accountId: process.env.TABULA_JSON_R2_ACCOUNT_ID,
      bucket: requiredEnv("TABULA_JSON_R2_BUCKET"),
      endpoint: process.env.TABULA_JSON_R2_ENDPOINT,
      prefix: process.env.TABULA_JSON_R2_PREFIX,
      secretAccessKey: requiredEnv("TABULA_JSON_R2_SECRET_ACCESS_KEY"),
    });
  }

  throw new Error(`Unsupported TABULA_JSON_STORAGE_DRIVER: ${storageDriver}`);
}

function getRequestOrigin(request: express.Request) {
  const protocol = request.get("x-forwarded-proto")?.split(",")[0]?.trim() || request.protocol;
  return `${protocol}://${request.get("host")}`;
}

function applyOpenCors(): RequestHandler {
  return (request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "content-type");
    if (request.method === "OPTIONS") {
      response.status(204).end();
      return;
    }
    next();
  };
}

function applyWriteCors(allowedOrigins: string[]): RequestHandler {
  const allowedOriginSet = new Set(allowedOrigins);
  return (request, response, next) => {
    const origin = request.headers.origin;
    if (origin && isAllowedOrigin(origin, allowedOriginSet)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Headers", "content-type");
      response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
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

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
  return parsed;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function isRequestBodyTooLarge(error: unknown) {
  return Boolean(error && typeof error === "object" && "type" in error && error.type === "entity.too.large");
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

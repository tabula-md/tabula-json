/// <reference types="@cloudflare/workers-types" />

import {
  defaultMaxPayloadBytes,
  jsonShareApiPrefix,
  jsonShareCacheControl,
  jsonShareContentType,
  jsonSharePostPath,
  ProtocolError,
  validateJsonShareBytes,
  validateJsonShareId,
} from "./protocol.js";
import { servicePageHtml } from "./service-page.js";

const htmlResponseHeaders = {
  "access-control-allow-origin": "*",
  "content-type": "text/html; charset=utf-8",
  "x-content-type-options": "nosniff",
};

const jsonResponseHeaders = {
  "access-control-allow-origin": "*",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof ProtocolError) {
        return jsonError(error.statusCode, error.message);
      }
      console.error(JSON.stringify({ event: "tabula-json.error", message: errorMessage(error) }));
      return jsonError(500, "Internal server error");
    }
  },
} satisfies ExportedHandler<Env>;

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    return new Response(servicePageHtml(), {
      headers: htmlResponseHeaders,
      status: 200,
    });
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse(
      {
        ok: true,
        service: "tabula-json",
        version: env.TABULA_JSON_VERSION || "0.1.0",
      },
      200,
    );
  }

  if (url.pathname === jsonSharePostPath && request.method === "OPTIONS") {
    return writeCorsPreflight(request, env);
  }

  if (url.pathname === jsonSharePostPath && request.method === "POST") {
    return createSnapshot(request, env);
  }

  if (request.method === "GET" && url.pathname.startsWith(jsonShareApiPrefix)) {
    const rawId = url.pathname.slice(jsonShareApiPrefix.length);
    if (rawId.includes("/")) {
      return jsonError(404, "Not found");
    }
    return readSnapshot(rawId, env);
  }

  return jsonError(404, "Not found");
}

async function createSnapshot(request: Request, env: Env) {
  const writeCorsHeaders = getWriteCorsHeaders(request, env);
  if (!writeCorsHeaders) {
    return jsonError(403, "Origin is not allowed");
  }

  if (!isOctetStream(request.headers.get("content-type"))) {
    throw new ProtocolError(415, `JSON share payload must be ${jsonShareContentType}`);
  }

  const maxPayloadBytes = getMaxPayloadBytes(env);
  const snapshot = validateJsonShareBytes(await readRequestBytes(request, maxPayloadBytes), { maxPayloadBytes });
  const id = await generateUniqueJsonShareId(env);
  const objectKey = getObjectKey(id, env);

  await env.SNAPSHOTS.put(objectKey, snapshot, {
    httpMetadata: {
      cacheControl: jsonShareCacheControl,
      contentType: jsonShareContentType,
    },
  });

  console.info(JSON.stringify({ event: "tabula-json.write", bytes: snapshot.byteLength }));

  return jsonResponse(
    {
      id,
      data: `${new URL(request.url).origin}${jsonShareApiPrefix}${id}`,
      createdAt: new Date().toISOString(),
    },
    201,
    writeCorsHeaders,
  );
}

async function readSnapshot(rawId: string, env: Env) {
  const id = validateJsonShareId(rawId);
  const object = await env.SNAPSHOTS.get(getObjectKey(id, env));
  if (!object) {
    return jsonError(404, "JSON share not found");
  }
  if (!object.body) {
    console.error(JSON.stringify({ event: "tabula-json.empty-r2-body" }));
    return jsonError(500, "Internal server error");
  }

  return new Response(object.body, {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": jsonShareCacheControl,
      "content-type": jsonShareContentType,
      "x-content-type-options": "nosniff",
    },
    status: 200,
  });
}

async function readRequestBytes(request: Request, maxPayloadBytes: number) {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsedContentLength = Number(contentLength);
    if (Number.isFinite(parsedContentLength) && parsedContentLength > maxPayloadBytes) {
      throw new ProtocolError(413, "JSON share payload is too large");
    }
  }

  if (!request.body) {
    throw new ProtocolError(400, "JSON share payload is empty");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > maxPayloadBytes) {
      throw new ProtocolError(413, "JSON share payload is too large");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function generateUniqueJsonShareId(env: Env) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = generateJsonShareId();
    if (!(await env.SNAPSHOTS.head(getObjectKey(id, env)))) {
      return id;
    }
  }
  throw new Error("Unable to allocate JSON share id");
}

function generateJsonShareId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getObjectKey(id: string, env: Env) {
  return `${normalizeObjectPrefix(env.TABULA_JSON_R2_PREFIX || "json/")}${id}.bin`;
}

function normalizeObjectPrefix(prefix: string) {
  const trimmedPrefix = prefix.trim().replace(/^\/+/, "");
  if (!trimmedPrefix) {
    return "";
  }
  return trimmedPrefix.endsWith("/") ? trimmedPrefix : `${trimmedPrefix}/`;
}

function getMaxPayloadBytes(env: Env) {
  const raw = env.TABULA_JSON_MAX_PAYLOAD_BYTES;
  if (!raw) {
    return defaultMaxPayloadBytes;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("TABULA_JSON_MAX_PAYLOAD_BYTES must be a non-negative number.");
  }
  return parsed;
}

function writeCorsPreflight(request: Request, env: Env) {
  const headers = getWriteCorsHeaders(request, env);
  if (!headers) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { headers, status: 204 });
}

function getWriteCorsHeaders(request: Request, env: Env): Record<string, string> | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    return {
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST,OPTIONS",
    };
  }
  if (!isAllowedOrigin(origin, parseAllowedOrigins(env.TABULA_JSON_ALLOWED_ORIGINS))) {
    return null;
  }
  return {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-origin": origin,
    vary: "Origin",
  };
}

function isAllowedOrigin(origin: string, allowedOrigins: string[]) {
  if (allowedOrigins.length === 0) {
    return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
  }
  return allowedOrigins.includes(origin);
}

function parseAllowedOrigins(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isOctetStream(contentType: string | null) {
  return contentType?.split(";")[0]?.trim().toLowerCase() === jsonShareContentType;
}

function jsonResponse(value: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    headers: {
      ...jsonResponseHeaders,
      ...headers,
    },
    status,
  });
}

function jsonError(status: number, message: string) {
  return jsonResponse({ error: message }, status);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

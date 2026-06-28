/// <reference types="@cloudflare/workers-types" />

import { describe, expect, it } from "vitest";
import worker from "../src/worker.js";

type StoredObject = {
  body: Uint8Array;
  httpMetadata?: R2HTTPMetadata;
};

type TestR2Object = {
  body: ReadableStream<Uint8Array> | null;
  httpMetadata?: R2HTTPMetadata;
};

type TestR2Bucket = {
  get: (key: string) => Promise<TestR2Object | null>;
  head: (key: string) => Promise<{ key: string } | null>;
  put: (
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
    options?: R2PutOptions,
  ) => Promise<null>;
};

type WorkerTestEnv = Omit<
  Env,
  | "SNAPSHOTS"
  | "TABULA_JSON_ALLOWED_ORIGINS"
  | "TABULA_JSON_MAX_PAYLOAD_BYTES"
  | "TABULA_JSON_R2_PREFIX"
  | "TABULA_JSON_VERSION"
> & {
  SNAPSHOTS: TestR2Bucket;
  TABULA_JSON_ALLOWED_ORIGINS?: string;
  TABULA_JSON_MAX_PAYLOAD_BYTES?: string;
  TABULA_JSON_R2_PREFIX?: string;
  TABULA_JSON_VERSION?: string;
};

function createEnv(overrides: Partial<WorkerTestEnv> = {}) {
  const objects = new Map<string, StoredObject>();
  const bucket = {
    async get(key: string) {
      const object = objects.get(key);
      if (!object) {
        return null;
      }
      return {
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(object.body);
            controller.close();
          },
        }),
        httpMetadata: object.httpMetadata,
      };
    },
    async head(key: string) {
      return objects.has(key) ? ({ key } as R2Object) : null;
    },
    async put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions) {
      const bytes =
        value instanceof Uint8Array
          ? value
          : value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : new Uint8Array(await new Response(value as BodyInit).arrayBuffer());
      const httpMetadata = options?.httpMetadata instanceof Headers ? undefined : options?.httpMetadata;
      objects.set(key, {
        body: bytes,
        httpMetadata,
      });
      return null;
    },
  };

  return {
    env: {
      SNAPSHOTS: bucket,
      TABULA_JSON_ALLOWED_ORIGINS: "https://tabula.md",
      TABULA_JSON_MAX_PAYLOAD_BYTES: "2097152",
      TABULA_JSON_R2_PREFIX: "json/",
      TABULA_JSON_VERSION: "0.1.0",
      ...overrides,
    } satisfies WorkerTestEnv,
    objects,
  };
}

function fetchWorker(request: Request, env: WorkerTestEnv) {
  return worker.fetch(request, env as Env);
}

describe("Tabula JSON Worker", () => {
  it("serves the public service page and health", async () => {
    const { env } = createEnv();
    const root = await fetchWorker(new Request("https://json.tabula.md/"), env);
    const health = await fetchWorker(new Request("https://json.tabula.md/health"), env);

    await expect(root.text()).resolves.toContain("Tabula JSON Store");
    await expect(health.json()).resolves.toMatchObject({ ok: true, service: "tabula-json" });
  });

  it("stores and reads opaque encrypted snapshots through /api/v1", async () => {
    const { env, objects } = createEnv();
    const encryptedBlob = new TextEncoder().encode("opaque encrypted snapshot");
    const createResponse = await fetchWorker(
      new Request("https://json.tabula.md/api/v1/post/", {
        body: encryptedBlob,
        headers: {
          "content-type": "application/octet-stream",
          origin: "https://tabula.md",
        },
        method: "POST",
      }),
      env,
    );

    expect(createResponse.status).toBe(201);
    expect(createResponse.headers.get("access-control-allow-origin")).toBe("https://tabula.md");
    const created = (await createResponse.json()) as { data: string; id: string };
    expect(created.id).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
    expect(created.data).toBe(`https://json.tabula.md/api/v1/${created.id}`);
    expect(objects.get(`json/${created.id}.bin`)?.httpMetadata).toMatchObject({
      cacheControl: "public, max-age=31536000, immutable",
      contentType: "application/octet-stream",
    });

    const readResponse = await fetchWorker(new Request(created.data), env);
    expect(readResponse.status).toBe(200);
    expect(readResponse.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(readResponse.headers.get("content-type")).toBe("application/octet-stream");
    expect(new Uint8Array(await readResponse.arrayBuffer())).toEqual(encryptedBlob);
  });

  it("does not log snapshot ids on writes or empty object bodies", async () => {
    const { env } = createEnv();
    const logs: string[] = [];
    const errors: string[] = [];
    const originalInfo = console.info;
    const originalError = console.error;
    console.info = (message?: unknown) => {
      logs.push(String(message));
    };
    console.error = (message?: unknown) => {
      errors.push(String(message));
    };

    try {
      const createResponse = await fetchWorker(
        new Request("https://json.tabula.md/api/v1/post/", {
          body: new Uint8Array([1, 2, 3]),
          headers: {
            "content-type": "application/octet-stream",
            origin: "https://tabula.md",
          },
          method: "POST",
        }),
        env,
      );
      const created = (await createResponse.json()) as { id: string };
      expect(logs.join("\n")).toContain("tabula-json.write");
      expect(logs.join("\n")).not.toContain(created.id);

      const brokenEnv = createEnv({
        SNAPSHOTS: {
          ...env.SNAPSHOTS,
          get: async () => ({ body: null }),
        },
      });
      const readResponse = await fetchWorker(new Request("https://json.tabula.md/api/v1/emptyBody1"), brokenEnv.env);
      expect(readResponse.status).toBe(500);
      expect(errors.join("\n")).toContain("tabula-json.empty-r2-body");
      expect(errors.join("\n")).not.toContain("emptyBody1");
    } finally {
      console.info = originalInfo;
      console.error = originalError;
    }
  });

  it("rejects disallowed origins before writing", async () => {
    const { env, objects } = createEnv();
    const response = await fetchWorker(
      new Request("https://json.tabula.md/api/v1/post/", {
        body: new Uint8Array([1, 2, 3]),
        headers: {
          "content-type": "application/octet-stream",
          origin: "https://evil.example",
        },
        method: "POST",
      }),
      env,
    );

    expect(response.status).toBe(403);
    expect(objects.size).toBe(0);
  });

  it("returns 404 for missing snapshots", async () => {
    const { env } = createEnv();
    const response = await fetchWorker(new Request("https://json.tabula.md/api/v1/missing123"), env);

    expect(response.status).toBe(404);
  });

  it("keeps the write route strict", async () => {
    const { env, objects } = createEnv();
    const missingTrailingSlash = await fetchWorker(
      new Request("https://json.tabula.md/api/v1/post", {
        body: new Uint8Array([1, 2, 3]),
        headers: {
          "content-type": "application/octet-stream",
          origin: "https://tabula.md",
        },
        method: "POST",
      }),
      env,
    );
    const readReservedPath = await fetchWorker(new Request("https://json.tabula.md/api/v1/post/"), env);

    expect(missingTrailingSlash.status).toBe(404);
    expect(readReservedPath.status).toBe(404);
    expect(objects.size).toBe(0);
  });

  it("rejects payloads over the configured limit", async () => {
    const { env } = createEnv({ TABULA_JSON_MAX_PAYLOAD_BYTES: "2" });
    const response = await fetchWorker(
      new Request("https://json.tabula.md/api/v1/post/", {
        body: new Uint8Array([1, 2, 3]),
        headers: {
          "content-type": "application/octet-stream",
          origin: "https://tabula.md",
        },
        method: "POST",
      }),
      env,
    );

    expect(response.status).toBe(413);
  });
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTabulaJsonServer } from "../src/server.js";

let temporaryDirectory = "";

beforeEach(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "tabula-json-test-"));
});

afterEach(async () => {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

describe("Tabula JSON server", () => {
  const encryptedBlob = Buffer.from("opaque encrypted snapshot", "utf8");

  it("serves a minimal public service page", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    await request(server.app)
      .get("/")
      .expect(200)
      .expect("access-control-allow-origin", "*")
      .expect((response) => {
        expect(response.text).toContain("Tabula JSON Store");
      });
  });

  it("reports health", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    await request(server.app)
      .get("/health")
      .expect(200)
      .expect("access-control-allow-origin", "*")
      .expect((response) => {
        expect(response.body).toMatchObject({ ok: true, service: "tabula-json" });
      });
  });

  it("stores and reads opaque encrypted snapshots", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    const createResponse = await request(server.app)
      .post("/api/v2/post/")
      .set("origin", "https://tabula.md")
      .set("content-type", "application/octet-stream")
      .send(encryptedBlob)
      .expect(200);

    expect(createResponse.body.id).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
    expect(createResponse.body.data).toMatch(new RegExp(`/api/v2/${createResponse.body.id}$`));
    expect(createResponse.body.createdAt).toBeUndefined();

    await request(server.app)
      .get(`/api/v2/${createResponse.body.id}`)
      .set("origin", "https://tabula.md")
      .buffer(true)
      .expect(200)
      .expect("content-type", /application\/octet-stream/)
      .expect("cache-control", "public, max-age=31536000, immutable")
      .expect("x-content-type-options", "nosniff")
      .expect((response) => {
        expect(response.body).toEqual(encryptedBlob);
      });
  });

  it("keeps /api/v1 as a compatibility alias", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    const createResponse = await request(server.app)
      .post("/api/v1/post/")
      .set("origin", "https://tabula.md")
      .set("content-type", "application/octet-stream")
      .send(encryptedBlob)
      .expect(201);

    expect(createResponse.body.data).toMatch(new RegExp(`/api/v1/${createResponse.body.id}$`));
    expect(createResponse.body.createdAt).toMatch(/Z$/);

    await request(server.app)
      .get(`/api/v1/${createResponse.body.id}`)
      .set("origin", "https://tabula.md")
      .buffer(true)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(encryptedBlob);
      });
    await request(server.app)
      .get(`/api/v2/${createResponse.body.id}`)
      .set("origin", "https://tabula.md")
      .buffer(true)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(encryptedBlob);
      });
  });

  it("rejects non-binary uploads", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    await request(server.app)
      .post("/api/v2/post/")
      .set("origin", "https://tabula.md")
      .send({ markdown: "# Secret" })
      .expect(415)
      .expect((response) => {
        expect(response.body.error).toBe("JSON share payload must be application/octet-stream");
      });
  });

  it("rejects empty uploads", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    await request(server.app)
      .post("/api/v2/post/")
      .set("origin", "https://tabula.md")
      .set("content-type", "application/octet-stream")
      .send(Buffer.alloc(0))
      .expect(400)
      .expect((response) => {
        expect(response.body.error).toBe("JSON share payload is empty");
      });
  });

  it("rejects disallowed origins", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    await request(server.app)
      .post("/api/v2/post/")
      .set("origin", "https://evil.example")
      .set("content-type", "application/octet-stream")
      .send(encryptedBlob)
      .expect(403);
  });

  it("allows public reads from any origin", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    const createResponse = await request(server.app)
      .post("/api/v2/post/")
      .set("origin", "https://tabula.md")
      .set("content-type", "application/octet-stream")
      .send(encryptedBlob)
      .expect(200);

    await request(server.app)
      .get(`/api/v2/${createResponse.body.id}`)
      .set("origin", "https://reader.example")
      .expect(200)
      .expect("access-control-allow-origin", "*");
  });

  it("rate limits repeated snapshot writes per client", async () => {
    const server = createTabulaJsonServer({
      dataDir: temporaryDirectory,
      allowedOrigins: ["https://tabula.md"],
      rateLimits: {
        writePerClientPerMinute: 1,
        globalWritePerMinute: 100,
      },
    });

    await request(server.app)
      .post("/api/v2/post/")
      .set("origin", "https://tabula.md")
      .set("x-forwarded-for", "203.0.113.10")
      .set("content-type", "application/octet-stream")
      .send(encryptedBlob)
      .expect(200);

    await request(server.app)
      .post("/api/v2/post/")
      .set("origin", "https://tabula.md")
      .set("x-forwarded-for", "203.0.113.10")
      .set("content-type", "application/octet-stream")
      .send(encryptedBlob)
      .expect(429)
      .expect((response) => {
        expect(response.body.error).toBe("Rate limit exceeded");
      });
  });

  it("rate limits public snapshot reads per client", async () => {
    const server = createTabulaJsonServer({
      dataDir: temporaryDirectory,
      allowedOrigins: ["https://tabula.md"],
      rateLimits: {
        readPerClientPerMinute: 1,
        globalReadPerMinute: 100,
      },
    });
    const createResponse = await request(server.app)
      .post("/api/v2/post/")
      .set("origin", "https://tabula.md")
      .set("content-type", "application/octet-stream")
      .send(encryptedBlob)
      .expect(200);

    await request(server.app)
      .get(`/api/v2/${createResponse.body.id}`)
      .set("x-forwarded-for", "203.0.113.20")
      .buffer(true)
      .expect(200);

    await request(server.app)
      .get(`/api/v2/${createResponse.body.id}`)
      .set("x-forwarded-for", "203.0.113.20")
      .expect(429);
  });

  it("applies global snapshot write limits across clients", async () => {
    const server = createTabulaJsonServer({
      dataDir: temporaryDirectory,
      allowedOrigins: ["https://tabula.md"],
      rateLimits: {
        writePerClientPerMinute: 100,
        globalWritePerMinute: 1,
      },
    });

    await request(server.app)
      .post("/api/v2/post/")
      .set("origin", "https://tabula.md")
      .set("x-forwarded-for", "203.0.113.30")
      .set("content-type", "application/octet-stream")
      .send(encryptedBlob)
      .expect(200);

    await request(server.app)
      .post("/api/v2/post/")
      .set("origin", "https://tabula.md")
      .set("x-forwarded-for", "203.0.113.31")
      .set("content-type", "application/octet-stream")
      .send(encryptedBlob)
      .expect(429);
  });

  it("allows localhost origins when no allowlist is configured", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: [] });
    await request(server.app)
      .post("/api/v2/post/")
      .set("origin", "http://localhost:5173")
      .set("content-type", "application/octet-stream")
      .send(encryptedBlob)
      .expect(200);
  });

  it("returns 404 for missing records", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    await request(server.app).get("/api/v2/missing123").set("origin", "https://tabula.md").expect(404);
  });

  it("keeps the write route strict", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    await request(server.app)
      .post("/api/v2/post")
      .set("origin", "https://tabula.md")
      .set("content-type", "application/octet-stream")
      .send(encryptedBlob)
      .expect(404);
    await request(server.app).get("/api/v2/post/").set("origin", "https://tabula.md").expect(404);
  });

  it("fails fast when numeric environment variables are invalid", () => {
    const originalValue = process.env.TABULA_JSON_MAX_PAYLOAD_BYTES;
    process.env.TABULA_JSON_MAX_PAYLOAD_BYTES = "not-a-number";

    try {
      expect(() =>
        createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] }),
      ).toThrow("TABULA_JSON_MAX_PAYLOAD_BYTES must be a non-negative number.");
    } finally {
      if (originalValue === undefined) {
        delete process.env.TABULA_JSON_MAX_PAYLOAD_BYTES;
      } else {
        process.env.TABULA_JSON_MAX_PAYLOAD_BYTES = originalValue;
      }
    }
  });

  it("fails fast when rate limit environment variables are invalid", () => {
    const originalValue = process.env.TABULA_JSON_WRITE_RATE_LIMIT_PER_MINUTE;
    process.env.TABULA_JSON_WRITE_RATE_LIMIT_PER_MINUTE = "not-a-number";

    try {
      expect(() =>
        createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] }),
      ).toThrow("TABULA_JSON_WRITE_RATE_LIMIT_PER_MINUTE must be a non-negative number.");
    } finally {
      if (originalValue === undefined) {
        delete process.env.TABULA_JSON_WRITE_RATE_LIMIT_PER_MINUTE;
      } else {
        process.env.TABULA_JSON_WRITE_RATE_LIMIT_PER_MINUTE = originalValue;
      }
    }
  });
});

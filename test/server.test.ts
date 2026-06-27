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
  it("reports health", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    await request(server.app)
      .get("/health")
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ ok: true, service: "tabula-json" });
      });
  });

  it("stores and reads encrypted JSON share records", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    const createResponse = await request(server.app)
      .post("/v1/json")
      .set("origin", "https://tabula.md")
      .send({ encryptedData: "ciphertext_123", iv: "iv_123" })
      .expect(201);

    expect(createResponse.body.jsonId).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
    expect(createResponse.body.createdAt).toMatch(/Z$/);

    await request(server.app)
      .get(`/v1/json/${createResponse.body.jsonId}`)
      .set("origin", "https://tabula.md")
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          v: 1,
          jsonId: createResponse.body.jsonId,
          createdAt: createResponse.body.createdAt,
          encryptedData: "ciphertext_123",
          iv: "iv_123",
        });
      });
  });

  it("rejects plaintext fields", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    await request(server.app)
      .post("/v1/json")
      .set("origin", "https://tabula.md")
      .send({ encryptedData: "ciphertext_123", iv: "iv_123", markdown: "# Secret" })
      .expect(400)
      .expect((response) => {
        expect(response.body.error).toBe("JSON share payload must not include markdown");
      });
  });

  it("rejects disallowed origins", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    await request(server.app)
      .post("/v1/json")
      .set("origin", "https://evil.example")
      .send({ encryptedData: "ciphertext_123", iv: "iv_123" })
      .expect(403);
  });

  it("allows localhost origins when no allowlist is configured", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: [] });
    await request(server.app)
      .post("/v1/json")
      .set("origin", "http://localhost:5173")
      .send({ encryptedData: "ciphertext_123", iv: "iv_123" })
      .expect(201);
  });

  it("returns 404 for missing records", async () => {
    const server = createTabulaJsonServer({ dataDir: temporaryDirectory, allowedOrigins: ["https://tabula.md"] });
    await request(server.app).get("/v1/json/missing123").set("origin", "https://tabula.md").expect(404);
  });
});

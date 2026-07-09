import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileJsonShareStore } from "../src/storage/file-store.js";
import { deleteExpiredJsonShares, isJsonShareExpired, jsonShareExpiresAt } from "../src/storage/retention.js";

let temporaryDirectory = "";

beforeEach(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "tabula-json-retention-test-"));
});

afterEach(async () => {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

describe("JSON share retention", () => {
  it("computes expiration from the configured retention window", () => {
    const createdAt = new Date("2026-07-01T00:00:00.000Z");

    expect(jsonShareExpiresAt(createdAt, 7).toISOString()).toBe("2026-07-08T00:00:00.000Z");
    expect(isJsonShareExpired(createdAt, 7, new Date("2026-07-07T23:59:59.999Z"))).toBe(false);
    expect(isJsonShareExpired(createdAt, 7, new Date("2026-07-08T00:00:00.000Z"))).toBe(true);
  });

  it("deletes only expired snapshots from a supported store", async () => {
    const store = new FileJsonShareStore(temporaryDirectory);
    await store.writeJsonShare("expired1", Buffer.from("expired"));
    await store.writeJsonShare("fresh123", Buffer.from("fresh"));

    const expiredPath = path.join(temporaryDirectory, "json", "expired1", "snapshot.bin");
    const expiredAt = new Date("2026-07-01T00:00:00.000Z");
    await fs.utimes(expiredPath, expiredAt, expiredAt);

    const result = await deleteExpiredJsonShares(store, 7, new Date("2026-07-09T00:00:00.000Z"));

    expect(result).toEqual({
      checked: 2,
      deleted: 1,
      failed: 0,
      supported: true,
    });
    await expect(store.getJsonShare("expired1")).resolves.toBeNull();
    await expect(store.getJsonShare("fresh123")).resolves.toEqual(Buffer.from("fresh"));
  });

  it("reports unsupported stores without pretending cleanup ran", async () => {
    const result = await deleteExpiredJsonShares(
      {
        getJsonShare: async () => null,
        writeJsonShare: async () => undefined,
      },
      7,
    );

    expect(result).toEqual({
      checked: 0,
      deleted: 0,
      failed: 0,
      supported: false,
    });
  });
});

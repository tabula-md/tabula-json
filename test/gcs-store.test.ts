import { describe, expect, it } from "vitest";
import { GcsJsonShareStore } from "../src/storage/gcs-store.js";

type SavedObject = {
  body: Buffer;
  options: unknown;
  timeCreated: string;
};

function createTestClient() {
  const objects = new Map<string, SavedObject>();
  const client = {
    bucket(bucketName: string) {
      return {
        file(name: string) {
          const key = `${bucketName}/${name}`;
          return {
            async download() {
              const object = objects.get(key);
              if (!object) {
                const error = new Error("missing") as Error & { code: number };
                error.code = 404;
                throw error;
              }
              return [object.body] as [Buffer];
            },
            async delete() {
              objects.delete(key);
            },
            async exists() {
              return [objects.has(key)] as [boolean];
            },
            async getMetadata() {
              const object = objects.get(key);
              if (!object) {
                const error = new Error("missing") as Error & { code: number };
                error.code = 404;
                throw error;
              }
              return [{ timeCreated: object.timeCreated }, {}] as [{ timeCreated: string }, unknown];
            },
            async save(data: Buffer, options: unknown) {
              objects.set(key, { body: data, options, timeCreated: new Date().toISOString() });
            },
          };
        },
        async getFiles({ prefix }: { prefix: string }) {
          return [
            Array.from(objects.entries())
              .filter(([key]) => key.startsWith(`${bucketName}/${prefix}`))
              .map(([key]) => {
                const name = key.slice(`${bucketName}/`.length);
                const file = this.file(name);
                return { ...file, name };
              }),
          ] as [Array<ReturnType<typeof this.file> & { name: string }>];
        },
      };
    },
  };

  return { client, objects };
}

describe("GcsJsonShareStore", () => {
  it("writes encrypted snapshots as opaque objects with stable storage metadata", async () => {
    const { client, objects } = createTestClient();
    const store = new GcsJsonShareStore({
      bucket: "example-snapshot-bucket",
      client,
      prefix: "shares",
    });
    const body = Buffer.from("encrypted bytes");

    await store.writeJsonShare("abc12345", body);

    expect(objects.get("example-snapshot-bucket/shares/abc12345.bin")).toMatchObject({
      body,
      options: {
        metadata: {
          cacheControl: "public, max-age=3600",
          contentType: "application/octet-stream",
        },
        resumable: false,
        validation: "crc32c",
      },
    });
  });

  it("reads encrypted snapshots from the configured prefix", async () => {
    const { client } = createTestClient();
    const store = new GcsJsonShareStore({
      bucket: "example-snapshot-bucket",
      client,
      prefix: "/snapshots/",
    });
    await store.writeJsonShare("abc12345", Buffer.from([1, 2, 3]));

    await expect(store.getJsonShare("abc12345")).resolves.toEqual(Buffer.from([1, 2, 3]));
    await expect(store.getJsonShareMetadata?.("abc12345")).resolves.toMatchObject({ createdAt: expect.any(Date) });
    await expect(store.hasJsonShare?.("abc12345")).resolves.toBe(true);
  });

  it("returns null when Google Cloud Storage reports a missing object", async () => {
    const { client } = createTestClient();
    const store = new GcsJsonShareStore({
      bucket: "example-snapshot-bucket",
      client,
    });

    await expect(store.getJsonShare("abc12345")).resolves.toBeNull();
    await expect(store.getJsonShareMetadata?.("abc12345")).resolves.toBeNull();
    await expect(store.hasJsonShare?.("abc12345")).resolves.toBe(false);
  });

  it("lists and deletes encrypted snapshots from the configured prefix", async () => {
    const { client, objects } = createTestClient();
    const store = new GcsJsonShareStore({
      bucket: "example-snapshot-bucket",
      client,
      prefix: "shares",
    });
    await store.writeJsonShare("abc12345", Buffer.from("one"));
    await store.writeJsonShare("def67890", Buffer.from("two"));
    objects.set("example-snapshot-bucket/shares/not-a-json-id.txt", {
      body: Buffer.from("ignored"),
      options: {},
      timeCreated: new Date().toISOString(),
    });

    await expect(store.listJsonShares?.()).resolves.toEqual(
      expect.arrayContaining([
        { jsonId: "abc12345", createdAt: expect.any(Date) },
        { jsonId: "def67890", createdAt: expect.any(Date) },
      ]),
    );

    await store.deleteJsonShare?.("abc12345");

    expect(objects.has("example-snapshot-bucket/shares/abc12345.bin")).toBe(false);
    expect(objects.has("example-snapshot-bucket/shares/def67890.bin")).toBe(true);
  });
});

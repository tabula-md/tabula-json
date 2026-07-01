import { describe, expect, it } from "vitest";
import { GcsJsonShareStore } from "../src/storage/gcs-store.js";

type SavedObject = {
  body: Buffer;
  options: unknown;
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
            async exists() {
              return [objects.has(key)] as [boolean];
            },
            async save(data: Buffer, options: unknown) {
              objects.set(key, { body: data, options });
            },
          };
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
      bucket: "tabula-json-prod",
      client,
      prefix: "shares",
    });
    const body = Buffer.from("encrypted bytes");

    await store.writeJsonShare("abc12345", body);

    expect(objects.get("tabula-json-prod/shares/abc12345.bin")).toMatchObject({
      body,
      options: {
        metadata: {
          cacheControl: "public, max-age=31536000, immutable",
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
      bucket: "tabula-json-prod",
      client,
      prefix: "/snapshots/",
    });
    await store.writeJsonShare("abc12345", Buffer.from([1, 2, 3]));

    await expect(store.getJsonShare("abc12345")).resolves.toEqual(Buffer.from([1, 2, 3]));
    await expect(store.hasJsonShare?.("abc12345")).resolves.toBe(true);
  });

  it("returns null when Google Cloud Storage reports a missing object", async () => {
    const { client } = createTestClient();
    const store = new GcsJsonShareStore({
      bucket: "tabula-json-prod",
      client,
    });

    await expect(store.getJsonShare("abc12345")).resolves.toBeNull();
    await expect(store.hasJsonShare?.("abc12345")).resolves.toBe(false);
  });
});

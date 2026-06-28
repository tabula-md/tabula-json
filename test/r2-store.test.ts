import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { R2JsonShareStore } from "../src/storage/r2-store.js";

describe("R2JsonShareStore", () => {
  it("writes encrypted snapshots as opaque objects with stable storage metadata", async () => {
    const commands: Array<GetObjectCommand | PutObjectCommand> = [];
    const store = new R2JsonShareStore({
      accessKeyId: "access",
      bucket: "tabula-json",
      client: {
        send: async (command) => {
          commands.push(command);
          return {};
        },
      },
      endpoint: "https://example.r2.cloudflarestorage.com",
      prefix: "shares",
      secretAccessKey: "secret",
    });
    const body = Buffer.from("encrypted bytes");

    await store.writeJsonShare("abc12345", body);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(PutObjectCommand);
    expect(commands[0].input).toMatchObject({
      Bucket: "tabula-json",
      CacheControl: "public, max-age=31536000, immutable",
      ContentType: "application/octet-stream",
      Key: "shares/abc12345.bin",
    });
    expect((commands[0] as PutObjectCommand).input.Body).toEqual(body);
  });

  it("reads encrypted snapshots from the configured prefix", async () => {
    const commands: Array<GetObjectCommand | PutObjectCommand> = [];
    const store = new R2JsonShareStore({
      accessKeyId: "access",
      bucket: "tabula-json",
      client: {
        send: async (command) => {
          commands.push(command);
          return { Body: new Uint8Array([1, 2, 3]) };
        },
      },
      endpoint: "https://example.r2.cloudflarestorage.com",
      prefix: "/snapshots/",
      secretAccessKey: "secret",
    });

    await expect(store.getJsonShare("abc12345")).resolves.toEqual(Buffer.from([1, 2, 3]));
    expect(commands[0]).toBeInstanceOf(GetObjectCommand);
    expect(commands[0].input).toMatchObject({
      Bucket: "tabula-json",
      Key: "snapshots/abc12345.bin",
    });
  });

  it("returns null when R2 reports a missing object", async () => {
    const store = new R2JsonShareStore({
      accessKeyId: "access",
      bucket: "tabula-json",
      client: {
        send: async () => {
          const error = new Error("missing") as Error & { name: string };
          error.name = "NoSuchKey";
          throw error;
        },
      },
      endpoint: "https://example.r2.cloudflarestorage.com",
      secretAccessKey: "secret",
    });

    await expect(store.getJsonShare("abc12345")).resolves.toBeNull();
  });

  it("requires an account id when no explicit endpoint is configured", () => {
    expect(
      () =>
        new R2JsonShareStore({
          accessKeyId: "access",
          bucket: "tabula-json",
          secretAccessKey: "secret",
        }),
    ).toThrow("TABULA_JSON_R2_ACCOUNT_ID is required when R2 storage is enabled.");
  });
});

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { validateJsonShareId } from "../protocol.js";
import type { JsonShareStore } from "./store.js";

type R2Client = {
  send: (command: GetObjectCommand | PutObjectCommand) => Promise<unknown>;
};

export type R2JsonShareStoreOptions = {
  accessKeyId: string;
  accountId?: string;
  bucket: string;
  client?: R2Client;
  endpoint?: string;
  prefix?: string;
  secretAccessKey: string;
};

export class R2JsonShareStore implements JsonShareStore {
  private readonly client: R2Client;
  private readonly objectPrefix: string;

  constructor(private readonly options: R2JsonShareStoreOptions) {
    const endpoint = options.endpoint ?? getR2Endpoint(options.accountId);
    this.objectPrefix = normalizeObjectPrefix(options.prefix ?? "json/");
    this.client = options.client ?? new S3Client({
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      endpoint,
      forcePathStyle: true,
      region: "auto",
    });
  }

  async getJsonShare(jsonIdInput: string): Promise<Buffer | null> {
    const jsonId = validateJsonShareId(jsonIdInput);

    try {
      const response = (await this.client.send(
        new GetObjectCommand({
          Bucket: this.options.bucket,
          Key: this.getObjectKey(jsonId),
        }),
      )) as { Body?: unknown };
      return await bodyToBuffer(response.Body);
    } catch (error) {
      if (isObjectNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async writeJsonShare(jsonIdInput: string, snapshot: Buffer) {
    const jsonId = validateJsonShareId(jsonIdInput);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        CacheControl: "public, max-age=31536000, immutable",
        ContentType: "application/octet-stream",
        Key: this.getObjectKey(jsonId),
        Body: snapshot,
      }),
    );
  }

  private getObjectKey(jsonId: string) {
    return `${this.objectPrefix}${jsonId}.bin`;
  }
}

function getR2Endpoint(accountId?: string) {
  if (!accountId) {
    throw new Error("TABULA_JSON_R2_ACCOUNT_ID is required when R2 storage is enabled.");
  }
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function normalizeObjectPrefix(prefix: string) {
  const trimmedPrefix = prefix.trim().replace(/^\/+/, "");
  if (!trimmedPrefix) {
    return "";
  }
  return trimmedPrefix.endsWith("/") ? trimmedPrefix : `${trimmedPrefix}/`;
}

async function bodyToBuffer(body: unknown) {
  if (!body) {
    return Buffer.alloc(0);
  }

  const transformable = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof transformable.transformToByteArray === "function") {
    return Buffer.from(await transformable.transformToByteArray());
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported R2 response body.");
}

function isObjectNotFound(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { $metadata?: { httpStatusCode?: number }; name?: string };
  return candidate.$metadata?.httpStatusCode === 404 || candidate.name === "NoSuchKey" || candidate.name === "NotFound";
}

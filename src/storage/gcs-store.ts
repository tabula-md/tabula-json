import { Storage } from "@google-cloud/storage";
import { jsonShareCacheControl, jsonShareContentType, validateJsonShareId } from "../protocol.js";
import type { JsonShareStore } from "./store.js";

type GcsFile = {
  download: () => Promise<[Buffer]>;
  exists: () => Promise<[boolean]>;
  save: (
    data: Buffer,
    options: {
      metadata: {
        cacheControl: string;
        contentType: string;
      };
      resumable: false;
      validation: "crc32c";
    },
  ) => Promise<unknown>;
};

type GcsBucket = {
  file: (name: string) => GcsFile;
};

type GcsClient = {
  bucket: (name: string) => GcsBucket;
};

export type GcsJsonShareStoreOptions = {
  bucket: string;
  client?: GcsClient;
  prefix?: string;
};

export class GcsJsonShareStore implements JsonShareStore {
  private readonly bucket: GcsBucket;
  private readonly objectPrefix: string;

  constructor(options: GcsJsonShareStoreOptions) {
    this.bucket = (options.client ?? new Storage()).bucket(options.bucket);
    this.objectPrefix = normalizeObjectPrefix(options.prefix ?? "json/");
  }

  async getJsonShare(jsonIdInput: string): Promise<Buffer | null> {
    const jsonId = validateJsonShareId(jsonIdInput);
    try {
      const [body] = await this.getFile(jsonId).download();
      return body;
    } catch (error) {
      if (isObjectNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async hasJsonShare(jsonIdInput: string) {
    const jsonId = validateJsonShareId(jsonIdInput);
    const [exists] = await this.getFile(jsonId).exists();
    return exists;
  }

  async writeJsonShare(jsonIdInput: string, snapshot: Buffer) {
    const jsonId = validateJsonShareId(jsonIdInput);
    await this.getFile(jsonId).save(snapshot, {
      metadata: {
        cacheControl: jsonShareCacheControl,
        contentType: jsonShareContentType,
      },
      resumable: false,
      validation: "crc32c",
    });
  }

  private getFile(jsonId: string) {
    return this.bucket.file(`${this.objectPrefix}${jsonId}.bin`);
  }
}

function normalizeObjectPrefix(prefix: string) {
  const trimmedPrefix = prefix.trim().replace(/^\/+/, "");
  if (!trimmedPrefix) {
    return "";
  }
  return trimmedPrefix.endsWith("/") ? trimmedPrefix : `${trimmedPrefix}/`;
}

function isObjectNotFound(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: number | string };
  return candidate.code === 404 || candidate.code === "404";
}

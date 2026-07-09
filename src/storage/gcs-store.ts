import { Storage } from "@google-cloud/storage";
import { jsonShareCacheControl, jsonShareContentType, validateJsonShareId } from "../protocol.js";
import type { JsonShareListEntry, JsonShareMetadata, JsonShareStore } from "./store.js";

type GcsFile = {
  delete: (options?: { ignoreNotFound?: boolean }) => Promise<unknown>;
  download: () => Promise<[Buffer]>;
  exists: () => Promise<[boolean]>;
  getMetadata: () => Promise<[{ timeCreated?: string; updated?: string }, unknown]>;
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

type GcsListedFile = GcsFile & {
  name: string;
};

type GcsBucket = {
  file: (name: string) => GcsFile;
  getFiles: (options: { prefix: string }) => Promise<[GcsListedFile[], ...unknown[]]>;
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

  async deleteJsonShare(jsonIdInput: string) {
    const jsonId = validateJsonShareId(jsonIdInput);
    try {
      await this.getFile(jsonId).delete({ ignoreNotFound: true });
    } catch (error) {
      if (!isObjectNotFound(error)) {
        throw error;
      }
    }
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

  async getJsonShareMetadata(jsonIdInput: string): Promise<JsonShareMetadata | null> {
    const jsonId = validateJsonShareId(jsonIdInput);
    try {
      const [metadata] = await this.getFile(jsonId).getMetadata();
      const createdAt = parseGcsTimestamp(metadata.timeCreated ?? metadata.updated);
      return createdAt ? { createdAt } : null;
    } catch (error) {
      if (isObjectNotFound(error)) {
        return null;
      }
      throw error;
    }
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

  async listJsonShares(): Promise<JsonShareListEntry[]> {
    const [files] = await this.bucket.getFiles({ prefix: this.objectPrefix });
    const entries: JsonShareListEntry[] = [];

    for (const file of files) {
      const jsonId = this.getJsonIdFromObjectName(file.name);
      if (!jsonId) {
        continue;
      }

      try {
        const [metadata] = await file.getMetadata();
        const createdAt = parseGcsTimestamp(metadata.timeCreated ?? metadata.updated);
        if (createdAt) {
          entries.push({ jsonId, createdAt });
        }
      } catch (error) {
        if (!isObjectNotFound(error)) {
          throw error;
        }
      }
    }

    return entries;
  }

  private getFile(jsonId: string) {
    return this.bucket.file(`${this.objectPrefix}${jsonId}.bin`);
  }

  private getJsonIdFromObjectName(objectName: string) {
    if (!objectName.startsWith(this.objectPrefix) || !objectName.endsWith(".bin")) {
      return null;
    }

    const jsonId = objectName.slice(this.objectPrefix.length, -".bin".length);
    try {
      return validateJsonShareId(jsonId);
    } catch {
      return null;
    }
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

function parseGcsTimestamp(value: string | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

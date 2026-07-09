import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { validateJsonShareId } from "../protocol.js";
import type { JsonShareListEntry, JsonShareMetadata, JsonShareStore } from "./store.js";

export class FileJsonShareStore implements JsonShareStore {
  constructor(private readonly dataDir: string) {}

  async deleteJsonShare(jsonIdInput: string) {
    const jsonId = validateJsonShareId(jsonIdInput);
    await fs.rm(this.jsonShareDir(jsonId), { force: true, recursive: true });
  }

  async getJsonShare(jsonIdInput: string): Promise<Buffer | null> {
    const jsonId = validateJsonShareId(jsonIdInput);
    try {
      return await fs.readFile(this.jsonSharePath(jsonId));
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async writeJsonShare(jsonIdInput: string, snapshot: Buffer) {
    const jsonId = validateJsonShareId(jsonIdInput);
    const jsonShareDir = this.jsonShareDir(jsonId);
    await fs.mkdir(jsonShareDir, { recursive: true });
    await writeFileAtomically(this.jsonSharePath(jsonId), snapshot);
  }

  async getJsonShareMetadata(jsonIdInput: string): Promise<JsonShareMetadata | null> {
    const jsonId = validateJsonShareId(jsonIdInput);
    try {
      const stats = await fs.stat(this.jsonSharePath(jsonId));
      return { createdAt: stats.mtime };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async listJsonShares(): Promise<JsonShareListEntry[]> {
    const root = path.resolve(this.dataDir, "json");
    let entries: Dirent[];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }

    const snapshots: JsonShareListEntry[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      let jsonId: string;
      try {
        jsonId = validateJsonShareId(entry.name);
      } catch {
        continue;
      }

      const metadata = await this.getJsonShareMetadata(jsonId);
      if (metadata) {
        snapshots.push({ jsonId, ...metadata });
      }
    }

    return snapshots;
  }

  private jsonShareDir(jsonId: string) {
    const root = path.resolve(this.dataDir, "json");
    const jsonShareDir = path.resolve(root, jsonId);
    if (jsonShareDir !== root && !jsonShareDir.startsWith(`${root}${path.sep}`)) {
      throw new Error("Invalid JSON share path");
    }
    return jsonShareDir;
  }

  private jsonSharePath(jsonId: string) {
    return path.join(this.jsonShareDir(jsonId), "snapshot.bin");
  }
}

async function writeFileAtomically(filePath: string, data: Buffer) {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(directory, `.json-share.${process.pid}.${randomUUID()}.tmp`);

  try {
    await fs.writeFile(temporaryPath, data, { flag: "wx" });
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function isNotFound(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

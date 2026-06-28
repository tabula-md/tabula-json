import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { validateJsonShareId } from "../protocol.js";
import type { JsonShareStore } from "./store.js";

export class FileJsonShareStore implements JsonShareStore {
  constructor(private readonly dataDir: string) {}

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

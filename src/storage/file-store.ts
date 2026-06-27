import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type PublicJsonShareSnapshot, validateJsonShareId } from "../protocol.js";

export class FileJsonShareStore {
  constructor(private readonly dataDir: string) {}

  async getJsonShare(jsonIdInput: string): Promise<PublicJsonShareSnapshot | null> {
    const jsonId = validateJsonShareId(jsonIdInput);
    try {
      return JSON.parse(await fs.readFile(this.jsonSharePath(jsonId), "utf8")) as PublicJsonShareSnapshot;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async writeJsonShare(snapshot: PublicJsonShareSnapshot) {
    const jsonId = validateJsonShareId(snapshot.jsonId);
    const jsonShareDir = this.jsonShareDir(jsonId);
    await fs.mkdir(jsonShareDir, { recursive: true });
    await writeFileAtomically(this.jsonSharePath(jsonId), `${JSON.stringify(snapshot, null, 2)}\n`);
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
    return path.join(this.jsonShareDir(jsonId), "json.json");
  }
}

async function writeFileAtomically(filePath: string, data: string) {
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

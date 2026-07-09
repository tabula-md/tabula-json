import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultJsonShareRetentionDays } from "../dist/src/protocol.js";
import { FileJsonShareStore } from "../dist/src/storage/file-store.js";
import { GcsJsonShareStore } from "../dist/src/storage/gcs-store.js";
import { deleteExpiredJsonShares } from "../dist/src/storage/retention.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDirectory, "..");

const retentionDays = positiveIntegerFromEnv("TABULA_JSON_RETENTION_DAYS", defaultJsonShareRetentionDays);
const store = createJsonShareStore();
const result = await deleteExpiredJsonShares(store, retentionDays);

console.log(
  JSON.stringify({
    checked: result.checked,
    deleted: result.deleted,
    failed: result.failed,
    retentionDays,
    service: "tabula-json",
    supported: result.supported,
  }),
);

if (!result.supported || result.failed > 0) {
  process.exitCode = 1;
}

function createJsonShareStore() {
  const storageDriver = process.env.TABULA_JSON_STORAGE_DRIVER?.trim().toLowerCase() || "file";

  if (storageDriver === "file") {
    return new FileJsonShareStore(process.env.TABULA_JSON_DATA_DIR ?? path.join(repoRoot, ".tabula-json", "data"));
  }

  if (storageDriver === "gcs") {
    return new GcsJsonShareStore({
      bucket: requiredEnv("TABULA_JSON_GCS_BUCKET"),
      prefix: process.env.TABULA_JSON_GCS_PREFIX,
    });
  }

  throw new Error(`Unsupported TABULA_JSON_STORAGE_DRIVER: ${storageDriver}`);
}

function positiveIntegerFromEnv(name, fallback) {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

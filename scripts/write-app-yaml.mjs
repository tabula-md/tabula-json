import { writeFileSync } from "node:fs";

const requiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to generate app.yaml`);
  }
  return value;
};

const optionalEnv = (name, fallback) => process.env[name]?.trim() || fallback;

const yamlString = (value) => JSON.stringify(String(value));
const yamlNumber = (name, fallback) => {
  const rawValue = optionalEnv(name, fallback);
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return String(value);
};
const yamlPositiveInteger = (name, fallback) => {
  const rawValue = optionalEnv(name, fallback);
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return String(value);
};

const config = {
  allowedOrigins: requiredEnv("TABULA_JSON_ALLOWED_ORIGINS"),
  bucket: requiredEnv("TABULA_JSON_GCS_BUCKET"),
  globalReadRateLimit: yamlNumber("TABULA_JSON_GLOBAL_READ_RATE_LIMIT_PER_MINUTE", "3000"),
  globalWriteRateLimit: yamlNumber("TABULA_JSON_GLOBAL_WRITE_RATE_LIMIT_PER_MINUTE", "120"),
  gcsPrefix: optionalEnv("TABULA_JSON_GCS_PREFIX", "json/"),
  maxInstances: yamlNumber("TABULA_JSON_MAX_INSTANCES", "3"),
  maxPayloadBytes: yamlNumber("TABULA_JSON_MAX_PAYLOAD_BYTES", "2097152"),
  readRateLimit: yamlNumber("TABULA_JSON_READ_RATE_LIMIT_PER_MINUTE", "600"),
  retentionDays: yamlPositiveInteger("TABULA_JSON_RETENTION_DAYS", "7"),
  storageDriver: optionalEnv("TABULA_JSON_STORAGE_DRIVER", "gcs"),
  writeRateLimit: yamlNumber("TABULA_JSON_WRITE_RATE_LIMIT_PER_MINUTE", "30"),
};

if (config.storageDriver !== "gcs") {
  throw new Error("App Engine deployment requires TABULA_JSON_STORAGE_DRIVER=gcs");
}

const appYaml = `runtime: nodejs22
instance_class: F1

automatic_scaling:
  min_instances: 0
  max_instances: ${config.maxInstances}
  target_cpu_utilization: 0.7
  target_throughput_utilization: 0.75
  max_concurrent_requests: 20

env_variables:
  NODE_ENV: production
  TABULA_JSON_ALLOWED_ORIGINS: ${yamlString(config.allowedOrigins)}
  TABULA_JSON_STORAGE_DRIVER: ${yamlString(config.storageDriver)}
  TABULA_JSON_GCS_BUCKET: ${yamlString(config.bucket)}
  TABULA_JSON_GCS_PREFIX: ${yamlString(config.gcsPrefix)}
  TABULA_JSON_MAX_PAYLOAD_BYTES: ${yamlString(config.maxPayloadBytes)}
  TABULA_JSON_WRITE_RATE_LIMIT_PER_MINUTE: ${yamlString(config.writeRateLimit)}
  TABULA_JSON_READ_RATE_LIMIT_PER_MINUTE: ${yamlString(config.readRateLimit)}
  TABULA_JSON_RETENTION_DAYS: ${yamlString(config.retentionDays)}
  TABULA_JSON_GLOBAL_WRITE_RATE_LIMIT_PER_MINUTE: ${yamlString(config.globalWriteRateLimit)}
  TABULA_JSON_GLOBAL_READ_RATE_LIMIT_PER_MINUTE: ${yamlString(config.globalReadRateLimit)}
`;

writeFileSync("app.yaml", appYaml, "utf8");
console.log("Generated app.yaml for App Engine deployment.");

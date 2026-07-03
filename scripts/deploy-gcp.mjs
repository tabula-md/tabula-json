import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
if (!projectId) {
  throw new Error("GOOGLE_CLOUD_PROJECT is required for manual GCP deploy");
}

if (!existsSync("app.yaml")) {
  throw new Error("app.yaml is missing. Run scripts/write-app-yaml.mjs first.");
}

const result = spawnSync(
  "gcloud",
  ["app", "deploy", "app.yaml", "--project", projectId, "-q"],
  { stdio: "inherit" },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

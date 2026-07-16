import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const forbiddenPaths = new Map([
  ["AGENTS.md", "local agent instructions do not belong in the public OSS repo"],
  ["CLAUDE.md", "local agent instructions do not belong in the public OSS repo"],
  ["WORKFLOW.md", "maintainer workflow belongs outside the public OSS repo"],
  ["WORKFLOW.ko.md", "maintainer workflow belongs outside the public OSS repo"],
  ["TODO.md", "maintainer planning notes belong outside the public OSS repo"],
  ["TODO.ko.md", "maintainer planning notes belong outside the public OSS repo"],
  ["CHANGELOG.md", "release notes should be published through GitHub Releases"],
  ["CONTRIBUTING.md", "public contribution policy is not ready yet"],
  ["app.yaml", "generated provider config should not be tracked; use app.yaml.example"],
]);

const forbiddenPrefixes = new Map([
  ["docs/", "maintainer docs belong outside the public OSS repo"],
  ["knowledge/", "maintainer knowledge belongs outside the public OSS repo"],
  [".codex/", "local agent hooks do not belong in the public OSS repo"],
  [".linear/", "private tracker templates do not belong in the public OSS repo"],
]);

const managedProject = ["tabula", "md", "prod"].join("-");
const managedBucket = ["tabula", "json", "prod"].join("-");

const forbiddenText = [
  { label: "managed GCP project id", pattern: new RegExp(`\\b${managedProject}\\b`, "g") },
  { label: "managed GCS bucket", pattern: new RegExp(`\\b${managedBucket}\\b`, "g") },
  {
    label: "hardcoded managed deploy command",
    pattern: new RegExp(`GOOGLE_CLOUD_PROJECT=${managedProject}`, "g"),
  },
];

const errors = [];

for (const file of trackedFiles) {
  if (!existsSync(file)) {
    continue;
  }

  const forbiddenPathReason = forbiddenPaths.get(file);
  if (forbiddenPathReason) {
    errors.push(`${file}: ${forbiddenPathReason}`);
  }

  for (const [prefix, reason] of forbiddenPrefixes) {
    if (file.startsWith(prefix)) {
      errors.push(`${file}: ${reason}`);
    }
  }

  const buffer = readFileSync(file);
  if (buffer.includes(0)) {
    continue;
  }

  const text = buffer.toString("utf8");
  for (const { label, pattern } of forbiddenText) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      errors.push(`${file}: contains ${label}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Public surface check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Public surface check passed (${trackedFiles.length} tracked files).`);

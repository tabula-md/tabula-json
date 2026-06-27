export const JSON_SHARE_RECORD_VERSION = 1;

export type JsonShareInput = {
  encryptedData: string;
  iv: string;
};

export type PublicJsonShareSnapshot = JsonShareInput & {
  v: typeof JSON_SHARE_RECORD_VERSION;
  jsonId: string;
  createdAt: string;
};

const jsonIdPattern = /^[a-zA-Z0-9_-]{8,80}$/;
const base64UrlPattern = /^[a-zA-Z0-9_-]+$/;
const isoUtcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const jsonShareInputFields = new Set(["encryptedData", "iv"]);
const forbiddenFieldNames = new Set([
  "activeFileId",
  "body",
  "commentsByFileId",
  "files",
  "key",
  "llmsFullTxt",
  "llmsTxt",
  "markdown",
  "markdownBundle",
  "ownerToken",
  "plaintext",
  "plaintextSecret",
  "publishBundle",
  "roomId",
  "roomKey",
  "shareUrl",
  "text",
]);

export class ProtocolError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ProtocolError";
  }
}

export function validateJsonShareId(value: unknown): string {
  if (typeof value !== "string" || !jsonIdPattern.test(value)) {
    throw new ProtocolError(400, "Invalid JSON share id");
  }
  return value;
}

export function validateJsonShareInput(
  value: unknown,
  options: { maxPayloadBytes?: number } = {},
): JsonShareInput {
  if (!isRecord(value)) {
    throw new ProtocolError(400, "JSON share payload must be an object");
  }
  rejectUnsupportedFields(value, jsonShareInputFields, "JSON share payload");

  const maxPayloadBytes = options.maxPayloadBytes ?? 1024 * 1024;
  return {
    encryptedData: validateBase64UrlField(value.encryptedData, "encryptedData", maxPayloadBytes),
    iv: validateBase64UrlField(value.iv, "iv", 64),
  };
}

export function validateCreatedAt(value: unknown, fieldName = "timestamp") {
  if (typeof value !== "string" || !isoUtcTimestampPattern.test(value)) {
    throw new ProtocolError(400, `Invalid ${fieldName}`);
  }
  return value;
}

function rejectUnsupportedFields(value: Record<string, unknown>, allowedFields: Set<string>, context: string) {
  for (const key of Object.keys(value)) {
    if (forbiddenFieldNames.has(key)) {
      throw new ProtocolError(400, `${context} must not include ${key}`);
    }
    if (!allowedFields.has(key)) {
      throw new ProtocolError(400, `Unsupported ${context} field ${key}`);
    }
  }
}

function validateBase64UrlField(value: unknown, fieldName: string, maxBytes: number) {
  if (typeof value !== "string" || value.length === 0 || !base64UrlPattern.test(value)) {
    throw new ProtocolError(400, `${fieldName} must be base64url text`);
  }
  if (Buffer.byteLength(value, "utf8") > maxBytes) {
    throw new ProtocolError(400, `${fieldName} is too large`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

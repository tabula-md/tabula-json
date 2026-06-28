const jsonIdPattern = /^[a-zA-Z0-9_-]{8,80}$/;

export const jsonShareApiPrefix = "/api/v1/";
export const jsonSharePostPath = "/api/v1/post/";
export const jsonShareContentType = "application/octet-stream";
export const jsonShareCacheControl = "public, max-age=31536000, immutable";
export const defaultMaxPayloadBytes = 2 * 1024 * 1024;

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

export function validateJsonShareBlob(value: unknown, options: { maxPayloadBytes?: number } = {}): Buffer {
  if (!Buffer.isBuffer(value)) {
    throw new ProtocolError(400, "JSON share payload must be binary");
  }
  validateJsonShareBytes(value, options);
  return value;
}

export function validateJsonShareBytes(
  value: Uint8Array,
  options: { maxPayloadBytes?: number } = {},
): Uint8Array {
  if (value.byteLength === 0) {
    throw new ProtocolError(400, "JSON share payload is empty");
  }
  const maxPayloadBytes = options.maxPayloadBytes ?? defaultMaxPayloadBytes;
  if (value.byteLength > maxPayloadBytes) {
    throw new ProtocolError(413, "JSON share payload is too large");
  }
  return value;
}

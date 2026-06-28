const jsonIdPattern = /^[a-zA-Z0-9_-]{8,80}$/;

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
  if (value.byteLength === 0) {
    throw new ProtocolError(400, "JSON share payload is empty");
  }
  const maxPayloadBytes = options.maxPayloadBytes ?? 1024 * 1024;
  if (value.byteLength > maxPayloadBytes) {
    throw new ProtocolError(413, "JSON share payload is too large");
  }
  return value;
}

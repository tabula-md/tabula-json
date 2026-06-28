import { describe, expect, it } from "vitest";
import { validateJsonShareBlob, validateJsonShareId } from "../src/protocol.js";

describe("JSON share protocol validation", () => {
  it("validates JSON share ids", () => {
    expect(validateJsonShareId("abc12345")).toBe("abc12345");
    expect(() => validateJsonShareId("../secret")).toThrow("Invalid JSON share id");
    expect(() => validateJsonShareId("short")).toThrow("Invalid JSON share id");
  });

  it("accepts opaque encrypted snapshot blobs", () => {
    const blob = Buffer.from("encrypted snapshot");
    expect(validateJsonShareBlob(blob)).toBe(blob);
  });

  it("rejects non-binary payloads", () => {
    expect(() => validateJsonShareBlob({ markdown: "# Hello" })).toThrow("JSON share payload must be binary");
  });

  it("rejects empty payloads", () => {
    expect(() => validateJsonShareBlob(Buffer.alloc(0))).toThrow("JSON share payload is empty");
  });

  it("rejects oversized payloads", () => {
    expect(() => validateJsonShareBlob(Buffer.from("12345"), { maxPayloadBytes: 4 })).toThrow(
      "JSON share payload is too large",
    );
  });
});

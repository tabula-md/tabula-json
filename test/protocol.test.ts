import { describe, expect, it } from "vitest";
import { validateCreatedAt, validateJsonShareId, validateJsonShareInput } from "../src/protocol.js";

describe("JSON share protocol validation", () => {
  it("validates JSON share ids", () => {
    expect(validateJsonShareId("abc12345")).toBe("abc12345");
    expect(() => validateJsonShareId("../secret")).toThrow("Invalid JSON share id");
    expect(() => validateJsonShareId("short")).toThrow("Invalid JSON share id");
  });

  it("accepts encrypted JSON share payloads", () => {
    expect(validateJsonShareInput({ encryptedData: "abc_123-def", iv: "iv_123" })).toEqual({
      encryptedData: "abc_123-def",
      iv: "iv_123",
    });
  });

  it("rejects fragment keys and plaintext fields", () => {
    expect(() =>
      validateJsonShareInput({
        encryptedData: "abc12345",
        iv: "iv12345",
        key: "secret",
      }),
    ).toThrow("JSON share payload must not include key");

    expect(() =>
      validateJsonShareInput({
        encryptedData: "abc12345",
        iv: "iv12345",
        files: [],
      }),
    ).toThrow("JSON share payload must not include files");

    expect(() =>
      validateJsonShareInput({
        encryptedData: "abc12345",
        iv: "iv12345",
        markdown: "# Hello",
      }),
    ).toThrow("JSON share payload must not include markdown");
  });

  it("rejects unknown fields", () => {
    expect(() =>
      validateJsonShareInput({
        encryptedData: "abc12345",
        iv: "iv12345",
        extra: true,
      }),
    ).toThrow("Unsupported JSON share payload field extra");
  });

  it("rejects invalid base64url values", () => {
    expect(() => validateJsonShareInput({ encryptedData: "abc+123", iv: "iv12345" })).toThrow(
      "encryptedData must be base64url text",
    );
  });

  it("validates timestamps", () => {
    expect(validateCreatedAt("2026-06-28T00:00:00.000Z")).toBe("2026-06-28T00:00:00.000Z");
    expect(() => validateCreatedAt("today")).toThrow("Invalid timestamp");
  });
});

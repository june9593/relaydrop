import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  MAX_CAPTION_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  RelayDropValidationError,
  createFileDescriptor,
  createTextDescriptor,
  parseDescriptor,
  serializeDescriptor
} from "./descriptor";

describe("RelayDrop descriptor", () => {
  it("serializes fields in canonical order", () => {
    const descriptor = createTextDescriptor({
      id: "7cd2216d-4f13-4ca6-b64b-d04f1d19d150",
      text: "hello",
      source: "desktop",
      createdAt: "2026-09-06T05:00:00.000Z"
    });

    expect(serializeDescriptor(descriptor)).toBe(
      JSON.stringify({
        schemaVersion: 1,
        id: descriptor.id,
        type: "text",
        createdAt: descriptor.createdAt,
        source: "desktop",
        text: "hello"
      })
    );
  });

  it("preserves a caller-provided timestamp across safe retries", () => {
    const createdAt = "2026-09-06T05:00:00.000Z";
    const descriptor = createFileDescriptor(
      {
        id: "7cd2216d-4f13-4ca6-b64b-d04f1d19d150",
        file: new File(["content"], "report.txt", { type: "text/plain" }),
        source: "desktop",
        createdAt
      },
      "drive-item",
      "a".repeat(64)
    );

    expect(descriptor.createdAt).toBe(createdAt);
  });

  it("rejects files beyond the MVP limit", () => {
    expect(() =>
      parseDescriptor({
        schemaVersion: 1,
        id: "7cd2216d-4f13-4ca6-b64b-d04f1d19d150",
        type: "file",
        createdAt: "2026-09-04T00:00:00.000Z",
        source: "phone",
        file: {
          driveItemId: "drive-item",
          displayName: "large.bin",
          size: MAX_FILE_BYTES + 1,
          mediaType: "application/octet-stream",
          sha256: "a".repeat(64)
        }
      })
    ).toThrow(RelayDropValidationError);
  });

  it("rejects invalid file digests", () => {
    expect(() =>
      parseDescriptor({
        schemaVersion: 1,
        id: "7cd2216d-4f13-4ca6-b64b-d04f1d19d150",
        type: "file",
        createdAt: "2026-09-04T00:00:00.000Z",
        source: "phone",
        file: {
          driveItemId: "drive-item",
          displayName: "file.bin",
          size: 1,
          mediaType: "application/octet-stream",
          sha256: "not-a-digest"
        }
      })
    ).toThrow(RelayDropValidationError);
  });

  it("rejects a link descriptor that is not an HTTP or HTTPS URL", () => {
    expect(() =>
      parseDescriptor({
        schemaVersion: 1,
        id: "7cd2216d-4f13-4ca6-b64b-d04f1d19d150",
        type: "link",
        createdAt: "2026-09-04T00:00:00.000Z",
        source: "phone",
        text: "javascript:alert(document.domain)"
      })
    ).toThrow(RelayDropValidationError);
  });

  it("round-trips credential-bearing URLs as plain text", () => {
    const descriptor = createTextDescriptor({
      id: "7cd2216d-4f13-4ca6-b64b-d04f1d19d150",
      text: "https://user:password@example.com/private",
      source: "desktop",
      createdAt: "2026-09-07T00:00:00.000Z"
    });

    expect(descriptor.type).toBe("text");
    expect(parseDescriptor(JSON.parse(serializeDescriptor(descriptor)))).toEqual(
      descriptor
    );
  });

  it("rejects oversized file metadata fields", () => {
    expect(() =>
      parseDescriptor({
        schemaVersion: 1,
        id: "7cd2216d-4f13-4ca6-b64b-d04f1d19d150",
        type: "file",
        createdAt: "2026-09-04T00:00:00.000Z",
        source: "phone",
        caption: "x".repeat(MAX_CAPTION_LENGTH + 1),
        file: {
          driveItemId: "drive-item",
          displayName: "x".repeat(MAX_DISPLAY_NAME_LENGTH + 1),
          size: 1,
          mediaType: "application/octet-stream",
          sha256: "a".repeat(64)
        }
      })
    ).toThrow(RelayDropValidationError);
  });

  it("rejects bidirectional controls in displayed file names", () => {
    expect(() =>
      parseDescriptor({
        schemaVersion: 1,
        id: "7cd2216d-4f13-4ca6-b64b-d04f1d19d150",
        type: "file",
        createdAt: "2026-09-04T00:00:00.000Z",
        source: "phone",
        file: {
          driveItemId: "drive-item",
          displayName: "invoice\u202efdp.exe",
          size: 1,
          mediaType: "application/octet-stream",
          sha256: "a".repeat(64)
        }
      })
    ).toThrow(RelayDropValidationError);
  });
});

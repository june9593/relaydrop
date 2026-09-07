import { describe, expect, it } from "vitest";
import {
  createClipboardFileName,
  ensureClipboardFileName,
  firstClipboardFile
} from "./composerClipboard";

function clipboardDataWith(options: {
  files?: File[];
  items?: Array<{ kind: DataTransferItem["kind"]; file?: File | null }>;
}): DataTransfer {
  const files = options.files ?? [];
  const items = options.items ?? [];
  const fileList: { length: number; item: (index: number) => File | null; [index: number]: File } = {
    length: files.length,
    item: (index: number) => files[index] ?? null
  };
  const itemList: {
    length: number;
    [index: number]: { kind: DataTransferItem["kind"]; getAsFile: () => File | null };
  } = { length: items.length };

  files.forEach((file, index) => {
    fileList[index] = file;
  });
  items.forEach((item, index) => {
    itemList[index] = {
      kind: item.kind,
      getAsFile: () => item.file ?? null
    };
  });

  return {
    files: fileList,
    items: itemList
  } as unknown as DataTransfer;
}

describe("firstClipboardFile", () => {
  it("leaves a text-only clipboard alone", () => {
    const clipboardData = clipboardDataWith({ items: [{ kind: "string" }] });

    expect(firstClipboardFile(clipboardData)).toBeNull();
  });

  it("returns only the first file even when the clipboard has several", () => {
    const first = new File(["first"], "first.png", { type: "image/png" });
    const second = new File(["second"], "second.jpg", { type: "image/jpeg" });
    const clipboardData = clipboardDataWith({
      items: [
        { kind: "string" },
        { kind: "file", file: first },
        { kind: "file", file: second }
      ]
    });

    expect(firstClipboardFile(clipboardData)).toBe(first);
  });

  it("falls back to the clipboard file list", () => {
    const file = new File(["report"], "report.pdf", { type: "application/pdf" });

    expect(firstClipboardFile(clipboardDataWith({ files: [file] }))).toBe(file);
  });
});

describe("clipboard file names", () => {
  const now = new Date("2026-09-06T03:04:05.000Z");

  it("creates a safe image name with the matching extension", () => {
    expect(createClipboardFileName("image/png", now)).toBe(
      "pasted-image-20260906-030405.png"
    );
  });

  it("uses a safe generic extension for an unknown type", () => {
    expect(createClipboardFileName("", now)).toBe("pasted-file-20260906-030405.bin");
  });

  it("keeps an existing file name unchanged", () => {
    const file = new File(["photo"], "holiday photo.jpg", { type: "image/jpeg" });

    expect(ensureClipboardFileName(file, now)).toBe(file);
  });

  it("names an unnamed clipboard image without changing its contents", async () => {
    const file = new File(["image bytes"], "", {
      type: "image/jpeg",
      lastModified: 123
    });

    const namedFile = ensureClipboardFileName(file, now);

    expect(namedFile.name).toBe("pasted-image-20260906-030405.jpg");
    expect(namedFile.type).toBe("image/jpeg");
    expect(namedFile.lastModified).toBe(123);
    expect(await namedFile.text()).toBe("image bytes");
  });
});

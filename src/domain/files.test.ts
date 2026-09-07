import { describe, expect, it } from "vitest";
import {
  classifyFile,
  hasUnsafeFileNameControls,
  isPotentiallyExecutableFileName,
  sanitizeStorageName,
  sha256Hex
} from "./files";

describe("sha256Hex", () => {
  it("hashes blob content incrementally without calling arrayBuffer", async () => {
    const blob = new Blob(["abc"]);
    Object.defineProperty(blob, "arrayBuffer", {
      value: () => {
        throw new Error("arrayBuffer should not be used");
      }
    });

    await expect(sha256Hex(blob)).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});

describe("classifyFile", () => {
  it("recognizes browser-previewable media", () => {
    expect(classifyFile("image/jpeg", "photo.jpg")).toBe("image");
    expect(classifyFile("video/mp4", "clip.mp4")).toBe("video");
    expect(classifyFile("application/pdf", "brief.pdf")).toBe("pdf");
  });

  it("gives common productivity files distinct artwork groups", () => {
    expect(classifyFile("", "brief.docx")).toBe("document");
    expect(classifyFile("", "budget.xlsx")).toBe("spreadsheet");
    expect(classifyFile("", "review.pptx")).toBe("presentation");
    expect(classifyFile("", "source.ts")).toBe("code");
    expect(classifyFile("", "bundle.zip")).toBe("archive");
  });
});

describe("sanitizeStorageName", () => {
  it("removes characters OneDrive cannot store", () => {
    expect(sanitizeStorageName('report:final?.pdf')).toBe("report_final_.pdf");
  });

  it("removes bidirectional and zero-width spoofing controls", () => {
    expect(sanitizeStorageName("invoice\u202efdp.exe")).toBe("invoicefdp.exe");
    expect(sanitizeStorageName("invoice\u061cfdp.exe")).toBe("invoicefdp.exe");
    expect(hasUnsafeFileNameControls("invoice\u202efdp.exe")).toBe(true);
    expect(hasUnsafeFileNameControls("invoice\u061cfdp.exe")).toBe(true);
  });
});

describe("isPotentiallyExecutableFileName", () => {
  it("detects executable and shortcut formats by their final extension", () => {
    expect(isPotentiallyExecutableFileName("invoice.pdf.exe")).toBe(true);
    expect(isPotentiallyExecutableFileName("shortcut.lnk")).toBe(true);
    expect(isPotentiallyExecutableFileName("budget.xlsm")).toBe(true);
    expect(isPotentiallyExecutableFileName("script.js")).toBe(true);
    expect(isPotentiallyExecutableFileName("report.pdf")).toBe(false);
  });
});

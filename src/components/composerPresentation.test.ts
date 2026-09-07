import { describe, expect, it } from "vitest";
import {
  canPreviewSelectedFile,
  shouldAnimateUploadProgress
} from "./composerPresentation";

describe("canPreviewSelectedFile", () => {
  it("previews pasted and dropped images locally", () => {
    expect(canPreviewSelectedFile(new File(["png"], "photo.png", { type: "image/png" }))).toBe(
      true
    );
    expect(canPreviewSelectedFile(new File(["webp"], "photo.webp", { type: "image/webp" }))).toBe(
      true
    );
  });

  it("keeps ordinary files in the compact file presentation", () => {
    expect(
      canPreviewSelectedFile(new File(["pdf"], "report.pdf", { type: "application/pdf" }))
    ).toBe(false);
    expect(canPreviewSelectedFile(new File(["unknown"], "image.bin"))).toBe(false);
  });
});

describe("shouldAnimateUploadProgress", () => {
  it("animates only phases that are actively doing indeterminate work", () => {
    expect(shouldAnimateUploadProgress("preparing")).toBe(true);
    expect(shouldAnimateUploadProgress("checking")).toBe(true);
    expect(shouldAnimateUploadProgress("publishing")).toBe(true);
  });

  it("stops immediately when cancellation begins or completes", () => {
    expect(shouldAnimateUploadProgress("cancelling")).toBe(false);
    expect(shouldAnimateUploadProgress("cancelled")).toBe(false);
    expect(shouldAnimateUploadProgress("failed")).toBe(false);
    expect(shouldAnimateUploadProgress("success")).toBe(false);
  });

  it("uses native percentage updates instead of an indeterminate animation while uploading", () => {
    expect(shouldAnimateUploadProgress("uploading")).toBe(false);
  });
});

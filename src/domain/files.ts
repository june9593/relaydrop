import { sha256 } from "@noble/hashes/sha2.js";
import type { RelayDropFileKind } from "./types";

const UNSAFE_FILE_NAME_CONTROLS = /[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/gi;
const EXECUTABLE_EXTENSIONS = new Set([
  "action",
  "app",
  "apk",
  "appx",
  "appxbundle",
  "bat",
  "chm",
  "cjs",
  "cmd",
  "com",
  "command",
  "cpl",
  "csh",
  "desktop",
  "dmg",
  "docm",
  "dotm",
  "exe",
  "gadget",
  "hta",
  "inf",
  "ins",
  "isp",
  "jar",
  "js",
  "jse",
  "job",
  "lnk",
  "mjs",
  "msc",
  "msi",
  "msix",
  "msixbundle",
  "msp",
  "mst",
  "ops",
  "pkg",
  "pif",
  "potm",
  "ppam",
  "ppsm",
  "pptm",
  "prg",
  "ps1",
  "py",
  "rb",
  "reg",
  "scr",
  "scf",
  "sct",
  "sh",
  "sldm",
  "url",
  "vb",
  "vbe",
  "vbs",
  "workflow",
  "wsf",
  "wsh",
  "xlam",
  "xlsm",
  "xltm",
  "xnk"
]);

export async function sha256Hex(data: Blob): Promise<string> {
  const digest = sha256.create();
  const reader = data.stream().getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    digest.update(value);
  }
  return Array.from(digest.digest())
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function sanitizeStorageName(fileName: string): string {
  const sanitized = stripUnsafeFileNameControls(fileName)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();

  return sanitized || "file";
}

export function stripUnsafeFileNameControls(fileName: string): string {
  return fileName.replace(UNSAFE_FILE_NAME_CONTROLS, "");
}

export function hasUnsafeFileNameControls(fileName: string): boolean {
  UNSAFE_FILE_NAME_CONTROLS.lastIndex = 0;
  return UNSAFE_FILE_NAME_CONTROLS.test(fileName);
}

export function isPotentiallyExecutableFileName(fileName: string): boolean {
  const safeName = stripUnsafeFileNameControls(fileName).toLowerCase();
  const extension = safeName.split(".").pop() ?? "";
  return EXECUTABLE_EXTENSIONS.has(extension);
}

export function classifyFile(mediaType: string, fileName: string): RelayDropFileKind {
  const normalizedType = mediaType.toLowerCase();
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (normalizedType.startsWith("image/")) return "image";
  if (normalizedType.startsWith("video/")) return "video";
  if (normalizedType.startsWith("audio/")) return "audio";
  if (normalizedType === "application/pdf" || extension === "pdf") return "pdf";
  if (["doc", "docx", "odt", "rtf", "pages"].includes(extension)) return "document";
  if (["xls", "xlsx", "csv", "ods", "numbers"].includes(extension)) return "spreadsheet";
  if (["ppt", "pptx", "odp", "key"].includes(extension)) return "presentation";
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(extension)) return "archive";
  if (
    normalizedType.startsWith("text/") ||
    ["txt", "md", "log", "rtf"].includes(extension)
  ) {
    return "text";
  }
  if (
    [
      "js",
      "jsx",
      "ts",
      "tsx",
      "json",
      "html",
      "css",
      "xml",
      "yaml",
      "yml",
      "py",
      "rs",
      "go",
      "java",
      "cpp",
      "c",
      "h",
      "sh"
    ].includes(extension)
  ) {
    return "code";
  }

  return "file";
}

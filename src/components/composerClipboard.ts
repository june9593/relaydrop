import { sanitizeStorageName } from "../domain/files";

const MEDIA_TYPE_EXTENSIONS: Readonly<Record<string, string>> = {
  "application/json": "json",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "text/csv": "csv",
  "text/html": "html",
  "text/plain": "txt",
  "video/quicktime": "mov",
  "video/mp4": "mp4",
  "video/webm": "webm"
};

export function firstClipboardFile(clipboardData: DataTransfer): File | null {
  for (let index = 0; index < clipboardData.items.length; index += 1) {
    const item = clipboardData.items[index];
    if (item.kind !== "file") {
      continue;
    }

    const file = item.getAsFile();
    if (file) {
      return file;
    }
  }

  return clipboardData.files.item(0);
}

export function createClipboardFileName(mediaType: string, now = new Date()): string {
  const normalizedType = mediaType.trim().toLowerCase();
  const prefix = normalizedType.startsWith("image/") ? "pasted-image" : "pasted-file";
  const extension = MEDIA_TYPE_EXTENSIONS[normalizedType] ?? "bin";
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);

  return sanitizeStorageName(`${prefix}-${timestamp}.${extension}`);
}

export function ensureClipboardFileName(file: File, now = new Date()): File {
  if (file.name.trim()) {
    return file;
  }

  return new File([file], createClipboardFileName(file.type, now), {
    type: file.type,
    lastModified: file.lastModified
  });
}

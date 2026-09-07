import type { RelayDropFileTransferStatus } from "../domain/transfers";

export function canPreviewSelectedFile(file: Pick<File, "type">): boolean {
  return file.type.trim().toLowerCase().startsWith("image/");
}

export function shouldAnimateUploadProgress(
  status: RelayDropFileTransferStatus
): boolean {
  return ["preparing", "checking", "publishing"].includes(status);
}

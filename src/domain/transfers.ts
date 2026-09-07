export type RelayDropFileTransferStatus =
  | "idle"
  | "preparing"
  | "checking"
  | "uploading"
  | "publishing"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "success";

export interface RelayDropFileTransferState {
  status: RelayDropFileTransferStatus;
  fileName?: string;
  loadedBytes?: number;
  totalBytes?: number;
  percent?: number;
  attempt?: number;
  message?: string;
}

export const IDLE_FILE_TRANSFER: RelayDropFileTransferState = {
  status: "idle"
};

export function isActiveFileTransfer(
  status: RelayDropFileTransferStatus
): boolean {
  return [
    "preparing",
    "checking",
    "uploading",
    "publishing",
    "cancelling"
  ].includes(status);
}

export function isCancellableFileTransfer(
  status: RelayDropFileTransferStatus
): boolean {
  return ["preparing", "checking", "uploading"].includes(status);
}

export type RelayDropDownloadStatus =
  | "downloading"
  | "complete"
  | "interrupted"
  | "missing";

export interface RelayDropDownloadState {
  itemId: string;
  status: RelayDropDownloadStatus;
  downloadId?: number;
  fileName: string;
  localPath?: string;
  bytesReceived?: number;
  totalBytes?: number;
}

export interface RelayDropDownloadRequest {
  itemId: string;
  fileName: string;
  loadBlob: () => Promise<Blob>;
  onStateChange?: (state: RelayDropDownloadState) => void;
}

export interface RelayDropDownloadManager {
  readonly capabilities?: { open: boolean; show: boolean; deleteLocal: boolean };
  getStates(itemIds: string[]): Promise<Record<string, RelayDropDownloadState>>;
  subscribe(listener: (state: RelayDropDownloadState) => void): () => void;
  download(request: RelayDropDownloadRequest): Promise<RelayDropDownloadState>;
  open(itemId: string): Promise<void>;
  show(itemId: string): Promise<void>;
  deleteLocal(itemId: string): Promise<RelayDropDownloadState>;
}

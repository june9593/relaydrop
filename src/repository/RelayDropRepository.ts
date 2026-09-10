import type {
  NewFileItem,
  NewTextItem,
  RelayDropFilePresentation,
  RelayDropItem,
  RelayDropPage,
  RelayDropStorageInfo
} from "../domain/types";

export interface RelayDropListOptions {
  cursor?: string;
  limit?: number;
  cachedItems?: RelayDropItem[];
  onNewestItem?: (item: RelayDropItem) => void;
}

export type RelayDropUploadPhase =
  | "preparing"
  | "checking"
  | "uploading"
  | "publishing";

export interface RelayDropFileUploadProgress {
  phase: RelayDropUploadPhase;
  loadedBytes?: number;
  totalBytes?: number;
  attempt?: number;
}

export interface RelayDropFileUploadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: RelayDropFileUploadProgress) => void;
}

export type RelayDropDeleteStep =
  | "locating"
  | "file"
  | "folder"
  | "descriptor";

export interface RelayDropDeleteProgress {
  step: RelayDropDeleteStep;
  completedSteps: RelayDropDeleteStep[];
}

export interface RelayDropDeleteOptions {
  onProgress?: (progress: RelayDropDeleteProgress) => void;
}

export class RelayDropDeleteError extends Error {
  readonly step: RelayDropDeleteStep;
  readonly completedSteps: RelayDropDeleteStep[];

  constructor(
    step: RelayDropDeleteStep,
    completedSteps: RelayDropDeleteStep[],
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "RelayDropDeleteError";
    this.step = step;
    this.completedSteps = [...completedSteps];
  }
}

export interface RelayDropRepository {
  listItems(options?: RelayDropListOptions): Promise<RelayDropPage>;
  getStorageInfo?(): Promise<RelayDropStorageInfo>;
  createText(input: NewTextItem): Promise<RelayDropItem>;
  createFile(
    input: NewFileItem,
    options?: RelayDropFileUploadOptions
  ): Promise<RelayDropItem>;
  getFilePresentation(id: string, options?: { refresh?: boolean }): Promise<RelayDropFilePresentation>;
  downloadFile(id: string): Promise<Blob>;
  deleteItem(id: string, options?: RelayDropDeleteOptions): Promise<void>;
  dispose?(): void;
}

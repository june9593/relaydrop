export type RelayDropItemType = "text" | "link" | "image" | "file";
export type RelayDropDevice = "phone" | "desktop" | "tablet";
export type RelayDropFileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "archive"
  | "code"
  | "text"
  | "file";

export interface RelayDropFile {
  name: string;
  size: number;
  mediaType: string;
}

export interface RelayDropFilePresentation {
  kind: RelayDropFileKind;
  thumbnailUrl?: string;
  previewUrl?: string;
  openUrl?: string;
}

interface RelayDropItemBase {
  id: string;
  createdAt: string;
  serverCreatedAt: string;
  source: RelayDropDevice;
}

export interface RelayDropTextItem extends RelayDropItemBase {
  type: "text" | "link";
  text: string;
}

export interface RelayDropFileItem extends RelayDropItemBase {
  type: "image" | "file";
  caption?: string;
  file: RelayDropFile;
}

export type RelayDropItem = RelayDropTextItem | RelayDropFileItem;

export interface NewTextItem {
  id: string;
  text: string;
  source: RelayDropDevice;
  createdAt: string;
}

export interface NewFileItem {
  id: string;
  file: File;
  source: RelayDropDevice;
  createdAt: string;
}

export interface RelayDropPage {
  items: RelayDropItem[];
  nextCursor?: string;
  total: number;
}

export interface RelayDropStorageInfo {
  usedBytes: number;
  totalBytes?: number;
  manageUrl?: string;
}

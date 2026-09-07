import { classifyText, isSafeHttpUrl } from "./feed";
import { hasUnsafeFileNameControls } from "./files";
import type {
  NewFileItem,
  NewTextItem,
  RelayDropDevice,
  RelayDropFileItem,
  RelayDropItem,
  RelayDropTextItem
} from "./types";

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 20_000;
export const MAX_DESCRIPTOR_BYTES = 64 * 1024;
export const MAX_CAPTION_LENGTH = 2_000;
export const MAX_DISPLAY_NAME_LENGTH = 255;
export const MAX_MEDIA_TYPE_LENGTH = 255;
export const MAX_DRIVE_ITEM_ID_LENGTH = 512;

export interface RelayDropDescriptorFileV1 {
  driveItemId: string;
  displayName: string;
  size: number;
  mediaType: string;
  sha256: string;
}

export interface RelayDropDescriptorV1 {
  schemaVersion: 1;
  id: string;
  type: "text" | "link" | "image" | "file";
  createdAt: string;
  source: RelayDropDevice;
  text?: string;
  caption?: string;
  file?: RelayDropDescriptorFileV1;
}

export function createTextDescriptor(input: NewTextItem): RelayDropDescriptorV1 {
  const text = input.text.trim();

  if (!text || text.length > MAX_TEXT_LENGTH) {
    throw new RelayDropValidationError(
      "Text items must contain between 1 and " + MAX_TEXT_LENGTH + " characters."
    );
  }

  return {
    schemaVersion: 1,
    id: input.id,
    type: classifyText(text),
    createdAt: input.createdAt,
    source: input.source,
    text
  };
}

export function createFileDescriptor(
  input: NewFileItem,
  driveItemId: string,
  sha256: string
): RelayDropDescriptorV1 {
  const mediaType = validateNewFileMetadata(input.file);
  if (!driveItemId || driveItemId.length > MAX_DRIVE_ITEM_ID_LENGTH) {
    throw new RelayDropValidationError("The OneDrive file identifier is invalid.");
  }

  return {
    schemaVersion: 1,
    id: input.id,
    type: input.file.type.startsWith("image/") ? "image" : "file",
    createdAt: input.createdAt,
    source: input.source,
    file: {
      driveItemId,
      displayName: input.file.name,
      size: input.file.size,
      mediaType,
      sha256
    }
  };
}

export function validateNewFileMetadata(
  file: Pick<File, "name" | "size" | "type">
): string {
  if (file.size > MAX_FILE_BYTES) {
    throw new RelayDropValidationError("Files must be 100 MB or smaller.");
  }
  if (!file.name.trim()) {
    throw new RelayDropValidationError("A file name is required.");
  }
  if (file.name.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new RelayDropValidationError("File names must be 255 characters or shorter.");
  }
  if (hasUnsafeFileNameControls(file.name)) {
    throw new RelayDropValidationError("The file name contains unsafe control characters.");
  }
  const mediaType = file.type || "application/octet-stream";
  if (mediaType.length > MAX_MEDIA_TYPE_LENGTH) {
    throw new RelayDropValidationError("The file media type is too long.");
  }
  return mediaType;
}

export function serializeDescriptor(descriptor: RelayDropDescriptorV1): string {
  const canonical: RelayDropDescriptorV1 = {
    schemaVersion: 1,
    id: descriptor.id,
    type: descriptor.type,
    createdAt: descriptor.createdAt,
    source: descriptor.source
  };

  if (descriptor.text !== undefined) {
    canonical.text = descriptor.text;
  }

  if (descriptor.caption !== undefined) {
    canonical.caption = descriptor.caption;
  }

  if (descriptor.file) {
    canonical.file = {
      driveItemId: descriptor.file.driveItemId,
      displayName: descriptor.file.displayName,
      size: descriptor.file.size,
      mediaType: descriptor.file.mediaType,
      sha256: descriptor.file.sha256
    };
  }

  return JSON.stringify(canonical);
}

export function parseDescriptor(value: unknown): RelayDropDescriptorV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new RelayDropValidationError("Unsupported descriptor schema.");
  }

  const id = requiredString(value.id, "id");
  const type = value.type;
  const createdAt = requiredString(value.createdAt, "createdAt");
  const source = value.source;

  if (!isUuid(id)) {
    throw new RelayDropValidationError("Descriptor id is invalid.");
  }

  if (!isValidDate(createdAt)) {
    throw new RelayDropValidationError("Descriptor createdAt is invalid.");
  }

  if (source !== "phone" && source !== "desktop" && source !== "tablet") {
    throw new RelayDropValidationError("Descriptor source is invalid.");
  }

  if (type === "text" || type === "link") {
    const text = requiredString(value.text, "text");
    if (text.length > MAX_TEXT_LENGTH) {
      throw new RelayDropValidationError("Descriptor text is too long.");
    }
    if (type === "link" && !isSafeHttpUrl(text)) {
      throw new RelayDropValidationError("Descriptor link is invalid.");
    }

    return {
      schemaVersion: 1,
      id,
      type,
      createdAt,
      source,
      text
    };
  }

  if (type === "image" || type === "file") {
    if (!isRecord(value.file)) {
      throw new RelayDropValidationError("Descriptor file metadata is required.");
    }

    const size = value.file.size;
    const sha256 = requiredString(value.file.sha256, "sha256").toLowerCase();
    const displayName = requiredBoundedString(
      value.file.displayName,
      "displayName",
      MAX_DISPLAY_NAME_LENGTH
    );

    if (!Number.isSafeInteger(size) || Number(size) < 0 || Number(size) > MAX_FILE_BYTES) {
      throw new RelayDropValidationError("Descriptor file size is invalid.");
    }

    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new RelayDropValidationError("Descriptor file digest is invalid.");
    }
    if (hasUnsafeFileNameControls(displayName)) {
      throw new RelayDropValidationError(
        "Descriptor displayName contains unsafe control characters."
      );
    }

    return {
      schemaVersion: 1,
      id,
      type,
      createdAt,
      source,
      caption: optionalBoundedString(value.caption, "caption", MAX_CAPTION_LENGTH),
      file: {
        driveItemId: requiredBoundedString(
          value.file.driveItemId,
          "driveItemId",
          MAX_DRIVE_ITEM_ID_LENGTH
        ),
        displayName,
        size: Number(size),
        mediaType: requiredBoundedString(
          value.file.mediaType,
          "mediaType",
          MAX_MEDIA_TYPE_LENGTH
        ),
        sha256
      }
    };
  }

  throw new RelayDropValidationError("Descriptor type is invalid.");
}

export function descriptorToItem(
  descriptor: RelayDropDescriptorV1,
  serverCreatedAt: string
): RelayDropItem {
  if (descriptor.type === "text" || descriptor.type === "link") {
    const item: RelayDropTextItem = {
      id: descriptor.id,
      type: descriptor.type,
      createdAt: descriptor.createdAt,
      serverCreatedAt,
      source: descriptor.source,
      text: descriptor.text ?? ""
    };
    return item;
  }

  const file = descriptor.file;
  if (!file) {
    throw new RelayDropValidationError("File metadata is required.");
  }

  const item: RelayDropFileItem = {
    id: descriptor.id,
    type: descriptor.type,
    createdAt: descriptor.createdAt,
    serverCreatedAt,
    source: descriptor.source,
    caption: descriptor.caption,
    file: {
      name: file.displayName,
      size: file.size,
      mediaType: file.mediaType
    }
  };
  return item;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) {
    throw new RelayDropValidationError("Descriptor " + field + " is required.");
  }
  return value;
}

function requiredBoundedString(value: unknown, field: string, maximum: number): string {
  const parsed = requiredString(value, field);
  if (parsed.length > maximum) {
    throw new RelayDropValidationError("Descriptor " + field + " is too long.");
  }
  return parsed;
}

function optionalBoundedString(
  value: unknown,
  field: string,
  maximum: number
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > maximum) {
    throw new RelayDropValidationError("Descriptor " + field + " is invalid.");
  }
  return value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

export class RelayDropValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayDropValidationError";
  }
}

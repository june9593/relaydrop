import { sha256 } from "@noble/hashes/sha2.js";
import {
  MAX_DESCRIPTOR_BYTES,
  MAX_FILE_BYTES,
  RelayDropValidationError,
  createFileDescriptor,
  createTextDescriptor,
  descriptorToItem,
  parseDescriptor,
  serializeDescriptor,
  validateNewFileMetadata,
  type RelayDropDescriptorV1
} from "../domain/descriptor";
import { classifyFile, sha256Hex, sanitizeStorageName } from "../domain/files";
import { sortFeed } from "../domain/feed";
import type {
  NewFileItem,
  NewTextItem,
  RelayDropFilePresentation,
  RelayDropFileItem,
  RelayDropItem,
  RelayDropPage,
  RelayDropStorageInfo,
  RelayDropTextItem
} from "../domain/types";
import { GraphApiError, GraphClient } from "./GraphClient";
import {
  RelayDropDeleteError,
  type RelayDropDeleteOptions,
  type RelayDropDeleteStep,
  type RelayDropFileUploadOptions,
  type RelayDropListOptions,
  type RelayDropRepository
} from "./RelayDropRepository";

interface GraphDriveItem {
  id: string;
  name: string;
  size?: number;
  createdDateTime?: string;
  eTag?: string;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  webUrl?: string;
  parentReference?: { id?: string };
  "@microsoft.graph.downloadUrl"?: string;
}

interface GraphThumbnail {
  url?: string;
}

interface GraphThumbnailSet {
  small?: GraphThumbnail;
  medium?: GraphThumbnail;
  large?: GraphThumbnail;
}

interface GraphCollection<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

interface FolderSet {
  appRoot: GraphDriveItem;
  feed: GraphDriveItem;
  blobs: GraphDriveItem;
}

const STORAGE_INFO_TTL_MS = 60_000;
const MAX_GRAPH_LIST_PAGES = 100;
const MAX_GRAPH_LIST_ITEMS = 20_000;

export class OneDriveRelayDropRepository implements RelayDropRepository {
  private lifecycleVersion = 0;
  private storageInfoVersion = 0;
  private folderPromise?: Promise<FolderSet>;
  private storageInfoRequest?: Promise<RelayDropStorageInfo>;
  private storageInfoCache?: {
    value: RelayDropStorageInfo;
    expiresAt: number;
  };
  private feedIndex: GraphDriveItem[] | null = null;
  private readonly descriptorItems = new Map<string, GraphDriveItem>();
  private readonly fileItems = new Map<string, string>();
  private readonly descriptorCache = new Map<
    string,
    { eTag?: string; descriptor: RelayDropDescriptorV1 }
  >();
  private readonly presentationCache = new Map<string, RelayDropFilePresentation>();

  constructor(private readonly graph: GraphClient) {}

  async getStorageInfo(): Promise<RelayDropStorageInfo> {
    const cached = this.storageInfoCache;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    if (this.storageInfoRequest) {
      return this.storageInfoRequest;
    }

    const lifecycleVersion = this.lifecycleVersion;
    const storageInfoVersion = this.storageInfoVersion;
    const request = this.graph
      .json<GraphDriveItem>("/me/drive/special/approot?$select=id,name,size,webUrl")
      .then((appRoot) => {
        this.assertActive(lifecycleVersion);
        const manageUrl = safeMicrosoftContentUrl(appRoot.webUrl);
        const value: RelayDropStorageInfo = {
          usedBytes: validByteSize(appRoot.size),
          ...(manageUrl ? { manageUrl } : {})
        };

        if (storageInfoVersion === this.storageInfoVersion) {
          this.storageInfoCache = {
            value,
            expiresAt: Date.now() + STORAGE_INFO_TTL_MS
          };
        }
        return value;
      })
      .finally(() => {
        if (this.storageInfoRequest === request) {
          this.storageInfoRequest = undefined;
        }
      });

    this.storageInfoRequest = request;
    return request;
  }

  async listItems(options: RelayDropListOptions = {}): Promise<RelayDropPage> {
    const folders = await this.folders();
    if (!options.cursor || !this.feedIndex) {
      this.feedIndex = sortDriveItems(
        (await this.listAllChildren(folders.feed.id)).filter((item) =>
          item.name.endsWith(".json")
        )
      );
      this.reconcileCaches(this.feedIndex);
      this.clearPresentationCache();
    }

    const feedIndex = this.feedIndex;
    const limit = Math.max(1, Math.min(options.limit ?? 12, 50));
    const start = options.cursor ? findCursorStart(feedIndex, options.cursor) : 0;
    const driveItems = feedIndex.slice(start, start + limit);
    const loaded = await mapWithConcurrency(driveItems, 6, async (driveItem) => {
      try {
        const descriptor = await this.loadCachedDescriptor(driveItem);
        this.descriptorItems.set(descriptor.id, driveItem);
        if (descriptor.file) {
          this.fileItems.set(descriptor.id, descriptor.file.driveItemId);
        }
        return descriptorToItem(
          descriptor,
          driveItem.createdDateTime ?? descriptor.createdAt
        );
      } catch (error) {
        if (
          error instanceof RelayDropValidationError ||
          error instanceof SyntaxError ||
          (error instanceof GraphApiError && error.status === 404)
        ) {
          return null;
        }
        throw error;
      }
    });

    const items = sortFeed(loaded.filter((item): item is RelayDropItem => item !== null));
    const lastDriveItem = driveItems.at(-1);
    return {
      items,
      total: feedIndex.length,
      nextCursor:
        start + driveItems.length < feedIndex.length && lastDriveItem
          ? cursorFor(lastDriveItem)
          : undefined
    };
  }

  async createText(input: NewTextItem): Promise<RelayDropTextItem> {
    try {
      const folders = await this.folders();
      const descriptor = createTextDescriptor(input);
      const driveItem = await this.publishDescriptor(folders.feed.id, descriptor);
      this.descriptorItems.set(descriptor.id, driveItem);
      this.feedIndex = null;
      return descriptorToItem(
        descriptor,
        driveItem.createdDateTime ?? descriptor.createdAt
      ) as RelayDropTextItem;
    } finally {
      this.invalidateStorageInfo();
    }
  }

  async createFile(
    input: NewFileItem,
    options: RelayDropFileUploadOptions = {}
  ): Promise<RelayDropFileItem> {
    validateNewFileMetadata(input.file);

    try {
      throwIfAborted(options.signal);
      options.onProgress?.({ phase: "preparing" });
      const folders = await this.folders();
      const digest = await sha256Hex(input.file);
      throwIfAborted(options.signal);
      options.onProgress?.({ phase: "checking" });
      const blobFolder = await this.ensureFolder(folders.blobs.id, input.id);
      const storageName = sanitizeStorageName(input.file.name);
      const blobItem = await this.uploadBlob(
        blobFolder.id,
        storageName,
        input.file,
        digest,
        options
      );
      throwIfAborted(options.signal);
      options.onProgress?.({ phase: "publishing" });
      const descriptor = createFileDescriptor(input, blobItem.id, digest);
      const descriptorItem = await this.publishDescriptor(folders.feed.id, descriptor);
      this.descriptorItems.set(descriptor.id, descriptorItem);
      this.fileItems.set(descriptor.id, blobItem.id);
      this.feedIndex = null;
      try {
        const metadata = await this.graph.json<GraphDriveItem>(
          "/me/drive/items/" + encodeURIComponent(blobItem.id)
        );
        if (fileMetadataMatchesDescriptor(descriptor, metadata, blobFolder.id)) {
          this.presentationCache.set(
            descriptor.id,
            presentationFromMetadata(descriptor, metadata)
          );
        }
      } catch {
        // The descriptor is already published. Presentation metadata is loaded lazily later.
      }

      return descriptorToItem(
        descriptor,
        descriptorItem.createdDateTime ?? descriptor.createdAt
      ) as RelayDropFileItem;
    } finally {
      this.invalidateStorageInfo();
    }
  }

  async getFilePresentation(id: string): Promise<RelayDropFilePresentation> {
    const lifecycleVersion = this.lifecycleVersion;
    const cached = this.presentationCache.get(id);
    if (cached?.thumbnailUrl || (cached && !canHaveThumbnail(cached.kind))) {
      return cached;
    }

    let presentation = cached;
    let itemId = this.fileItems.get(id);
    if (!presentation || !itemId) {
      const descriptor = await this.resolveDescriptor(id);
      if (!descriptor.file) {
        throw new Error("This RelayDrop item does not contain a file.");
      }

      itemId = descriptor.file.driveItemId;
      const metadata = await this.resolveOwnedFileMetadata(descriptor, itemId);
      presentation = presentationFromMetadata(descriptor, metadata);
    }

    if (canHaveThumbnail(presentation.kind)) {
      try {
        const response = await this.graph.response(
          "/me/drive/items/" +
            encodeURIComponent(itemId) +
            "/thumbnails/0/large/content"
        );
        const thumbnail = await response.blob();
        this.assertActive(lifecycleVersion);
        if (thumbnail.size > 0) {
          presentation.thumbnailUrl = URL.createObjectURL(thumbnail);
        }
      } catch (error) {
        if (lifecycleVersion !== this.lifecycleVersion) throw error;
        try {
          const thumbnails = await this.graph.json<GraphCollection<GraphThumbnailSet>>(
            "/me/drive/items/" +
              encodeURIComponent(itemId) +
              "/thumbnails?$select=small,medium,large"
          );
          this.assertActive(lifecycleVersion);
          const thumbnail = thumbnails.value[0];
          presentation.thumbnailUrl = safeMicrosoftContentUrl(
            thumbnail?.large?.url ?? thumbnail?.medium?.url ?? thumbnail?.small?.url
          );
        } catch (fallbackError) {
          if (lifecycleVersion !== this.lifecycleVersion) throw fallbackError;
          // A generated thumbnail is optional. Opening the original must still work.
        }
      }
    }

    this.assertActive(lifecycleVersion);
    this.presentationCache.set(id, presentation);
    return presentation;
  }

  async downloadFile(id: string): Promise<Blob> {
    const descriptor = await this.resolveDescriptor(id);
    const descriptorFile = descriptor.file;
    if (!descriptorFile) {
      throw new Error("This RelayDrop item does not contain a file.");
    }
    const metadata = await this.resolveOwnedFileMetadata(
      descriptor,
      this.fileItems.get(id) ?? descriptorFile.driveItemId
    );

    const response = await this.graph.response(
      "/me/drive/items/" + encodeURIComponent(metadata.id) + "/content"
    );
    const downloaded = await readBoundedBlob(response, descriptorFile.size);
    if (
      downloaded.blob.size !== descriptorFile.size ||
      downloaded.sha256 !== descriptorFile.sha256
    ) {
      throw new RelayDropValidationError(
        "The downloaded file failed its integrity check. Refresh and try again."
      );
    }
    return downloaded.blob;
  }

  async deleteItem(id: string, options: RelayDropDeleteOptions = {}): Promise<void> {
    const completedSteps: RelayDropDeleteStep[] = [];
    const runStep = async (
      step: RelayDropDeleteStep,
      operation: () => Promise<void>
    ) => {
      options.onProgress?.({ step, completedSteps: [...completedSteps] });
      try {
        await operation();
        completedSteps.push(step);
      } catch (caught) {
        throw new RelayDropDeleteError(
          step,
          completedSteps,
          deleteStepErrorMessage(step),
          { cause: caught }
        );
      }
    };

    try {
      let folders: FolderSet | undefined;
      let descriptorItem: GraphDriveItem | null | undefined;
      let descriptor: RelayDropDescriptorV1 | undefined;
      let blobFolder: GraphDriveItem | null | undefined;
      let verifiedFileItemId: string | undefined;
      await runStep("locating", async () => {
        folders = await this.folders();
        descriptorItem =
          this.descriptorItems.get(id) ??
          (await this.getItemByPath(folders.feed.id, id + ".json"));
        if (descriptorItem) {
          descriptor = await this.loadDescriptor(descriptorItem);
          if (descriptor.file) {
            blobFolder = await this.getItemByPath(folders.blobs.id, id);
            if (blobFolder?.folder) {
              try {
                const candidate = await this.graph.json<GraphDriveItem>(
                  "/me/drive/items/" +
                    encodeURIComponent(descriptor.file.driveItemId) +
                    "?$select=id,name,file,parentReference"
                );
                if (
                  candidate.file &&
                  candidate.parentReference?.id === blobFolder.id &&
                  candidate.name === sanitizeStorageName(descriptor.file.displayName)
                ) {
                  verifiedFileItemId = candidate.id;
                }
              } catch (error) {
                if (!(error instanceof GraphApiError && error.status === 404)) throw error;
              }
            }
          }
        }
      });

      if (!descriptorItem) {
        return;
      }

      const descriptorItemId = descriptorItem.id;

      if (descriptor?.file) {
        await runStep("file", async () => {
          if (verifiedFileItemId) await this.deleteIfPresent(verifiedFileItemId);
        });
        await runStep("folder", async () => {
          if (blobFolder) await this.deleteIfPresent(blobFolder.id);
        });
      }

      await runStep("descriptor", () => this.deleteIfPresent(descriptorItemId));
      this.descriptorItems.delete(id);
      this.fileItems.delete(id);
      const presentation = this.presentationCache.get(id);
      if (presentation?.thumbnailUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(presentation.thumbnailUrl);
      }
      this.presentationCache.delete(id);
      this.descriptorCache.delete(descriptorItemId);
      this.feedIndex =
        this.feedIndex?.filter((item) => item.id !== descriptorItemId) ?? null;
    } finally {
      this.invalidateStorageInfo();
    }
  }

  dispose(): void {
    this.lifecycleVersion += 1;
    this.invalidateStorageInfo();
    this.clearPresentationCache();
    this.folderPromise = undefined;
    this.feedIndex = null;
    this.descriptorItems.clear();
    this.fileItems.clear();
    this.descriptorCache.clear();
  }

  private assertActive(expectedVersion: number): void {
    if (this.lifecycleVersion !== expectedVersion) {
      throw new Error("This RelayDrop repository is no longer active.");
    }
  }

  private invalidateStorageInfo(): void {
    this.storageInfoVersion += 1;
    this.storageInfoCache = undefined;
    this.storageInfoRequest = undefined;
  }

  private folders(): Promise<FolderSet> {
    if (!this.folderPromise) {
      this.folderPromise = this.initializeFolders();
    }
    return this.folderPromise;
  }

  private async initializeFolders(): Promise<FolderSet> {
    const appRoot = await this.graph.json<GraphDriveItem>(
      "/me/drive/special/approot?$select=id,name"
    );
    const [feed, blobs] = await Promise.all([
      this.ensureFolder(appRoot.id, "feed"),
      this.ensureFolder(appRoot.id, "blobs")
    ]);
    return { appRoot, feed, blobs };
  }

  private async ensureFolder(parentId: string, name: string): Promise<GraphDriveItem> {
    const existing = await this.getItemByPath(parentId, name);
    if (existing?.folder) {
      return existing;
    }

    try {
      return await this.graph.json<GraphDriveItem>(
        "/me/drive/items/" + encodeURIComponent(parentId) + "/children",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            folder: {},
            "@microsoft.graph.conflictBehavior": "fail"
          })
        }
      );
    } catch (error) {
      if (error instanceof GraphApiError && error.status === 409) {
        const concurrent = await this.getItemByPath(parentId, name);
        if (concurrent?.folder) {
          return concurrent;
        }
      }
      throw error;
    }
  }

  private async listAllChildren(parentId: string): Promise<GraphDriveItem[]> {
    const results: GraphDriveItem[] = [];
    const visitedPages = new Set<string>();
    let path: string | undefined =
      "/me/drive/items/" +
      encodeURIComponent(parentId) +
      "/children?$select=id,name,size,createdDateTime,eTag,file,folder&$top=200";

    while (path) {
      if (visitedPages.has(path)) {
        throw new RelayDropValidationError("Microsoft Graph returned a pagination loop.");
      }
      if (visitedPages.size >= MAX_GRAPH_LIST_PAGES) {
        throw new RelayDropValidationError("Microsoft Graph returned too many pages.");
      }
      visitedPages.add(path);
      const page: GraphCollection<GraphDriveItem> =
        await this.graph.json<GraphCollection<GraphDriveItem>>(path);
      if (!Array.isArray(page.value)) {
        throw new RelayDropValidationError("Microsoft Graph returned an invalid item page.");
      }
      if (results.length + page.value.length > MAX_GRAPH_LIST_ITEMS) {
        throw new RelayDropValidationError("RelayDrop contains too many items to load safely.");
      }
      results.push(...page.value);
      path = page["@odata.nextLink"];
    }

    return results;
  }

  private async getItemByPath(
    parentId: string,
    name: string
  ): Promise<GraphDriveItem | null> {
    try {
      return await this.graph.json<GraphDriveItem>(
        "/me/drive/items/" +
          encodeURIComponent(parentId) +
          ":/" +
          encodeURIComponent(name) +
          "?$select=id,name,size,createdDateTime,eTag,file,folder"
      );
    } catch (error) {
      if (error instanceof GraphApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  private async loadDescriptor(driveItem: GraphDriveItem): Promise<RelayDropDescriptorV1> {
    if (typeof driveItem.size === "number" && driveItem.size > MAX_DESCRIPTOR_BYTES) {
      throw new RelayDropValidationError("Descriptor document is too large.");
    }
    const content = await this.graph.text(
      "/me/drive/items/" + encodeURIComponent(driveItem.id) + "/content"
    );
    if (new TextEncoder().encode(content).byteLength > MAX_DESCRIPTOR_BYTES) {
      throw new RelayDropValidationError("Descriptor document is too large.");
    }
    const descriptor = parseDescriptor(JSON.parse(content) as unknown);
    if (driveItem.name !== descriptor.id + ".json") {
      throw new RelayDropValidationError(
        "Descriptor id does not match its feed filename."
      );
    }
    return descriptor;
  }

  private async loadCachedDescriptor(
    driveItem: GraphDriveItem
  ): Promise<RelayDropDescriptorV1> {
    const cached = this.descriptorCache.get(driveItem.id);
    if (cached && cached.eTag === driveItem.eTag) {
      return cached.descriptor;
    }

    const descriptor = await this.loadDescriptor(driveItem);
    this.descriptorCache.set(driveItem.id, { eTag: driveItem.eTag, descriptor });
    return descriptor;
  }

  private async resolveDescriptor(id: string): Promise<RelayDropDescriptorV1> {
    const folders = await this.folders();
    const descriptorItem =
      this.descriptorItems.get(id) ??
      (await this.getItemByPath(folders.feed.id, id + ".json"));
    if (!descriptorItem) {
      throw new Error("The file item no longer exists.");
    }

    const descriptor = await this.loadCachedDescriptor(descriptorItem);
    this.descriptorItems.set(id, descriptorItem);
    if (descriptor.file) {
      this.fileItems.set(id, descriptor.file.driveItemId);
    }
    return descriptor;
  }

  private async resolveOwnedFileMetadata(
    descriptor: RelayDropDescriptorV1,
    fileItemId: string
  ): Promise<GraphDriveItem> {
    if (!descriptor.file) {
      throw new Error("This RelayDrop item does not contain a file.");
    }
    const folders = await this.folders();
    const blobFolder = await this.getItemByPath(folders.blobs.id, descriptor.id);
    if (!blobFolder?.folder) {
      throw new Error("The file is no longer available in OneDrive.");
    }

    let metadata: GraphDriveItem;
    try {
      metadata = await this.graph.json<GraphDriveItem>(
        "/me/drive/items/" + encodeURIComponent(fileItemId)
      );
    } catch (error) {
      if (error instanceof GraphApiError && error.status === 404) {
        throw new Error("The file is no longer available in OneDrive.");
      }
      throw error;
    }
    if (!fileMetadataMatchesDescriptor(descriptor, metadata, blobFolder.id)) {
      throw new RelayDropValidationError(
        "The OneDrive file no longer matches this RelayDrop item."
      );
    }
    return metadata;
  }

  private reconcileCaches(driveItems: GraphDriveItem[]): void {
    const currentIds = new Set(driveItems.map((item) => item.id));
    for (const descriptorItemId of this.descriptorCache.keys()) {
      if (!currentIds.has(descriptorItemId)) {
        this.descriptorCache.delete(descriptorItemId);
      }
    }
  }

  private clearPresentationCache(): void {
    for (const presentation of this.presentationCache.values()) {
      if (presentation.thumbnailUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(presentation.thumbnailUrl);
      }
    }
    this.presentationCache.clear();
  }

  private async publishDescriptor(
    feedFolderId: string,
    descriptor: RelayDropDescriptorV1
  ): Promise<GraphDriveItem> {
    const name = descriptor.id + ".json";
    const serialized = serializeDescriptor(descriptor);
    const existing = await this.getItemByPath(feedFolderId, name);

    if (existing) {
      const existingContent = await this.graph.text(
        "/me/drive/items/" + encodeURIComponent(existing.id) + "/content"
      );
      if (existingContent === serialized) {
        return existing;
      }
      throw new RelayDropConflictError("A different item already uses this RelayDrop id.");
    }

    try {
      return await this.graph.json<GraphDriveItem>(
        "/me/drive/items/" +
          encodeURIComponent(feedFolderId) +
          ":/" +
          encodeURIComponent(name) +
          ":/content",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: serialized
        }
      );
    } catch (error) {
      const retryItem = await this.getItemByPath(feedFolderId, name);
      if (retryItem) {
        const content = await this.graph.text(
          "/me/drive/items/" + encodeURIComponent(retryItem.id) + "/content"
        );
        if (content === serialized) {
          return retryItem;
        }
      }
      throw error;
    }
  }

  private async uploadBlob(
    parentId: string,
    name: string,
    file: File,
    digest: string,
    options: RelayDropFileUploadOptions
  ): Promise<GraphDriveItem> {
    throwIfAborted(options.signal);
    const existing = await this.getItemByPath(parentId, name);

    if (existing) {
      if (existing.size !== file.size) {
        throw new RelayDropConflictError("An existing file has a different size.");
      }

      const remote = await this.graph.response(
        "/me/drive/items/" + encodeURIComponent(existing.id) + "/content",
        { signal: options.signal }
      );
      const remoteDigest = (await readBoundedBlob(remote, file.size)).sha256;
      throwIfAborted(options.signal);
      if (remoteDigest !== digest) {
        throw new RelayDropConflictError("An existing file has different content.");
      }
      return existing;
    }

    return this.graph.uploadJson<GraphDriveItem>(
      "/me/drive/items/" +
        encodeURIComponent(parentId) +
        ":/" +
        encodeURIComponent(name) +
        ":/content",
      file,
      {
        headers: {
          "Content-Type": file.type || "application/octet-stream"
        },
        signal: options.signal,
        onProgress: (progress) =>
          options.onProgress?.({
            phase: "uploading",
            loadedBytes: progress.loadedBytes,
            totalBytes: progress.totalBytes,
            attempt: progress.attempt
          })
      }
    );
  }

  private async deleteIfPresent(itemId: string): Promise<void> {
    try {
      await this.graph.response("/me/drive/items/" + encodeURIComponent(itemId), {
        method: "DELETE"
      });
    } catch (error) {
      if (!(error instanceof GraphApiError && error.status === 404)) {
        throw error;
      }
    }
  }
}

export class RelayDropConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayDropConflictError";
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );
  return results;
}

function sortDriveItems(items: GraphDriveItem[]): GraphDriveItem[] {
  return [...items].sort(compareDriveItems);
}

function compareDriveItems(left: GraphDriveItem, right: GraphDriveItem): number {
  const dateComparison = (right.createdDateTime ?? "").localeCompare(
    left.createdDateTime ?? ""
  );
  return dateComparison || left.name.localeCompare(right.name);
}

function cursorFor(item: GraphDriveItem): string {
  return JSON.stringify([item.createdDateTime ?? "", item.name]);
}

function findCursorStart(items: GraphDriveItem[], cursor: string): number {
  try {
    const parsed = JSON.parse(cursor) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string"
    ) {
      return 0;
    }

    const cursorItem: GraphDriveItem = {
      id: "cursor",
      createdDateTime: parsed[0],
      name: parsed[1]
    };
    const exactIndex = items.findIndex((item) => cursorFor(item) === cursor);
    if (exactIndex >= 0) {
      return exactIndex + 1;
    }

    const nextIndex = items.findIndex((item) => compareDriveItems(item, cursorItem) > 0);
    return nextIndex >= 0 ? nextIndex : items.length;
  } catch {
    return 0;
  }
}

function presentationFromMetadata(
  descriptor: RelayDropDescriptorV1,
  metadata: GraphDriveItem
): RelayDropFilePresentation {
  if (!descriptor.file) {
    throw new Error("This RelayDrop item does not contain a file.");
  }

  return {
    kind: classifyFile(descriptor.file.mediaType, descriptor.file.displayName),
    previewUrl: safeMicrosoftContentUrl(metadata["@microsoft.graph.downloadUrl"]),
    openUrl: safeMicrosoftContentUrl(metadata.webUrl)
  };
}

function fileMetadataMatchesDescriptor(
  descriptor: RelayDropDescriptorV1,
  metadata: GraphDriveItem,
  expectedParentId: string
): boolean {
  const file = descriptor.file;
  return Boolean(
    file &&
      metadata.id === file.driveItemId &&
      metadata.file &&
      metadata.parentReference?.id === expectedParentId &&
      metadata.name === sanitizeStorageName(file.displayName) &&
      metadata.size === file.size
  );
}

function canHaveThumbnail(kind: RelayDropFilePresentation["kind"]): boolean {
  return [
    "image",
    "video",
    "pdf",
    "document",
    "spreadsheet",
    "presentation"
  ].includes(kind);
}

function validByteSize(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0;
}

async function readBoundedBlob(
  response: Response,
  expectedBytes: number
): Promise<{ blob: Blob; sha256: string }> {
  const contentLength = Number(response.headers.get("Content-Length"));
  if (
    Number.isFinite(contentLength) &&
    (contentLength > expectedBytes || contentLength > MAX_FILE_BYTES)
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new RelayDropValidationError(
      "The downloaded file exceeded its declared size."
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    if (expectedBytes !== 0) {
      throw new RelayDropValidationError("The downloaded file was incomplete.");
    }
    return {
      blob: new Blob([], { type: response.headers.get("Content-Type") ?? "" }),
      sha256: bytesToHex(sha256(new Uint8Array()))
    };
  }

  const chunks: BlobPart[] = [];
  const digest = sha256.create();
  let receivedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > expectedBytes || receivedBytes > MAX_FILE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new RelayDropValidationError(
        "The downloaded file exceeded its declared size."
      );
    }
    digest.update(value);
    chunks.push(value);
  }

  if (receivedBytes !== expectedBytes) {
    throw new RelayDropValidationError("The downloaded file was incomplete.");
  }
  return {
    blob: new Blob(chunks, { type: response.headers.get("Content-Type") ?? "" }),
    sha256: bytesToHex(digest.digest())
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function safeMicrosoftContentUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const allowedHost =
      ["onedrive.live.com", "1drv.ms", "storage.live.com"].includes(hostname) ||
      [
        ".onedrive.com",
        ".1drv.com",
        ".storage.live.com",
        ".livefilestore.com",
        ".microsoftpersonalcontent.com",
        ".svc.ms"
      ].some((suffix) => hostname.endsWith(suffix));
    return url.protocol === "https:" && !url.username && !url.password && allowedHost
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was cancelled.", "AbortError");
  }
}

function deleteStepErrorMessage(step: RelayDropDeleteStep): string {
  switch (step) {
    case "locating":
      return "RelayDrop could not inspect this item before deleting it.";
    case "file":
      return "The file data could not be removed from OneDrive.";
    case "folder":
      return "The item's OneDrive folder could not be removed.";
    case "descriptor":
      return "The feed entry could not be removed from OneDrive.";
  }
}

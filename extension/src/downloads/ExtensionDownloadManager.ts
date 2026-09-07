import type {
  RelayDropDownloadManager,
  RelayDropDownloadRequest,
  RelayDropDownloadState,
  RelayDropDownloadStatus
} from "../../../src/downloads/RelayDropDownloadManager";
import {
  isPotentiallyExecutableFileName,
  stripUnsafeFileNameControls
} from "../../../src/domain/files";

const DOWNLOADS_KEY_PREFIX = "relaydrop.extension.downloads.v1.";
const DOWNLOAD_DIRECTORY = "RelayDrop";

interface ExtensionStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface ExtensionDownloadItem {
  id: number;
  filename: string;
  state: "in_progress" | "interrupted" | "complete";
  danger?: string;
  exists?: boolean;
  bytesReceived?: number;
  totalBytes?: number;
}

interface ExtensionDownloadDelta {
  id: number;
  state?: { current?: ExtensionDownloadItem["state"] };
  exists?: { current?: boolean };
  bytesReceived?: { current?: number };
  totalBytes?: { current?: number };
  filename?: { current?: string };
}

interface ExtensionDownloadsApi {
  download(options: {
    url: string;
    filename: string;
    conflictAction: "uniquify";
    saveAs: false;
  }): Promise<number>;
  search(query: { id: number }): Promise<ExtensionDownloadItem[]>;
  open(downloadId: number): Promise<void> | void;
  show(downloadId: number): void;
  removeFile(downloadId: number): Promise<void>;
  onChanged: {
    addListener(listener: (delta: ExtensionDownloadDelta) => void): void;
    removeListener(listener: (delta: ExtensionDownloadDelta) => void): void;
  };
}

interface ExtensionDownloadPlatform {
  downloads: ExtensionDownloadsApi;
  storage: ExtensionStorageArea;
}

export interface ExtensionDownloadLockManager {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

interface StoredDownloadRecord {
  itemId: string;
  downloadId: number;
  fileName: string;
}

export class ExtensionDownloadManager implements RelayDropDownloadManager {
  private readonly key: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly active = new Map<string, Promise<RelayDropDownloadState>>();
  private readonly recordCache = new Map<string, StoredDownloadRecord>();
  private readonly dirtyRecords = new Map<string, StoredDownloadRecord>();
  private readonly changeSequences = new Map<number, number>();
  private readonly stateListeners = new Set<
    (state: RelayDropDownloadState) => void
  >();
  private readonly platformChangeListener = (delta: ExtensionDownloadDelta) => {
    if (delta.state || delta.exists || delta.filename) {
      const sequence = (this.changeSequences.get(delta.id) ?? 0) + 1;
      this.changeSequences.set(delta.id, sequence);
      void this.publishDownloadChange(delta, sequence).catch(() => undefined);
    }
  };

  constructor(
    accountId: string,
    private readonly platform: ExtensionDownloadPlatform = getDefaultPlatform(),
    private readonly locks: ExtensionDownloadLockManager | undefined = getDefaultLockManager()
  ) {
    this.key = DOWNLOADS_KEY_PREFIX + encodeURIComponent(accountId);
  }

  async getStates(itemIds: string[]): Promise<Record<string, RelayDropDownloadState>> {
    const records = await this.readRecords();
    const requested = new Set(itemIds);
    const states = await Promise.all(
      Object.values(records)
        .filter((record) => requested.has(record.itemId))
        .map((record) => this.resolveRecord(record))
    );
    return Object.fromEntries(states.map((state) => [state.itemId, state]));
  }

  subscribe(listener: (state: RelayDropDownloadState) => void): () => void {
    if (this.stateListeners.size === 0) {
      this.platform.downloads.onChanged.addListener(this.platformChangeListener);
    }
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
      if (this.stateListeners.size === 0) {
        this.platform.downloads.onChanged.removeListener(this.platformChangeListener);
        this.changeSequences.clear();
      }
    };
  }

  download(request: RelayDropDownloadRequest): Promise<RelayDropDownloadState> {
    const pending = this.active.get(request.itemId);
    if (pending) return pending;

    const operation = this.withItemLock(request.itemId, () =>
      this.downloadOnce(request)
    ).finally(() => {
      if (this.active.get(request.itemId) === operation) {
        this.active.delete(request.itemId);
      }
    });
    this.active.set(request.itemId, operation);
    return operation;
  }

  private withItemLock<T>(itemId: string, operation: () => Promise<T>): Promise<T> {
    return this.locks
      ? this.locks.request(`relaydrop-download:${this.key}:${itemId}`, operation)
      : operation();
  }

  private withRecordsLock<T>(operation: () => Promise<T>): Promise<T> {
    return this.locks
      ? this.locks.request(`relaydrop-download-records:${this.key}`, operation)
      : operation();
  }

  async open(itemId: string): Promise<void> {
    const { record, item: current } = await this.requireCompleteDownload(itemId);
    const localFileName = current?.filename.split(/[\\/]/).pop() ?? record.fileName;
    if (
      isPotentiallyExecutableFileName(record.fileName) ||
      isPotentiallyExecutableFileName(localFileName) ||
      (current.danger !== undefined && current.danger !== "safe")
    ) {
      throw new Error(
        "RelayDrop does not directly open files that may contain active content. Show the file in its folder and review it first."
      );
    }
    await this.platform.downloads.open(record.downloadId);
  }

  async show(itemId: string): Promise<void> {
    const { record } = await this.requireCompleteDownload(itemId);
    this.platform.downloads.show(record.downloadId);
  }

  deleteLocal(itemId: string): Promise<RelayDropDownloadState> {
    return this.withItemLock(itemId, async () => {
      const records = await this.readRecords();
      const record = records[itemId];
      if (!record) {
        throw new Error("This file has not been downloaded on this device.");
      }

      const current = await this.resolveRecord(record);
      if (current.status === "missing") return current;
      if (current.status !== "complete") {
        throw new Error("Wait for the local download to finish before deleting it.");
      }

      try {
        await this.platform.downloads.removeFile(record.downloadId);
      } catch (caught) {
        const latest = await this.resolveRecord(record);
        if (latest.status === "missing") return latest;
        throw caught;
      }

      return {
        itemId: record.itemId,
        fileName: record.fileName,
        status: "missing"
      };
    });
  }

  private async downloadOnce(
    request: RelayDropDownloadRequest
  ): Promise<RelayDropDownloadState> {
    const records = await this.readRecords();
    const existing = records[request.itemId];
    if (existing) {
      const current = await this.resolveRecord(existing);
      request.onStateChange?.(current);
      if (current.status === "complete") return current;
      if (current.status === "downloading") {
        return this.waitForDownload(existing, request.onStateChange);
      }
    }

    const blob = await request.loadBlob();
    const objectUrl = URL.createObjectURL(blob);
    let downloadId: number;
    try {
      downloadId = await this.platform.downloads.download({
        url: objectUrl,
        filename: `${DOWNLOAD_DIRECTORY}/${sanitizeDownloadFileName(request.fileName)}`,
        conflictAction: "uniquify",
        saveAs: false
      });
    } finally {
      globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
    const record: StoredDownloadRecord = {
      itemId: request.itemId,
      downloadId,
      fileName: request.fileName
    };
    this.recordCache.set(record.itemId, record);
    this.dirtyRecords.set(record.itemId, record);
    await this.saveRecord(record);
    request.onStateChange?.({
      itemId: request.itemId,
      downloadId,
      fileName: request.fileName,
      status: "downloading",
      bytesReceived: 0,
      totalBytes: blob.size
    });
    return this.waitForDownload(record, request.onStateChange);
  }

  private async requireCompleteDownload(
    itemId: string
  ): Promise<{ record: StoredDownloadRecord; item: ExtensionDownloadItem }> {
    const records = await this.readRecords();
    const record = records[itemId];
    if (!record) throw new Error("This file has not been downloaded on this device.");
    const [item] = await this.platform.downloads.search({ id: record.downloadId });
    if (!item || item.exists === false || item.state !== "complete") {
      throw new Error("The downloaded file is no longer available on this device.");
    }
    return { record, item };
  }

  private async publishDownloadChange(
    delta: ExtensionDownloadDelta,
    sequence: number
  ): Promise<void> {
    const cached = [...this.recordCache.values()].find(
      (record) => record.downloadId === delta.id
    );
    const record =
      cached ??
      Object.values(await this.readRecords()).find(
        (candidate) => candidate.downloadId === delta.id
      );
    if (
      !record ||
      this.stateListeners.size === 0 ||
      this.changeSequences.get(delta.id) !== sequence
    ) {
      return;
    }

    const state =
      delta.exists?.current === false
        ? {
            itemId: record.itemId,
            fileName: record.fileName,
            status: "missing" as const
          }
        : await this.resolveRecord(record);
    if (this.changeSequences.get(delta.id) !== sequence) return;
    for (const listener of this.stateListeners) listener(state);
  }

  private async resolveRecord(record: StoredDownloadRecord): Promise<RelayDropDownloadState> {
    const [item] = await this.platform.downloads.search({ id: record.downloadId });
    if (!item || item.exists === false) {
      return { itemId: record.itemId, fileName: record.fileName, status: "missing" };
    }
    return stateFromDownload(record, item);
  }

  private waitForDownload(
    record: StoredDownloadRecord,
    onStateChange?: (state: RelayDropDownloadState) => void
  ): Promise<RelayDropDownloadState> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let inspectionSequence = 0;
      const finish = (state: RelayDropDownloadState, error?: Error) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        this.platform.downloads.onChanged.removeListener(listener);
        onStateChange?.(state);
        if (error) reject(error);
        else resolve(state);
      };
      const inspect = async () => {
        const sequence = ++inspectionSequence;
        try {
          const state = await this.resolveRecord(record);
          if (settled || sequence !== inspectionSequence) return;
          onStateChange?.(state);
          if (state.status === "complete") finish(state);
          if (state.status === "interrupted" || state.status === "missing") {
            finish(state, new Error("The download did not complete."));
          }
        } catch (caught) {
          if (settled || sequence !== inspectionSequence) return;
          finish(
            { itemId: record.itemId, fileName: record.fileName, status: "missing" },
            caught instanceof Error ? caught : new Error("The download did not complete.")
          );
        }
      };
      const listener = (delta: ExtensionDownloadDelta) => {
        if (
          delta.id === record.downloadId &&
          (delta.state || delta.exists || delta.filename)
        ) {
          void inspect();
        }
      };
      const timeout = globalThis.setTimeout(() => {
        void inspect().then(() => {
          if (!settled) {
            finish({
              itemId: record.itemId,
              downloadId: record.downloadId,
              fileName: record.fileName,
              status: "downloading"
            });
          }
        });
      }, 10 * 60 * 1000);
      this.platform.downloads.onChanged.addListener(listener);
      void inspect();
    });
  }

  private async readRecords(): Promise<Record<string, StoredDownloadRecord>> {
    await this.writeQueue;
    let value: unknown;
    try {
      const values = await this.platform.storage.get(this.key);
      value = values[this.key];
    } catch {
      return Object.fromEntries(
        [...this.recordCache.values()].map((record) => [record.itemId, record])
      );
    }
    const records: Record<string, StoredDownloadRecord> =
      !value || typeof value !== "object" || Array.isArray(value)
        ? {}
        : Object.fromEntries(
            Object.entries(value)
              .map(([itemId, record]) => [itemId, parseRecord(record)] as const)
              .filter(
                (entry): entry is [string, StoredDownloadRecord] =>
                  entry[1] !== null
              )
              .map(([itemId, record]) => {
                const preferred = this.dirtyRecords.get(itemId) ?? record;
                this.recordCache.set(itemId, preferred);
                return [itemId, preferred] as const;
              })
          );
    for (const record of this.dirtyRecords.values()) {
      records[record.itemId] = record;
      this.recordCache.set(record.itemId, record);
    }
    for (const record of this.recordCache.values()) {
      records[record.itemId] ??= record;
    }
    return records;
  }

  private async saveRecord(record: StoredDownloadRecord): Promise<void> {
    this.recordCache.set(record.itemId, record);
    this.dirtyRecords.set(record.itemId, record);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const operation = this.writeQueue.then(() =>
        this.withRecordsLock(async () => {
          const values = await this.platform.storage.get(this.key);
          const current = values[this.key];
          const records =
            current && typeof current === "object" && !Array.isArray(current)
              ? current as Record<string, unknown>
              : {};
          await this.platform.storage.set({
            [this.key]: { ...records, [record.itemId]: record }
          });
        })
      );
      this.writeQueue = operation.catch(() => undefined);
      try {
        await operation;
        if (this.dirtyRecords.get(record.itemId)?.downloadId === record.downloadId) {
          this.dirtyRecords.delete(record.itemId);
        }
        return;
      } catch {
        // The in-memory record still prevents a duplicate in this panel.
      }
    }
  }
}

function stateFromDownload(
  record: StoredDownloadRecord,
  item: ExtensionDownloadItem
): RelayDropDownloadState {
  const status: RelayDropDownloadStatus =
    item.state === "complete"
      ? "complete"
      : item.state === "interrupted"
        ? "interrupted"
        : "downloading";
  return {
    itemId: record.itemId,
    downloadId: record.downloadId,
    fileName: record.fileName,
    localPath: item.filename,
    status,
    ...(item.bytesReceived !== undefined ? { bytesReceived: item.bytesReceived } : {}),
    ...(item.totalBytes !== undefined ? { totalBytes: item.totalBytes } : {})
  };
}

function parseRecord(value: unknown): StoredDownloadRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StoredDownloadRecord>;
  return typeof record.itemId === "string" &&
    typeof record.downloadId === "number" &&
    Number.isInteger(record.downloadId) &&
    typeof record.fileName === "string"
    ? {
        itemId: record.itemId,
        downloadId: record.downloadId,
        fileName: record.fileName
      }
    : null;
}

export function sanitizeDownloadFileName(fileName: string): string {
  const sanitized = stripUnsafeFileNameControls(fileName)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/^\.+/g, "")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 180);
  return sanitized || "download";
}

function getDefaultPlatform(): ExtensionDownloadPlatform {
  const chromeApi = (globalThis as unknown as {
    chrome?: {
      downloads?: ExtensionDownloadsApi;
      storage?: { local?: ExtensionStorageArea };
    };
  }).chrome;
  if (!chromeApi?.downloads || !chromeApi.storage?.local) {
    throw new Error("RelayDrop download APIs are unavailable.");
  }
  return { downloads: chromeApi.downloads, storage: chromeApi.storage.local };
}

function getDefaultLockManager(): ExtensionDownloadLockManager | undefined {
  return (
    globalThis as unknown as {
      navigator?: { locks?: ExtensionDownloadLockManager };
    }
  ).navigator?.locks;
}

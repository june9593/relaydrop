import type {
  RelayDropFeedCache,
  RelayDropFeedSnapshot
} from "../../../src/cache/RelayDropFeedCache";
import {
  isRelayDropRefreshDue,
  RELAYDROP_AUTO_REFRESH_LEASE_MS
} from "../../../src/cache/RelayDropFeedCache";
import type { RelayDropDevice, RelayDropItem } from "../../../src/domain/types";
import {
  MAX_CAPTION_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_FILE_BYTES,
  MAX_MEDIA_TYPE_LENGTH,
  MAX_TEXT_LENGTH
} from "../../../src/domain/descriptor";
import { hasUnsafeFileNameControls } from "../../../src/domain/files";
import { isSafeHttpUrl } from "../../../src/domain/feed";

const CACHE_KEY_PREFIX = "relaydrop.extension.feed-cache.v1.";
const AUTO_REFRESH_KEY_PREFIX = "relaydrop.extension.auto-refresh.v1.";
const CACHE_EPOCH_KEY_PREFIX = "relaydrop.extension.feed-cache-epoch.v1.";
const CACHE_SCHEMA_VERSION = 1;
export const EXTENSION_FEED_CACHE_LIMIT = 50;
export const AUTO_REFRESH_LEASE_MS = RELAYDROP_AUTO_REFRESH_LEASE_MS;

interface ExtensionStorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface ExtensionLockManager {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

interface StoredFeedCache {
  schemaVersion: typeof CACHE_SCHEMA_VERSION;
  cacheEpoch: string;
  snapshot: RelayDropFeedSnapshot;
}

interface StoredAutoRefreshState {
  cacheEpoch: string;
  leaseExpiresAt?: string;
  lastSuccessfulRefreshAt?: string;
}

export class ExtensionFeedCache implements RelayDropFeedCache {
  private readonly key: string;
  private readonly autoRefreshKey: string;
  private readonly epochKey: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private observedEpoch?: string;
  private revoked = false;

  constructor(
    accountId: string,
    private readonly storage: ExtensionStorageArea = getDefaultStorageArea(),
    private readonly locks: ExtensionLockManager | undefined = getDefaultLockManager()
  ) {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      throw new Error("An account ID is required for the RelayDrop feed cache.");
    }
    const accountKey = encodeURIComponent(normalizedAccountId);
    this.key = CACHE_KEY_PREFIX + accountKey;
    this.autoRefreshKey = AUTO_REFRESH_KEY_PREFIX + accountKey;
    this.epochKey = CACHE_EPOCH_KEY_PREFIX + accountKey;
  }

  load(): Promise<RelayDropFeedSnapshot | null> {
    return this.enqueue(() =>
      this.withAccountLock(async () => {
        if (this.revoked) return null;
        const cacheEpoch = await this.ensureEpoch();
        const values = await this.storage.get(this.key);
        return parseStoredCache(values[this.key], cacheEpoch);
      })
    );
  }

  save(snapshot: RelayDropFeedSnapshot): Promise<void> {
    const sanitized = sanitizeSnapshot(snapshot);
    return this.enqueue(() =>
      this.withAccountLock(async () => {
        if (this.revoked) return;
        const cacheEpoch = this.observedEpoch ?? (await this.ensureEpoch());
        const currentEpoch = await this.readEpoch();
        if (this.revoked || currentEpoch !== cacheEpoch) return;
        const stored: StoredFeedCache = {
          schemaVersion: CACHE_SCHEMA_VERSION,
          cacheEpoch,
          snapshot: sanitized
        };
        const items: Record<string, unknown> = { [this.key]: stored };
        const refreshedAt = sanitized.lastRefreshedAt;
        if (refreshedAt) {
          const values = await this.storage.get(this.autoRefreshKey);
          const previous = parseAutoRefreshState(
            values[this.autoRefreshKey],
            cacheEpoch
          );
          const previousSuccess = previous?.lastSuccessfulRefreshAt;
          items[this.autoRefreshKey] = {
            cacheEpoch,
            ...(previous?.leaseExpiresAt
              ? { leaseExpiresAt: previous.leaseExpiresAt }
              : {}),
            lastSuccessfulRefreshAt:
              previousSuccess && Date.parse(previousSuccess) > Date.parse(refreshedAt)
                ? previousSuccess
                : refreshedAt
          } satisfies StoredAutoRefreshState;
        }
        await this.storage.set(items);
      })
    );
  }

  tryBeginAutoRefresh(minimumIntervalMs: number, now: number): Promise<boolean> {
    return this.enqueue(() =>
      this.withAccountLock(async () => {
        if (this.revoked) return false;
        const cacheEpoch = this.observedEpoch ?? (await this.ensureEpoch());
        if ((await this.readEpoch()) !== cacheEpoch) return false;
        const values = await this.storage.get(this.autoRefreshKey);
        const state = parseAutoRefreshState(values[this.autoRefreshKey], cacheEpoch);
        if (
          state?.lastSuccessfulRefreshAt &&
          !isRelayDropRefreshDue(
            state.lastSuccessfulRefreshAt,
            minimumIntervalMs,
            now
          )
        ) {
          return false;
        }
        const leaseExpiresAt =
          state?.leaseExpiresAt
            ? Date.parse(state.leaseExpiresAt)
            : Number.NaN;
        if (
          Number.isFinite(leaseExpiresAt) &&
          leaseExpiresAt > now &&
          leaseExpiresAt <= now + AUTO_REFRESH_LEASE_MS + 60_000
        ) {
          return false;
        }

        await this.storage.set({
          [this.autoRefreshKey]: {
            cacheEpoch,
            leaseExpiresAt: new Date(now + AUTO_REFRESH_LEASE_MS).toISOString(),
            ...(state?.lastSuccessfulRefreshAt
              ? { lastSuccessfulRefreshAt: state.lastSuccessfulRefreshAt }
              : {})
          } satisfies StoredAutoRefreshState
        });
        return true;
      })
    );
  }

  clear(): Promise<void> {
    this.revoked = true;
    return this.enqueue(() =>
      this.withAccountLock(async () => {
        const results = await Promise.allSettled([
          this.storage.set({ [this.epochKey]: createCacheEpoch() }),
          this.storage.remove([this.key, this.autoRefreshKey])
        ]);
        this.observedEpoch = undefined;
        const failure = results.find(
          (result): result is PromiseRejectedResult => result.status === "rejected"
        );
        if (failure) throw failure.reason;
      })
    );
  }

  private async ensureEpoch(): Promise<string> {
    const existing = await this.readEpoch();
    if (existing) {
      this.observedEpoch = existing;
      return existing;
    }
    const initialEpoch = "initial";
    await this.storage.set({ [this.epochKey]: initialEpoch });
    this.observedEpoch = initialEpoch;
    return initialEpoch;
  }

  private async readEpoch(): Promise<string | undefined> {
    const values = await this.storage.get(this.epochKey);
    const value = values[this.epochKey];
    return typeof value === "string" && value ? value : undefined;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private withAccountLock<T>(operation: () => Promise<T>): Promise<T> {
    return this.locks
      ? this.locks.request("relaydrop-feed-cache:" + this.autoRefreshKey, operation)
      : operation();
  }
}

function getDefaultStorageArea(): ExtensionStorageArea {
  const extensionPlatform = (
    globalThis as unknown as {
      chrome?: { storage?: { local?: ExtensionStorageArea } };
    }
  ).chrome;
  const storage = extensionPlatform?.storage?.local;
  if (!storage) {
    throw new Error("Chrome extension local storage is unavailable.");
  }
  return storage;
}

function getDefaultLockManager(): ExtensionLockManager | undefined {
  return (
    globalThis as unknown as {
      navigator?: { locks?: ExtensionLockManager };
    }
  ).navigator?.locks;
}

function parseStoredCache(
  value: unknown,
  cacheEpoch: string
): RelayDropFeedSnapshot | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== CACHE_SCHEMA_VERSION ||
    value.cacheEpoch !== cacheEpoch
  ) {
    return null;
  }
  const snapshot = value.snapshot;
  if (!isRecord(snapshot) || !Array.isArray(snapshot.items)) {
    return null;
  }

  const items = snapshot.items
    .map(parseItem)
    .filter((item): item is RelayDropItem => item !== null)
    .slice(0, EXTENSION_FEED_CACHE_LIMIT);
  const totalItems = parseNonNegativeInteger(snapshot.totalItems);
  if (totalItems === null) {
    return null;
  }
  const lastRefreshedAt = parseNullableDate(snapshot.lastRefreshedAt);
  if (lastRefreshedAt === undefined) {
    return null;
  }

  return {
    items,
    totalItems: Math.max(totalItems, items.length),
    ...(typeof snapshot.nextCursor === "string" && snapshot.nextCursor
      ? { nextCursor: snapshot.nextCursor }
      : {}),
    lastRefreshedAt
  };
}

function createCacheEpoch(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseAutoRefreshState(
  value: unknown,
  cacheEpoch: string
): StoredAutoRefreshState | undefined {
  if (!isRecord(value) || value.cacheEpoch !== cacheEpoch) return undefined;
  return {
    cacheEpoch,
    ...(typeof value.leaseExpiresAt === "string"
      ? { leaseExpiresAt: value.leaseExpiresAt }
      : {}),
    ...(typeof value.lastSuccessfulRefreshAt === "string"
      ? { lastSuccessfulRefreshAt: value.lastSuccessfulRefreshAt }
      : {})
  };
}

function sanitizeSnapshot(snapshot: RelayDropFeedSnapshot): RelayDropFeedSnapshot {
  const validItems = snapshot.items
    .map(parseItem)
    .filter((item): item is RelayDropItem => item !== null);
  const wasTruncated = validItems.length > EXTENSION_FEED_CACHE_LIMIT;
  const items = validItems.slice(0, EXTENSION_FEED_CACHE_LIMIT);
  const nextCursor = wasTruncated
    ? cursorAfterCachedItem(items.at(-1))
    : typeof snapshot.nextCursor === "string" && snapshot.nextCursor
      ? snapshot.nextCursor
      : undefined;
  return {
    items,
    totalItems: Math.max(parseNonNegativeInteger(snapshot.totalItems) ?? 0, items.length),
    ...(nextCursor ? { nextCursor } : {}),
    lastRefreshedAt:
      parseNullableDate(snapshot.lastRefreshedAt) === undefined
        ? null
        : snapshot.lastRefreshedAt
  };
}

function cursorAfterCachedItem(item: RelayDropItem | undefined): string | undefined {
  return item ? JSON.stringify([item.serverUpdatedAt ?? item.serverCreatedAt, item.id + ".json"]) : undefined;
}

function parseItem(value: unknown): RelayDropItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = parseBoundedString(value.id, 128);
  const createdAt = parseDateString(value.createdAt);
  const serverCreatedAt = parseDateString(value.serverCreatedAt);
  const serverUpdatedAt = parseDateString(value.serverUpdatedAt);
  const source = parseDevice(value.source);
  if (!id || !createdAt || !serverCreatedAt || !source) {
    return null;
  }
  const version = value.cloudVersion;
  const cloudVersion = isRecord(version) &&
    parseBoundedString(version.id, 512) && parseBoundedString(version.eTag, 1024)
    ? { id: version.id as string, eTag: version.eTag as string }
    : undefined;

  if (value.type === "text" || value.type === "link") {
    if (typeof value.text !== "string" || value.text.length > MAX_TEXT_LENGTH) {
      return null;
    }
    const type = value.type === "link" && !isSafeHttpUrl(value.text)
      ? "text"
      : value.type;
    return {
      id,
      type,
      text: value.text,
      createdAt,
      serverCreatedAt,
      ...(serverUpdatedAt ? { serverUpdatedAt } : {}),
      source,
      ...(cloudVersion ? { cloudVersion } : {})
    };
  }

  if (value.type !== "image" && value.type !== "file") {
    return null;
  }
  if (!isRecord(value.file)) {
    return null;
  }
  const name = parseBoundedString(value.file.name, MAX_DISPLAY_NAME_LENGTH);
  const size = parseNonNegativeInteger(value.file.size);
  const mediaType = parseBoundedString(value.file.mediaType, MAX_MEDIA_TYPE_LENGTH);
  const caption =
    value.caption === undefined
      ? undefined
      : parseBoundedString(value.caption, MAX_CAPTION_LENGTH, true);
  if (
    !name ||
    hasUnsafeFileNameControls(name) ||
    size === null ||
    size > MAX_FILE_BYTES ||
    !mediaType ||
    caption === null
  ) {
    return null;
  }

  return {
    id,
    type: value.type,
    ...(caption !== undefined ? { caption } : {}),
    file: { name, size, mediaType },
    createdAt,
    serverCreatedAt,
    ...(serverUpdatedAt ? { serverUpdatedAt } : {}),
    source,
    ...(cloudVersion ? { cloudVersion } : {})
  };
}

function parseDevice(value: unknown): RelayDropDevice | null {
  return value === "phone" || value === "desktop" || value === "tablet"
    ? value
    : null;
}

function parseBoundedString(
  value: unknown,
  maximum: number,
  allowEmpty = false
): string | null {
  return typeof value === "string" &&
    value.length <= maximum &&
    (allowEmpty || Boolean(value.trim()))
    ? value
    : null;
}

function parseDateString(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

function parseNullableDate(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return parseDateString(value) ?? undefined;
}

function parseNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

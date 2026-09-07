import type { RelayDropItem } from "../domain/types";
import type { RelayDropDownloadManager } from "../downloads/RelayDropDownloadManager";

export interface RelayDropFeedSnapshot {
  items: RelayDropItem[];
  totalItems: number;
  nextCursor?: string;
  lastRefreshedAt: string | null;
}

export interface RelayDropFeedCache {
  load(): Promise<RelayDropFeedSnapshot | null>;
  save(snapshot: RelayDropFeedSnapshot): Promise<void>;
  tryBeginAutoRefresh(minimumIntervalMs: number, now: number): Promise<boolean>;
  clear(): Promise<void>;
}

export interface RelayDropSyncPolicy {
  refreshOnOpen: boolean;
  refreshWhileOpen: boolean;
  openCooldownMs: number;
  visibleRefreshIntervalMs: number;
}

export interface UseRelayDropOptions {
  cache?: RelayDropFeedCache;
  downloadManager?: RelayDropDownloadManager;
  syncPolicy?: Partial<RelayDropSyncPolicy>;
  now?: () => number;
}

export const DEFAULT_RELAYDROP_SYNC_POLICY: RelayDropSyncPolicy = {
  refreshOnOpen: false,
  refreshWhileOpen: false,
  openCooldownMs: 2 * 60 * 1000,
  visibleRefreshIntervalMs: 5 * 60 * 1000
};
export const RELAYDROP_AUTO_REFRESH_LEASE_MS = 15 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

export function resolveRelayDropSyncPolicy(
  policy: Partial<RelayDropSyncPolicy> | undefined
): RelayDropSyncPolicy {
  return {
    ...DEFAULT_RELAYDROP_SYNC_POLICY,
    ...policy,
    openCooldownMs: validInterval(
      policy?.openCooldownMs,
      DEFAULT_RELAYDROP_SYNC_POLICY.openCooldownMs
    ),
    visibleRefreshIntervalMs: validInterval(
      policy?.visibleRefreshIntervalMs,
      DEFAULT_RELAYDROP_SYNC_POLICY.visibleRefreshIntervalMs
    )
  };
}

export function isRelayDropRefreshDue(
  lastRefreshedAt: string | Date | null | undefined,
  minimumAgeMs: number,
  now: number
): boolean {
  if (!lastRefreshedAt) {
    return true;
  }

  const refreshedAt =
    lastRefreshedAt instanceof Date
      ? lastRefreshedAt.getTime()
      : Date.parse(lastRefreshedAt);
  if (!Number.isFinite(refreshedAt)) return true;
  const age = now - refreshedAt;
  return age < -CLOCK_SKEW_TOLERANCE_MS || age >= minimumAgeMs;
}

function validInterval(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

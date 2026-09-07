import type { RelayDropSyncPreferences } from "../../../src/settings/types";

const SETTINGS_KEY_PREFIX = "relaydrop.extension.settings.v1.";

export const DEFAULT_EXTENSION_SYNC_PREFERENCES: RelayDropSyncPreferences = {
  refreshOnOpen: true,
  refreshWhileOpen: true
};

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export class ExtensionSettingsStore {
  private readonly key: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    accountId: string,
    private readonly storage: StorageArea = getDefaultStorage()
  ) {
    this.key = SETTINGS_KEY_PREFIX + encodeURIComponent(accountId);
  }

  async load(): Promise<RelayDropSyncPreferences> {
    await this.writeQueue;
    const values = await this.storage.get(this.key);
    const value = values[this.key];
    return isSyncPreferences(value) ? value : DEFAULT_EXTENSION_SYNC_PREFERENCES;
  }

  save(preferences: RelayDropSyncPreferences): Promise<void> {
    const next = this.writeQueue.then(() =>
      this.storage.set({
        [this.key]: {
          refreshOnOpen: preferences.refreshOnOpen,
          refreshWhileOpen: preferences.refreshWhileOpen
        }
      })
    );
    this.writeQueue = next.catch(() => undefined);
    return next;
  }
}

function isSyncPreferences(value: unknown): value is RelayDropSyncPreferences {
  if (!value || typeof value !== "object") return false;
  const preferences = value as Partial<RelayDropSyncPreferences>;
  return (
    typeof preferences.refreshOnOpen === "boolean" &&
    typeof preferences.refreshWhileOpen === "boolean"
  );
}

function getDefaultStorage(): StorageArea {
  const chromeApi = (globalThis as unknown as {
    chrome?: { storage?: { local?: StorageArea } };
  }).chrome;
  if (!chromeApi?.storage?.local) {
    throw new Error("RelayDrop extension storage is unavailable.");
  }
  return chromeApi.storage.local;
}

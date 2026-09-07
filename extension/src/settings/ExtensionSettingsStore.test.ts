import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXTENSION_SYNC_PREFERENCES,
  ExtensionSettingsStore
} from "./ExtensionSettingsStore";

describe("ExtensionSettingsStore", () => {
  it("uses safe automatic refresh defaults", async () => {
    const store = new ExtensionSettingsStore("account-a", createStorage());
    await expect(store.load()).resolves.toEqual(
      DEFAULT_EXTENSION_SYNC_PREFERENCES
    );
  });

  it("persists settings per account", async () => {
    const values = new Map<string, unknown>();
    const storage = createStorage(values);
    const first = new ExtensionSettingsStore("account-a", storage);
    const second = new ExtensionSettingsStore("account-b", storage);

    await first.save({ refreshOnOpen: false, refreshWhileOpen: true });

    await expect(first.load()).resolves.toEqual({
      refreshOnOpen: false,
      refreshWhileOpen: true
    });
    await expect(second.load()).resolves.toEqual(
      DEFAULT_EXTENSION_SYNC_PREFERENCES
    );
  });
});

function createStorage(values = new Map<string, unknown>()) {
  return {
    async get(key: string) {
      return values.has(key) ? { [key]: values.get(key) } : {};
    },
    async set(items: Record<string, unknown>) {
      for (const [key, value] of Object.entries(items)) values.set(key, value);
    }
  };
}

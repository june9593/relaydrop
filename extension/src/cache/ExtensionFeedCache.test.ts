import { describe, expect, it } from "vitest";
import type { RelayDropFeedSnapshot } from "../../../src/cache/RelayDropFeedCache";
import type { RelayDropItem } from "../../../src/domain/types";
import { MAX_TEXT_LENGTH } from "../../../src/domain/descriptor";
import {
  AUTO_REFRESH_LEASE_MS,
  EXTENSION_FEED_CACHE_LIMIT,
  ExtensionFeedCache
} from "./ExtensionFeedCache";

describe("ExtensionFeedCache", () => {
  it("stores only allowlisted feed metadata and caps the snapshot at 50 items", async () => {
    const values = new Map<string, unknown>();
    const cache = new ExtensionFeedCache("account-a", createStorage(values));
    const snapshot = createSnapshot(55);
    snapshot.items[0] = {
      ...snapshot.items[0],
      token: "must-not-be-cached",
      presentation: { previewUrl: "blob:must-not-be-cached" }
    } as unknown as RelayDropItem;

    await cache.save(snapshot);

    const loaded = await cache.load();
    expect(loaded?.items).toHaveLength(EXTENSION_FEED_CACHE_LIMIT);
    expect(loaded?.items[0]).toEqual({
      id: "item-0",
      type: "text",
      text: "Note 0",
      createdAt: "2026-09-06T10:00:00.000Z",
      serverCreatedAt: "2026-09-06T10:00:00.000Z",
      source: "desktop"
    });
    expect(loaded?.totalItems).toBe(55);
    expect(loaded?.nextCursor).toBe(
      JSON.stringify(["2026-09-06T10:00:00.000Z", "item-49.json"])
    );
  });

  it("keeps account caches isolated and clears only the selected account", async () => {
    const values = new Map<string, unknown>();
    const storage = createStorage(values);
    const first = new ExtensionFeedCache("account-a", storage);
    const second = new ExtensionFeedCache("account-b", storage);

    await first.save(createSnapshot(2));
    await second.save({
      ...createSnapshot(1),
      items: [createTextItem("account-b-item")]
    });
    await first.clear();

    await expect(first.load()).resolves.toBeNull();
    await expect(second.load()).resolves.toMatchObject({
      items: [{ id: "account-b-item" }]
    });
    expect(
      [...values.keys()].some((key) =>
        key.startsWith("relaydrop.extension.feed-cache.v1.account-a")
      )
    ).toBe(false);
  });

  it("persists and serializes the automatic refresh cooldown gate", async () => {
    const values = new Map<string, unknown>();
    const storage = createStorage(values);
    const locks = createLockManager();
    const firstPanel = new ExtensionFeedCache("account-a", storage, locks);
    const reopenedPanel = new ExtensionFeedCache("account-a", storage, locks);
    const startedAt = Date.UTC(2026, 8, 6, 10, 0, 0);
    const cooldown = 2 * 60 * 1000;

    await expect(
      Promise.all([
        firstPanel.tryBeginAutoRefresh(cooldown, startedAt),
        reopenedPanel.tryBeginAutoRefresh(cooldown, startedAt)
      ])
    ).resolves.toEqual([true, false]);
    await expect(
      reopenedPanel.tryBeginAutoRefresh(
        cooldown,
        startedAt + AUTO_REFRESH_LEASE_MS - 1
      )
    ).resolves.toBe(false);
    await expect(
      reopenedPanel.tryBeginAutoRefresh(cooldown, startedAt + AUTO_REFRESH_LEASE_MS)
    ).resolves.toBe(true);
  });

  it("shares the last successful refresh cooldown across panels", async () => {
    const values = new Map<string, unknown>();
    const storage = createStorage(values);
    const locks = createLockManager();
    const firstPanel = new ExtensionFeedCache("account-a", storage, locks);
    const secondPanel = new ExtensionFeedCache("account-a", storage, locks);
    const refreshedAt = Date.UTC(2026, 8, 6, 10, 0, 0);
    const cooldown = 2 * 60 * 1000;

    await firstPanel.save({
      ...createSnapshot(1),
      lastRefreshedAt: new Date(refreshedAt).toISOString()
    });

    await expect(
      secondPanel.tryBeginAutoRefresh(
        cooldown,
        refreshedAt + AUTO_REFRESH_LEASE_MS + 1
      )
    ).resolves.toBe(false);
    await expect(
      secondPanel.tryBeginAutoRefresh(cooldown, refreshedAt + cooldown)
    ).resolves.toBe(true);
  });

  it("recovers the refresh lease after the system clock moves backward", async () => {
    const values = new Map<string, unknown>();
    const storage = createStorage(values);
    const cache = new ExtensionFeedCache("account-a", storage);
    const currentTime = Date.UTC(2026, 8, 6, 10, 0, 0);

    await expect(
      cache.tryBeginAutoRefresh(120_000, currentTime + 60 * 60 * 1000)
    ).resolves.toBe(true);
    await expect(cache.tryBeginAutoRefresh(120_000, currentTime)).resolves.toBe(
      true
    );
  });

  it("clears the cached feed and automatic refresh attempt together", async () => {
    const values = new Map<string, unknown>();
    const storage = createStorage(values);
    const cache = new ExtensionFeedCache("account-a", storage);
    const startedAt = Date.UTC(2026, 8, 6, 10, 0, 0);

    await cache.save(createSnapshot(1));
    await cache.tryBeginAutoRefresh(120_000, startedAt);
    expect(values.size).toBe(3);

    await cache.clear();

    expect(values.size).toBe(1);
    await expect(cache.load()).resolves.toBeNull();
    await expect(
      cache.tryBeginAutoRefresh(120_000, startedAt + 1)
    ).resolves.toBe(false);
  });

  it("prevents an older panel from restoring cache content after logout", async () => {
    const values = new Map<string, unknown>();
    const storage = createStorage(values);
    const locks = createLockManager();
    const olderPanel = new ExtensionFeedCache("account-a", storage, locks);
    const logoutPanel = new ExtensionFeedCache("account-a", storage, locks);
    await olderPanel.load();
    await logoutPanel.load();
    await olderPanel.save(createSnapshot(1));

    await logoutPanel.clear();
    await olderPanel.save(createSnapshot(2));

    await expect(
      new ExtensionFeedCache("account-a", storage, locks).load()
    ).resolves.toBeNull();
    expect(
      [...values.keys()].some((key) =>
        key.startsWith("relaydrop.extension.feed-cache.v1.account-a")
      )
    ).toBe(false);
  });

  it("still removes plaintext cache data when epoch rotation fails", async () => {
    const values = new Map<string, unknown>();
    let rejectEpochRotation = false;
    const storage = {
      ...createStorage(values),
      async set(items: Record<string, unknown>) {
        if (
          rejectEpochRotation &&
          Object.keys(items).some((key) => key.includes("feed-cache-epoch"))
        ) {
          throw new Error("simulated epoch write failure");
        }
        for (const [key, value] of Object.entries(items)) values.set(key, value);
      }
    };
    const cache = new ExtensionFeedCache("account-a", storage, undefined);
    await cache.save(createSnapshot(1));
    rejectEpochRotation = true;

    await expect(cache.clear()).rejects.toThrow("simulated epoch write failure");

    rejectEpochRotation = false;
    await expect(
      new ExtensionFeedCache("account-a", storage, undefined).load()
    ).resolves.toBeNull();
  });

  it("ignores corrupt cache data instead of exposing it to the feed", async () => {
    const values = new Map<string, unknown>();
    const storage = createStorage(values);
    const cache = new ExtensionFeedCache("account-a", storage);
    values.set([...values.keys()][0] ?? "relaydrop.extension.feed-cache.v1.account-a", {
      schemaVersion: 1,
      snapshot: {
        items: [],
        totalItems: -1,
        lastRefreshedAt: "not-a-date"
      }
    });

    await expect(cache.load()).resolves.toBeNull();
  });

  it("drops oversized cached item fields", async () => {
    const values = new Map<string, unknown>();
    const cache = new ExtensionFeedCache("account-a", createStorage(values));
    const snapshot = createSnapshot(1);
    snapshot.items[0] = {
      ...snapshot.items[0],
      text: "x".repeat(MAX_TEXT_LENGTH + 1)
    } as RelayDropItem;

    await cache.save(snapshot);

    await expect(cache.load()).resolves.toMatchObject({ items: [] });
  });

  it("downgrades a tampered cached link to inert text", async () => {
    const values = new Map<string, unknown>();
    const cache = new ExtensionFeedCache("account-a", createStorage(values));
    const snapshot = createSnapshot(1);
    snapshot.items[0] = {
      ...snapshot.items[0],
      type: "link",
      text: "javascript:alert(1)"
    } as RelayDropItem;

    await cache.save(snapshot);

    await expect(cache.load()).resolves.toMatchObject({
      items: [{ type: "text", text: "javascript:alert(1)" }]
    });
  });
});

function createSnapshot(count: number): RelayDropFeedSnapshot {
  return {
    items: Array.from({ length: count }, (_, index) => createTextItem(`item-${index}`)),
    totalItems: count,
    nextCursor: `cursor-${count}`,
    lastRefreshedAt: "2026-09-06T10:00:00.000Z"
  };
}

function createTextItem(id: string): RelayDropItem {
  return {
    id,
    type: "text",
    text: id.startsWith("item-") ? `Note ${id.slice(5)}` : "Account B note",
    createdAt: "2026-09-06T10:00:00.000Z",
    serverCreatedAt: "2026-09-06T10:00:00.000Z",
    source: "desktop"
  };
}

function createStorage(values: Map<string, unknown>) {
  return {
    async get(keys: string | string[]) {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(
        requested.filter((key) => values.has(key)).map((key) => [key, values.get(key)])
      );
    },
    async set(items: Record<string, unknown>) {
      for (const [key, value] of Object.entries(items)) {
        values.set(key, value);
      }
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        values.delete(key);
      }
    }
  };
}

function createLockManager() {
  const queues = new Map<string, Promise<void>>();
  return {
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      const next = (queues.get(name) ?? Promise.resolve()).then(callback, callback);
      queues.set(
        name,
        next.then(
          () => undefined,
          () => undefined
        )
      );
      return next;
    }
  };
}

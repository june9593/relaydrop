// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RelayDropFeedCache, RelayDropFeedSnapshot } from "../cache/RelayDropFeedCache";
import type { RelayDropItem } from "../domain/types";
import type { RelayDropRepository } from "../repository/RelayDropRepository";
import { useRelayDrop } from "./useRelayDrop";

const item = (id: string, day: number): RelayDropItem => ({
  id, type: "text", text: id, source: "desktop",
  createdAt: new Date(Date.UTC(2026, 8, day)).toISOString(),
  serverCreatedAt: new Date(Date.UTC(2026, 8, day)).toISOString()
});

describe("feed reopening and newest-first refresh", () => {
  let root: Root;
  let host: HTMLDivElement;
  let current: ReturnType<typeof useRelayDrop>;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

  it("reuses recent previews but refreshes expired temporary file links", async () => {
    let time = 1000;
    const now = () => time;
    const getFilePresentation = vi.fn(async () => ({ kind: "image" as const }));
    const repository = { getFilePresentation } as unknown as RelayDropRepository;
    function Harness() { current = useRelayDrop(repository, "desktop", { now }); return null; }
    await act(async () => root.render(<Harness />));
    await act(async () => { await current.loadFilePresentation("image-a"); });
    await act(async () => { await current.loadFilePresentation("image-a"); });
    expect(getFilePresentation).toHaveBeenCalledTimes(1);
    time += 6 * 60 * 1000;
    await act(async () => { await current.loadFilePresentation("image-a"); });
    expect(getFilePresentation).toHaveBeenCalledTimes(2);
    expect(getFilePresentation).toHaveBeenLastCalledWith("image-a", { refresh: true });
  });

  it("shows persisted cards while the network is pending and keeps older cards after checking new arrivals", async () => {
    const snapshot: RelayDropFeedSnapshot = {
      items: [item("old-head", 6), item("older", 5)], totalItems: 20,
      nextCursor: '["2026-09-05T00:00:00.000Z","older.json"]',
      lastRefreshedAt: "2026-09-06T00:00:00.000Z"
    };
    const cache: RelayDropFeedCache = {
      load: vi.fn(async () => snapshot), save: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined), tryBeginAutoRefresh: vi.fn(async () => true)
    };
    let finish!: (page: Awaited<ReturnType<RelayDropRepository["listItems"]>>) => void;
    const repository = { listItems: vi.fn(() => new Promise((resolve) => { finish = resolve; })) } as unknown as RelayDropRepository;
    function Harness() {
      current = useRelayDrop(repository, "desktop", { cache });
      return <div>{current.items.map(i => i.id).join(",")}</div>;
    }
    await act(async () => root.render(<Harness />));
    expect(host.textContent).toBe("old-head,older");
    let refresh!: Promise<void>;
    await act(async () => { refresh = current.refresh(); });
    expect(host.textContent).toBe("old-head,older");
    await act(async () => {
      finish({ items: [item("newest", 7), item("old-head", 6)], total: 21, nextCursor: "head-cursor" });
      await refresh;
    });
    expect(host.textContent).toBe("newest,old-head,older");
    expect(cache.save).toHaveBeenLastCalledWith(expect.objectContaining({ items: current.items }));
  });
});

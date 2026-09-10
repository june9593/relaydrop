import { describe, expect, it } from "vitest";
import type { RelayDropDownloadState } from "../downloads/RelayDropDownloadManager";
import { mergeLatestFeed, mergeQueriedDownloadStates } from "./useRelayDrop";
import type { RelayDropItem } from "../domain/types";

describe("mergeLatestFeed", () => {
  const item = (id: string, day: number): RelayDropItem => ({ id, type: "text", text: id,
    createdAt: `2026-09-${String(day).padStart(2, "0")}T00:00:00Z`,
    serverCreatedAt: `2026-09-${String(day).padStart(2, "0")}T00:00:00Z`, source: "desktop" });
  it("removes deleted cached entries inside the metadata coverage without fetching their bodies", () => {
    const newest = item("new", 10), removed = item("deleted", 9), old = item("old", 7);
    expect(mergeLatestFeed([removed, old], [newest], true, {
      itemIds: ["new", "old"], oldest: { id: old.id, timestamp: old.serverCreatedAt }, complete: false
    })).toEqual([newest, old]);
  });
  it("retains old cached history outside the observed range", () => {
    const newest = item("new", 10), old = item("old", 2);
    expect(mergeLatestFeed([old], [newest], true, {
      itemIds: ["new"], oldest: { id: newest.id, timestamp: newest.serverCreatedAt }, complete: false
    })).toEqual([newest, old]);
  });
  it("clears removed entries when the server confirms the full folder", () => {
    expect(mergeLatestFeed([item("removed", 2)], [], false, { itemIds: [], complete: true })).toEqual([]);
  });
});

describe("mergeQueriedDownloadStates", () => {
  it("preserves a newer local state when an older query completes", () => {
    const downloading: RelayDropDownloadState = {
      itemId: "item-a",
      fileName: "report.pdf",
      status: "downloading"
    };

    expect(
      mergeQueriedDownloadStates(
        { "item-a": downloading },
        {},
        ["item-a"],
        new Map([["item-a", 1]]),
        new Map([["item-a", 0]])
      )
    ).toEqual({ "item-a": downloading });
  });

  it("applies queried state when the item did not change locally", () => {
    const complete: RelayDropDownloadState = {
      itemId: "item-a",
      fileName: "report.pdf",
      status: "complete",
      downloadId: 7
    };

    expect(
      mergeQueriedDownloadStates(
        {},
        { "item-a": complete },
        ["item-a"],
        new Map([["item-a", 0]]),
        new Map([["item-a", 0]])
      )
    ).toEqual({ "item-a": complete });
  });
});

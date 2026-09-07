import { describe, expect, it } from "vitest";
import { classifyText, formatBytes, sortFeed, upsertFeedItem } from "./feed";
import type { RelayDropItem } from "./types";

describe("classifyText", () => {
  it("recognizes a standalone web link", () => {
    expect(classifyText("https://example.com/path")).toBe("link");
  });

  it("keeps prose containing a link as text", () => {
    expect(classifyText("Read https://example.com later")).toBe("text");
  });

  it("keeps credential-bearing URLs as non-clickable text", () => {
    expect(classifyText("https://user:password@example.com/private")).toBe("text");
  });
});

describe("formatBytes", () => {
  it("formats byte and megabyte values", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
  });
});

describe("sortFeed", () => {
  it("sorts newest first and uses id as the stable tie-breaker", () => {
    const sharedTime = "2026-09-04T10:00:00.000Z";
    const items = [
      createTextItem("b", sharedTime),
      createTextItem("a", sharedTime),
      createTextItem("c", "2026-09-04T11:00:00.000Z")
    ];

    expect(sortFeed(items).map((item) => item.id)).toEqual(["c", "a", "b"]);
  });
});

describe("upsertFeedItem", () => {
  it("replaces an existing item without duplicating its id", () => {
    const original = createTextItem("same-id", "2026-09-04T10:00:00.000Z");
    const refreshed = {
      ...createTextItem("same-id", "2026-09-04T11:00:00.000Z"),
      text: "fresh server copy"
    };

    expect(upsertFeedItem([original], refreshed)).toEqual({
      items: [refreshed],
      inserted: false
    });
  });

  it("marks a new item as inserted", () => {
    const existing = createTextItem("existing", "2026-09-04T10:00:00.000Z");
    const added = createTextItem("added", "2026-09-04T11:00:00.000Z");

    expect(upsertFeedItem([existing], added)).toEqual({
      items: [added, existing],
      inserted: true
    });
  });
});

function createTextItem(id: string, serverCreatedAt: string): RelayDropItem {
  return {
    id,
    type: "text",
    text: id,
    createdAt: serverCreatedAt,
    serverCreatedAt,
    source: "desktop"
  };
}

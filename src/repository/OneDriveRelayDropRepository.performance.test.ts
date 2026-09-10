import { expect, it, vi } from "vitest";
import { serializeDescriptor } from "../domain/descriptor";
import type { GraphClient } from "./GraphClient";
import { OneDriveRelayDropRepository } from "./OneDriveRelayDropRepository";

it("checks 5000-item history with one directory page and reuses persisted unchanged item bodies", async () => {
  const items = Array.from({ length: 5000 }, (_, index) => ({
    id: "drive-" + index,
    name: "00000000-0000-4000-8000-" + String(index).padStart(12, "0") + ".json",
    createdDateTime: new Date(Date.UTC(2026, 8, 10) - index * 1000).toISOString(),
    eTag: '"v1-' + index + '"'
  }));
  let directoryPages = 0;
  const json = vi.fn(async (path: string) => {
    if (path.includes("/special/approot")) return { id: "root" };
    if (path.includes(":/feed?")) return { id: "feed", folder: {} };
    if (path.includes(":/blobs?")) return { id: "blobs", folder: {} };
    if (path.includes("/feed/children")) {
      directoryPages++;
      const query = new URL(path, "https://graph.microsoft.com").searchParams;
      expect(query.get("$orderby")).toBe("lastModifiedDateTime desc,name asc");
      const start = Number(query.get("$skiptoken") ?? 0);
      const size = Number(query.get("$top") ?? 50);
      return { value: items.slice(start, start + size), "@odata.nextLink":
        `/me/drive/items/feed/children?$orderby=lastModifiedDateTime%20desc,name%20asc&$top=${size}&$skiptoken=${start + size}` };
    }
    throw new Error("Unexpected fixture request");
  });
  const text = vi.fn(async (path: string) => {
    const driveId = path.split("/").at(-2);
    const metadata = items.find(item => item.id === driveId)!;
    return serializeDescriptor({ schemaVersion: 1, id: metadata.name.slice(0,-5), type: "text",
      text: "Note " + metadata.id, source: "phone", createdAt: metadata.createdDateTime });
  });
  const graph = { json, text } as unknown as GraphClient;
  const first = await new OneDriveRelayDropRepository(graph).listItems({ limit: 12 });
  expect(directoryPages).toBe(1);
  expect(text).toHaveBeenCalledTimes(12);
  text.mockClear(); directoryPages = 0;
  const reopened = new OneDriveRelayDropRepository(graph);
  const warm = await reopened.listItems({ limit: 12, cachedItems: first.items });
  expect(warm.items).toEqual(first.items);
  expect(directoryPages).toBe(1);
  expect(text).not.toHaveBeenCalled();
  items[0].eTag = '"v2"';
  await reopened.listItems({ limit: 12, cachedItems: warm.items });
  expect(text).toHaveBeenCalledTimes(1);
});

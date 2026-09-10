import { describe, expect, it, vi } from "vitest";
import {
  MAX_DESCRIPTOR_BYTES,
  MAX_FILE_BYTES,
  RelayDropValidationError,
  serializeDescriptor
} from "../domain/descriptor";
import { sha256Hex } from "../domain/files";
import { GraphApiError, type GraphClient } from "./GraphClient";
import { OneDriveRelayDropRepository } from "./OneDriveRelayDropRepository";
import { RelayDropDeleteError } from "./RelayDropRepository";

describe("OneDriveRelayDropRepository", () => {
  it("retries folder initialization after a transient sign-in or network failure", async () => {
    const graph = createFakeGraph();
    graph.json.mockRejectedValueOnce(new Error("temporarily offline"));
    const repository = new OneDriveRelayDropRepository(graph.client);
    await expect(repository.listItems()).rejects.toThrow("temporarily offline");
    await expect(repository.listItems()).resolves.toMatchObject({ items: [] });
  });

  it("falls back to a bounded full scan when OneDrive rejects server ordering", async () => {
    const graph = createFakeGraph();
    const base = graph.json.getMockImplementation()!;
    graph.json.mockImplementation(async (path, init) => {
      if (path.includes("$orderby=")) throw new GraphApiError(400, "invalidRequest", "Order unsupported");
      return base(path, init);
    });
    await expect(new OneDriveRelayDropRepository(graph.client).listItems()).resolves.toMatchObject({ items: [] });
    const directories = graph.json.mock.calls.map(([path]) => path).filter(path => path.includes("feed-folder/children"));
    expect(directories).toHaveLength(3);
    expect(directories[1]).toContain("lastModifiedDateTime%20desc");
    expect(new URL(directories[1], "https://graph.microsoft.com").searchParams.get("$orderby")).toBe("lastModifiedDateTime desc");
    expect(directories[2]).not.toContain("$orderby");
  });

  it("announces the newest changed item before a slower older descriptor finishes", async () => {
    const graph = createFakeGraph();
    for (let index = 0; index < 2; index++) {
      const id = "00000000-0000-4000-8000-" + String(index).padStart(12, "0");
      const createdAt = new Date(Date.UTC(2026, 8, 10 - index)).toISOString();
      graph.feedItems.push({ id: "drive-" + index, name: id + ".json", createdDateTime: createdAt });
      graph.descriptorContent.set("drive-" + index, serializeDescriptor({ schemaVersion: 1, id, type: "text", text: "Item " + index, source: "phone", createdAt }));
    }
    const baseText = graph.text.getMockImplementation()!;
    let finishOlder!: (value: string) => void;
    graph.text.mockImplementation(path => path.includes("drive-1/")
      ? new Promise(resolve => { finishOlder = resolve; }) : baseText(path));
    const onNewestItem = vi.fn();
    let finished = false;
    const pending = new OneDriveRelayDropRepository(graph.client).listItems({ onNewestItem }).then(page => { finished = true; return page; });
    await vi.waitFor(() => expect(onNewestItem).toHaveBeenCalledWith(expect.objectContaining({ text: "Item 0" })));
    expect(finished).toBe(false);
    finishOlder(graph.descriptorContent.get("drive-1")!);
    await expect(pending).resolves.toMatchObject({ items: [{ text: "Item 0" }, { text: "Item 1" }] });
  });

  it("returns the newest page without waiting for historical metadata pages", async () => {
    const graph = createFakeGraph();
    const base = graph.json.getMockImplementation()!;
    const id = "00000000-0000-4000-8000-000000000001";
    const nextLink = "https://graph.microsoft.com/v1.0/me/drive/items/feed-folder/children?$skiptoken=older";
    graph.descriptorContent.set("newest-descriptor", serializeDescriptor({
      schemaVersion: 1, id, type: "text", text: "Just arrived", source: "phone",
      createdAt: "2026-09-10T00:00:00.000Z"
    }));
    graph.json.mockImplementation(async (path, init) => {
      if (path === nextLink) throw new Error("History must not block the newest item");
      if (path.includes("feed-folder/children")) return {
        value: [{ id: "newest-descriptor", name: id + ".json", eTag: "v1", createdDateTime: "2026-09-10T00:00:00.000Z" }],
        "@odata.nextLink": nextLink
      };
      return base(path, init);
    });
    const page = await new OneDriveRelayDropRepository(graph.client).listItems({ limit: 1 });
    expect(page.items[0]).toMatchObject({ text: "Just arrived" });
    expect(page.nextCursor).toBeTruthy();
    expect(graph.json).not.toHaveBeenCalledWith(nextLink);
  });

  it("reports the app-folder size and caches it for a short TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T00:00:00.000Z"));

    try {
      const graph = createFakeGraph();
      graph.appRoot.size = 4096;
      graph.appRoot.webUrl = "https://onedrive.live.com/?id=relaydrop";
      const repository = new OneDriveRelayDropRepository(graph.client);

      const first = await repository.getStorageInfo();
      graph.appRoot.size = 8192;
      const cached = await repository.getStorageInfo();

      expect(first).toEqual({
        usedBytes: 4096,
        manageUrl: "https://onedrive.live.com/?id=relaydrop"
      });
      expect(cached).toEqual(first);
      expect(graph.appRootRequests()).toBe(1);
      expect(graph.json).toHaveBeenCalledWith(
        "/me/drive/special/approot?$select=id,name,size,webUrl"
      );

      vi.advanceTimersByTime(60_001);
      await expect(repository.getStorageInfo()).resolves.toMatchObject({
        usedBytes: 8192
      });
      expect(graph.appRootRequests()).toBe(2);
      expect(
        graph.json.mock.calls.some(([path]) => {
          const value = String(path);
          return value === "/me/drive" || value.startsWith("/me/drive?");
        })
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not expose a non-HTTPS app-folder URL", async () => {
    const graph = createFakeGraph();
    graph.appRoot.webUrl = "javascript:alert(document.domain)";
    const repository = new OneDriveRelayDropRepository(graph.client);

    await expect(repository.getStorageInfo()).resolves.toEqual({ usedBytes: 0 });
  });

  it("invalidates cached app-folder storage after mutations and disposal", async () => {
    const graph = createFakeGraph();
    graph.appRoot.size = 100;
    const repository = new OneDriveRelayDropRepository(graph.client);
    const id = "7cd2216d-4f13-4ca6-b64b-d04f1d19d150";

    await expect(repository.getStorageInfo()).resolves.toMatchObject({ usedBytes: 100 });
    await repository.createText({
      id,
      text: "hello",
      source: "desktop",
      createdAt: "2026-09-06T04:00:00.000Z"
    });

    graph.appRoot.size = 200;
    await expect(repository.getStorageInfo()).resolves.toMatchObject({ usedBytes: 200 });
    await repository.deleteItem(id);

    graph.appRoot.size = 50;
    await expect(repository.getStorageInfo()).resolves.toMatchObject({ usedBytes: 50 });
    repository.dispose();

    graph.appRoot.size = 75;
    await expect(repository.getStorageInfo()).resolves.toMatchObject({ usedBytes: 75 });
  });

  it("creates the app folders and publishes a text descriptor", async () => {
    const graph = createFakeGraph();
    const repository = new OneDriveRelayDropRepository(graph.client);
    const internal = repository as unknown as {
      feedIndex: unknown[] | null;
    };
    await repository.listItems();
    expect(internal.feedIndex).toEqual([]);

    const item = await repository.createText({
      id: "7cd2216d-4f13-4ca6-b64b-d04f1d19d150",
      text: "hello from OneDrive",
      source: "desktop",
      createdAt: "2026-09-06T05:00:00.000Z"
    });

    expect(item.text).toBe("hello from OneDrive");
    expect(internal.feedIndex).toBeNull();
    expect(graph.createdFolders.sort()).toEqual(["blobs", "feed"]);
    expect(graph.uploadedDescriptor).toContain('"source":"desktop"');
  });

  it("reports file upload phases and treats metadata lookup as best effort", async () => {
    const graph = createFakeGraph();
    const repository = new OneDriveRelayDropRepository(graph.client);
    const progress = vi.fn();
    const file = new File(["upload content"], "report.txt", {
      type: "text/plain"
    });

    await expect(
      repository.createFile(
        {
          id: "937fb6dc-5b85-4e1c-9738-12f1749a0844",
          file,
          source: "desktop",
          createdAt: "2026-09-06T05:00:00.000Z"
        },
        { onProgress: progress }
      )
    ).resolves.toMatchObject({ file: { name: "report.txt" } });

    expect(progress.mock.calls.map(([value]) => value.phase)).toEqual([
      "preparing",
      "checking",
      "uploading",
      "publishing"
    ]);
    expect(graph.uploadJson).toHaveBeenCalledTimes(1);
  });

  it("does not publish a descriptor after an upload is cancelled", async () => {
    const graph = createFakeGraph();
    const repository = new OneDriveRelayDropRepository(graph.client);
    const controller = new AbortController();
    graph.uploadJson.mockImplementationOnce(
      async (_path, _body, options) =>
        new Promise((_, reject) => {
          options?.onProgress?.({ loadedBytes: 2, totalBytes: 10, attempt: 1 });
          options?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true }
          );
        })
    );
    const pending = repository.createFile(
      {
        id: "cc210455-5d5c-44d9-a7f6-d1ee83959826",
        file: new File(["upload content"], "report.txt", { type: "text/plain" }),
        source: "desktop",
        createdAt: "2026-09-06T05:00:00.000Z"
      },
      { signal: controller.signal }
    );
    await vi.waitFor(() => expect(graph.uploadJson).toHaveBeenCalledTimes(1));

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(graph.uploadedDescriptor).toBe("");
  });

  it("lists a text descriptor from the feed folder", async () => {
    const graph = createFakeGraph();
    const descriptor = {
      schemaVersion: 1 as const,
      id: "7cd2216d-4f13-4ca6-b64b-d04f1d19d150",
      type: "text" as const,
      createdAt: "2026-09-04T10:00:00.000Z",
      source: "phone" as const,
      text: "from the phone"
    };
    graph.feedItems.push({
      id: "descriptor-item",
      name: descriptor.id + ".json",
      createdDateTime: "2026-09-04T10:01:00.000Z"
    });
    graph.descriptorContent.set("descriptor-item", serializeDescriptor(descriptor));
    const repository = new OneDriveRelayDropRepository(graph.client);

    const page = await repository.listItems();

    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      id: descriptor.id,
      type: "text",
      source: "phone",
      serverCreatedAt: "2026-09-04T10:01:00.000Z"
    });
  });

  it("loads descriptor pages lazily and reuses unchanged descriptor content", async () => {
    const graph = createFakeGraph();
    for (let index = 0; index < 14; index += 1) {
      const id = "00000000-0000-4000-8000-" + String(index).padStart(12, "0");
      const driveItemId = "descriptor-" + index;
      graph.feedItems.push({
        id: driveItemId,
        name: id + ".json",
        eTag: '"' + index + '"',
        createdDateTime: new Date(Date.UTC(2026, 8, 4, 12, 0, 14 - index)).toISOString()
      });
      graph.descriptorContent.set(
        driveItemId,
        serializeDescriptor({
          schemaVersion: 1,
          id,
          type: "text",
          createdAt: new Date(Date.UTC(2026, 8, 4, 12, 0, 14 - index)).toISOString(),
          source: "desktop",
          text: "Item " + index
        })
      );
    }
    const repository = new OneDriveRelayDropRepository(graph.client);

    const first = await repository.listItems({ limit: 5 });
    const second = await repository.listItems({ limit: 5, cursor: first.nextCursor });
    const refreshed = await repository.listItems({ limit: 5 });

    expect(first.items).toHaveLength(5);
    expect(first.total).toBe(14);
    expect(first.nextCursor).toBeDefined();
    expect(second.items).toHaveLength(5);
    expect(new Set([...first.items, ...second.items].map((item) => item.id))).toHaveLength(10);
    expect(graph.text).toHaveBeenCalledTimes(10);
    expect(refreshed.items.map((item) => item.id)).toEqual(
      first.items.map((item) => item.id)
    );
    expect(graph.text).toHaveBeenCalledTimes(10);
  });

  it("rejects a self-referential Graph continuation link", async () => {
    const graph = createFakeGraph();
    graph.setFeedNextLink(
      "https://graph.microsoft.com/v1.0/me/drive/items/feed-folder/children?$skiptoken=loop"
    );
    const repository = new OneDriveRelayDropRepository(graph.client);

    await expect(repository.listItems()).rejects.toThrow("pagination loop");
  });

  it("ignores descriptor documents beyond the bounded JSON size", async () => {
    const graph = createFakeGraph();
    const id = "7acaf48d-85cc-4cac-a47e-eb1e713ed23f";
    graph.feedItems.push({
      id: "oversized-descriptor",
      name: id + ".json",
      createdDateTime: "2026-09-07T05:00:00.000Z"
    });
    graph.descriptorContent.set(
      "oversized-descriptor",
      JSON.stringify({
        schemaVersion: 1,
        id,
        type: "text",
        createdAt: "2026-09-07T05:00:00.000Z",
        source: "desktop",
        text: "visible text",
        padding: "x".repeat(MAX_DESCRIPTOR_BYTES)
      })
    );
    const repository = new OneDriveRelayDropRepository(graph.client);

    await expect(repository.listItems()).resolves.toMatchObject({ items: [] });
  });

  it("rejects oversized descriptors from listing metadata before downloading them", async () => {
    const graph = createFakeGraph();
    const id = "9d39ca43-43db-4606-a108-10242a0ed150";
    graph.feedItems.push({
      id: "oversized-metadata-descriptor",
      name: id + ".json",
      size: MAX_DESCRIPTOR_BYTES + 1,
      createdDateTime: "2026-09-07T05:00:00.000Z"
    });
    const repository = new OneDriveRelayDropRepository(graph.client);

    await expect(repository.listItems()).resolves.toMatchObject({ items: [] });
    expect(graph.text).not.toHaveBeenCalled();
  });

  it("loads and caches a OneDrive file presentation with a generated thumbnail", async () => {
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL");
    const graph = createFakeGraph();
    const descriptor = {
      schemaVersion: 1 as const,
      id: "7cd2216d-4f13-4ca6-b64b-d04f1d19d150",
      type: "image" as const,
      createdAt: "2026-09-04T10:00:00.000Z",
      source: "phone" as const,
      file: {
        driveItemId: "remote-image",
        displayName: "photo.jpg",
        size: 1024,
        mediaType: "image/jpeg",
        sha256: "a".repeat(64)
      }
    };
    graph.feedItems.push({
      id: "descriptor-image",
      name: descriptor.id + ".json",
      eTag: '"image"',
      createdDateTime: descriptor.createdAt
    });
    graph.descriptorContent.set("descriptor-image", serializeDescriptor(descriptor));
    registerOwnedFile(graph, descriptor, {
      webUrl: "https://onedrive.live.com/?id=photo",
      "@microsoft.graph.downloadUrl": "https://media.files.1drv.com/photo"
    });
    graph.thumbnailContent.set(
      "remote-image",
      new Blob(["thumbnail bytes"], { type: "image/png" })
    );
    const repository = new OneDriveRelayDropRepository(graph.client);
    await repository.listItems();

    const first = await repository.getFilePresentation(descriptor.id);
    const second = await repository.getFilePresentation(descriptor.id);

    expect(first).toEqual({
      kind: "image",
      openUrl: "https://onedrive.live.com/?id=photo",
      previewUrl: "https://media.files.1drv.com/photo",
      thumbnailUrl: expect.stringMatching(/^blob:/)
    });
    expect(second).toBe(first);
    expect(graph.response).toHaveBeenCalledWith(
      "/me/drive/items/remote-image/thumbnails/0/large/content"
    );
    repository.dispose();
    expect(revokeObjectUrl).toHaveBeenCalledWith(first.thumbnailUrl);
    revokeObjectUrl.mockRestore();
  });

  it("drops an in-flight thumbnail result after the repository is disposed", async () => {
    const graph = createFakeGraph();
    const descriptor = {
      schemaVersion: 1 as const,
      id: "3e307df9-1837-49fa-ae58-dc7faf0270a7",
      type: "image" as const,
      createdAt: "2026-09-04T10:00:00.000Z",
      source: "phone" as const,
      file: {
        driveItemId: "remote-delayed-image",
        displayName: "delayed.jpg",
        size: 1024,
        mediaType: "image/jpeg",
        sha256: "c".repeat(64)
      }
    };
    graph.feedItems.push({
      id: "descriptor-delayed-image",
      name: descriptor.id + ".json",
      eTag: '"delayed-image"',
      createdDateTime: descriptor.createdAt
    });
    graph.descriptorContent.set(
      "descriptor-delayed-image",
      serializeDescriptor(descriptor)
    );
    registerOwnedFile(graph, descriptor, {
      webUrl: "https://onedrive.live.com/?id=delayed",
      "@microsoft.graph.downloadUrl": "https://media.files.1drv.com/delayed"
    });
    let resolveThumbnail!: (response: Response) => void;
    graph.response.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveThumbnail = resolve;
        })
    );
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    const repository = new OneDriveRelayDropRepository(graph.client);
    await repository.listItems();

    const pending = repository.getFilePresentation(descriptor.id);
    await vi.waitFor(() => expect(graph.response).toHaveBeenCalledTimes(1));
    repository.dispose();
    resolveThumbnail(
      new Response(new Blob(["thumbnail bytes"], { type: "image/png" }), {
        status: 200
      })
    );

    await expect(pending).rejects.toThrow("no longer active");
    expect(createObjectUrl).not.toHaveBeenCalled();
    createObjectUrl.mockRestore();
  });

  it("falls back to the thumbnail URL when thumbnail content cannot be fetched", async () => {
    const graph = createFakeGraph();
    const descriptor = {
      schemaVersion: 1 as const,
      id: "24aeb642-8b04-424d-8606-ce46064e192f",
      type: "image" as const,
      createdAt: "2026-09-05T10:00:00.000Z",
      source: "phone" as const,
      file: {
        driveItemId: "remote-fallback-image",
        displayName: "fallback.jpg",
        size: 2048,
        mediaType: "image/jpeg",
        sha256: "b".repeat(64)
      }
    };
    graph.feedItems.push({
      id: "descriptor-fallback-image",
      name: descriptor.id + ".json",
      eTag: '"fallback-image"',
      createdDateTime: descriptor.createdAt
    });
    graph.descriptorContent.set(
      "descriptor-fallback-image",
      serializeDescriptor(descriptor)
    );
    registerOwnedFile(graph, descriptor, {
      "@microsoft.graph.downloadUrl": "https://media.files.1drv.com/fallback"
    });
    graph.thumbnails.set("remote-fallback-image", "https://thumb.svc.ms/fallback");
    const repository = new OneDriveRelayDropRepository(graph.client);
    await repository.listItems();

    const presentation = await repository.getFilePresentation(descriptor.id);

    expect(presentation.thumbnailUrl).toBe("https://thumb.svc.ms/fallback");
    expect(graph.json).toHaveBeenCalledWith(
      "/me/drive/items/remote-fallback-image/thumbnails?$select=small,medium,large"
    );
  });

  it("does not expose non-Microsoft or executable presentation URLs", async () => {
    const graph = createFakeGraph();
    const descriptor = {
      schemaVersion: 1 as const,
      id: "4549740b-3ad8-4e21-b77e-7cc92cb5a167",
      type: "file" as const,
      createdAt: "2026-09-07T06:00:00.000Z",
      source: "desktop" as const,
      file: {
        driveItemId: "unsafe-presentation-file",
        displayName: "payload.bin",
        size: 8,
        mediaType: "application/octet-stream",
        sha256: "b".repeat(64)
      }
    };
    graph.feedItems.push({
      id: "unsafe-presentation-descriptor",
      name: descriptor.id + ".json",
      createdDateTime: descriptor.createdAt
    });
    graph.descriptorContent.set(
      "unsafe-presentation-descriptor",
      serializeDescriptor(descriptor)
    );
    registerOwnedFile(graph, descriptor, {
      webUrl: "javascript:alert(document.domain)",
      "@microsoft.graph.downloadUrl": "https://attacker.example/payload"
    });
    const repository = new OneDriveRelayDropRepository(graph.client);
    await repository.listItems();

    await expect(repository.getFilePresentation(descriptor.id)).resolves.toEqual({
      kind: "file",
      openUrl: undefined,
      previewUrl: undefined
    });
  });

  it("rejects presentation metadata outside the item's deterministic blob folder", async () => {
    const graph = createFakeGraph();
    const descriptor = {
      schemaVersion: 1 as const,
      id: "9e37f07d-8092-4145-b12c-49018f7158c9",
      type: "file" as const,
      createdAt: "2026-09-07T06:00:00.000Z",
      source: "desktop" as const,
      file: {
        driveItemId: "foreign-file",
        displayName: "report.pdf",
        size: 8,
        mediaType: "application/pdf",
        sha256: "b".repeat(64)
      }
    };
    graph.feedItems.push({
      id: "foreign-presentation-descriptor",
      name: descriptor.id + ".json",
      createdDateTime: descriptor.createdAt
    });
    graph.descriptorContent.set(
      "foreign-presentation-descriptor",
      serializeDescriptor(descriptor)
    );
    registerOwnedFile(graph, descriptor, {
      parentReference: { id: "another-item-folder" },
      webUrl: "https://onedrive.live.com/?id=foreign"
    });
    const repository = new OneDriveRelayDropRepository(graph.client);
    await repository.listItems();

    await expect(repository.getFilePresentation(descriptor.id)).rejects.toThrow(
      "no longer matches this RelayDrop item"
    );
  });

  it("reports the failed deletion step and can safely retry", async () => {
    const graph = createFakeGraph();
    const descriptor = {
      schemaVersion: 1 as const,
      id: "83931a4b-fc51-42a4-8998-652f61bfed72",
      type: "file" as const,
      createdAt: "2026-09-06T10:00:00.000Z",
      source: "desktop" as const,
      file: {
        driveItemId: "remote-delete-file",
        displayName: "delete-me.pdf",
        size: 12,
        mediaType: "application/pdf",
        sha256: "d".repeat(64)
      }
    };
    graph.feedItems.push({
      id: "delete-descriptor",
      name: descriptor.id + ".json",
      createdDateTime: descriptor.createdAt
    });
    graph.descriptorContent.set(
      "delete-descriptor",
      serializeDescriptor(descriptor)
    );
    graph.blobFolders.set(descriptor.id, {
      id: "delete-blob-folder",
      name: descriptor.id,
      folder: {}
    });
    graph.fileMetadata.set("remote-delete-file", {
      id: "remote-delete-file",
      name: "delete-me.pdf",
      file: { mimeType: "application/pdf" },
      parentReference: { id: "delete-blob-folder" }
    });
    const repository = new OneDriveRelayDropRepository(graph.client);
    await repository.listItems();
    const progress = vi.fn();
    graph.response.mockRejectedValueOnce(
      new GraphApiError(503, "serviceUnavailable", "Try again")
    );

    await expect(
      repository.deleteItem(descriptor.id, { onProgress: progress })
    ).rejects.toMatchObject({
      name: "RelayDropDeleteError",
      step: "file",
      completedSteps: ["locating"]
    } satisfies Partial<RelayDropDeleteError>);
    expect(progress.mock.calls.map(([value]) => value.step)).toEqual([
      "locating",
      "file"
    ]);
    await expect(repository.deleteItem(descriptor.id)).resolves.toBeUndefined();
  });

  it("does not delete a file referenced outside the item's blob folder", async () => {
    const graph = createFakeGraph();
    const descriptor = {
      schemaVersion: 1 as const,
      id: "42cf6d0a-24f5-4e0d-bcc5-8f7e7b18ea0f",
      type: "file" as const,
      createdAt: "2026-09-07T05:00:00.000Z",
      source: "desktop" as const,
      file: {
        driveItemId: "another-items-file",
        displayName: "private.pdf",
        size: 12,
        mediaType: "application/pdf",
        sha256: "e".repeat(64)
      }
    };
    graph.feedItems.push({
      id: "untrusted-descriptor",
      name: descriptor.id + ".json",
      createdDateTime: descriptor.createdAt
    });
    graph.descriptorContent.set(
      "untrusted-descriptor",
      serializeDescriptor(descriptor)
    );
    graph.blobFolders.set(descriptor.id, {
      id: "expected-blob-folder",
      name: descriptor.id,
      folder: {}
    });
    graph.fileMetadata.set("another-items-file", {
      id: "another-items-file",
      name: "private.pdf",
      file: { mimeType: "application/pdf" },
      parentReference: { id: "some-other-folder" }
    });
    const repository = new OneDriveRelayDropRepository(graph.client);

    await repository.listItems();
    await repository.deleteItem(descriptor.id);

    const deletedPaths = graph.response.mock.calls
      .filter(([, init]) => init?.method === "DELETE")
      .map(([path]) => String(path));
    expect(deletedPaths).not.toContain("/me/drive/items/another-items-file");
    expect(deletedPaths).toContain("/me/drive/items/expected-blob-folder");
    expect(deletedPaths).toContain("/me/drive/items/untrusted-descriptor");
  });

  it("ignores a descriptor whose id does not match its feed filename", async () => {
    const graph = createFakeGraph();
    const filenameId = "a32e9355-55ab-49df-b506-bfed76078747";
    const forgedDescriptor = {
      schemaVersion: 1 as const,
      id: "36edbf49-02cc-4826-b88c-e37739338df4",
      type: "file" as const,
      createdAt: "2026-09-07T06:00:00.000Z",
      source: "desktop" as const,
      file: {
        driveItemId: "forged-file",
        displayName: "forged.txt",
        size: 6,
        mediaType: "text/plain",
        sha256: "f".repeat(64)
      }
    };
    graph.feedItems.push({
      id: "forged-descriptor-item",
      name: filenameId + ".json",
      createdDateTime: forgedDescriptor.createdAt
    });
    graph.descriptorContent.set(
      "forged-descriptor-item",
      serializeDescriptor(forgedDescriptor)
    );
    graph.blobFolders.set(forgedDescriptor.id, {
      id: "requested-blob-folder",
      name: forgedDescriptor.id,
      folder: {}
    });
    const repository = new OneDriveRelayDropRepository(graph.client);

    await expect(repository.listItems()).resolves.toMatchObject({ items: [] });
    await expect(repository.deleteItem(forgedDescriptor.id)).resolves.toBeUndefined();
    expect(
      graph.response.mock.calls.filter(([, init]) => init?.method === "DELETE")
    ).toHaveLength(0);
  });

  it("rejects oversized files before calling Graph", async () => {
    const graph = createFakeGraph();
    const repository = new OneDriveRelayDropRepository(graph.client);
    const file = {
      name: "too-large.bin",
      size: MAX_FILE_BYTES + 1,
      type: "application/octet-stream",
      lastModified: 0
    } as File;

    await expect(
      repository.createFile({
        id: "7cd2216d-4f13-4ca6-b64b-d04f1d19d150",
        file,
        source: "desktop",
        createdAt: "2026-09-06T05:00:00.000Z"
      })
    ).rejects.toBeInstanceOf(RelayDropValidationError);
    expect(graph.json).not.toHaveBeenCalled();
  });

  it("rejects unsafe file names before creating folders or uploading bytes", async () => {
    const graph = createFakeGraph();
    const repository = new OneDriveRelayDropRepository(graph.client);

    await expect(
      repository.createFile({
        id: "7cd2216d-4f13-4ca6-b64b-d04f1d19d150",
        file: new File(["content"], "invoice\u202efdp.exe", {
          type: "application/octet-stream"
        }),
        source: "desktop",
        createdAt: "2026-09-07T05:00:00.000Z"
      })
    ).rejects.toBeInstanceOf(RelayDropValidationError);
    expect(graph.json).not.toHaveBeenCalled();
    expect(graph.uploadJson).not.toHaveBeenCalled();
  });

  it("bounds existing remote file content before hashing an upload retry", async () => {
    const graph = createFakeGraph();
    const repository = new OneDriveRelayDropRepository(graph.client);
    const file = new File(["x"], "retry.txt", { type: "text/plain" });
    graph.json.mockResolvedValueOnce({
      id: "existing-remote-file",
      name: "retry.txt",
      size: file.size,
      file: { mimeType: "text/plain" }
    });
    graph.response.mockResolvedValueOnce(
      new Response(new Uint8Array(8 * 1024 * 1024), {
        status: 200,
        headers: { "Content-Length": String(8 * 1024 * 1024) }
      })
    );
    const internal = repository as unknown as {
      uploadBlob(
        parentId: string,
        name: string,
        input: File,
        digest: string,
        options: Record<string, never>
      ): Promise<unknown>;
    };

    await expect(
      internal.uploadBlob(
        "blob-folder",
        "retry.txt",
        file,
        await sha256Hex(file),
        {}
      )
    ).rejects.toThrow("exceeded its declared size");
  });

  it("downloads file content through the authenticated Graph endpoint", async () => {
    const graph = createFakeGraph();
    const content = "downloaded content";
    const id = "7cd2216d-4f13-4ca6-b64b-d04f1d19d150";
    const descriptor = {
      schemaVersion: 1 as const,
      id,
      type: "file" as const,
      createdAt: "2026-09-07T05:00:00.000Z",
      source: "desktop" as const,
      file: {
        driveItemId: "remote-file",
        displayName: "download.txt",
        size: new Blob([content]).size,
        mediaType: "text/plain",
        sha256: await sha256Hex(new Blob([content]))
      }
    };
    graph.feedItems.push({
      id: "download-descriptor",
      name: id + ".json",
      createdDateTime: descriptor.createdAt
    });
    graph.descriptorContent.set(
      "download-descriptor",
      serializeDescriptor(descriptor)
    );
    registerOwnedFile(graph, descriptor);
    graph.response.mockResolvedValue(new Response(content, { status: 200 }));
    const repository = new OneDriveRelayDropRepository(graph.client);
    await repository.listItems();

    const blob = await repository.downloadFile(id);

    await expect(blob.text()).resolves.toBe("downloaded content");
    expect(graph.response).toHaveBeenCalledWith(
      "/me/drive/items/remote-file/content"
    );
  });

  it("rejects downloaded bytes that do not match the descriptor digest", async () => {
    const graph = createFakeGraph();
    const expected = new Blob(["ORIGINAL"]);
    const id = "39a99576-8252-4675-ae0d-cfb055e6e29a";
    const descriptor = {
      schemaVersion: 1 as const,
      id,
      type: "file" as const,
      createdAt: "2026-09-07T05:00:00.000Z",
      source: "desktop" as const,
      file: {
        driveItemId: "tampered-file",
        displayName: "download.txt",
        size: expected.size,
        mediaType: "text/plain",
        sha256: await sha256Hex(expected)
      }
    };
    graph.feedItems.push({
      id: "tampered-descriptor",
      name: id + ".json",
      createdDateTime: descriptor.createdAt
    });
    graph.descriptorContent.set(
      "tampered-descriptor",
      serializeDescriptor(descriptor)
    );
    registerOwnedFile(graph, descriptor);
    graph.response.mockResolvedValue(
      new Response(new Blob(["MALWARE!"]), { status: 200 })
    );
    const repository = new OneDriveRelayDropRepository(graph.client);
    await repository.listItems();

    await expect(repository.downloadFile(id)).rejects.toThrow(
      "integrity check"
    );
  });

  it("rejects an oversized download from Content-Length before accepting it", async () => {
    const graph = createFakeGraph();
    const expected = new Blob(["ORIGINAL"]);
    const id = "14200adb-4b24-4c79-b4d1-c41b559b6e2f";
    const descriptor = {
      schemaVersion: 1 as const,
      id,
      type: "file" as const,
      createdAt: "2026-09-07T05:00:00.000Z",
      source: "desktop" as const,
      file: {
        driveItemId: "oversized-download",
        displayName: "download.txt",
        size: expected.size,
        mediaType: "text/plain",
        sha256: await sha256Hex(expected)
      }
    };
    graph.feedItems.push({
      id: "oversized-download-descriptor",
      name: id + ".json",
      createdDateTime: descriptor.createdAt
    });
    graph.descriptorContent.set(
      "oversized-download-descriptor",
      serializeDescriptor(descriptor)
    );
    registerOwnedFile(graph, descriptor);
    graph.response.mockResolvedValue(
      new Response(new Uint8Array(expected.size), {
        status: 200,
        headers: { "Content-Length": String(8 * 1024 * 1024) }
      })
    );
    const repository = new OneDriveRelayDropRepository(graph.client);
    await repository.listItems();

    await expect(repository.downloadFile(id)).rejects.toThrow(
      "exceeded its declared size"
    );
  });
});

function registerOwnedFile(
  graph: ReturnType<typeof createFakeGraph>,
  descriptor: {
    id: string;
    file: { driveItemId: string; displayName: string; size: number };
  },
  metadata: Record<string, unknown> = {}
): void {
  const folderId = "blob-folder-" + descriptor.id;
  graph.blobFolders.set(descriptor.id, {
    id: folderId,
    name: descriptor.id,
    folder: {}
  });
  graph.fileMetadata.set(descriptor.file.driveItemId, {
    id: descriptor.file.driveItemId,
    name: descriptor.file.displayName,
    size: descriptor.file.size,
    file: { mimeType: "application/octet-stream" },
    parentReference: { id: folderId },
    ...metadata
  });
}

function createFakeGraph() {
  const createdFolders: string[] = [];
  const feedItems: Array<{
    id: string;
    name: string;
    size?: number;
    createdDateTime?: string;
    eTag?: string;
  }> = [];
  const descriptorContent = new Map<string, string>();
  const blobFolders = new Map<string, Record<string, unknown>>();
  const fileMetadata = new Map<string, Record<string, unknown>>();
  const thumbnails = new Map<string, string>();
  const thumbnailContent = new Map<string, Blob>();
  const appRoot: {
    id: string;
    name: string;
    folder: Record<string, never>;
    size?: number;
    webUrl?: string;
  } = {
    id: "app-root",
    name: "RelayDrop",
    folder: {}
  };
  let uploadedDescriptor = "";
  let feedNextLink: string | undefined;
  let feedPageRequests = 0;

  const json = vi.fn(async (path: string, init?: RequestInit): Promise<unknown> => {
    if (path.startsWith("/me/drive/special/approot")) {
      return { ...appRoot };
    }

    if (path.includes(":/feed?")) {
      if (createdFolders.includes("feed")) {
        return { id: "feed-folder", name: "feed", folder: {} };
      }
      throw new GraphApiError(404, "itemNotFound", "Not found");
    }

    if (path.includes(":/blobs?")) {
      if (createdFolders.includes("blobs")) {
        return { id: "blobs-folder", name: "blobs", folder: {} };
      }
      throw new GraphApiError(404, "itemNotFound", "Not found");
    }

    if (path.endsWith("/children") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { name: string };
      createdFolders.push(body.name);
      return {
        id: body.name === "feed" ? "feed-folder" : "blobs-folder",
        name: body.name,
        folder: {}
      };
    }

    if (path.includes("feed-folder/children")) {
      feedPageRequests += 1;
      if (feedPageRequests > 5) throw new Error("test runaway request guard");
      return {
        value: feedItems,
        ...(feedNextLink ? { "@odata.nextLink": feedNextLink } : {})
      };
    }

    const blobFolderMatch = path.match(/^\/me\/drive\/items\/blobs-folder:\/([^?]+)\?/);
    if (blobFolderMatch) {
      const folder = blobFolders.get(decodeURIComponent(blobFolderMatch[1]));
      if (folder) return folder;
      throw new GraphApiError(404, "itemNotFound", "Not found");
    }

    const thumbnailMatch = path.match(/^\/me\/drive\/items\/([^/]+)\/thumbnails/);
    if (thumbnailMatch) {
      const url = thumbnails.get(decodeURIComponent(thumbnailMatch[1]));
      if (!url) throw new GraphApiError(404, "itemNotFound", "Not found");
      return { value: [{ large: { url } }] };
    }

    const metadataMatch = path.match(/^\/me\/drive\/items\/([^/?]+)(?:\?.*)?$/);
    if (metadataMatch) {
      const metadata = fileMetadata.get(decodeURIComponent(metadataMatch[1]));
      if (metadata) return metadata;
    }

    if (path.includes(":/content") && init?.method === "PUT") {
      uploadedDescriptor = String(init.body);
      descriptorContent.set("new-descriptor", uploadedDescriptor);
      return {
        id: "new-descriptor",
        name: "7cd2216d-4f13-4ca6-b64b-d04f1d19d150.json",
        createdDateTime: "2026-09-04T10:02:00.000Z"
      };
    }

    if (path.includes(".json?")) {
      throw new GraphApiError(404, "itemNotFound", "Not found");
    }

    if (path.includes("/items/blobs-folder:/") && path.includes("?$select=")) {
      throw new GraphApiError(404, "itemNotFound", "Not found");
    }

    throw new Error("Unexpected Graph JSON request: " + path);
  });

  const text = vi.fn(async (path: string): Promise<string> => {
    const id = path.split("/").at(-2) ?? "";
    const value = descriptorContent.get(id);
    if (value === undefined) {
      throw new Error("Unexpected Graph text request: " + path);
    }
    return value;
  });

  const response = vi.fn(async (path: string, init?: RequestInit): Promise<Response> => {
    if (init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }

    const thumbnailMatch = path.match(
      /^\/me\/drive\/items\/([^/]+)\/thumbnails\/0\/large\/content$/
    );
    if (thumbnailMatch) {
      const blob = thumbnailContent.get(decodeURIComponent(thumbnailMatch[1]));
      if (!blob) throw new GraphApiError(404, "itemNotFound", "Not found");
      return new Response(blob, { status: 200 });
    }
    throw new Error("Unexpected Graph response request: " + path);
  });
  const uploadJson = vi.fn(
    async (
      path: string,
      body: Blob,
      options?: {
        headers?: HeadersInit;
        signal?: AbortSignal;
        onProgress?: (progress: {
          loadedBytes: number;
          totalBytes: number;
          attempt: number;
        }) => void;
      }
    ): Promise<unknown> => {
      options?.onProgress?.({
        loadedBytes: body.size,
        totalBytes: body.size,
        attempt: 1
      });
      return json(path, {
        method: "PUT",
        headers: options?.headers,
        body
      });
    }
  );
  const client = {
    json,
    text,
    response,
    uploadJson
  } as unknown as GraphClient;

  return {
    client,
    json,
    appRoot,
    appRootRequests() {
      return json.mock.calls.filter(([path]) =>
        String(path).startsWith("/me/drive/special/approot")
      ).length;
    },
    createdFolders,
    feedItems,
    descriptorContent,
    blobFolders,
    fileMetadata,
    thumbnails,
    thumbnailContent,
    text,
    response,
    uploadJson,
    setFeedNextLink(value: string | undefined) {
      feedNextLink = value;
    },
    get uploadedDescriptor() {
      return uploadedDescriptor;
    }
  };
}

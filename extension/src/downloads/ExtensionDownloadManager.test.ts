import { describe, expect, it, vi } from "vitest";
import {
  ExtensionDownloadManager,
  sanitizeDownloadFileName
} from "./ExtensionDownloadManager";

describe("ExtensionDownloadManager", () => {
  it("stores files in Downloads/RelayDrop and avoids duplicate downloads", async () => {
    const platform = createPlatform();
    const locks = createLockManager();
    const manager = new ExtensionDownloadManager("account-a", platform, locks);
    const secondPanel = new ExtensionDownloadManager("account-a", platform, locks);
    const loadBlob = vi.fn(async () => new Blob(["downloaded"]));

    const [first, second] = await Promise.all([
      manager.download({
        itemId: "item-a",
        fileName: "report.pdf",
        loadBlob
      }),
      secondPanel.download({
        itemId: "item-a",
        fileName: "report.pdf",
        loadBlob
      })
    ]);

    expect(first.status).toBe("complete");
    expect(second.status).toBe("complete");
    expect(loadBlob).toHaveBeenCalledTimes(1);
    expect(platform.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "RelayDrop/report.pdf",
        conflictAction: "uniquify",
        saveAs: false
      })
    );
  });

  it("marks a removed local file as missing", async () => {
    const platform = createPlatform();
    const manager = new ExtensionDownloadManager("account-a", platform);
    await manager.download({
      itemId: "item-a",
      fileName: "report.pdf",
      loadBlob: async () => new Blob(["downloaded"])
    });
    platform.items.get(1)!.exists = false;

    await expect(manager.getStates(["item-a"])).resolves.toMatchObject({
      "item-a": { status: "missing" }
    });
  });

  it("publishes a delayed exists=false result after a status check", async () => {
    const platform = createPlatform();
    const manager = new ExtensionDownloadManager("account-a", platform);
    await manager.download({
      itemId: "item-a",
      fileName: "report.pdf",
      loadBlob: async () => new Blob(["downloaded"])
    });
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);

    platform.items.get(1)!.exists = false;
    platform.emitChange(1, { exists: { current: false } });

    await vi.waitFor(() =>
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "item-a", status: "missing" })
      )
    );
    unsubscribe();
    expect(platform.listenerCount()).toBe(0);
  });

  it("does not let an older change lookup overwrite a missing result", async () => {
    const platform = createPlatform();
    const manager = new ExtensionDownloadManager("account-a", platform);
    await manager.download({
      itemId: "item-a",
      fileName: "report.pdf",
      loadBlob: async () => new Blob(["downloaded"])
    });
    const listener = vi.fn();
    manager.subscribe(listener);
    type FakeDownloadItem = NonNullable<ReturnType<typeof platform.items.get>>;
    let resolveOlderSearch: ((items: FakeDownloadItem[]) => void) | undefined;
    platform.downloads.search.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOlderSearch = resolve;
        })
    );

    platform.emitChange(1, { state: { current: "complete" } });
    await vi.waitFor(() => expect(platform.downloads.search).toHaveBeenCalledTimes(2));
    platform.emitChange(1, { exists: { current: false } });
    await vi.waitFor(() =>
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "item-a", status: "missing" })
      )
    );
    resolveOlderSearch?.([{ ...platform.items.get(1)!, exists: true }]);
    await Promise.resolve();

    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({ status: "missing" });
  });

  it("keeps records for different items downloaded from separate panels", async () => {
    const platform = createPlatform();
    const locks = createLockManager();
    const firstPanel = new ExtensionDownloadManager("account-a", platform, locks);
    const secondPanel = new ExtensionDownloadManager("account-a", platform, locks);

    await Promise.all([
      firstPanel.download({
        itemId: "item-a",
        fileName: "first.pdf",
        loadBlob: async () => new Blob(["first"])
      }),
      secondPanel.download({
        itemId: "item-b",
        fileName: "second.pdf",
        loadBlob: async () => new Blob(["second"])
      })
    ]);

    await expect(firstPanel.getStates(["item-a", "item-b"])).resolves.toMatchObject({
      "item-a": { status: "complete" },
      "item-b": { status: "complete" }
    });
  });

  it("keeps an in-memory record when local storage temporarily fails", async () => {
    const platform = createPlatform();
    platform.storage.set = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    const manager = new ExtensionDownloadManager("account-a", platform);
    const loadBlob = vi.fn(async () => new Blob(["downloaded"]));

    await expect(
      manager.download({ itemId: "item-a", fileName: "report.pdf", loadBlob })
    ).resolves.toMatchObject({ status: "complete" });
    await expect(
      manager.download({ itemId: "item-a", fileName: "report.pdf", loadBlob })
    ).resolves.toMatchObject({ status: "complete" });

    expect(platform.downloads.download).toHaveBeenCalledTimes(1);
    expect(loadBlob).toHaveBeenCalledTimes(1);
    expect(platform.storage.set).toHaveBeenCalledTimes(3);
  });

  it("prefers a new in-memory record over an older stored download", async () => {
    const platform = createPlatform();
    const manager = new ExtensionDownloadManager("account-a", platform);
    const loadBlob = vi.fn(async () => new Blob(["downloaded"]));
    await manager.download({ itemId: "item-a", fileName: "report.pdf", loadBlob });
    platform.items.get(1)!.exists = false;
    platform.storage.set = vi.fn().mockRejectedValue(new Error("storage unavailable"));

    await expect(
      manager.download({ itemId: "item-a", fileName: "report.pdf", loadBlob })
    ).resolves.toMatchObject({ status: "complete", downloadId: 2 });
    await expect(manager.getStates(["item-a"])).resolves.toMatchObject({
      "item-a": { status: "complete", downloadId: 2 }
    });
    await manager.download({ itemId: "item-a", fileName: "report.pdf", loadBlob });

    expect(platform.downloads.download).toHaveBeenCalledTimes(2);
    expect(loadBlob).toHaveBeenCalledTimes(2);
  });

  it("does not let an older status lookup overwrite completion", async () => {
    const platform = createPlatform();
    const manager = new ExtensionDownloadManager("account-a", platform);
    const onStateChange = vi.fn();
    type FakeDownloadItem = NonNullable<ReturnType<typeof platform.items.get>>;
    let resolveFirstSearch: ((items: FakeDownloadItem[]) => void) | undefined;
    platform.downloads.search
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstSearch = resolve;
          })
      )
      .mockImplementation(async ({ id }: { id: number }) => {
        const item = platform.items.get(id);
        return item ? [{ ...item, state: "complete" as const }] : [];
      });
    const pending = manager.download({
      itemId: "item-a",
      fileName: "report.pdf",
      loadBlob: async () => new Blob(["downloaded"]),
      onStateChange
    });
    await vi.waitFor(() => expect(platform.downloads.search).toHaveBeenCalledTimes(1));

    platform.emitChange(1);
    await expect(pending).resolves.toMatchObject({ status: "complete" });
    resolveFirstSearch?.([
      {
        ...platform.items.get(1)!,
        state: "in_progress" as const,
        bytesReceived: 1
      }
    ]);
    await Promise.resolve();

    expect(onStateChange.mock.calls.at(-1)?.[0]).toMatchObject({
      status: "complete"
    });
  });

  it("opens and reveals an existing download", async () => {
    const platform = createPlatform();
    const manager = new ExtensionDownloadManager("account-a", platform);
    await manager.download({
      itemId: "item-a",
      fileName: "report.pdf",
      loadBlob: async () => new Blob(["downloaded"])
    });

    await manager.open("item-a");
    await manager.show("item-a");

    expect(platform.downloads.open).toHaveBeenCalledWith(1);
    expect(platform.downloads.show).toHaveBeenCalledWith(1);
  });

  it("does not reveal a recorded download whose local file is missing", async () => {
    const platform = createPlatform();
    const manager = new ExtensionDownloadManager("account-a", platform);
    await manager.download({
      itemId: "item-a",
      fileName: "report.pdf",
      loadBlob: async () => new Blob(["downloaded"])
    });
    platform.items.get(1)!.exists = false;

    await expect(manager.show("item-a")).rejects.toThrow(
      "The downloaded file is no longer available on this device."
    );
    expect(platform.downloads.show).not.toHaveBeenCalled();
  });

  it("does not directly open a potentially executable local file", async () => {
    const platform = createPlatform();
    const manager = new ExtensionDownloadManager("account-a", platform);
    await manager.download({
      itemId: "item-a",
      fileName: "invoice.pdf.exe",
      loadBlob: async () => new Blob(["downloaded"])
    });

    await expect(manager.open("item-a")).rejects.toThrow(
      "does not directly open files that may contain active content"
    );
    expect(platform.downloads.open).not.toHaveBeenCalled();
  });

  it("rechecks the current local filename before opening it", async () => {
    const platform = createPlatform();
    const manager = new ExtensionDownloadManager("account-a", platform);
    await manager.download({
      itemId: "item-a",
      fileName: "report.pdf",
      loadBlob: async () => new Blob(["downloaded"])
    });
    platform.items.get(1)!.filename = "/Downloads/RelayDrop/report.pdf.exe";

    await expect(manager.open("item-a")).rejects.toThrow(
      "does not directly open files that may contain active content"
    );
    expect(platform.downloads.open).not.toHaveBeenCalled();
  });

  it("does not directly open a download flagged as dangerous by the browser", async () => {
    const platform = createPlatform();
    const manager = new ExtensionDownloadManager("account-a", platform);
    await manager.download({
      itemId: "item-a",
      fileName: "report.pdf",
      loadBlob: async () => new Blob(["downloaded"])
    });
    platform.items.get(1)!.danger = "dangerous";

    await expect(manager.open("item-a")).rejects.toThrow(
      "does not directly open files that may contain active content"
    );
    expect(platform.downloads.open).not.toHaveBeenCalled();
  });

  it("deletes only the local file, keeps its record, and allows downloading again", async () => {
    const platform = createPlatform();
    const locks = createLockManager();
    const manager = new ExtensionDownloadManager("account-a", platform, locks);
    const secondPanel = new ExtensionDownloadManager("account-a", platform, locks);
    const loadBlob = vi.fn(async () => new Blob(["downloaded"]));
    await manager.download({
      itemId: "item-a",
      fileName: "report.pdf",
      loadBlob
    });
    await secondPanel.getStates(["item-a"]);
    const secondPanelListener = vi.fn();
    const unsubscribe = secondPanel.subscribe(secondPanelListener);

    await expect(manager.deleteLocal("item-a")).resolves.toMatchObject({
      itemId: "item-a",
      fileName: "report.pdf",
      status: "missing"
    });

    expect(platform.downloads.removeFile).toHaveBeenCalledWith(1);
    await vi.waitFor(() =>
      expect(secondPanelListener).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "item-a", status: "missing" })
      )
    );
    unsubscribe();
    await expect(secondPanel.getStates(["item-a"])).resolves.toMatchObject({
      "item-a": { status: "missing" }
    });

    await expect(
      secondPanel.download({ itemId: "item-a", fileName: "report.pdf", loadBlob })
    ).resolves.toMatchObject({ status: "complete", downloadId: 2 });
    expect(loadBlob).toHaveBeenCalledTimes(2);
  });

  it("sanitizes path separators and reserved file-name characters", () => {
    expect(sanitizeDownloadFileName('../bad<name>:"report?.pdf')).toBe(
      "_bad_name___report_.pdf"
    );
  });

  it("removes bidirectional controls that can disguise an executable extension", () => {
    expect(sanitizeDownloadFileName("invoice\u202efdp.exe")).toBe(
      "invoicefdp.exe"
    );
    expect(sanitizeDownloadFileName("invoice\u061cfdp.exe")).toBe(
      "invoicefdp.exe"
    );
  });
});

function createPlatform() {
  const storageValues = new Map<string, unknown>();
  const items = new Map<number, {
    id: number;
    filename: string;
    state: "in_progress" | "interrupted" | "complete";
    danger?: string;
    exists: boolean;
    bytesReceived: number;
    totalBytes: number;
  }>();
  let nextId = 1;
  type FakeDownloadDelta = {
    id: number;
    state?: { current?: "in_progress" | "interrupted" | "complete" };
    exists?: { current?: boolean };
  };
  const listeners = new Set<(delta: FakeDownloadDelta) => void>();
  const downloads = {
    download: vi.fn(async (options: { filename: string }) => {
      const id = nextId++;
      items.set(id, {
        id,
        filename: "/mock-home/Downloads/" + options.filename,
        state: "complete",
        exists: true,
        bytesReceived: 10,
        totalBytes: 10
      });
      return id;
    }),
    search: vi.fn(async ({ id }: { id: number }) => {
      const item = items.get(id);
      return item ? [item] : [];
    }),
    open: vi.fn(async () => undefined),
    show: vi.fn(() => undefined),
    removeFile: vi.fn(async (downloadId: number) => {
      const item = items.get(downloadId);
      if (!item || item.exists === false) {
        throw new Error("File not found");
      }
      item.exists = false;
      for (const listener of listeners) {
        listener({ id: downloadId, exists: { current: false } });
      }
    }),
    onChanged: {
      addListener(listener: (delta: FakeDownloadDelta) => void) {
        listeners.add(listener);
      },
      removeListener(listener: (delta: FakeDownloadDelta) => void) {
        listeners.delete(listener);
      }
    }
  };
  return {
    downloads,
    items,
    emitChange(id: number, change: Omit<FakeDownloadDelta, "id"> = {
      state: { current: "complete" as const }
    }) {
      for (const listener of listeners) {
        listener({ id, ...change });
      }
    },
    listenerCount() {
      return listeners.size;
    },
    storage: {
      async get(key: string) {
        return storageValues.has(key) ? { [key]: storageValues.get(key) } : {};
      },
      async set(values: Record<string, unknown>) {
        for (const [key, value] of Object.entries(values)) {
          storageValues.set(key, value);
        }
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

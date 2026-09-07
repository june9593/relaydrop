import { classifyText, sortFeed } from "../domain/feed";
import { classifyFile } from "../domain/files";
import type {
  NewFileItem,
  NewTextItem,
  RelayDropFilePresentation,
  RelayDropFileItem,
  RelayDropItem,
  RelayDropPage,
  RelayDropTextItem
} from "../domain/types";
import type {
  RelayDropFileUploadOptions,
  RelayDropDeleteOptions,
  RelayDropListOptions,
  RelayDropRepository
} from "./RelayDropRepository";

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function createDemoImageUrl(): string {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 520'>" +
    "<rect width='900' height='520' fill='#102b3e'/>" +
    "<rect x='72' y='66' width='756' height='388' rx='10' fill='#f7e8cb'/>" +
    "<circle cx='650' cy='178' r='88' fill='#ff5c35'/>" +
    "<path d='M72 360 250 210l135 112 105-83 198 215H72z' fill='#9bcbe6'/>" +
    "<path d='M72 407 286 260l133 104 123-78 176 168H72z' fill='#c7f36b' opacity='.78'/>" +
    "<rect x='121' y='111' width='244' height='48' fill='#fffaf0'/>" +
    "<text x='142' y='143' font-family='serif' font-size='24' fill='#102b3e'>SATURDAY · 10:30</text>" +
    "</svg>";

  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function createSeedItems(): RelayDropItem[] {
  const noteTime = minutesAgo(8);
  const imageTime = minutesAgo(42);
  const fileTime = minutesAgo(130);

  return [
    {
      id: "af3b826a-8c84-4014-a787-09fd43ce5da1",
      type: "text",
      text: "Remember to move the travel photos into the shared album.",
      createdAt: noteTime,
      serverCreatedAt: noteTime,
      source: "phone"
    },
    {
      id: "6388de18-9d59-4692-9676-12e29f30a104",
      type: "image",
      caption: "The café reference for Saturday",
      createdAt: imageTime,
      serverCreatedAt: imageTime,
      source: "phone",
      file: {
        name: "quiet-corner.jpg",
        size: 2_480_000,
        mediaType: "image/jpeg"
      }
    },
    {
      id: "44c5d475-0b67-4ec6-befa-2744a62f147e",
      type: "file",
      createdAt: fileTime,
      serverCreatedAt: fileTime,
      source: "desktop",
      file: {
        name: "relaydrop-notes.pdf",
        size: 840_000,
        mediaType: "application/pdf"
      }
    }
  ];
}

export class DemoRelayDropRepository implements RelayDropRepository {
  private items = createSeedItems();
  private readonly presentations = new Map<string, RelayDropFilePresentation>([
    [
      "6388de18-9d59-4692-9676-12e29f30a104",
      {
        kind: "image",
        thumbnailUrl: "data:image/png;base64,not-a-valid-image",
        previewUrl: createDemoImageUrl()
      }
    ],
    [
      "44c5d475-0b67-4ec6-befa-2744a62f147e",
      {
        kind: "pdf",
        openUrl: "data:text/plain;charset=utf-8,RelayDrop%20demo%20file%20placeholder"
      }
    ]
  ]);

  async listItems(options: RelayDropListOptions = {}): Promise<RelayDropPage> {
    await delay(700);
    const sorted = sortFeed(this.items);
    const limit = options.limit ?? 12;
    const cursorIndex = options.cursor
      ? sorted.findIndex((item) => item.id === options.cursor) + 1
      : 0;
    const start = Math.max(cursorIndex, 0);
    const items = sorted.slice(start, start + limit);
    const lastItem = items.at(-1);
    return {
      items,
      total: sorted.length,
      nextCursor: start + items.length < sorted.length ? lastItem?.id : undefined
    };
  }

  async createText(input: NewTextItem): Promise<RelayDropTextItem> {
    await delay(320);
    const now = input.createdAt;
    const item: RelayDropTextItem = {
      id: input.id,
      type: classifyText(input.text),
      text: input.text.trim(),
      createdAt: now,
      serverCreatedAt: now,
      source: input.source
    };

    this.items = [item, ...this.items];
    return item;
  }

  async createFile(
    input: NewFileItem,
    options: RelayDropFileUploadOptions = {}
  ): Promise<RelayDropFileItem> {
    options.onProgress?.({ phase: "preparing" });
    await cancellableDelay(120, options.signal);
    options.onProgress?.({ phase: "checking" });
    await cancellableDelay(100, options.signal);
    for (const loadedBytes of [Math.ceil(input.file.size / 3), input.file.size]) {
      options.onProgress?.({
        phase: "uploading",
        loadedBytes,
        totalBytes: input.file.size,
        attempt: 1
      });
      await cancellableDelay(120, options.signal);
    }
    options.onProgress?.({ phase: "publishing" });
    await cancellableDelay(80, options.signal);
    const now = input.createdAt;
    const objectUrl = URL.createObjectURL(input.file);
    const item: RelayDropFileItem = {
      id: input.id,
      type: input.file.type.startsWith("image/") ? "image" : "file",
      createdAt: now,
      serverCreatedAt: now,
      source: input.source,
      file: {
        name: input.file.name,
        size: input.file.size,
        mediaType: input.file.type || "application/octet-stream"
      }
    };

    this.items = [item, ...this.items];
    const kind = classifyFile(item.file.mediaType, item.file.name);
    this.presentations.set(item.id, {
      kind,
      thumbnailUrl: kind === "image" ? objectUrl : undefined,
      previewUrl: kind === "image" || kind === "video" || kind === "audio" ? objectUrl : undefined,
      openUrl: objectUrl
    });
    return item;
  }

  async getFilePresentation(id: string): Promise<RelayDropFilePresentation> {
    await delay(120);
    const presentation = this.presentations.get(id);
    if (!presentation) {
      throw new Error("The demo file is no longer available.");
    }
    return presentation;
  }

  async downloadFile(id: string): Promise<Blob> {
    const item = this.items.find((candidate) => candidate.id === id);
    const presentation = this.presentations.get(id);
    const url = presentation?.previewUrl ?? presentation?.openUrl;

    if (!item || (item.type !== "file" && item.type !== "image") || !url) {
      throw new Error("The demo file is no longer available.");
    }

    const response = await fetch(url);
    return response.blob();
  }

  async deleteItem(id: string, options: RelayDropDeleteOptions = {}): Promise<void> {
    options.onProgress?.({ step: "locating", completedSteps: [] });
    await delay(240);
    const item = this.items.find((candidate) => candidate.id === id);

    if (item && (item.type === "file" || item.type === "image")) {
      options.onProgress?.({ step: "file", completedSteps: ["locating"] });
      const presentation = this.presentations.get(id);
      const urls = new Set([presentation?.thumbnailUrl, presentation?.previewUrl, presentation?.openUrl]);
      for (const url of urls) {
        if (url?.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      }
      this.presentations.delete(id);
    }

    options.onProgress?.({
      step: "descriptor",
      completedSteps:
        item && (item.type === "file" || item.type === "image")
          ? ["locating", "file"]
          : ["locating"]
    });
    this.items = this.items.filter((candidate) => candidate.id !== id);
  }
}

function cancellableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("The operation was cancelled.", "AbortError"));
  }
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = window.setTimeout(finish, milliseconds);
    const abort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("The operation was cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

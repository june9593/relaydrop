import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RelayDropFileItem } from "../domain/types";
import { FeedCard } from "./FeedCard";

const item: RelayDropFileItem = {
  id: "item-a",
  type: "file",
  createdAt: "2026-09-07T00:00:00.000Z",
  serverCreatedAt: "2026-09-07T00:00:00.000Z",
  source: "desktop",
  file: {
    name: "report.pdf",
    size: 1024,
    mediaType: "application/pdf"
  }
};

describe("FeedCard local downloads", () => {
  it("shows downloaded status on an image without unsupported mobile file-manager actions", () => {
    const html = renderToStaticMarkup(<FeedCard
      item={{ ...item, type: "image" }} index={0} isDeleting={false}
      isDownloading={false} isDeletingDownloaded={false} isCompactSurface
      downloadState={{ itemId: item.id, fileName: item.file.name, status: "complete" }}
      downloadActions={{ open: false, show: false, deleteLocal: false }}
      onLoadPresentation={vi.fn()} onOpen={vi.fn()} onDownload={vi.fn()}
      onOpenDownloaded={vi.fn()} onShowDownloaded={vi.fn()} onDeleteDownloaded={vi.fn()} onDelete={vi.fn()}
    />);
    expect(html).toContain("Downloaded");
    expect(html).toContain("In Edge downloads");
    expect(html).not.toContain("Delete local");
    expect(html).not.toContain("Open local");
  });
  it("offers local deletion only while the downloaded file exists", () => {
    const html = renderToStaticMarkup(
      <FeedCard
        item={item}
        index={0}
        isDeleting={false}
        isDownloading={false}
        isDeletingDownloaded={false}
        isCompactSurface
        downloadState={{
          itemId: item.id,
          fileName: item.file.name,
          downloadId: 7,
          status: "complete"
        }}
        onLoadPresentation={vi.fn()}
        onOpen={vi.fn()}
        onDownload={vi.fn()}
        onOpenDownloaded={vi.fn()}
        onShowDownloaded={vi.fn()}
        onDeleteDownloaded={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(html).toContain("Delete local");
  });
});

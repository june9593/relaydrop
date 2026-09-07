import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatBytes, formatRelativeTime } from "../domain/feed";
import { classifyFile } from "../domain/files";
import type {
  RelayDropFilePresentation,
  RelayDropItem
} from "../domain/types";
import type { RelayDropDownloadState } from "../downloads/RelayDropDownloadManager";
import {
  ArrowUpRightIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  ImageIcon,
  LinkIcon,
  NoteIcon,
  PhoneIcon,
  PlayIcon,
  TrashIcon
} from "./Icons";
import { FileArtwork } from "./FileArtwork";
import { ResilientImage } from "./ResilientImage";

interface FeedCardProps {
  item: RelayDropItem;
  index: number;
  presentation?: RelayDropFilePresentation;
  isDeleting: boolean;
  isDownloading: boolean;
  isDeletingDownloaded: boolean;
  isCompactSurface: boolean;
  downloadState?: RelayDropDownloadState;
  onLoadPresentation: (id: string) => Promise<RelayDropFilePresentation>;
  onOpen: (item: RelayDropItem) => void;
  onDownload: (item: RelayDropItem) => void;
  onOpenDownloaded: (id: string) => void;
  onShowDownloaded: (id: string) => void;
  onDeleteDownloaded: (id: string) => void;
  onDelete: (item: RelayDropItem) => void;
}

const typeLabels = {
  text: "Note",
  link: "Link",
  image: "Image",
  file: "File"
} as const;

export function FeedCard({
  item,
  index,
  presentation,
  isDeleting,
  isDownloading,
  isDeletingDownloaded,
  isCompactSurface,
  downloadState,
  onLoadPresentation,
  onOpen,
  onDownload,
  onOpenDownloaded,
  onShowDownloaded,
  onDeleteDownloaded,
  onDelete
}: FeedCardProps) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const style = { "--item-index": index } as CSSProperties;
  const hasFile = item.type === "image" || item.type === "file";
  const fileKind = hasFile
    ? presentation?.kind ?? classifyFile(item.file.mediaType, item.file.name)
    : undefined;
  const mediaSources = presentationImageSources(presentation, fileKind);
  const isDownloaded = downloadState?.status === "complete";
  const isDownloadActive =
    isDownloading || downloadState?.status === "downloading";

  useEffect(() => {
    if (!hasFile || presentation || !cardRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void onLoadPresentation(item.id).catch(() => undefined);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [hasFile, item.id, onLoadPresentation, presentation]);

  const copyText = async () => {
    if (item.type !== "text" && item.type !== "link") {
      return;
    }

    await navigator.clipboard.writeText(item.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const TypeIcon =
    item.type === "text"
      ? NoteIcon
      : item.type === "link"
        ? LinkIcon
        : item.type === "image"
          ? ImageIcon
          : FileIcon;

  return (
    <article ref={cardRef} className={"feed-card type-" + item.type} style={style}>
      <div className="rail-node" aria-hidden="true">
        <TypeIcon />
      </div>

      <div className="card-topline">
        <span className="item-type">{typeLabels[item.type]}</span>
        <span className="item-source">
          {item.source === "phone" ? <PhoneIcon /> : <span className="desktop-dot" />}
          from {item.source}
        </span>
        <time dateTime={item.serverCreatedAt}>{formatRelativeTime(item.serverCreatedAt)}</time>
      </div>

      {(item.type === "text" || item.type === "link") && (
        <div
          className="text-content"
          tabIndex={isCompactSurface && item.type === "text" ? 0 : undefined}
          aria-label={
            isCompactSurface && item.type === "text" ? "Scrollable note content" : undefined
          }
        >
          {item.type === "link" ? (
            <a href={item.text} target="_blank" rel="noreferrer">
              <span>{item.text}</span>
              <ArrowUpRightIcon />
            </a>
          ) : (
            <p>{item.text}</p>
          )}
        </div>
      )}

      {hasFile && (fileKind === "image" || fileKind === "video") && (
        <button className="media-content" type="button" onClick={() => onOpen(item)}>
          <span className="media-frame">
            <ResilientImage
              sources={mediaSources}
              alt={item.caption || item.file.name}
              referrerPolicy="no-referrer"
              fallback={
                <span className="media-placeholder">
                  <FileArtwork file={item.file} kind={fileKind} />
                </span>
              }
            />
            {fileKind === "video" && (
              <span className="play-badge">
                <PlayIcon />
              </span>
            )}
          </span>
          <span className="media-copy">
            <strong>{item.caption || item.file.name}</strong>
            <span>
              {item.file.name} · {formatBytes(item.file.size)} · {fileKind === "video" ? "Play" : "Preview"}
              {isDownloaded ? " · Downloaded" : ""}
            </span>
          </span>
        </button>
      )}

      {hasFile && fileKind !== "image" && fileKind !== "video" && (
        <button className="file-content" type="button" onClick={() => onOpen(item)}>
          <ResilientImage
            sources={mediaSources}
            className="file-thumbnail"
            alt=""
            referrerPolicy="no-referrer"
            fallback={<FileArtwork file={item.file} kind={fileKind} />}
          />
          <span className="file-copy">
            <strong>{item.file.name}</strong>
            <span>
              {formatBytes(item.file.size)} · Open in browser
              {isDownloaded ? " · Downloaded" : ""}
            </span>
          </span>
          <ArrowUpRightIcon className="file-open-icon" />
        </button>
      )}

      <div className="card-actions">
        {(item.type === "text" || item.type === "link") && (
          <button className="icon-text-button" type="button" onClick={copyText}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        {hasFile && (
          <>
            <button className="icon-text-button" type="button" onClick={() => onOpen(item)}>
              {fileKind === "video" ? <PlayIcon /> : <ArrowUpRightIcon />}
              {fileKind === "video" ? "Play" : "Open"}
            </button>
            {isDownloaded ? (
              <>
                <button
                  className="icon-text-button"
                  type="button"
                  disabled={isDeletingDownloaded}
                  onClick={() => onOpenDownloaded(item.id)}
                >
                  <FileIcon />
                  Open local
                </button>
                <button
                  className="icon-text-button"
                  type="button"
                  disabled={isDeletingDownloaded}
                  onClick={() => onShowDownloaded(item.id)}
                >
                  <FolderIcon />
                  Show
                </button>
                <button
                  className="icon-text-button"
                  type="button"
                  disabled={isDeletingDownloaded}
                  onClick={() => onDeleteDownloaded(item.id)}
                >
                  <TrashIcon />
                  {isDeletingDownloaded ? "Deleting…" : "Delete local"}
                </button>
              </>
            ) : (
              <button
                className="icon-text-button"
                type="button"
                disabled={isDownloadActive}
                onClick={() => onDownload(item)}
              >
                <DownloadIcon />
                {isDownloadActive
                  ? "Saving…"
                  : downloadState?.status === "interrupted" ||
                      downloadState?.status === "missing"
                    ? "Download again"
                    : "Download"}
              </button>
            )}
          </>
        )}
        <button
          className="delete-button"
          type="button"
          aria-label={"Delete " + typeLabels[item.type].toLowerCase()}
          disabled={isDeleting || isDeletingDownloaded}
          onClick={() => onDelete(item)}
        >
          <TrashIcon />
        </button>
      </div>
    </article>
  );
}

function presentationImageSources(
  presentation: RelayDropFilePresentation | undefined,
  kind: RelayDropFilePresentation["kind"] | undefined
): string[] {
  const candidates = [
    presentation?.thumbnailUrl,
    kind === "image" ? presentation?.previewUrl : undefined
  ].filter((value): value is string => Boolean(value));
  return [...new Set(candidates)];
}

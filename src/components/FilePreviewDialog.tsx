import { useEffect, useState } from "react";
import { formatBytes } from "../domain/feed";
import type {
  RelayDropFileItem,
  RelayDropFilePresentation
} from "../domain/types";
import { CloseIcon, DownloadIcon, PlayIcon } from "./Icons";
import { ResilientImage } from "./ResilientImage";

interface FilePreviewDialogProps {
  item: RelayDropFileItem;
  presentation: RelayDropFilePresentation;
  isDownloading: boolean;
  onClose: () => void;
  onDownload: (item: RelayDropFileItem) => void;
}

export function FilePreviewDialog({
  item,
  presentation,
  isDownloading,
  onClose,
  onDownload
}: FilePreviewDialogProps) {
  const [videoFailed, setVideoFailed] = useState(false);
  const imageSources = [presentation.previewUrl, presentation.thumbnailUrl].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setVideoFailed(false);
  }, [presentation.previewUrl, presentation.thumbnailUrl]);

  return (
    <div className="preview-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="file-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="file-preview-title">{item.file.name}</h2>
            <p>{formatBytes(item.file.size)}</p>
          </div>
          <button type="button" aria-label="Close preview" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className={"preview-stage preview-" + presentation.kind}>
          {presentation.kind === "image" && (
            <ResilientImage
              sources={imageSources}
              alt={item.caption || item.file.name}
              referrerPolicy="no-referrer"
              fallback={
                <div className="preview-unavailable">
                  <PlayIcon />
                  <p>A browser preview is not available for this file.</p>
                  {presentation.openUrl && (
                    <a href={presentation.openUrl} target="_blank" rel="noreferrer">
                      Open in OneDrive
                    </a>
                  )}
                </div>
              }
            />
          )}
          {presentation.kind === "video" && presentation.previewUrl && !videoFailed && (
            <video
              controls
              autoPlay
              playsInline
              preload="metadata"
              src={presentation.previewUrl}
              onError={() => setVideoFailed(true)}
            >
              Your browser cannot play this video.
            </video>
          )}
          {presentation.kind === "video" && (!presentation.previewUrl || videoFailed) && (
            <div className="preview-unavailable">
              <PlayIcon />
              <p>A browser preview is not available for this file.</p>
              {presentation.openUrl && (
                <a href={presentation.openUrl} target="_blank" rel="noreferrer">
                  Open in OneDrive
                </a>
              )}
            </div>
          )}
        </div>

        <footer>
          <span>The original stays in your OneDrive app folder.</span>
          <button
            className="preview-download-button"
            type="button"
            disabled={isDownloading}
            onClick={() => onDownload(item)}
          >
            <DownloadIcon />
            {isDownloading ? "Downloading…" : "Download original"}
          </button>
        </footer>
      </section>
    </div>
  );
}

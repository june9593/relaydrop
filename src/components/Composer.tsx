import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent
} from "react";
import { formatBytes } from "../domain/feed";
import {
  isActiveFileTransfer,
  isCancellableFileTransfer,
  type RelayDropFileTransferState
} from "../domain/transfers";
import { CloseIcon, FileIcon, NoteIcon, SendIcon, UploadIcon } from "./Icons";
import { ensureClipboardFileName, firstClipboardFile } from "./composerClipboard";
import {
  canPreviewSelectedFile,
  shouldAnimateUploadProgress
} from "./composerPresentation";

interface ComposerProps {
  isSending: boolean;
  fileTransfer: RelayDropFileTransferState;
  onSendText: (text: string) => Promise<void>;
  onSendFile: (file: File) => Promise<void>;
  onCancelFileUpload: () => void;
  onResetFileTransfer: () => void;
}

type ComposerMode = "note" | "file";
type FileSource = "clipboard" | "device" | "drop";

export function Composer({
  isSending,
  fileTransfer,
  onSendText,
  onSendFile,
  onCancelFileUpload,
  onResetFileTransfer
}: ComposerProps) {
  const [mode, setMode] = useState<ComposerMode>("note");
  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileSource, setFileSource] = useState<FileSource | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (
      !selectedFile ||
      !canPreviewSelectedFile(selectedFile) ||
      typeof URL.createObjectURL !== "function"
    ) {
      setFilePreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(selectedFile);
    setFilePreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedFile]);

  const submitText = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();

    if (!value || isSending) {
      return;
    }

    try {
      await onSendText(value);
      setText("");
    } catch {
      // The shared hook owns the visible error and keeps this draft intact.
    }
  };

  const submitFile = async (event: FormEvent) => {
    event.preventDefault();

    if (!selectedFile || isSending) {
      return;
    }

    try {
      await onSendFile(selectedFile);
      setSelectedFile(null);
      setFileSource(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch {
      // Keep the file selected so Cancelled and Failed uploads can be retried.
    }
  };

  const selectFile = (file: File | null, source: FileSource | null) => {
    if (isSending) return;
    onResetFileTransfer();
    if (source !== "device" && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setSelectedFile(file);
    setFileSource(file ? source : null);
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    selectFile(file, "device");
  };

  const clearFileSelection = () => {
    if (isSending) return;
    selectFile(null, null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const dropFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];

    if (file) {
      selectFile(file, "drop");
    }
  };

  const pasteFile = (event: ClipboardEvent<HTMLElement>) => {
    const file = firstClipboardFile(event.clipboardData);
    if (!file) {
      return;
    }

    if (isSending) return;
    event.preventDefault();
    selectFile(ensureClipboardFileName(file), "clipboard");
    setMode("file");
  };

  const transferActive = isActiveFileTransfer(fileTransfer.status);
  const transferMatchesSelection = Boolean(
    selectedFile && fileTransfer.fileName === selectedFile.name
  );
  const transferLabel = uploadLabel(fileTransfer);
  const progressIsIndeterminate = shouldAnimateUploadProgress(fileTransfer.status);

  return (
    <section className="composer-card" aria-labelledby="composer-title" onPaste={pasteFile}>
      <div className="composer-heading">
        <div>
          <p className="eyebrow">New item</p>
          <h2 id="composer-title">Send to your devices</h2>
        </div>
        <span className="demo-chip">Preview</span>
      </div>

      <div className="mode-switch" role="tablist" aria-label="Item type">
        <button
          className={mode === "note" ? "mode-button active" : "mode-button"}
          type="button"
          role="tab"
          aria-selected={mode === "note"}
          disabled={isSending}
          onClick={() => setMode("note")}
        >
          <NoteIcon />
          Note
        </button>
        <button
          className={mode === "file" ? "mode-button active" : "mode-button"}
          type="button"
          role="tab"
          aria-selected={mode === "file"}
          disabled={isSending}
          onClick={() => setMode("file")}
        >
          <FileIcon />
          File
        </button>
      </div>

      {mode === "note" ? (
        <form className="composer-form" onSubmit={submitText}>
          <label className="sr-only" htmlFor="relay-note">
            Note or link
          </label>
          <textarea
            id="relay-note"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Type a note or paste a link"
            rows={6}
          />
          <div className="composer-meta">
            <span>Ctrl/⌘ + Enter to send</span>
            <span>{text.length} characters</span>
          </div>
          <button className="send-button" type="submit" disabled={!text.trim() || isSending}>
            <span>{isSending ? "Sending…" : "Send"}</span>
            <SendIcon />
          </button>
        </form>
      ) : (
        <form className="composer-form" onSubmit={submitFile}>
          <input
            ref={fileInputRef}
            className="sr-only"
            id="relay-file"
            type="file"
            disabled={isSending}
            onChange={chooseFile}
          />
          <div
            className={isDragging ? "drop-zone dragging" : "drop-zone"}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!isSending) setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={dropFile}
            aria-busy={transferActive}
          >
            {filePreviewUrl ? (
              <div className="selected-image-preview">
                <img src={filePreviewUrl} alt={`Preview of ${selectedFile?.name ?? "image"}`} />
              </div>
            ) : (
              <UploadIcon />
            )}
            {selectedFile ? (
              <>
                <strong>{selectedFile.name}</strong>
                <span>
                  {formatBytes(selectedFile.size)} ·{" "}
                  {transferMatchesSelection && transferActive
                    ? "Transfer in progress"
                    : fileTransfer.status === "failed" ||
                        fileTransfer.status === "cancelled"
                      ? "Ready to retry"
                      : "Ready to send"}
                </span>
                {fileSource === "clipboard" ? (
                  <span className="file-source-hint" aria-live="polite">
                    From clipboard
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <strong>Drop a file here</strong>
                <span>browse this device or paste from clipboard</span>
              </>
            )}
            <div className="file-selection-actions">
              <button
                className="text-button"
                type="button"
                disabled={isSending}
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? "Choose another" : "Choose a file"}
              </button>
              {selectedFile ? (
                <button
                  className="remove-file-button"
                  type="button"
                  disabled={isSending}
                  onClick={clearFileSelection}
                >
                  <CloseIcon />
                  Remove file
                </button>
              ) : null}
            </div>
          </div>
          {selectedFile && transferMatchesSelection && fileTransfer.status !== "idle" && (
            <div
              className={`upload-status status-${fileTransfer.status}`}
              aria-live="polite"
            >
              <div className="upload-status-copy">
                <strong>{transferLabel}</strong>
                <span>{uploadDetail(fileTransfer)}</span>
              </div>
              <div
                className={`upload-progress-track${progressIsIndeterminate ? " indeterminate" : ""}`}
                role="progressbar"
                aria-label={transferLabel}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={fileTransfer.percent}
              >
                <span style={{ width: `${fileTransfer.percent ?? 32}%` }} />
              </div>
              {isCancellableFileTransfer(fileTransfer.status) && (
                <button
                  className="cancel-upload-button"
                  type="button"
                  onClick={onCancelFileUpload}
                >
                  <CloseIcon />
                  Cancel
                </button>
              )}
            </div>
          )}
          <p className="storage-note">Files up to 100 MB.</p>
          <button className="send-button" type="submit" disabled={!selectedFile || isSending}>
            <span>
              {isSending
                ? transferLabel
                : fileTransfer.status === "failed" || fileTransfer.status === "cancelled"
                  ? "Retry upload"
                  : "Send"}
            </span>
            <SendIcon />
          </button>
        </form>
      )}
    </section>
  );
}

function uploadLabel(state: RelayDropFileTransferState): string {
  switch (state.status) {
    case "preparing":
      return "Preparing…";
    case "checking":
      return "Checking OneDrive…";
    case "uploading":
      return `Uploading ${state.percent ?? 0}%`;
    case "publishing":
      return "Finishing in OneDrive…";
    case "cancelling":
      return "Stopping upload…";
    case "cancelled":
      return "Upload stopped";
    case "failed":
      return "Upload failed";
    case "success":
      return "Upload complete";
    default:
      return "Ready to send";
  }
}

function uploadDetail(state: RelayDropFileTransferState): string {
  if (state.message) return state.message;
  if (
    state.status === "uploading" &&
    state.loadedBytes !== undefined &&
    state.totalBytes !== undefined
  ) {
    const attempt = state.attempt && state.attempt > 1 ? ` · attempt ${state.attempt}` : "";
    return `${formatBytes(state.loadedBytes)} of ${formatBytes(state.totalBytes)}${attempt}`;
  }
  if (state.status === "publishing") return "Publishing the feed item…";
  if (state.status === "checking") return "Checking for a safe retry…";
  if (state.status === "preparing") return "Preparing and verifying the file…";
  return "The file remains selected for a safe retry.";
}

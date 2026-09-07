import { CloseIcon, TrashIcon } from "./Icons";
import type { RelayDropDeleteStep } from "../repository/RelayDropRepository";

interface ConfirmDialogProps {
  itemName: string;
  isDeleting: boolean;
  currentStep?: RelayDropDeleteStep;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  itemName,
  isDeleting,
  currentStep,
  error,
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="dialog-close" type="button" aria-label="Close" onClick={onCancel}>
          <CloseIcon />
        </button>
        <div className="dialog-icon">
          <TrashIcon />
        </div>
        <p className="eyebrow">Remove from the lane</p>
        <h2 id="delete-title">Delete this item?</h2>
        <p>
          “{itemName}” will disappear from RelayDrop after other devices refresh. OneDrive may
          retain a recoverable copy according to its recycle-bin policy.
        </p>
        {error && (
          <div className="delete-retry-message" role="alert">
            <strong>Deletion paused</strong>
            <span>{error} Already removed content is detected and skipped on retry.</span>
          </div>
        )}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Keep it
          </button>
          <button className="danger-button" type="button" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting
              ? deleteStepLabel(currentStep)
              : error
                ? "Retry deletion"
                : "Delete item"}
          </button>
        </div>
      </div>
    </div>
  );
}

function deleteStepLabel(step: RelayDropDeleteStep | undefined): string {
  switch (step) {
    case "locating":
      return "Checking item…";
    case "file":
      return "Removing file…";
    case "folder":
      return "Cleaning folder…";
    case "descriptor":
      return "Removing entry…";
    default:
      return "Deleting…";
  }
}

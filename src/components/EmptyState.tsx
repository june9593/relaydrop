import { RefreshIcon } from "./Icons";

interface EmptyStateProps {
  isRefreshing: boolean;
  hasRefreshed: boolean;
  onRefresh: () => void;
}

export function EmptyState({ isRefreshing, hasRefreshed, onRefresh }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-orbit" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="eyebrow">{hasRefreshed ? "Up to date" : "Manual refresh"}</p>
      <h2>{hasRefreshed ? "No items yet" : "No items loaded"}</h2>
      <p>
        {hasRefreshed
          ? "Send a note or file to start using RelayDrop."
          : "Select Refresh to check OneDrive for the latest notes and files."}
      </p>
      {!hasRefreshed && (
        <button className="refresh-button primary" type="button" onClick={onRefresh}>
          <RefreshIcon className={isRefreshing ? "spinning" : undefined} />
          {isRefreshing ? "Checking…" : "Pull latest"}
        </button>
      )}
    </div>
  );
}

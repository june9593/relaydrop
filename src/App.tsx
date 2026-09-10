import { useCallback, useEffect, useMemo, useState } from "react";
import { Composer } from "./components/Composer";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { AccountMenu } from "./components/AccountMenu";
import { EmptyState } from "./components/EmptyState";
import { FeedCard } from "./components/FeedCard";
import { FilePreviewDialog } from "./components/FilePreviewDialog";
import { OneDriveStorageCard, storageUsageLabel } from "./components/OneDriveStorageCard";
import { MobileAccessCard } from "./components/MobileAccessCard";
import { SettingsDialog } from "./components/SettingsDialog";
import {
  CheckIcon,
  FileIcon,
  HomeIcon,
  PhoneIcon,
  RefreshIcon,
  SettingsIcon
} from "./components/Icons";
import { classifyFile } from "./domain/files";
import type {
  RelayDropDevice,
  RelayDropFileItem,
  RelayDropFilePresentation,
  RelayDropItem
} from "./domain/types";
import type { UseRelayDropOptions } from "./cache/RelayDropFeedCache";
import { useRelayDrop } from "./hooks/useRelayDrop";
import { useRelayDropStorage } from "./hooks/useRelayDropStorage";
import type { RelayDropRepository } from "./repository/RelayDropRepository";
import type { RelayDropSyncPreferences, RelayDropTheme } from "./settings/types";

function detectDevice(): RelayDropDevice {
  return window.matchMedia("(max-width: 720px)").matches ? "phone" : "desktop";
}

interface AppProps {
  repository: RelayDropRepository;
  mode: "demo" | "onedrive";
  accountName: string;
  accountSubtitle: string;
  surface?: "web" | "sidepanel";
  onSignOut?: () => void | Promise<void>;
  relayOptions?: UseRelayDropOptions;
  syncPreferences?: RelayDropSyncPreferences;
  onSyncPreferencesChange?: (preferences: RelayDropSyncPreferences) => void;
  syncSettingsError?: string | null;
  theme?: RelayDropTheme;
  onThemeChange?: (theme: RelayDropTheme) => void;
  device?: RelayDropDevice;
  requiresReconnect?: boolean;
  onReconnect?: () => void | Promise<void>;
}

export default function App({
  repository,
  mode,
  accountName,
  accountSubtitle,
  surface = "web",
  onSignOut,
  relayOptions,
  syncPreferences,
  onSyncPreferencesChange,
  syncSettingsError,
  theme,
  onThemeChange,
  device,
  requiresReconnect = false,
  onReconnect
}: AppProps) {
  const source = useMemo(
    () => device ?? (surface === "sidepanel" ? "desktop" : detectDevice()),
    [device, surface]
  );
  const relay = useRelayDrop(repository, source, relayOptions);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(surface !== "sidepanel");
  const storageRefreshKey = `${relay.items.length}:${relay.items[0]?.id ?? ""}:${
    relay.lastRefreshedAt?.getTime() ?? 0
  }`;
  const storageInfo = useRelayDropStorage(
    repository,
    mode === "onedrive" && (surface !== "sidepanel" || settingsOpen),
    storageRefreshKey
  );
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const [deleteTarget, setDeleteTarget] = useState<RelayDropItem | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{
    item: RelayDropFileItem;
    presentation: RelayDropFilePresentation;
  } | null>(null);

  useEffect(() => () => repository.dispose?.(), [repository]);


  const openFile = useCallback(
    async (item: RelayDropItem) => {
      if (item.type !== "file" && item.type !== "image") {
        return;
      }

      const knownPresentation = relay.presentations[item.id];
      const kind =
        knownPresentation?.kind ?? classifyFile(item.file.mediaType, item.file.name);
      const usesInlinePreview = kind === "image" || kind === "video";
      const pendingTab = !usesInlinePreview
        ? window.open("about:blank", "_blank")
        : null;

      try {
        const presentation =
          await relay.loadFilePresentation(item.id);

        if (
          (presentation.kind === "image" || presentation.kind === "video") &&
          presentation.previewUrl
        ) {
          setPreviewTarget({ item, presentation });
          pendingTab?.close();
          return;
        }

        const openUrl = presentation.openUrl;
        if (!openUrl) {
          pendingTab?.close();
          await relay.downloadItem(item);
          return;
        }

        if (pendingTab) {
          pendingTab.opener = null;
          pendingTab.location.replace(openUrl);
        } else {
          window.open(openUrl, "_blank", "noopener,noreferrer");
        }
      } catch {
        pendingTab?.close();
        relay.reportError(
          "RelayDrop could not open that file. Try downloading the original instead."
        );
      }
    },
    [relay]
  );

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await relay.deleteItem(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // The hook owns the visible error state.
    }
  };

  return (
    <div
      className={
        surface === "sidepanel"
          ? "product-shell product-shell--sidepanel"
          : "product-shell"
      }
    >
      <header className="app-header">
        <a
          className="brand"
          href={surface === "sidepanel" ? "#overview" : "/"}
          aria-label="RelayDrop home"
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>RelayDrop</span>
          {surface !== "sidepanel" && <small>Preview</small>}
        </a>

        <div className="header-actions">
          <span className="connection-label">
            <span className="status-dot" />
            {mode === "demo" ? "Demo mode" : requiresReconnect ? "Reconnect OneDrive" : "OneDrive"}
          </span>
          <AccountMenu
            accountName={accountName}
            accountSubtitle={accountSubtitle}
            onOpenSettings={() => setSettingsOpen(true)}
            onSignOut={onSignOut}
          />
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <nav className="primary-nav" aria-label="Primary navigation">
            <a className="nav-item active" href="#overview" aria-current="page">
              <HomeIcon />
              Overview
            </a>
            <a className="nav-item" href="#recent">
              <FileIcon />
              Recent items
            </a>
            <button className="nav-item" type="button" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon />
              Settings
            </button>
          </nav>

          <div className="sidebar-section device-section">
            <p className="section-label">Your devices</p>
            <div className="device-row">
              <span className="device-avatar desktop-device">
                <span />
              </span>
              <span>
                <strong>This computer</strong>
                <small>Current device</small>
              </span>
              <i className="online-dot" aria-label="Online" />
            </div>
            <div className="device-row">
              <span className="device-avatar">
                <PhoneIcon />
              </span>
              <span>
                <strong>Your phone</strong>
                <small>Refresh to receive</small>
              </span>
            </div>
          </div>

          {mode === "onedrive" ? (
            <OneDriveStorageCard info={storageInfo} variant="sidebar" />
          ) : (
            <div className="sidebar-section storage-section">
              <strong>OneDrive</strong>
              <p>Connect a Microsoft account to use RelayDrop's private app folder.</p>
            </div>
          )}

          <div className="manual-sync-note">
            <CheckIcon />
            <p>
              <strong>{relayOptions?.syncPolicy?.refreshOnOpen ? "Smart refresh" : "Manual sync"}</strong>
              {relayOptions?.syncPolicy?.refreshOnOpen
                ? "Cached items appear first; changes refresh quietly in the background."
                : "Nothing is fetched until you choose Refresh."}
            </p>
          </div>
        </aside>

        <main className="main-content" id="overview">
          <div className="content-container">
            <div className="page-heading">
              <div>
                <p className="eyebrow">Personal transfer</p>
                <h1>
                  {surface === "sidepanel"
                    ? "Your private device drop"
                    : "Send files and notes across your devices"}
                </h1>
                <p>
                  {surface === "sidepanel"
                    ? "Send now, then refresh on your other device."
                    : "A private space backed by your Microsoft account. No contacts, no conversations, no background notifications."}
                </p>
              </div>
              <button
                className="refresh-button"
                type="button"
                disabled={relay.isRefreshing}
                onClick={relay.refresh}
              >
                <RefreshIcon className={relay.isRefreshing ? "spinning" : undefined} />
                <span>{relay.isRefreshing ? "Refreshing…" : "Refresh"}</span>
              </button>
            </div>

            {surface === "sidepanel" && mode === "onedrive" && source !== "phone" && (
              <div className="sidepanel-utility-stack">
                <MobileAccessCard />
              </div>
            )}

            {mode === "demo" && (
              <div className="preview-notice">
                <span className="notice-icon">i</span>
                <p>
                  This preview uses temporary in-memory data. Add a Microsoft client ID to connect
                  RelayDrop to your OneDrive app folder.
                </p>
              </div>
            )}

            {requiresReconnect && (
              <div className="reconnect-banner" role="status">
                <p>Your saved items are available. Reconnect to check for new items and send files.</p>
                <button type="button" onClick={() => void onReconnect?.()}>Reconnect Microsoft</button>
              </div>
            )}

            {relay.error && !requiresReconnect && (
              <div className="error-banner" role="alert">
                <span>{relay.error}</span>
                <button type="button" onClick={relay.clearError}>
                  Dismiss
                </button>
              </div>
            )}

            <div className="workspace-grid">
              <section className="feed-panel" id="recent" aria-labelledby="feed-title">
                <div className="section-heading">
                  <div>
                    <h2 id="feed-title">Recent items</h2>
                    <p>
                      {relay.isRefreshing ? "Checking for the newest items…" : relay.lastRefreshedAt
                        ? "Last refreshed " +
                          relay.lastRefreshedAt.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit"
                          })
                        : "Refresh when you want to check for new items"}
                    </p>
                  </div>
                  {relay.items.length > 0 && (
                    <span className="item-count">{relay.items.length} shown</span>
                  )}
                </div>

                {relay.items.length === 0 ? (
                  <EmptyState
                    isRefreshing={relay.isRefreshing}
                    hasRefreshed={relay.lastRefreshedAt !== null}
                    onRefresh={relay.refresh}
                  />
                ) : (
                  <div className="feed-list">
                    {relay.items.map((item, index) => (
                      <FeedCard
                        key={item.id}
                        item={item}
                        index={index}
                        presentation={relay.presentations[item.id]}
                        isDeleting={relay.deletingId === item.id}
                        isDownloading={relay.downloadingId === item.id}
                        isDeletingDownloaded={relay.deletingLocalIds.has(item.id)}
                        isCompactSurface={surface === "sidepanel"}
                        downloadState={relay.downloadStates[item.id]}
                        downloadActions={relayOptions?.downloadManager?.capabilities}
                        onLoadPresentation={relay.loadFilePresentation}
                        onOpen={openFile}
                        onDownload={relay.downloadItem}
                        onOpenDownloaded={relay.openDownloadedItem}
                        onShowDownloaded={relay.showDownloadedItem}
                        onDeleteDownloaded={relay.deleteDownloadedItem}
                        onDelete={setDeleteTarget}
                      />
                    ))}
                    <p className="feed-end" aria-live="polite">
                      {relay.hasMore ? (
                        <button className="load-older-button" type="button"
                          disabled={relay.isLoadingMore || relay.isRefreshing}
                          onClick={() => void relay.loadMore()}>
                          {relay.isLoadingMore ? "Loading older items…" : "Load older items"}
                        </button>
                      ) : "You are all caught up"}
                    </p>
                  </div>
                )}
              </section>

              <aside className="composer-panel">
                {surface === "sidepanel" && (
                  <button className="composer-toggle" type="button"
                    aria-expanded={composerOpen} aria-controls="relay-composer"
                    disabled={relay.isSending} onClick={() => setComposerOpen(open => !open)}>
                    {composerOpen ? "Close composer" : "Send a note or file"}
                  </button>
                )}
                <div id="relay-composer" hidden={!composerOpen}>
                <Composer
                  isSending={relay.isSending}
                  fileTransfer={relay.fileTransfer}
                  onSendText={async text => { await relay.sendText(text); if (surface === "sidepanel") setComposerOpen(false); }}
                  onSendFile={async file => { await relay.sendFile(file); if (surface === "sidepanel") setComposerOpen(false); }}
                  onCancelFileUpload={relay.cancelFileUpload}
                  onResetFileTransfer={relay.resetFileTransfer}
                />
                <p className="privacy-caption">
                  {mode === "demo"
                    ? "Items are held in memory for this preview and disappear when the page reloads."
                    : "Items are stored in RelayDrop's private OneDrive app folder."}
                </p>
                </div>
              </aside>
            </div>
          </div>
        </main>
      </div>

      <footer className="status-bar">
        <span>{mode === "demo" ? "RelayDrop preview" : "RelayDrop"}</span>
        <span>{mode === "demo" ? "PWA shell · Demo repository" : "OneDrive app folder"}</span>
      </footer>

      {deleteTarget && (
        <ConfirmDialog
          itemName={itemName(deleteTarget)}
          isDeleting={relay.deletingId === deleteTarget.id}
          currentStep={
            relay.deletingId === deleteTarget.id
              ? relay.deleteProgress?.step
              : undefined
          }
          error={
            relay.deleteFailure?.id === deleteTarget.id
              ? relay.deleteFailure.message
              : undefined
          }
          onCancel={() => {
            relay.clearDeleteFailure();
            setDeleteTarget(null);
          }}
          onConfirm={confirmDelete}
        />
      )}

      {previewTarget && (
        <FilePreviewDialog
          item={previewTarget.item}
          presentation={previewTarget.presentation}
          isDownloading={relay.downloadingId === previewTarget.item.id}
          onClose={() => setPreviewTarget(null)}
          onDownload={relay.downloadItem}
        />
      )}

      <SettingsDialog
        open={settingsOpen}
        surface={surface}
        preferences={syncPreferences}
        onPreferencesChange={onSyncPreferencesChange}
        oneDriveFolderUrl={storageInfo?.manageUrl}
        oneDriveUsageLabel={storageInfo ? storageUsageLabel(storageInfo) : undefined}
        settingsError={syncSettingsError}
        theme={theme}
        onThemeChange={onThemeChange}
        onClose={closeSettings}
      />
    </div>
  );
}

function itemName(item: RelayDropItem): string {
  if ("file" in item) {
    return item.file.name;
  }

  return item.text.length > 52 ? item.text.slice(0, 52) + "…" : item.text;
}

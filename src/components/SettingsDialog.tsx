import { useEffect, useRef } from "react";
import { ArrowUpRightIcon, CloseIcon, CloudIcon } from "./Icons";
import type { RelayDropSyncPreferences, RelayDropTheme } from "../settings/types";

interface SettingsDialogProps {
  open: boolean;
  surface: "web" | "sidepanel";
  preferences?: RelayDropSyncPreferences;
  onPreferencesChange?: (preferences: RelayDropSyncPreferences) => void;
  oneDriveFolderUrl?: string;
  oneDriveUsageLabel?: string;
  settingsError?: string | null;
  theme?: RelayDropTheme;
  onThemeChange?: (theme: RelayDropTheme) => void;
  onClose: () => void;
}

export function SettingsDialog({
  open,
  surface,
  preferences,
  onPreferencesChange,
  oneDriveFolderUrl,
  oneDriveUsageLabel,
  settingsError,
  theme,
  onThemeChange,
  onClose
}: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const updatePreference = (key: keyof RelayDropSyncPreferences, value: boolean) => {
    if (!preferences || !onPreferencesChange) return;
    onPreferencesChange({ ...preferences, [key]: value });
  };

  return (
    <div
      className={`settings-backdrop settings-backdrop--${surface}`}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-header">
          <div>
            <p>RelayDrop</p>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button ref={closeRef} type="button" aria-label="Close settings" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="settings-content">
          {settingsError && (
            <p className="settings-error" role="alert">
              {settingsError}
            </p>
          )}
          {theme && onThemeChange && (
            <section className="settings-section" aria-labelledby="appearance-settings-title">
              <div className="settings-section-heading">
                <h3 id="appearance-settings-title">Appearance</h3>
                <p>Choose how RelayDrop looks on this device.</p>
              </div>
              <div className="settings-theme-options" role="radiogroup" aria-label="Theme">
                <label className="settings-theme-option">
                  <input
                    type="radio"
                    name="relaydrop-theme"
                    value="light"
                    checked={theme === "light"}
                    onChange={() => onThemeChange("light")}
                  />
                  <span>
                    <strong>Light</strong>
                    <small>Warm paper surfaces</small>
                  </span>
                </label>
                <label className="settings-theme-option">
                  <input
                    type="radio"
                    name="relaydrop-theme"
                    value="dark"
                    checked={theme === "dark"}
                    onChange={() => onThemeChange("dark")}
                  />
                  <span>
                    <strong>Dark</strong>
                    <small>Comfortable in low light</small>
                  </span>
                </label>
              </div>
            </section>
          )}
          <section className="settings-section" aria-labelledby="sync-settings-title">
            <div className="settings-section-heading">
              <h3 id="sync-settings-title">Sync</h3>
              <p>Keep the panel current without slowing down startup.</p>
            </div>
            {preferences && onPreferencesChange ? (
              <div className="settings-list">
                <label className="settings-toggle-row">
                  <span>
                    <strong>Refresh when opened</strong>
                    <small>Checks for changes after a two-minute cooldown.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={preferences.refreshOnOpen}
                    onChange={(event) =>
                      updatePreference("refreshOnOpen", event.currentTarget.checked)
                    }
                  />
                  <i aria-hidden="true" />
                </label>
                <label className="settings-toggle-row">
                  <span>
                    <strong>Refresh while open</strong>
                    <small>Checks every five minutes while the panel is visible.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={preferences.refreshWhileOpen}
                    onChange={(event) =>
                      updatePreference("refreshWhileOpen", event.currentTarget.checked)
                    }
                  />
                  <i aria-hidden="true" />
                </label>
              </div>
            ) : (
              <p className="settings-detail">
                Use Refresh whenever you want to check OneDrive for new items.
              </p>
            )}
          </section>

          <section className="settings-section" aria-labelledby="cache-settings-title">
            <div className="settings-section-heading">
              <h3 id="cache-settings-title">Quick start cache</h3>
              <p>Recent item details are kept on this device so the panel opens instantly.</p>
            </div>
            <p className="settings-detail">
              File contents, Microsoft tokens and temporary preview links are never saved in the
              feed cache. The cache is cleared when you log out.
            </p>
          </section>

          {(oneDriveFolderUrl || oneDriveUsageLabel) && (
            <section className="settings-section" aria-labelledby="onedrive-settings-title">
              <div className="settings-section-heading">
                <h3 id="onedrive-settings-title">OneDrive</h3>
                <p>RelayDrop can only access its private app folder.</p>
              </div>
              {oneDriveFolderUrl ? (
                <a
                  className="settings-onedrive-link"
                  href={oneDriveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="settings-onedrive-icon">
                    <CloudIcon />
                  </span>
                  <span>
                    <strong>Open RelayDrop folder</strong>
                    <small>{oneDriveUsageLabel || "Manage files in OneDrive"}</small>
                  </span>
                  <ArrowUpRightIcon />
                </a>
              ) : (
                <p className="settings-detail">{oneDriveUsageLabel}</p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

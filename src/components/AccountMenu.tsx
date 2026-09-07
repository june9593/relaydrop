import { useEffect, useMemo, useRef, useState } from "react";
import { LogoutIcon, SettingsIcon } from "./Icons";

interface AccountMenuProps {
  accountName: string;
  accountSubtitle: string;
  onOpenSettings: () => void;
  onSignOut?: () => void | Promise<void>;
}

export function AccountMenu({
  accountName,
  accountSubtitle,
  onOpenSettings,
  onSignOut
}: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const initial = useMemo(
    () => accountInitial(accountName || accountSubtitle),
    [accountName, accountSubtitle]
  );

  useEffect(() => {
    if (!isOpen) return;

    const focusTimer = window.setTimeout(() => firstActionRef.current?.focus(), 0);
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const openSettings = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
    onOpenSettings();
  };

  const signOut = async () => {
    if (!onSignOut || isSigningOut) return;
    setIsSigningOut(true);
    setActionError(null);
    try {
      await onSignOut();
      setIsOpen(false);
    } catch {
      setActionError("RelayDrop could not log out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="account-menu-root" ref={rootRef}>
      <button
        ref={triggerRef}
        className="account-button"
        type="button"
        aria-label={`Open account menu for ${accountName}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="relaydrop-account-menu"
        onClick={() => {
          setActionError(null);
          setIsOpen((open) => !open);
        }}
      >
        <span className="account-avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="account-copy">
          <strong>{accountName}</strong>
          <small>{accountSubtitle}</small>
        </span>
      </button>

      {isOpen && (
        <div
          className="account-popover"
          id="relaydrop-account-menu"
          role="dialog"
          aria-label="Account"
        >
          <div className="account-summary">
            <span className="account-avatar account-avatar--large" aria-hidden="true">
              {initial}
            </span>
            <span>
              <strong>{accountName}</strong>
              <small>{accountSubtitle}</small>
            </span>
          </div>
          <div className="account-actions">
            <button ref={firstActionRef} type="button" onClick={openSettings}>
              <SettingsIcon />
              <span>Settings</span>
            </button>
            {onSignOut && (
              <button
                className="account-action--danger"
                type="button"
                disabled={isSigningOut}
                onClick={() => void signOut()}
              >
                <LogoutIcon />
                <span>{isSigningOut ? "Logging out…" : "Log out"}</span>
              </button>
            )}
          </div>
          {actionError && (
            <p className="account-action-error" role="alert">
              {actionError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function accountInitial(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "?";

  const Segmenter = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" }
      ) => { segment(input: string): Iterable<{ segment: string }> };
    }
  ).Segmenter;
  const first = Segmenter
    ? new Segmenter(undefined, { granularity: "grapheme" }).segment(normalized)[
        Symbol.iterator
      ]().next().value?.segment
    : Array.from(normalized)[0];
  return (first || "?").toLocaleUpperCase();
}

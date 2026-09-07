import { useEffect, useRef, useState } from "react";
import { ArrowUpRightIcon, CheckIcon, CopyIcon, PhoneIcon } from "./Icons";
import { mobileWebHost } from "../config/mobileAccess";

interface MobileAccessCardProps {
  webAppUrl?: string;
}

type CopyState = "idle" | "copied" | "failed";

export function MobileAccessCard({ webAppUrl }: MobileAccessCardProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current !== undefined) window.clearTimeout(resetTimer.current);
    },
    []
  );

  const copyLink = async () => {
    if (!webAppUrl) return;

    const copied = await copyText(webAppUrl);
    setCopyState(copied ? "copied" : "failed");
    if (resetTimer.current !== undefined) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 2400);
  };

  return (
    <section className="mobile-access-card" aria-labelledby="mobile-access-title">
      <div className="mobile-access-heading">
        <span className="mobile-access-icon" aria-hidden="true">
          <PhoneIcon />
        </span>
        <span>
          <strong id="mobile-access-title">Use RelayDrop on your phone</strong>
          <small>Mobile browsers use the web app, not this extension.</small>
        </span>
      </div>

      <ol className="mobile-access-steps">
        <li>Copy the web link to your phone.</li>
        <li>Sign in with the same Microsoft account.</li>
        <li>Add it to your Home Screen for app-like access.</li>
      </ol>

      {webAppUrl ? (
        <>
          <p className="mobile-access-host">{mobileWebHost(webAppUrl)}</p>
          <div className="mobile-access-actions">
            <button type="button" onClick={copyLink}>
              {copyState === "copied" ? <CheckIcon /> : <CopyIcon />}
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Copy failed"
                  : "Copy link"}
            </button>
            <a href={webAppUrl} target="_blank" rel="noopener noreferrer">
              Open web app
              <ArrowUpRightIcon />
            </a>
          </div>
        </>
      ) : (
        <p className="mobile-access-unavailable">
          The mobile web address has not been configured for this build.
        </p>
      )}
    </section>
  );
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();

    try {
      return document.execCommand("copy");
    } finally {
      field.remove();
    }
  }
}

import { useEffect, useRef, useState } from "react";
import { ArrowUpRightIcon, CheckIcon, CopyIcon, PhoneIcon } from "./Icons";
import { RELAYDROP_STORE_URL } from "../config/distribution";

type CopyState = "idle" | "copied" | "failed";

export function MobileAccessCard() {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current !== undefined) window.clearTimeout(resetTimer.current);
    },
    []
  );

  const copyLink = async () => {
    const copied = await copyText(RELAYDROP_STORE_URL);
    setCopyState(copied ? "copied" : "failed");
    if (resetTimer.current !== undefined) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 2400);
  };

  return (
    <details className="mobile-access-card">
      <summary className="mobile-access-heading">
        <span className="mobile-access-icon" aria-hidden="true">
          <PhoneIcon />
        </span>
        <span>
          <strong id="mobile-access-title">Use RelayDrop in Edge on Android</strong>
        </span>
      </summary>

      <ol className="mobile-access-steps">
        <li>Open the store link in Edge on Android and install RelayDrop.</li>
        <li>Sign in with the same Microsoft account.</li>
        <li>Open RelayDrop from the browser's extensions menu.</li>
      </ol>

        <>
          <p className="mobile-access-host">Microsoft Edge Add-ons</p>
          <div className="mobile-access-actions">
            <button type="button" onClick={copyLink}>
              {copyState === "copied" ? <CheckIcon /> : <CopyIcon />}
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Copy failed"
                  : "Copy link"}
            </button>
            <a href={RELAYDROP_STORE_URL} target="_blank" rel="noopener noreferrer">
              Open extension store
              <ArrowUpRightIcon />
            </a>
          </div>
        </>
    </details>
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

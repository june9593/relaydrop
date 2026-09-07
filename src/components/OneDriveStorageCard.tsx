import type { RelayDropStorageInfo } from "../domain/types";
import { formatStorageBytes } from "../hooks/useRelayDropStorage";
import { ArrowUpRightIcon, CloudIcon } from "./Icons";

interface OneDriveStorageCardProps {
  info: RelayDropStorageInfo | null;
  variant: "sidebar" | "sidepanel";
}

export function OneDriveStorageCard({ info, variant }: OneDriveStorageCardProps) {
  const usage = info ? storageUsageLabel(info) : "RelayDrop app folder";
  const content = (
    <>
      <span className="onedrive-card-icon" aria-hidden="true">
        <CloudIcon />
      </span>
      <span className="onedrive-card-copy" aria-live="polite">
        <strong>OneDrive</strong>
        <small>{usage}</small>
      </span>
      {info?.manageUrl && <ArrowUpRightIcon className="onedrive-card-open" />}
    </>
  );
  const className = `onedrive-card onedrive-card--${variant}`;

  return info?.manageUrl ? (
    <a
      className={className}
      href={info.manageUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open RelayDrop folder in OneDrive. ${usage}`}
    >
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function storageUsageLabel(info: RelayDropStorageInfo): string {
  const used = formatStorageBytes(info.usedBytes);
  if (info.totalBytes && info.totalBytes > 0) {
    return `${used} of ${formatStorageBytes(info.totalBytes)} used`;
  }
  return `${used} in RelayDrop folder`;
}

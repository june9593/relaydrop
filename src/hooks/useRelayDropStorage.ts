import { useEffect, useState } from "react";
import type { RelayDropStorageInfo } from "../domain/types";
import type { RelayDropRepository } from "../repository/RelayDropRepository";

export function useRelayDropStorage(
  repository: RelayDropRepository,
  enabled: boolean,
  refreshKey: string
) {
  const [storageInfo, setStorageInfo] = useState<RelayDropStorageInfo | null>(null);

  useEffect(() => {
    if (!enabled || !repository.getStorageInfo) {
      setStorageInfo(null);
      return;
    }

    let active = true;
    void repository
      .getStorageInfo()
      .then((info) => {
        if (active) setStorageInfo(info);
      })
      .catch(() => {
        // Storage usage is supplemental and should never block the feed.
      });
    return () => {
      active = false;
    };
  }, [enabled, refreshKey, repository]);

  return storageInfo;
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** unitIndex;
  const maximumFractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value)} ${
    units[unitIndex]
  }`;
}

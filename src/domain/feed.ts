import type { RelayDropItem, RelayDropItemType } from "./types";

export function classifyText(text: string): Extract<RelayDropItemType, "text" | "link"> {
  return isSafeHttpUrl(text.trim()) ? "link" : "text";
}

export function isSafeHttpUrl(value: string): boolean {
  if (!value || /\s/.test(value)) return false;

  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function sortFeed(items: RelayDropItem[]): RelayDropItem[] {
  return [...items].sort((left, right) => {
    const timeDifference =
      new Date(right.serverCreatedAt).getTime() - new Date(left.serverCreatedAt).getTime();

    if (timeDifference !== 0) {
      return timeDifference;
    }

    return left.id.localeCompare(right.id);
  });
}

export function upsertFeedItem(
  items: RelayDropItem[],
  item: RelayDropItem
): { items: RelayDropItem[]; inserted: boolean } {
  const inserted = !items.some((existing) => existing.id === item.id);
  return {
    items: sortFeed([item, ...items.filter((existing) => existing.id !== item.id)]),
    inserted
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return bytes + " B";
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 ? 0 : 1;
  return value.toFixed(precision) + " " + units[unitIndex];
}

export function formatRelativeTime(isoDate: string, now = new Date()): string {
  const value = new Date(isoDate);
  const differenceSeconds = Math.round((value.getTime() - now.getTime()) / 1000);
  const absoluteSeconds = Math.abs(differenceSeconds);

  if (absoluteSeconds < 45) {
    return "just now";
  }

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absoluteSeconds < 60 * 60) {
    return formatter.format(Math.round(differenceSeconds / 60), "minute");
  }

  if (absoluteSeconds < 60 * 60 * 24) {
    return formatter.format(Math.round(differenceSeconds / (60 * 60)), "hour");
  }

  if (absoluteSeconds < 60 * 60 * 24 * 7) {
    return formatter.format(Math.round(differenceSeconds / (60 * 60 * 24)), "day");
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: value.getFullYear() === now.getFullYear() ? undefined : "numeric"
  }).format(value);
}

export function createId(): string {
  return crypto.randomUUID();
}

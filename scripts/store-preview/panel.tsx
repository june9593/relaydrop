// Isolated screenshot fixture. No authentication service or Graph client is loaded.
// This entry is outside the production Vite inputs and is never packaged.
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/inter";
import "../../src/styles.css";
import App from "../../src/App";
import { useRelayDropTheme } from "../../src/hooks/useRelayDropTheme";
import { applyStoredRelayDropTheme } from "../../src/settings/theme";
import { DemoRelayDropRepository } from "../../src/repository/DemoRelayDropRepository";
import type { RelayDropPage, RelayDropItem } from "../../src/domain/types";
import type { RelayDropDownloadManager } from "../../src/downloads/RelayDropDownloadManager";

const scene = new URLSearchParams(location.search).get("scene") ?? "inbox";
const fileId = "5c099a44-967c-4fe7-850f-a4b0176d9b61";
const now = Date.now();
const timestamp = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const sampleItems: RelayDropItem[] = [
  { id: "45f6bc2b-6bba-486c-8771-5f4d3e72af35", type: "text", text: "Weekend plans\n\nPick a trail, pack the camera, and leave room for a long lunch.", createdAt: timestamp(4), serverCreatedAt: timestamp(4), source: "phone" },
  { id: fileId, type: "file", file: { name: "weekend-guide.pdf", mediaType: "application/pdf", size: 860160 }, createdAt: timestamp(12), serverCreatedAt: timestamp(12), source: "desktop" }
];

class SampleRepository extends DemoRelayDropRepository {
  async listItems(): Promise<RelayDropPage> {
    const items = scene === "downloads" ? [sampleItems[1], sampleItems[0]] : sampleItems;
    return { items, total: items.length };
  }
  async getStorageInfo() { return { usedBytes: 860400 }; }
  async getFilePresentation() { return { kind: "pdf" as const }; }
}

const downloadManager: RelayDropDownloadManager = {
  capabilities: { open: true, show: scene !== "android", deleteLocal: scene !== "android" },
  async getStates() {
    return scene === "downloads" || scene === "android" ? {
      [fileId]: { itemId: fileId, status: "complete", downloadId: 1, fileName: "weekend-guide.pdf", bytesReceived: 860160, totalBytes: 860160 }
    } : {};
  },
  subscribe() { return () => {}; },
  async download() { throw new Error("Screenshot fixture: downloads are disabled."); },
  async open() {},
  async show() {},
  async deleteLocal() { return { itemId: fileId, status: "missing", fileName: "weekend-guide.pdf" }; }
};

function Preview() {
  const repository = useMemo(() => new SampleRepository(), []);
  const appearance = useRelayDropTheme();
  const [preferences, setPreferences] = useState({ refreshOnOpen: true, refreshWhileOpen: true });
  const relayOptions = useMemo(() => ({ downloadManager, syncPolicy: { refreshOnOpen: true, refreshWhileOpen: false, openCooldownMs: 120000, visibleRefreshIntervalMs: 300000 } }), []);
  return <App repository={repository} mode="onedrive" surface="sidepanel"
    accountName="Alex" accountSubtitle="alex@example.com"
    theme={appearance.theme} onThemeChange={appearance.updateTheme}
    syncPreferences={preferences} onSyncPreferencesChange={setPreferences}
    relayOptions={relayOptions} onSignOut={() => {}}
    requiresReconnect={scene === "offline"} onReconnect={() => {}}
    device={scene === "android" ? "phone" : "desktop"} />;
}

document.documentElement.dataset.surface = "sidepanel";
applyStoredRelayDropTheme();
createRoot(document.getElementById("root")!).render(<Preview />);

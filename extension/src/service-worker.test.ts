import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const worker = readFileSync(new URL("../public/service-worker.js", import.meta.url), "utf8");

function startWorker(sidePanel?: { setPanelBehavior: ReturnType<typeof vi.fn>; open?: ReturnType<typeof vi.fn> }) {
  const chrome = {
    sidePanel,
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      getURL: (path: string) => "chrome-extension://test/" + path,
      getPlatformInfo: vi.fn(async () => ({ os: sidePanel ? "mac" : "android" }))
    },
    action: { onClicked: { addListener: vi.fn() } },
    tabs: { create: vi.fn(async () => ({ id: 123 })), update: vi.fn(), get: vi.fn() },
    storage: {
      local: { setAccessLevel: vi.fn(async () => undefined) },
      session: { setAccessLevel: vi.fn(async () => undefined), get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) }
    }
  };
  const context = { chrome, console, setup: undefined as Promise<void> | undefined };
  runInNewContext(worker.replace(/void configureExtension\(\);\s*$/, "globalThis.setup = configureExtension();"), context);
  return { chrome, ready: context.setup };
}

describe("extension launch surfaces", () => {
  it("initializes safely and opens an extension page on Android without sidePanel", async () => {
    const { chrome, ready } = startWorker();
    await expect(ready).resolves.toBeUndefined();
    expect(chrome.storage.local.setAccessLevel).toHaveBeenCalled();
    const listener = chrome.action.onClicked.addListener.mock.calls[0]?.[0];
    expect(listener).toBeTypeOf("function");
    await listener({ id: 5, windowId: 1 });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "chrome-extension://test/sidepanel.html?view=tab" });
  });

  it("retains the native desktop side panel", async () => {
    const sidePanel = { setPanelBehavior: vi.fn(async () => undefined) };
    const { ready } = startWorker(sidePanel);
    await ready;
    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
  });

  it("falls back if a platform exposes but rejects side-panel opening", async () => {
    const { chrome, ready } = startWorker({
      setPanelBehavior: vi.fn(async () => undefined), open: vi.fn(() => { throw new Error("unsupported"); })
    });
    await ready;
    await chrome.action.onClicked.addListener.mock.calls[0][0]({ id: 5 });
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
  });

  it("reuses only an existing RelayDrop tab, never an unrelated tab with the stored ID", async () => {
    const { chrome, ready } = startWorker();
    await ready;
    chrome.storage.session.get.mockResolvedValue({ "relaydrop.extension.mobile-tab": 123 });
    chrome.tabs.get.mockResolvedValue({ id: 123, url: "https://example.com/" });
    const click = chrome.action.onClicked.addListener.mock.calls[0][0];
    await click({ id: 5 });
    expect(chrome.tabs.update).not.toHaveBeenCalled();
    chrome.tabs.create.mockClear();
    chrome.tabs.get.mockResolvedValue({ id: 123, url: "chrome-extension://test/sidepanel.html?view=tab" });
    await click({ id: 5 });
    expect(chrome.tabs.update).toHaveBeenCalledWith(123, { active: true });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});

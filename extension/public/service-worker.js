let useDesktopSidePanel = false;
let platformOS;

async function configureLaunchSurface() {
  // Keep a declarative popup available without waiting for this worker. API
  // presence alone does not mean a platform implements a visible side panel.
  useDesktopSidePanel = false;
  const popup = chrome.runtime.getManifest().action.default_popup;
  await chrome.action.setPopup({ popup });
  const { os } = await chrome.runtime.getPlatformInfo();
  platformOS = os;
  if (["win", "mac", "linux", "cros", "openbsd"].includes(os) &&
      chrome.sidePanel?.setPanelBehavior && chrome.sidePanel?.open) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    await chrome.action.setPopup({ popup: "" });
    useDesktopSidePanel = true;
  } else if (chrome.sidePanel?.setPanelBehavior) {
    // Clear 0.6.0's unconditional side-panel action override on Android.
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }
}

async function configureExtension() {
  const tasks = [configureLaunchSurface()];
  // Optional setup failures must not block trusted storage or the native popup.
  for (const area of [chrome.storage.local, chrome.storage.session]) {
    if (area?.setAccessLevel) {
      tasks.push(Promise.resolve().then(() =>
        area.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
      ));
    }
  }
  const results = await Promise.allSettled(tasks);
  if (results.some((result) => result.status === "rejected")) {
    console.error("RelayDrop extension setup could not be completed.");
  }
}

let extensionTabRequest;
async function openExtensionTab() {
  if (extensionTabRequest) return extensionTabRequest;
  extensionTabRequest = (async () => {
    const url = chrome.runtime.getURL("sidepanel.html?view=tab");
    const storage = chrome.storage.session;
    const previous = await storage?.get("relaydrop.extension.mobile-tab").catch(() => ({}));
    const id = previous?.["relaydrop.extension.mobile-tab"];
    if (Number.isInteger(id)) {
      try {
        const existing = await chrome.tabs.get(id);
        // A reused tab ID or a tab navigated away from RelayDrop must not be focused.
        if (existing?.url === url) return await chrome.tabs.update(id, { active: true });
      } catch {
        // The old extension page was closed; create a fresh one.
      }
    }
    const opened = await chrome.tabs.create({ url });
    if (Number.isInteger(opened?.id)) {
      await storage?.set({ "relaydrop.extension.mobile-tab": opened.id }).catch(() => undefined);
    }
    return opened;
  })().finally(() => { extensionTabRequest = undefined; });
  return extensionTabRequest;
}

chrome.action.onClicked.addListener((tab) => {
  if (platformOS === "android" || /Android/i.test(globalThis.navigator?.userAgent ?? "")) {
    // A stale empty override can deliver this event during an update/startup.
    // Repair the popup for the next click; never turn a phone action into a tab.
    return chrome.action.setPopup({ popup: chrome.runtime.getManifest().action.default_popup });
  }
  if (useDesktopSidePanel && Number.isInteger(tab?.id)) {
    // Invoke inside the user gesture, without an awaited platform lookup.
    try {
      return Promise.resolve(chrome.sidePanel.open({ tabId: tab.id })).catch(() => openExtensionTab());
    } catch {
      return openExtensionTab();
    }
  }
  return openExtensionTab();
});

chrome.runtime.onInstalled.addListener(() => {
  void configureExtension();
});

chrome.runtime.onStartup.addListener(() => {
  void configureExtension();
});

void configureExtension();

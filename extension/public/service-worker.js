async function configureExtension() {
  const tasks = [];
  // Android supports extension tabs, identity, storage and downloads, but has
  // no sidePanel API. Each optional setup must fail independently.
  if (chrome.sidePanel?.setPanelBehavior) {
    tasks.push(Promise.resolve().then(() =>
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    ));
  }
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
  if (chrome.sidePanel?.open && Number.isInteger(tab.id)) {
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

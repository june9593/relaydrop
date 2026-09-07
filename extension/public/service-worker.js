async function configureExtension() {
  const tasks = [
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }),
    chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
    chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
  ];
  const results = await Promise.allSettled(tasks);
  if (results.some((result) => result.status === "rejected")) {
    console.error("RelayDrop extension setup could not be completed.");
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void configureExtension();
});

chrome.runtime.onStartup.addListener(() => {
  void configureExtension();
});

void configureExtension();

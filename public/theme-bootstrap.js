(() => {
  "use strict";

  const storageKey = "relaydrop.theme.v1";
  let theme = "light";
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "dark" || stored === "light") theme = stored;
  } catch {
    // The light default is safe if local storage is unavailable.
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#191816" : "#faf9f5");
})();

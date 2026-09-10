import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/inter";
import "../../src/styles.css";
import ExtensionRoot from "./ExtensionRoot";
import { applyStoredRelayDropTheme } from "../../src/settings/theme";

document.documentElement.dataset.surface = "sidepanel";
if (new URLSearchParams(location.search).get("view") === "tab") {
  document.documentElement.dataset.extensionView = "tab";
}
applyStoredRelayDropTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ExtensionRoot />
  </StrictMode>
);

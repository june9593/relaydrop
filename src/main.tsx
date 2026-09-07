import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/inter";
import Root from "./Root";
import "./styles.css";
import { applyStoredRelayDropTheme } from "./settings/theme";

registerSW({ immediate: true });
applyStoredRelayDropTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

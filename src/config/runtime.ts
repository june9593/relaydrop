import {
  MICROSOFT_CONSUMERS_AUTHORITY,
  normalizeMicrosoftAuthority
} from "./microsoftAuthority";

export const GRAPH_SCOPES = ["Files.ReadWrite.AppFolder"] as const;

export interface RuntimeConfig {
  mode: "demo" | "onedrive";
  clientId?: string;
  authority: string;
  redirectUri: string;
  configurationError?: string;
}

export function getRuntimeConfig(): RuntimeConfig {
  const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim();
  const requestedMode = import.meta.env.VITE_RELAYDROP_MODE?.trim().toLowerCase();
  const mode = requestedMode === "onedrive" || clientId ? "onedrive" : "demo";
  const configuredAuthority = import.meta.env.VITE_MICROSOFT_AUTHORITY?.trim();
  const authority = normalizeMicrosoftAuthority(configuredAuthority);

  return {
    mode,
    clientId,
    authority: authority ?? MICROSOFT_CONSUMERS_AUTHORITY,
    redirectUri: window.location.origin,
    configurationError:
      mode === "onedrive" && !clientId
        ? "VITE_MICROSOFT_CLIENT_ID is required when RelayDrop runs in OneDrive mode."
        : configuredAuthority && !authority
          ? "VITE_MICROSOFT_AUTHORITY must be the Microsoft consumers authority."
        : undefined
  };
}

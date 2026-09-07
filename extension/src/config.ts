import type { ExtensionAuthConfig } from "./auth/ExtensionAuthService";
import { normalizeMobileWebUrl } from "../../src/config/mobileAccess";
import {
  MICROSOFT_CONSUMERS_AUTHORITY,
  normalizeMicrosoftAuthority
} from "../../src/config/microsoftAuthority";

export interface ExtensionRuntimeConfig extends ExtensionAuthConfig {
  webAppUrl?: string;
  configurationError?: string;
}

export function getExtensionRuntimeConfig(): ExtensionRuntimeConfig {
  const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim();
  const configuredAuthority = import.meta.env.VITE_MICROSOFT_AUTHORITY?.trim();
  const authority = normalizeMicrosoftAuthority(configuredAuthority);
  const configuredWebAppUrl = import.meta.env.VITE_RELAYDROP_WEB_URL?.trim();
  const webAppUrl = normalizeMobileWebUrl(configuredWebAppUrl);

  return {
    clientId: clientId ?? "",
    authority: authority ?? MICROSOFT_CONSUMERS_AUTHORITY,
    webAppUrl,
    configurationError: !clientId
      ? "VITE_MICROSOFT_CLIENT_ID is required to build the browser extension."
      : configuredAuthority && !authority
        ? "VITE_MICROSOFT_AUTHORITY must be the Microsoft consumers authority."
        : configuredWebAppUrl && !webAppUrl
        ? "VITE_RELAYDROP_WEB_URL must use HTTPS (or localhost for development)."
        : undefined
  };
}

import type { ExtensionAuthConfig } from "./auth/ExtensionAuthService";
import {
  MICROSOFT_CONSUMERS_AUTHORITY,
  normalizeMicrosoftAuthority
} from "../../src/config/microsoftAuthority";

export interface ExtensionRuntimeConfig extends ExtensionAuthConfig {
  configurationError?: string;
}

export function getExtensionRuntimeConfig(): ExtensionRuntimeConfig {
  const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim();
  const configuredAuthority = import.meta.env.VITE_MICROSOFT_AUTHORITY?.trim();
  const authority = normalizeMicrosoftAuthority(configuredAuthority);

  return {
    clientId: clientId ?? "",
    authority: authority ?? MICROSOFT_CONSUMERS_AUTHORITY,
    configurationError: !clientId
      ? "VITE_MICROSOFT_CLIENT_ID is required to build the browser extension."
      : configuredAuthority && !authority
        ? "VITE_MICROSOFT_AUTHORITY must be the Microsoft consumers authority."
        : undefined
  };
}

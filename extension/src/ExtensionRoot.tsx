import { useCallback, useMemo } from "react";
import App from "../../src/App";
import type { UseRelayDropOptions } from "../../src/cache/RelayDropFeedCache";
import { AuthScreen } from "../../src/components/AuthScreen";
import { GraphClient } from "../../src/repository/GraphClient";
import { OneDriveRelayDropRepository } from "../../src/repository/OneDriveRelayDropRepository";
import {
  ExtensionAuthService,
  type ExtensionAccount
} from "./auth/ExtensionAuthService";
import { useExtensionAuth } from "./auth/useExtensionAuth";
import { ExtensionFeedCache } from "./cache/ExtensionFeedCache";
import { getExtensionRuntimeConfig } from "./config";
import { ExtensionDownloadManager } from "./downloads/ExtensionDownloadManager";
import { useExtensionSettings } from "./settings/useExtensionSettings";
import { useRelayDropTheme } from "../../src/hooks/useRelayDropTheme";

const OPEN_REFRESH_COOLDOWN_MS = 5_000;
const VISIBLE_REFRESH_INTERVAL_MS = 30_000;

export default function ExtensionRoot() {
  const config = useMemo(getExtensionRuntimeConfig, []);

  if (config.configurationError) {
    return (
      <AuthScreen
        state="configuration-error"
        error={config.configurationError}
      />
    );
  }

  return (
    <ConnectedExtension
      clientId={config.clientId}
      authority={config.authority}
    />
  );
}

function ConnectedExtension(input: {
  clientId: string;
  authority: string;
}) {
  const authService = useMemo(
    () => new ExtensionAuthService(input),
    [input.authority, input.clientId]
  );
  const auth = useExtensionAuth(authService);

  if (auth.isInitializing) {
    return <AuthScreen state="loading" />;
  }

  if (!auth.account) {
    return (
      <AuthScreen
        state="signed-out"
        error={auth.error ?? undefined}
        onSignIn={auth.signIn}
      />
    );
  }

  return (
    <SignedInExtension
      key={auth.account.id}
      account={auth.account}
      authService={authService}
      onSignOut={auth.signOut}
      onReconnect={auth.signIn}
      requiresReconnect={auth.requiresReconnect}
    />
  );
}

function SignedInExtension(input: {
  account: ExtensionAccount;
  authService: ExtensionAuthService;
  onSignOut: () => Promise<void>;
  onReconnect: () => Promise<void>;
  requiresReconnect: boolean;
}) {
  const repository = useMemo(
    () =>
      new OneDriveRelayDropRepository(
        new GraphClient((options) => input.authService.getAccessToken(options))
      ),
    [input.authService]
  );
  const feedCache = useMemo(
    () => new ExtensionFeedCache(input.account.id),
    [input.account.id]
  );
  const downloadManager = useMemo(
    () => new ExtensionDownloadManager(input.account.id),
    [input.account.id]
  );
  const settings = useExtensionSettings(input.account.id);
  const appearance = useRelayDropTheme();
  const relayOptions = useMemo<UseRelayDropOptions>(
    () => ({
      cache: feedCache,
      downloadManager,
      syncPolicy: {
        refreshOnOpen: settings.isLoaded && settings.preferences.refreshOnOpen,
        refreshWhileOpen: settings.isLoaded && settings.preferences.refreshWhileOpen,
        openCooldownMs: OPEN_REFRESH_COOLDOWN_MS,
        visibleRefreshIntervalMs: VISIBLE_REFRESH_INTERVAL_MS
      }
    }),
    [downloadManager, feedCache, settings.isLoaded, settings.preferences]
  );
  const signOut = useCallback(async () => {
    try {
      await feedCache.clear();
    } catch {
      // Signing out is more important than retaining or clearing this optional cache.
    }
    await input.onSignOut();
  }, [feedCache, input.onSignOut]);

  return (
    <App
      repository={repository}
      mode="onedrive"
      surface="sidepanel"
      accountName={input.account.name}
      accountSubtitle={input.account.username}
      onSignOut={signOut}
      onReconnect={input.onReconnect}
      requiresReconnect={input.requiresReconnect}
      device={new URLSearchParams(location.search).get("view") === "tab" && /Android/i.test(navigator.userAgent) ? "phone" : "desktop"}
      relayOptions={relayOptions}
      syncPreferences={settings.isLoaded ? settings.preferences : undefined}
      onSyncPreferencesChange={
        settings.isLoaded ? settings.updatePreferences : undefined
      }
      syncSettingsError={appearance.error ?? settings.error}
      theme={appearance.theme}
      onThemeChange={appearance.updateTheme}
    />
  );
}

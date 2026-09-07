import { useMemo } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import App from "./App";
import { AuthScreen } from "./components/AuthScreen";
import { MicrosoftAuthService } from "./auth/MicrosoftAuthService";
import { useMicrosoftAuth } from "./auth/useMicrosoftAuth";
import { getRuntimeConfig, type RuntimeConfig } from "./config/runtime";
import { DemoRelayDropRepository } from "./repository/DemoRelayDropRepository";
import { GraphClient } from "./repository/GraphClient";
import { OneDriveRelayDropRepository } from "./repository/OneDriveRelayDropRepository";
import { useRelayDropTheme } from "./hooks/useRelayDropTheme";

export default function Root() {
  const config = getRuntimeConfig();

  if (config.mode === "demo") {
    return <DemoRoot />;
  }

  if (config.configurationError) {
    return (
      <AuthScreen
        state="configuration-error"
        error={config.configurationError}
      />
    );
  }

  return <OneDriveRoot config={config} />;
}

function DemoRoot() {
  const repository = useMemo(() => new DemoRelayDropRepository(), []);
  const appearance = useRelayDropTheme();

  return (
    <App
      repository={repository}
      mode="demo"
      accountName="Alex"
      accountSubtitle="Personal"
      theme={appearance.theme}
      onThemeChange={appearance.updateTheme}
      syncSettingsError={appearance.error}
    />
  );
}

function OneDriveRoot({ config }: { config: RuntimeConfig }) {
  const authService = useMemo(() => new MicrosoftAuthService(config), [config]);
  const auth = useMicrosoftAuth(authService);
  const repository = useMemo(
    () =>
      new OneDriveRelayDropRepository(
        new GraphClient(() => authService.getAccessToken())
      ),
    [authService]
  );
  const appearance = useRelayDropTheme();

  if (auth.isInitializing) {
    return <AuthScreen state="loading" />;
  }

  if (!auth.account) {
    return <AuthScreen state="signed-out" error={auth.error ?? undefined} onSignIn={auth.signIn} />;
  }

  return (
    <App
      repository={repository}
      mode="onedrive"
      accountName={displayName(auth.account)}
      accountSubtitle={auth.account.username}
      onSignOut={auth.signOut}
      theme={appearance.theme}
      onThemeChange={appearance.updateTheme}
      syncSettingsError={appearance.error}
    />
  );
}

function displayName(account: AccountInfo): string {
  return account.name?.trim() || account.username.split("@")[0] || "Microsoft user";
}

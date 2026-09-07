import {
  BrowserCacheLocation,
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo
} from "@azure/msal-browser";
import { GRAPH_SCOPES, type RuntimeConfig } from "../config/runtime";
import type { AccessTokenRequest } from "./AccessTokenProvider";

export class MicrosoftAuthService {
  private readonly client: PublicClientApplication;
  private readonly silentRedirectUri: string;
  private initialization?: Promise<AccountInfo | null>;

  constructor(config: RuntimeConfig) {
    if (!config.clientId) {
      throw new Error("Microsoft client ID is required.");
    }

    this.silentRedirectUri = new URL("/auth/silent.html", config.redirectUri).toString();
    this.client = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: config.authority,
        redirectUri: config.redirectUri,
        postLogoutRedirectUri: config.redirectUri,
        navigateToLoginRequestUrl: true
      },
      cache: {
        cacheLocation: BrowserCacheLocation.LocalStorage,
        temporaryCacheLocation: BrowserCacheLocation.SessionStorage,
        storeAuthStateInCookie: false
      }
    });
  }

  initialize(): Promise<AccountInfo | null> {
    if (!this.initialization) {
      this.initialization = this.initializeClient();
    }

    return this.initialization;
  }

  async signIn(): Promise<void> {
    await this.client.loginRedirect({
      scopes: [...GRAPH_SCOPES]
    });
  }

  async signOut(account: AccountInfo): Promise<void> {
    await this.client.logoutRedirect({ account });
  }

  async getAccessToken(options: AccessTokenRequest = {}): Promise<string> {
    const account =
      this.client.getActiveAccount() ?? this.client.getAllAccounts()[0] ?? null;

    if (!account) {
      throw new AuthenticationRequiredError();
    }

    try {
      const response = await this.client.acquireTokenSilent({
        account,
        scopes: [...GRAPH_SCOPES],
        forceRefresh: options.forceRefresh
      });
      return response.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        await this.client.acquireTokenRedirect({
          account,
          scopes: [...GRAPH_SCOPES]
        });
        throw new AuthenticationRedirectStartedError();
      }

      throw error;
    }
  }

  private async initializeClient(): Promise<AccountInfo | null> {
    await this.client.initialize();
    const redirectResponse = await this.client.handleRedirectPromise();
    let account =
      redirectResponse?.account ??
      this.client.getActiveAccount() ??
      this.client.getAllAccounts()[0] ??
      null;

    if (!account) {
      try {
        const silentResponse = await this.client.ssoSilent({
          scopes: [...GRAPH_SCOPES],
          redirectUri: this.silentRedirectUri
        });
        account = silentResponse.account;
      } catch {
        // Silent SSO is opportunistic. The explicit sign-in button remains available.
      }
    }

    if (account) {
      this.client.setActiveAccount(account);
    }

    return account;
  }
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Microsoft sign-in is required.");
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthenticationRedirectStartedError extends Error {
  constructor() {
    super("Microsoft authentication redirect started.");
    this.name = "AuthenticationRedirectStartedError";
  }
}

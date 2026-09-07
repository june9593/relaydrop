import { beforeEach, describe, expect, it, vi } from "vitest";

const msal = vi.hoisted(() => ({
  configuration: undefined as Record<string, unknown> | undefined,
  initialize: vi.fn(async () => undefined),
  handleRedirectPromise: vi.fn(async () => null as { account: TestAccount } | null),
  getActiveAccount: vi.fn(() => null as TestAccount | null),
  getAllAccounts: vi.fn(() => [] as TestAccount[]),
  setActiveAccount: vi.fn(),
  loginRedirect: vi.fn(async () => undefined),
  logoutRedirect: vi.fn(async () => undefined),
  acquireTokenSilent: vi.fn(),
  acquireTokenRedirect: vi.fn(async () => undefined),
  ssoSilent: vi.fn()
}));

interface TestAccount {
  homeAccountId: string;
  environment: string;
  tenantId: string;
  username: string;
  localAccountId: string;
}

vi.mock("@azure/msal-browser", () => ({
  BrowserCacheLocation: {
    LocalStorage: "localStorage",
    SessionStorage: "sessionStorage"
  },
  InteractionRequiredAuthError: class InteractionRequiredAuthError extends Error {},
  PublicClientApplication: class PublicClientApplication {
    constructor(configuration: Record<string, unknown>) {
      msal.configuration = configuration;
    }

    initialize = msal.initialize;
    handleRedirectPromise = msal.handleRedirectPromise;
    getActiveAccount = msal.getActiveAccount;
    getAllAccounts = msal.getAllAccounts;
    setActiveAccount = msal.setActiveAccount;
    loginRedirect = msal.loginRedirect;
    logoutRedirect = msal.logoutRedirect;
    acquireTokenSilent = msal.acquireTokenSilent;
    acquireTokenRedirect = msal.acquireTokenRedirect;
    ssoSilent = msal.ssoSilent;
  }
}));

import { MicrosoftAuthService } from "./MicrosoftAuthService";

const config = {
  mode: "onedrive" as const,
  clientId: "client-id",
  authority: "https://login.microsoftonline.com/consumers",
  redirectUri: "https://relaydrop.example"
};

const account: TestAccount = {
  homeAccountId: "home-account",
  environment: "login.microsoftonline.com",
  tenantId: "consumers",
  username: "person@example.com",
  localAccountId: "local-account"
};

describe("MicrosoftAuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    msal.configuration = undefined;
    msal.handleRedirectPromise.mockResolvedValue(null);
    msal.getActiveAccount.mockReturnValue(null);
    msal.getAllAccounts.mockReturnValue([]);
    msal.ssoSilent.mockRejectedValue(new Error("interaction required"));
  });

  it("persists the MSAL account cache across tabs and browser restarts", () => {
    new MicrosoftAuthService(config);

    expect(msal.configuration).toMatchObject({
      cache: { cacheLocation: "localStorage" }
    });
  });

  it("does not force the account picker during normal sign-in", async () => {
    const service = new MicrosoftAuthService(config);

    await service.signIn();

    expect(msal.loginRedirect).toHaveBeenCalledWith({
      scopes: ["Files.ReadWrite.AppFolder"]
    });
  });

  it("uses the Microsoft web session for silent SSO when no local account exists", async () => {
    msal.ssoSilent.mockResolvedValue({ account });
    const service = new MicrosoftAuthService(config);

    await expect(service.initialize()).resolves.toEqual(account);
    expect(msal.ssoSilent).toHaveBeenCalledWith({
      scopes: ["Files.ReadWrite.AppFolder"],
      redirectUri: "https://relaydrop.example/auth/silent.html"
    });
    expect(msal.setActiveAccount).toHaveBeenCalledWith(account);
  });

  it("forces MSAL to bypass its access-token cache after a Graph 401", async () => {
    msal.getActiveAccount.mockReturnValue(account);
    msal.acquireTokenSilent.mockResolvedValue({ accessToken: "fresh-token" });
    const service = new MicrosoftAuthService(config);

    await expect(service.getAccessToken({ forceRefresh: true })).resolves.toBe(
      "fresh-token"
    );
    expect(msal.acquireTokenSilent).toHaveBeenCalledWith({
      account,
      scopes: ["Files.ReadWrite.AppFolder"],
      forceRefresh: true
    });
  });

  it("quietly falls back to the sign-in screen when silent SSO is unavailable", async () => {
    const service = new MicrosoftAuthService(config);

    await expect(service.initialize()).resolves.toBeNull();
  });
});

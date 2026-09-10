import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ExtensionAuthService,
  type ExtensionPlatform
} from "./ExtensionAuthService";

const NOW = Date.UTC(2026, 8, 5, 10, 0, 0);
const CLIENT_ID = "11111111-2222-4333-8444-555555555555";
const REDIRECT_URI = "https://abcdefghijklmnop.chromiumapp.org/oauth2";
const AUTH_EPOCH = "epoch-1";
const SESSION_KEY = "relaydrop.extension.session.v1." + AUTH_EPOCH;
const ACCOUNT_KEY = "relaydrop.extension.account.v1." + AUTH_EPOCH;
const INVALIDATED_SESSION_KEY =
  "relaydrop.extension.invalid-session.v1." + AUTH_EPOCH;
const AUTH_EPOCH_KEY = "relaydrop.extension.auth-epoch.v1";
const DISCONNECTED_EPOCH_KEY = "relaydrop.extension.disconnected-epoch.v1";
const CONNECTED_KEY = "relaydrop.extension.connected.v1." + AUTH_EPOCH;
const ID_TOKEN_ISSUER =
  "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0";
const CONSUMER_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";
const DISCOVERY_URL =
  "https://login.microsoftonline.com/consumers/v2.0/.well-known/openid-configuration";
const JWKS_URL = "https://login.microsoftonline.com/consumers/discovery/v2.0/keys";
const SIGNING_KEY_ID = "test-signing-key";

let signingKeys: CryptoKeyPair;
let signingJwk: JsonWebKey & { alg: "RS256"; kid: string; use: "sig" };

beforeAll(async () => {
  signingKeys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );
  signingJwk = {
    ...(await crypto.subtle.exportKey("jwk", signingKeys.publicKey)),
    alg: "RS256",
    kid: SIGNING_KEY_ID,
    use: "sig"
  };
});

describe("ExtensionAuthService", () => {
  let localValues: Map<string, unknown>;
  let sessionValues: Map<string, unknown>;
  let launchWebAuthFlow: ReturnType<typeof vi.fn>;
  let fetchImplementation: ReturnType<typeof vi.fn>;
  let platform: ExtensionPlatform;

  beforeEach(() => {
    localValues = new Map();
    localValues.set("relaydrop.extension.auth-epoch.v1", AUTH_EPOCH);
    sessionValues = new Map();
    launchWebAuthFlow = vi.fn(async (details: { url: string }) => {
      const request = new URL(details.url);
      const state = request.searchParams.get("state");
      return REDIRECT_URI + "?code=authorization-code&state=" + state;
    });
    platform = {
      identity: {
        getRedirectURL: vi.fn(() => REDIRECT_URI),
        launchWebAuthFlow
      },
      storage: {
        local: createStorage(localValues),
        session: createStorage(sessionValues)
      }
    };
    fetchImplementation = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === DISCOVERY_URL) {
        return jsonResponse({
          issuer: ID_TOKEN_ISSUER,
          jwks_uri: JWKS_URL,
          id_token_signing_alg_values_supported: ["RS256"]
        });
      }
      if (url === JWKS_URL) {
        return jsonResponse({ keys: [signingJwk] });
      }
      const body = init?.body as URLSearchParams;
      const authRequest = new URL(
        (launchWebAuthFlow.mock.calls.at(-1)?.[0] as { url: string }).url
      );
      const nonce = authRequest.searchParams.get("nonce");
      return jsonResponse({
        access_token: "access-token-for-" + body.get("code"),
        expires_in: 3600,
        id_token: await createIdToken({
          aud: CLIENT_ID,
          exp: Math.floor(NOW / 1000) + 3600,
          nonce,
          name: "Alex",
          preferred_username: "owner@example.com",
          sub: "account-id"
        })
      });
    });
  });

  it("rejects a non-consumers authority when instantiated directly", () => {
    expect(
      () =>
        new ExtensionAuthService(
          { clientId: CLIENT_ID, authority: "https://identity.example/consumers" },
          platform,
          fetchImplementation as unknown as typeof fetch,
          () => NOW
        )
    ).toThrow("Microsoft consumers authority");
  });

  it("reuses a valid session token without opening Microsoft sign-in", async () => {
    sessionValues.set(SESSION_KEY, {
      id: "cached-session",
      accessToken: "cached-token",
      expiresAt: NOW + 60 * 60 * 1000,
      authEpoch: AUTH_EPOCH,
      verificationVersion: 1,
      account: {
        id: "account-id",
        name: "Alex",
        username: "owner@example.com"
      }
    });
    const service = createService();

    await expect(service.initialize()).resolves.toMatchObject({ name: "Alex" });
    await expect(service.getAccessToken()).resolves.toBe("cached-token");
    expect(launchWebAuthFlow).not.toHaveBeenCalled();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("restores the known account after a browser restart before any network request", async () => {
    const account = { id: "account-id", name: "Alex", username: "owner@example.com" };
    localValues.set(ACCOUNT_KEY, account);
    localValues.set(CONNECTED_KEY, true);
    sessionValues.clear();
    launchWebAuthFlow.mockRejectedValue(new Error("temporarily offline"));

    await expect(createService().initialize()).resolves.toEqual(account);
    expect(launchWebAuthFlow).not.toHaveBeenCalled();
  });

  it("keeps the cached account visible when silent token renewal fails", async () => {
    const account = { id: "account-id", name: "Alex", username: "owner@example.com" };
    localValues.set(ACCOUNT_KEY, account);
    localValues.set(CONNECTED_KEY, true);
    launchWebAuthFlow.mockRejectedValue(new Error("Microsoft session expired"));
    const service = createService();
    const listener = vi.fn();
    service.subscribe(listener);

    await expect(service.getAccessToken()).rejects.toThrow("Microsoft sign-in is required");
    expect(listener).not.toHaveBeenCalledWith(null);
    await expect(service.initialize()).resolves.toEqual(account);
  });

  it("repairs a Unicode account name cached by an older extension build", async () => {
    sessionValues.set(SESSION_KEY, {
      id: "cached-session",
      accessToken: "cached-token",
      expiresAt: NOW + 60 * 60 * 1000,
      authEpoch: AUTH_EPOCH,
      verificationVersion: 1,
      account: {
        id: "account-id",
        name: legacyByteString("测试用户"),
        username: "owner@example.com"
      }
    });
    const service = createService();

    await expect(service.initialize()).resolves.toMatchObject({ name: "测试用户" });
    expect(sessionValues.get(SESSION_KEY)).toMatchObject({
      account: { name: "测试用户" }
    });
  });

  it("repairs Latin names cached with UTF-8 mojibake", async () => {
    sessionValues.set(SESSION_KEY, {
      id: "cached-session",
      accessToken: "cached-token",
      expiresAt: NOW + 60 * 60 * 1000,
      authEpoch: AUTH_EPOCH,
      verificationVersion: 1,
      account: {
        id: "account-id",
        name: legacyByteString("José Müller"),
        username: "jose@example.com"
      }
    });
    const service = createService();

    await expect(service.initialize()).resolves.toMatchObject({
      name: "José Müller"
    });
  });

  it("renews a legacy session that predates identity-token signature verification", async () => {
    sessionValues.set(SESSION_KEY, {
      id: "legacy-session",
      accessToken: "legacy-token",
      expiresAt: NOW + 60 * 60 * 1000,
      authEpoch: AUTH_EPOCH,
      account: {
        id: "account-id",
        name: "Alex",
        username: "owner@example.com"
      }
    });
    localValues.set(ACCOUNT_KEY, {
      id: "account-id",
      name: "Alex",
      username: "owner@example.com"
    });
    const service = createService();

    await expect(service.initialize()).resolves.toMatchObject({ id: "account-id" });
    expect(launchWebAuthFlow).toHaveBeenCalledTimes(1);
    expect(sessionValues.get(SESSION_KEY)).toMatchObject({
      accessToken: "access-token-for-authorization-code",
      verificationVersion: 1
    });
  });

  it("uses interactive PKCE login and exchanges the code without a client secret", async () => {
    const service = createService();

    await expect(service.signIn()).resolves.toEqual({
      id: "account-id",
      name: "Alex",
      username: "owner@example.com"
    });

    const details = launchWebAuthFlow.mock.calls[0][0] as {
      url: string;
      interactive: boolean;
    };
    const authorizeUrl = new URL(details.url);
    expect(details.interactive).toBe(true);
    expect(authorizeUrl.pathname).toBe("/consumers/oauth2/v2.0/authorize");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(authorizeUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizeUrl.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorizeUrl.searchParams.get("scope")).toContain("Files.ReadWrite.AppFolder");
    expect(authorizeUrl.searchParams.has("prompt")).toBe(false);

    const tokenRequest = fetchImplementation.mock.calls[0];
    expect(tokenRequest[0]).toBe(
      "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
    );
    const body = tokenRequest[1]?.body as URLSearchParams;
    expect(tokenRequest[1]).toMatchObject({
      credentials: "omit",
      redirect: "error"
    });
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(body.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(body.has("client_secret")).toBe(false);
    expect(
      [...sessionValues.entries()].find(([key]) =>
        key.startsWith("relaydrop.extension.session.v1.")
      )?.[1]
    ).toMatchObject({
      accessToken: "access-token-for-authorization-code"
    });
  });

  it("does not create a session from an unsigned Microsoft identity token", async () => {
    fetchImplementation.mockImplementationOnce(async () => {
      const authRequest = new URL(
        (launchWebAuthFlow.mock.calls.at(-1)?.[0] as { url: string }).url
      );
      return jsonResponse({
        access_token: "untrusted-access-token",
        expires_in: 3600,
        id_token: createUnsignedIdToken({
          iss: ID_TOKEN_ISSUER,
          aud: CLIENT_ID,
          exp: Math.floor(NOW / 1000) + 3600,
          nonce: authRequest.searchParams.get("nonce"),
          preferred_username: "owner@example.com",
          sub: "account-id"
        })
      });
    });
    const service = createService();

    await expect(service.signIn()).rejects.toThrow("signing algorithm");
    expect(
      [...sessionValues.keys()].some((key) =>
        key.startsWith("relaydrop.extension.session.v1.")
      )
    ).toBe(false);
  });

  it("decodes Unicode account names from the Microsoft identity token", async () => {
    fetchImplementation.mockImplementationOnce(async () => {
      const authRequest = new URL(
        (launchWebAuthFlow.mock.calls.at(-1)?.[0] as { url: string }).url
      );
      return new Response(
        JSON.stringify({
          access_token: "unicode-account-token",
          expires_in: 3600,
          id_token: await createIdToken({
            aud: CLIENT_ID,
            exp: Math.floor(NOW / 1000) + 3600,
            nonce: authRequest.searchParams.get("nonce"),
            name: "测试用户",
            preferred_username: "owner@example.com",
            sub: "unicode-account-id"
          })
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    const service = createService();

    await expect(service.signIn()).resolves.toMatchObject({ name: "测试用户" });
  });

  it("shares one silent authorization when concurrent callers need a fresh token", async () => {
    sessionValues.set(SESSION_KEY, {
      id: "expiring-session",
      accessToken: "expiring-token",
      expiresAt: NOW + 60 * 1000,
      authEpoch: AUTH_EPOCH,
      verificationVersion: 1,
      account: {
        id: "account-id",
        name: "Alex",
        username: "owner@example.com"
      }
    });
    const service = createService();

    const [first, second] = await Promise.all([
      service.getAccessToken(),
      service.getAccessToken()
    ]);

    expect(first).toBe("access-token-for-authorization-code");
    expect(second).toBe(first);
    expect(launchWebAuthFlow).toHaveBeenCalledTimes(1);
    const details = launchWebAuthFlow.mock.calls[0][0] as {
      url: string;
      interactive: boolean;
    };
    expect(details.interactive).toBe(false);
    expect(new URL(details.url).searchParams.get("prompt")).toBe("none");
  });

  it("does not silently sign back in after the user disconnects", async () => {
    const service = createService();
    await service.signOut();

    const nextService = createService();
    await expect(nextService.initialize()).resolves.toBeNull();
    expect(launchWebAuthFlow).not.toHaveBeenCalled();
    expect(localValues.get("relaydrop.extension.disconnected-epoch.v1")).toBe(
      localValues.get("relaydrop.extension.auth-epoch.v1")
    );
  });

  it("invalidates a token cached by another side-panel instance after disconnect", async () => {
    sessionValues.set(SESSION_KEY, {
      id: "cached-session",
      accessToken: "cached-token",
      expiresAt: NOW + 60 * 60 * 1000,
      authEpoch: AUTH_EPOCH,
      verificationVersion: 1,
      account: {
        id: "account-id",
        name: "Alex",
        username: "owner@example.com"
      }
    });
    const firstPanel = createService();
    const secondPanel = createService();
    await expect(firstPanel.getAccessToken()).resolves.toBe("cached-token");

    await secondPanel.signOut();

    await expect(firstPanel.getAccessToken()).rejects.toThrow(
      "Microsoft sign-in is required"
    );
  });

  it("rejects silent SSO when Microsoft returns a different account", async () => {
    localValues.set(ACCOUNT_KEY, {
      id: "account-id",
      name: "Alex",
      username: "owner@example.com"
    });
    fetchImplementation.mockImplementationOnce(async () => {
      const authRequest = new URL(
        (launchWebAuthFlow.mock.calls.at(-1)?.[0] as { url: string }).url
      );
      return new Response(
        JSON.stringify({
          access_token: "other-account-token",
          expires_in: 3600,
          id_token: await createIdToken({
            aud: CLIENT_ID,
            exp: Math.floor(NOW / 1000) + 3600,
            nonce: authRequest.searchParams.get("nonce"),
            name: "Other",
            preferred_username: "other@example.com",
            sub: "other-account-id"
          })
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    const service = createService();

    await expect(service.getAccessToken()).rejects.toThrow(
      "Microsoft sign-in is required"
    );
    expect(sessionValues.has(SESSION_KEY)).toBe(false);
  });

  it("rejects a callback with a mismatched OAuth state", async () => {
    launchWebAuthFlow.mockResolvedValue(
      REDIRECT_URI + "?code=authorization-code&state=wrong-state"
    );
    const service = createService();

    await expect(service.signIn()).rejects.toThrow("state could not be verified");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("does not restore credentials when disconnect supersedes an in-flight sign-in", async () => {
    const originalSessionSet = platform.storage.session.set.bind(
      platform.storage.session
    );
    platform.storage.session.set = vi.fn(async (items: Record<string, unknown>) => {
      await originalSessionSet(items);
      localValues.set("relaydrop.extension.auth-epoch.v1", "newer-epoch");
      localValues.set("relaydrop.extension.disconnected-epoch.v1", "newer-epoch");
      localValues.set("relaydrop.extension.connected.v1.newer-epoch", true);
      localValues.set("relaydrop.extension.account.v1.newer-epoch", {
        id: "newer-account",
        name: "Newer",
        username: "newer@example.com"
      });
      sessionValues.set("relaydrop.extension.session.v1.newer-epoch", {
        id: "newer-session",
        accessToken: "newer-token",
        expiresAt: NOW + 60 * 60 * 1000,
        authEpoch: "newer-epoch",
        verificationVersion: 1,
        account: {
          id: "newer-account",
          name: "Newer",
          username: "newer@example.com"
        }
      });
    });
    const service = createService();

    await expect(service.signIn()).rejects.toThrow("superseded");
    expect(sessionValues.get("relaydrop.extension.session.v1.newer-epoch")).toMatchObject({
      accessToken: "newer-token"
    });
    expect(localValues.get("relaydrop.extension.connected.v1.newer-epoch")).toBe(true);
    expect(
      [...localValues.keys()].filter((key) =>
        key.startsWith("relaydrop.extension.connected.v1.")
      )
    ).toEqual(["relaydrop.extension.connected.v1.newer-epoch"]);
    expect(localValues.get("relaydrop.extension.account.v1.newer-epoch")).toMatchObject({
      id: "newer-account"
    });
  });

  it("does not delete a newer session when an older silent flow fails", async () => {
    localValues.set(ACCOUNT_KEY, {
      id: "account-id",
      name: "Alex",
      username: "owner@example.com"
    });
    launchWebAuthFlow.mockImplementationOnce(async () => {
      sessionValues.set(SESSION_KEY, {
        id: "newer-session",
        accessToken: "newer-token",
        expiresAt: NOW + 60 * 60 * 1000,
        authEpoch: AUTH_EPOCH,
        verificationVersion: 1,
        account: {
          id: "account-id",
          name: "Alex",
          username: "owner@example.com"
        }
      });
      throw new Error("older silent flow failed");
    });
    const service = createService();

    await expect(service.getAccessToken()).rejects.toThrow(
      "Microsoft sign-in is required"
    );
    expect(sessionValues.get(SESSION_KEY)).toMatchObject({
      accessToken: "newer-token"
    });
  });

  it("does not reuse a Graph-rejected token when forced renewal fails", async () => {
    sessionValues.set(SESSION_KEY, {
      id: "rejected-session",
      accessToken: "rejected-token",
      expiresAt: NOW + 60 * 60 * 1000,
      authEpoch: AUTH_EPOCH,
      verificationVersion: 1,
      account: {
        id: "account-id",
        name: "Alex",
        username: "owner@example.com"
      }
    });
    localValues.set(ACCOUNT_KEY, {
      id: "account-id",
      name: "Alex",
      username: "owner@example.com"
    });
    launchWebAuthFlow.mockRejectedValue(new Error("interaction required"));
    const service = createService();

    await expect(
      service.getAccessToken({ forceRefresh: true })
    ).rejects.toThrow("Microsoft sign-in is required");
    expect(sessionValues.get(INVALIDATED_SESSION_KEY)).toBe("rejected-session");
    await expect(service.getAccessToken()).rejects.toThrow(
      "Microsoft sign-in is required"
    );
    expect(launchWebAuthFlow).toHaveBeenCalledTimes(2);
  });

  it("does not return a cached token after another panel logs out", async () => {
    const enteredInvalidationRead = deferred<void>();
    const releaseInvalidationRead = deferred<void>();
    let pauseInvalidationRead = true;
    const raceLocalValues = new Map<string, unknown>([
      [AUTH_EPOCH_KEY, AUTH_EPOCH],
      [DISCONNECTED_EPOCH_KEY, AUTH_EPOCH],
      [CONNECTED_KEY, true],
      [ACCOUNT_KEY, { id: "account-id", name: "Alex", username: "owner@example.com" }]
    ]);
    const raceSessionValues = new Map<string, unknown>([
      [
        SESSION_KEY,
        {
          id: "cached-session",
          accessToken: "cached-token",
          expiresAt: NOW + 60 * 60 * 1000,
          authEpoch: AUTH_EPOCH,
          verificationVersion: 1,
          account: {
            id: "account-id",
            name: "Alex",
            username: "owner@example.com"
          }
        }
      ]
    ]);
    const racePlatform: ExtensionPlatform = {
      identity: platform.identity,
      storage: {
        local: createStorage(raceLocalValues),
        session: createStorage(raceSessionValues, async (keys) => {
          if (pauseInvalidationRead && keys.includes(INVALIDATED_SESSION_KEY)) {
            pauseInvalidationRead = false;
            enteredInvalidationRead.resolve();
            await releaseInvalidationRead.promise;
          }
        })
      }
    };
    const firstPanel = createServiceForPlatform(racePlatform);
    const logoutPanel = createServiceForPlatform(racePlatform);

    const pendingToken = firstPanel.getAccessToken();
    await enteredInvalidationRead.promise;
    await logoutPanel.signOut();
    releaseInvalidationRead.resolve();

    await expect(pendingToken).rejects.toThrow("Microsoft sign-in is required");
  });

  it("does not publish a stale account after logout completes", async () => {
    const enteredInvalidationRead = deferred<void>();
    const releaseInvalidationRead = deferred<void>();
    let pauseInvalidationRead = true;
    const storageListeners = new Set<
      (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void
    >();
    const raceLocalValues = new Map<string, unknown>([
      [AUTH_EPOCH_KEY, AUTH_EPOCH],
      [DISCONNECTED_EPOCH_KEY, AUTH_EPOCH],
      [CONNECTED_KEY, true],
      [ACCOUNT_KEY, { id: "account-id", name: "Alex", username: "owner@example.com" }]
    ]);
    const raceSessionValues = new Map<string, unknown>([
      [
        SESSION_KEY,
        {
          id: "cached-session",
          accessToken: "cached-token",
          expiresAt: NOW + 60 * 60 * 1000,
          authEpoch: AUTH_EPOCH,
          verificationVersion: 1,
          account: {
            id: "account-id",
            name: "Alex",
            username: "owner@example.com"
          }
        }
      ]
    ]);
    const racePlatform: ExtensionPlatform = {
      identity: platform.identity,
      storage: {
        local: createStorage(raceLocalValues),
        session: createStorage(raceSessionValues, async (keys) => {
          if (pauseInvalidationRead && keys.includes(INVALIDATED_SESSION_KEY)) {
            pauseInvalidationRead = false;
            enteredInvalidationRead.resolve();
            await releaseInvalidationRead.promise;
          }
        }),
        onChanged: {
          addListener(listener) {
            storageListeners.add(listener);
          },
          removeListener(listener) {
            storageListeners.delete(listener);
          }
        }
      }
    };
    const service = createServiceForPlatform(racePlatform);
    const observed: Array<string | null> = [];
    service.subscribe((account) => observed.push(account?.id ?? null));

    for (const listener of storageListeners) {
      listener({ [SESSION_KEY]: { newValue: true } }, "session");
    }
    await enteredInvalidationRead.promise;
    await service.signOut();
    releaseInvalidationRead.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(observed.at(-1)).toBeNull();
  });

  it("requires interactive sign-in when the connected account binding is missing", async () => {
    localValues.set(CONNECTED_KEY, true);
    const service = createService();

    await expect(service.initialize()).resolves.toBeNull();
    expect(launchWebAuthFlow).not.toHaveBeenCalled();
  });

  it("does not reuse an obsolete silent token request across account epochs", async () => {
    const oldEpoch = "old-epoch";
    const newEpoch = "new-epoch";
    const oldFlow = deferred<string | undefined>();
    const newFlow = deferred<string | undefined>();
    const raceLocalValues = new Map<string, unknown>([
      [AUTH_EPOCH_KEY, oldEpoch],
      [CONNECTED_KEY.replace(AUTH_EPOCH, oldEpoch), true],
      [
        ACCOUNT_KEY.replace(AUTH_EPOCH, oldEpoch),
        { id: "old-account", name: "Old", username: "old@example.com" }
      ]
    ]);
    const racePlatform: ExtensionPlatform = {
      identity: {
        getRedirectURL: () => REDIRECT_URI,
        launchWebAuthFlow: vi
          .fn()
          .mockImplementationOnce(() => oldFlow.promise)
          .mockImplementationOnce(() => newFlow.promise)
      },
      storage: {
        local: createStorage(raceLocalValues),
        session: createStorage(new Map())
      }
    };
    const service = createServiceForPlatform(racePlatform);

    const obsoleteRequest = service.getAccessToken();
    await vi.waitFor(() =>
      expect(racePlatform.identity.launchWebAuthFlow).toHaveBeenCalledTimes(1)
    );
    raceLocalValues.set(AUTH_EPOCH_KEY, newEpoch);
    raceLocalValues.set(CONNECTED_KEY.replace(AUTH_EPOCH, newEpoch), true);
    raceLocalValues.set(ACCOUNT_KEY.replace(AUTH_EPOCH, newEpoch), {
      id: "new-account",
      name: "New",
      username: "new@example.com"
    });

    const currentRequest = service.getAccessToken();
    await vi.waitFor(() =>
      expect(racePlatform.identity.launchWebAuthFlow).toHaveBeenCalledTimes(2)
    );
    oldFlow.reject(new Error("obsolete flow stopped"));
    newFlow.reject(new Error("current flow stopped"));

    await expect(obsoleteRequest).rejects.toThrow("Microsoft sign-in is required");
    await expect(currentRequest).rejects.toThrow("Microsoft sign-in is required");
  });

  function createService() {
    return new ExtensionAuthService(
      {
        clientId: CLIENT_ID,
        authority: "https://login.microsoftonline.com/consumers"
      },
      platform,
      fetchImplementation as unknown as typeof fetch,
      () => NOW
    );
  }

  function createServiceForPlatform(input: ExtensionPlatform) {
    return new ExtensionAuthService(
      {
        clientId: CLIENT_ID,
        authority: "https://login.microsoftonline.com/consumers"
      },
      input,
      (async () => {
        throw new Error("network should not be used by this test");
      }) as typeof fetch,
      () => NOW
    );
  }
});

function createStorage(
  values: Map<string, unknown>,
  beforeGet?: (keys: string[]) => Promise<void>
) {
  return {
    async get(keys: string | string[]) {
      const requested = Array.isArray(keys) ? keys : [keys];
      await beforeGet?.(requested);
      return Object.fromEntries(
        requested.filter((key) => values.has(key)).map((key) => [key, values.get(key)])
      );
    },
    async set(items: Record<string, unknown>) {
      for (const [key, value] of Object.entries(items)) values.set(key, value);
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key);
    }
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function createIdToken(claims: Record<string, unknown>): Promise<string> {
  const encodedHeader = encodeBase64Url({
    alg: "RS256",
    kid: SIGNING_KEY_ID,
    typ: "JWT"
  });
  const encodedPayload = encodeBase64Url({
    iss: ID_TOKEN_ISSUER,
    tid: CONSUMER_TENANT_ID,
    ...claims
  });
  const signingInput = encodedHeader + "." + encodedPayload;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKeys.privateKey,
    new TextEncoder().encode(signingInput)
  );
  return signingInput + "." + encodeBase64UrlBytes(new Uint8Array(signature));
}

function createUnsignedIdToken(claims: Record<string, unknown>): string {
  return [
    encodeBase64Url({ alg: "none", typ: "JWT" }),
    encodeBase64Url(claims),
    ""
  ].join(".");
}

function encodeBase64Url(value: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return encodeBase64UrlBinary(binary);
}

function encodeBase64UrlBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return encodeBase64UrlBinary(binary);
}

function encodeBase64UrlBinary(binary: string): string {
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function legacyByteString(value: string): string {
  return Array.from(new TextEncoder().encode(value), (byte) =>
    String.fromCharCode(byte)
  ).join("");
}

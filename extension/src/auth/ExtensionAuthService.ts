import type { AccessTokenRequest } from "../../../src/auth/AccessTokenProvider";
import { normalizeMicrosoftAuthority } from "../../../src/config/microsoftAuthority";
import {
  MicrosoftIdTokenVerifier,
  type VerifiedMicrosoftIdTokenClaims
} from "./MicrosoftIdTokenVerifier";

const SESSION_KEY_PREFIX = "relaydrop.extension.session.v1.";
const ACCOUNT_KEY_PREFIX = "relaydrop.extension.account.v1.";
const INVALIDATED_SESSION_KEY_PREFIX = "relaydrop.extension.invalid-session.v1.";
const AUTH_EPOCH_KEY = "relaydrop.extension.auth-epoch.v1";
const CONNECTED_KEY_PREFIX = "relaydrop.extension.connected.v1.";
const DISCONNECTED_EPOCH_KEY = "relaydrop.extension.disconnected-epoch.v1";
const SESSION_VERIFICATION_VERSION = 1;
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const AUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "Files.ReadWrite.AppFolder"
] as const;

export interface ExtensionAuthConfig {
  clientId: string;
  authority: string;
}

export interface ExtensionAccount {
  id: string;
  name: string;
  username: string;
}

interface ExtensionSession {
  id: string;
  accessToken: string;
  expiresAt: number;
  authEpoch: string;
  verificationVersion: typeof SESSION_VERIFICATION_VERSION;
  account: ExtensionAccount;
}

interface ExtensionAuthState {
  authEpoch: string;
  connected: boolean;
  disconnectedEpoch?: string;
}

interface StorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface IdentityApi {
  getRedirectURL(path?: string): string;
  launchWebAuthFlow(details: {
    url: string;
    interactive: boolean;
    abortOnLoadForNonInteractive?: boolean;
    timeoutMsForNonInteractive?: number;
  }): Promise<string | undefined>;
}

export interface ExtensionPlatform {
  identity: IdentityApi;
  storage: {
    local: StorageArea;
    session: StorageArea;
    onChanged?: {
      addListener(
        listener: (
          changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
          areaName: string
        ) => void
      ): void;
      removeListener(
        listener: (
          changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
          areaName: string
        ) => void
      ): void;
    };
  };
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
}

export class ExtensionAuthService {
  private authenticationRequired = false;
  private initialization?: Promise<ExtensionAccount | null>;
  private tokenRequest?: { authEpoch: string; promise: Promise<string> };
  private notificationRevision = 0;
  private readonly config: ExtensionAuthConfig;
  private readonly idTokenVerifier: MicrosoftIdTokenVerifier;
  private readonly listeners = new Set<(account: ExtensionAccount | null) => void>();

  constructor(
    config: ExtensionAuthConfig,
    private readonly platform: ExtensionPlatform = getDefaultPlatform(),
    private readonly fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly now: () => number = Date.now
  ) {
    if (!config.clientId) {
      throw new Error("Microsoft client ID is required.");
    }
    const authority = normalizeMicrosoftAuthority(config.authority);
    if (!authority) {
      throw new Error("RelayDrop requires the Microsoft consumers authority.");
    }
    this.config = { ...config, authority };
    this.idTokenVerifier = new MicrosoftIdTokenVerifier(
      this.config,
      fetchImplementation,
      now
    );
  }

  initialize(): Promise<ExtensionAccount | null> {
    if (!this.initialization) {
      this.initialization = this.initializeSession();
    }

    return this.initialization;
  }

  get requiresReconnect(): boolean {
    return this.authenticationRequired;
  }

  async signIn(): Promise<ExtensionAccount> {
    const previousState = await this.readAuthState();
    const hint = await this.readAccount(previousState.authEpoch);
    const authEpoch = randomBase64Url(16);
    await this.platform.storage.local.set({
      [AUTH_EPOCH_KEY]: authEpoch,
      [DISCONNECTED_EPOCH_KEY]: authEpoch
    });
    await Promise.all([
      this.sessionStorage().remove([
        sessionKey(previousState.authEpoch),
        invalidatedSessionKey(previousState.authEpoch)
      ]),
      this.platform.storage.local.remove([
        accountKey(previousState.authEpoch),
        connectedKey(previousState.authEpoch)
      ])
    ]);
    this.commitNotification(null);
    const session = await this.authorize({
      interactive: true,
      loginHint: hint?.username,
      authEpoch
    });
    return session.account;
  }

  async signOut(): Promise<void> {
    this.authenticationRequired = false;
    const previousState = await this.readAuthState();
    const authEpoch = randomBase64Url(16);
    await this.platform.storage.local.set({
      [AUTH_EPOCH_KEY]: authEpoch,
      [DISCONNECTED_EPOCH_KEY]: authEpoch
    });
    await Promise.all([
      this.sessionStorage().remove([
        sessionKey(previousState.authEpoch),
        invalidatedSessionKey(previousState.authEpoch)
      ]),
      this.platform.storage.local.remove([
        accountKey(previousState.authEpoch),
        connectedKey(previousState.authEpoch)
      ])
    ]);
    this.commitNotification(null);
  }

  async getAccessToken(options: AccessTokenRequest = {}): Promise<string> {
    let authState = await this.readAuthState();
    if (isSilentSsoSuppressed(authState)) {
      this.commitNotification(null);
      throw new ExtensionAuthenticationRequiredError();
    }

    const storedSession = await this.readSession(authState.authEpoch);
    if (options.forceRefresh && storedSession) {
      await this.sessionStorage().set({
        [invalidatedSessionKey(authState.authEpoch)]: storedSession.id
      });
    }
    const session = options.forceRefresh ? undefined : storedSession;
    if (
      session &&
      session.authEpoch === authState.authEpoch &&
      (await this.isUsable(session))
    ) {
      const confirmedState = await this.readAuthState();
      const confirmedSession = await this.readSession(authState.authEpoch);
      if (
        confirmedState.authEpoch === authState.authEpoch &&
        !isSilentSsoSuppressed(confirmedState) &&
        confirmedSession?.id === session.id
      ) {
        if (this.authenticationRequired) {
          this.authenticationRequired = false;
          this.commitNotification(session.account);
        }
        return session.accessToken;
      }
      authState = confirmedState;
      if (isSilentSsoSuppressed(authState)) {
        this.commitNotification(null);
        throw new ExtensionAuthenticationRequiredError();
      }
    }

    if (!this.tokenRequest || this.tokenRequest.authEpoch !== authState.authEpoch) {
      const request = {
        authEpoch: authState.authEpoch,
        promise: Promise.resolve("")
      };
      request.promise = this.acquireTokenSilently(authState).finally(() => {
        if (this.tokenRequest === request) {
          this.tokenRequest = undefined;
        }
      });
      this.tokenRequest = request;
    }

    return this.tokenRequest.promise;
  }

  getRedirectUri(): string {
    return this.platform.identity.getRedirectURL("oauth2");
  }

  subscribe(listener: (account: ExtensionAccount | null) => void): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.platform.storage.onChanged?.addListener(this.handleStorageChange);
    }

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.platform.storage.onChanged?.removeListener(this.handleStorageChange);
      }
    };
  }

  private async initializeSession(): Promise<ExtensionAccount | null> {
    const authState = await this.readAuthState();
    if (isSilentSsoSuppressed(authState)) {
      return null;
    }

    const session = await this.readSession(authState.authEpoch);
    if (
      session &&
      session.authEpoch === authState.authEpoch &&
      (await this.isUsable(session))
    ) {
      return session.account;
    }

    const hint =
      session?.authEpoch === authState.authEpoch
        ? session.account
        : await this.readAccount(authState.authEpoch);
    // A remembered account selects its local snapshot; it does not authorize
    // Graph requests. Token renewal is deferred to getAccessToken so a network
    // outage or a browser restart never blocks displaying the cached inbox.
    if (authState.connected && hint) {
      const current = await this.readAuthState();
      return current.authEpoch === authState.authEpoch && !isSilentSsoSuppressed(current)
        ? hint
        : null;
    }
    if (authState.connected && !hint) {
      return null;
    }
    try {
      const nextSession = await this.authorize({
        interactive: false,
        loginHint: hint?.username,
        expectedAccountId: hint?.id,
        authEpoch: authState.authEpoch
      });
      return nextSession.account;
    } catch {
      return null;
    }
  }

  private async acquireTokenSilently(
    authState: ExtensionAuthState
  ): Promise<string> {
    const storedSession = await this.readSession(authState.authEpoch);
    const hint =
      storedSession?.authEpoch === authState.authEpoch
        ? storedSession.account
        : await this.readAccount(authState.authEpoch);
    if (authState.connected && !hint) {
      this.commitNotification(null);
      throw new ExtensionAuthenticationRequiredError();
    }
    try {
      const session = await this.authorize({
        interactive: false,
        loginHint: hint?.username,
        expectedAccountId: hint?.id,
        authEpoch: authState.authEpoch
      });
      return session.accessToken;
    } catch {
      const currentState = await this.readAuthState().catch(() => undefined);
      if (currentState?.authEpoch === authState.authEpoch) {
        this.authenticationRequired = true;
        this.commitNotification(
          currentState.connected && !isSilentSsoSuppressed(currentState) ? hint ?? null : null
        );
      }
      throw new ExtensionAuthenticationRequiredError();
    }
  }

  private async authorize(input: {
    interactive: boolean;
    loginHint?: string;
    expectedAccountId?: string;
    authEpoch: string;
  }): Promise<ExtensionSession> {
    const redirectUri = this.getRedirectUri();
    const state = randomBase64Url(32);
    const nonce = randomBase64Url(32);
    const codeVerifier = randomBase64Url(48);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const authorizeUrl = new URL(
      this.config.authority.replace(/\/$/, "") + "/oauth2/v2.0/authorize"
    );

    authorizeUrl.searchParams.set("client_id", this.config.clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("response_mode", "query");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", AUTH_SCOPES.join(" "));
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("nonce", nonce);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    if (!input.interactive) {
      authorizeUrl.searchParams.set("prompt", "none");
    }
    if (input.loginHint) {
      authorizeUrl.searchParams.set("login_hint", input.loginHint);
    }

    const responseUrl = await this.platform.identity.launchWebAuthFlow({
      url: authorizeUrl.toString(),
      interactive: input.interactive,
      ...(input.interactive
        ? {}
        : {
            abortOnLoadForNonInteractive: false,
            timeoutMsForNonInteractive: 10_000
          })
    });

    if (!responseUrl) {
      throw new Error("Microsoft sign-in did not return a response.");
    }

    const redirect = new URL(responseUrl);
    const expectedRedirect = new URL(redirectUri);
    if (
      redirect.origin !== expectedRedirect.origin ||
      redirect.pathname !== expectedRedirect.pathname
    ) {
      throw new Error("Microsoft sign-in returned to an unexpected address.");
    }

    if (redirect.searchParams.get("state") !== state) {
      throw new Error("Microsoft sign-in state could not be verified.");
    }

    const oauthError = redirect.searchParams.get("error");
    if (oauthError) {
      throw new Error(
        redirect.searchParams.get("error_description") ||
          "Microsoft sign-in was not completed."
      );
    }

    const code = redirect.searchParams.get("code");
    if (!code) {
      throw new Error("Microsoft sign-in did not provide an authorization code.");
    }

    const tokenResponse = await this.exchangeCode({
      code,
      codeVerifier,
      redirectUri
    });
    const session = await this.createSession(
      tokenResponse,
      nonce,
      input.authEpoch,
      input.loginHint
    );
    if (
      input.expectedAccountId &&
      session.account.id !== input.expectedAccountId
    ) {
      throw new Error("Microsoft silent sign-in returned a different account.");
    }

    const currentAuthState = await this.readAuthState();
    if (
      currentAuthState.authEpoch !== input.authEpoch ||
      (!input.interactive && isSilentSsoSuppressed(currentAuthState))
    ) {
      throw new Error("Microsoft sign-in was superseded by a newer account action.");
    }

    await this.sessionStorage().set({
      [sessionKey(input.authEpoch)]: session
    });
    await this.platform.storage.local.set({
      [accountKey(input.authEpoch)]: session.account,
      ...(input.interactive
        ? { [connectedKey(input.authEpoch)]: true }
        : {})
    });
    const committedState = await this.readAuthState();
    if (
      committedState.authEpoch !== input.authEpoch ||
      isSilentSsoSuppressed(committedState)
    ) {
      await Promise.all([
        this.sessionStorage().remove([
          sessionKey(input.authEpoch),
          invalidatedSessionKey(input.authEpoch)
        ]),
        this.platform.storage.local.remove([
          accountKey(input.authEpoch),
          connectedKey(input.authEpoch)
        ])
      ]);
      throw new Error("Microsoft sign-in was superseded by a newer account action.");
    }
    this.authenticationRequired = false;
    this.commitNotification(session.account);
    return session;
  }

  private async exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<TokenResponse> {
    const tokenUrl =
      this.config.authority.replace(/\/$/, "") + "/oauth2/v2.0/token";
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
      scope: AUTH_SCOPES.join(" ")
    });
    const response = await this.fetchImplementation(tokenUrl, {
      credentials: "omit",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      redirect: "error"
    });
    const payload = (await response.json()) as TokenResponse;

    if (!response.ok || payload.error) {
      throw new Error(
        payload.error_description || payload.error || "Microsoft token exchange failed."
      );
    }

    return payload;
  }

  private async createSession(
    tokenResponse: TokenResponse,
    nonce: string,
    authEpoch: string,
    loginHint?: string
  ): Promise<ExtensionSession> {
    if (!tokenResponse.access_token || !tokenResponse.id_token) {
      throw new Error("Microsoft sign-in returned an incomplete token response.");
    }

    const claims: VerifiedMicrosoftIdTokenClaims =
      await this.idTokenVerifier.verify(tokenResponse.id_token, nonce);

    const username = claims.preferred_username || claims.email || loginHint;
    const id = claims.oid || claims.sub;
    if (!username || !id) {
      throw new Error("Microsoft sign-in did not return account information.");
    }

    return {
      id: randomBase64Url(16),
      accessToken: tokenResponse.access_token,
      expiresAt: this.now() + Math.max(60, tokenResponse.expires_in ?? 3600) * 1000,
      authEpoch,
      verificationVersion: SESSION_VERIFICATION_VERSION,
      account: {
        id,
        name: claims.name?.trim() || username.split("@")[0] || "Microsoft user",
        username
      }
    };
  }

  private async readSession(authEpoch: string): Promise<ExtensionSession | undefined> {
    const key = sessionKey(authEpoch);
    const values = await this.sessionStorage().get(key);
    const value = values[key];
    if (!isExtensionSession(value)) {
      return undefined;
    }

    const account = repairLegacyAccount(value.account);
    if (account !== value.account) {
      const repairedSession = { ...value, account };
      await this.sessionStorage().set({ [key]: repairedSession });
      return repairedSession;
    }

    return value;
  }

  private async readAccount(authEpoch: string): Promise<ExtensionAccount | undefined> {
    const key = accountKey(authEpoch);
    const values = await this.platform.storage.local.get(key);
    const value = values[key];
    if (!isExtensionAccount(value)) {
      return undefined;
    }

    const account = repairLegacyAccount(value);
    if (account !== value) {
      await this.platform.storage.local.set({ [key]: account });
    }
    return account;
  }

  private async readAuthState(): Promise<ExtensionAuthState> {
    const values = await this.platform.storage.local.get([
      AUTH_EPOCH_KEY,
      DISCONNECTED_EPOCH_KEY
    ]);
    const storedAuthEpoch = values[AUTH_EPOCH_KEY];
    const authEpoch =
      typeof storedAuthEpoch === "string" ? storedAuthEpoch : randomBase64Url(16);
    if (typeof storedAuthEpoch !== "string") {
      await this.platform.storage.local.set({ [AUTH_EPOCH_KEY]: authEpoch });
    }
    const connectionValues = await this.platform.storage.local.get(
      connectedKey(authEpoch)
    );

    return {
      authEpoch,
      connected: connectionValues[connectedKey(authEpoch)] === true,
      disconnectedEpoch:
        typeof values[DISCONNECTED_EPOCH_KEY] === "string"
          ? values[DISCONNECTED_EPOCH_KEY]
          : undefined
    };
  }

  private async isUsable(session: ExtensionSession): Promise<boolean> {
    if (session.expiresAt - TOKEN_EXPIRY_BUFFER_MS <= this.now()) {
      return false;
    }
    const key = invalidatedSessionKey(session.authEpoch);
    const values = await this.sessionStorage().get(key);
    return values[key] !== session.id;
  }

  private sessionStorage(): StorageArea {
    return this.platform.storage.session;
  }

  private readonly handleStorageChange = (
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    areaName: string
  ) => {
    if (
      (areaName === "session" &&
        Object.keys(changes).some((key) => key.startsWith(SESSION_KEY_PREFIX))) ||
      (areaName === "local" &&
        (Object.keys(changes).some((key) => key.startsWith(ACCOUNT_KEY_PREFIX)) ||
          Object.keys(changes).some((key) => key.startsWith(CONNECTED_KEY_PREFIX)) ||
          [AUTH_EPOCH_KEY, DISCONNECTED_EPOCH_KEY].some((key) => key in changes)))
    ) {
      void this.publishStoredAccount();
    }
  };

  private async publishStoredAccount(): Promise<void> {
    const revision = ++this.notificationRevision;
    const authState = await this.readAuthState();
    const session = await this.readSession(authState.authEpoch);
    const usableSession =
      session &&
      session.authEpoch === authState.authEpoch &&
      !isSilentSsoSuppressed(authState) &&
      await this.isUsable(session);
    let account = usableSession && session ? session.account : null;
    if (!account && authState.connected && !isSilentSsoSuppressed(authState)) {
      account = await this.readAccount(authState.authEpoch) ?? null;
    }
    const confirmedState = await this.readAuthState();
    if (
      revision !== this.notificationRevision ||
      confirmedState.authEpoch !== authState.authEpoch
    ) {
      return;
    }
    if (usableSession) this.authenticationRequired = false;
    this.notify(isSilentSsoSuppressed(confirmedState) ? null : account);
  }

  private commitNotification(account: ExtensionAccount | null): void {
    this.notificationRevision += 1;
    this.notify(account);
  }

  private notify(account: ExtensionAccount | null): void {
    for (const listener of this.listeners) listener(account);
  }
}

export class ExtensionAuthenticationRequiredError extends Error {
  constructor() {
    super("Microsoft sign-in is required. Reconnect RelayDrop and try again.");
    this.name = "ExtensionAuthenticationRequiredError";
  }
}

function getDefaultPlatform(): ExtensionPlatform {
  const platform = (globalThis as unknown as { chrome?: ExtensionPlatform }).chrome;
  if (!platform?.identity || !platform.storage?.local || !platform.storage.session) {
    throw new Error("RelayDrop extension APIs are unavailable.");
  }
  return platform;
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function repairLegacyAccount(account: ExtensionAccount): ExtensionAccount {
  const name = repairLegacyUtf8(account.name);
  return name === account.name ? account : { ...account, name };
}

function repairLegacyUtf8(value: string): string {
  const codePoints = Array.from(value, (character) => character.codePointAt(0) ?? 0);
  const looksLikeLegacyByteText =
    codePoints.every((codePoint) => codePoint <= 0xff) &&
    codePoints.some(
      (codePoint, index) =>
        codePoint >= 0xc2 &&
        codePoint <= 0xf4 &&
        (codePoints[index + 1] ?? 0) >= 0x80 &&
        (codePoints[index + 1] ?? 0) <= 0xbf
    );
  if (!looksLikeLegacyByteText) {
    return value;
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(codePoints)
    );
    return decoded === value ? value : decoded;
  } catch {
    return value;
  }
}

function isExtensionAccount(value: unknown): value is ExtensionAccount {
  if (!value || typeof value !== "object") {
    return false;
  }
  const account = value as Partial<ExtensionAccount>;
  return (
    typeof account.id === "string" &&
    typeof account.name === "string" &&
    typeof account.username === "string"
  );
}

function isExtensionSession(value: unknown): value is ExtensionSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const session = value as Partial<ExtensionSession>;
  return (
    typeof session.accessToken === "string" &&
    typeof session.expiresAt === "number" &&
    typeof session.id === "string" &&
    typeof session.authEpoch === "string" &&
    session.verificationVersion === SESSION_VERIFICATION_VERSION &&
    isExtensionAccount(session.account)
  );
}

function isSilentSsoSuppressed(state: ExtensionAuthState): boolean {
  return (
    state.disconnectedEpoch === state.authEpoch &&
    !state.connected
  );
}

function sessionKey(authEpoch: string): string {
  return SESSION_KEY_PREFIX + authEpoch;
}

function accountKey(authEpoch: string): string {
  return ACCOUNT_KEY_PREFIX + authEpoch;
}

function connectedKey(authEpoch: string): string {
  return CONNECTED_KEY_PREFIX + authEpoch;
}

function invalidatedSessionKey(authEpoch: string): string {
  return INVALIDATED_SESSION_KEY_PREFIX + authEpoch;
}

export interface MicrosoftIdTokenVerifierConfig {
  authority: string;
  clientId: string;
}

export interface VerifiedMicrosoftIdTokenClaims {
  aud?: string | string[];
  azp?: string;
  exp?: number;
  iss?: string;
  nonce?: string;
  tid?: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  oid?: string;
  sub?: string;
}

interface IdTokenHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface MicrosoftOpenIdConfiguration {
  issuer?: string;
  jwks_uri?: string;
  id_token_signing_alg_values_supported?: unknown;
}

interface MicrosoftSigningKey extends JsonWebKey {
  cloud_instance_name?: string;
  issuer?: string;
  kid?: string;
  use?: string;
}

interface MicrosoftJwks {
  keys?: unknown;
}

interface TrustedOpenIdConfiguration {
  issuer: string;
  jwksUri: string;
}

export class MicrosoftIdTokenVerifier {
  private metadata?: Promise<TrustedOpenIdConfiguration>;
  private keys?: Promise<MicrosoftSigningKey[]>;

  constructor(
    private readonly config: MicrosoftIdTokenVerifierConfig,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly now: () => number = Date.now
  ) {}

  async verify(
    token: string,
    expectedNonce: string
  ): Promise<VerifiedMicrosoftIdTokenClaims> {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[0] || !parts[1]) {
      throw new Error("Microsoft identity token could not be decoded.");
    }
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = decodeJwtPart<IdTokenHeader>(encodedHeader);
    if (header.alg !== "RS256") {
      throw new Error("Microsoft identity token signing algorithm is not supported.");
    }
    if (!encodedSignature) {
      throw new Error("Microsoft identity token signature is missing.");
    }
    if (!header.kid) {
      throw new Error("Microsoft identity token signing key is missing.");
    }

    const key = await this.getSigningKey(header.kid);
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      key,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(encodedHeader + "." + encodedPayload)
    );
    if (!verified) {
      throw new Error("Microsoft identity token signature could not be verified.");
    }

    const claims = decodeJwtPart<VerifiedMicrosoftIdTokenClaims>(encodedPayload);
    if (claims.tid !== CONSUMER_TENANT_ID) {
      throw new Error("Microsoft identity token tenant could not be verified.");
    }
    const metadata = await this.getMetadata();
    const expectedIssuer = resolveIssuer(metadata.issuer, CONSUMER_TENANT_ID);
    if (
      normalizeTrustedIssuerPattern(claims.iss, "token issuer") !== expectedIssuer
    ) {
      throw new Error("Microsoft identity token issuer could not be verified.");
    }
    if (claims.nonce !== expectedNonce) {
      throw new Error("Microsoft identity token nonce could not be verified.");
    }
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(this.config.clientId)) {
      throw new Error("Microsoft identity token audience could not be verified.");
    }
    if (
      Array.isArray(claims.aud) &&
      claims.aud.length > 1 &&
      claims.azp !== this.config.clientId
    ) {
      throw new Error("Microsoft identity token authorized party could not be verified.");
    }
    if (
      typeof claims.exp !== "number" ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= Math.floor(this.now() / 1000)
    ) {
      throw new Error("Microsoft identity token has expired.");
    }
    return claims;
  }

  private async getSigningKey(kid: string): Promise<MicrosoftSigningKey> {
    const metadata = await this.getMetadata();
    if (!this.keys) {
      this.keys = this.loadKeys(metadata, false);
    }
    let keys = await this.keys;
    let key = keys.find((candidate) => candidate.kid === kid);
    if (!key) {
      this.keys = this.loadKeys(metadata, true);
      keys = await this.keys;
      key = keys.find((candidate) => candidate.kid === kid);
    }
    if (!key) {
      throw new Error("Microsoft identity token signing key is unknown.");
    }
    return key;
  }

  private async getMetadata(): Promise<TrustedOpenIdConfiguration> {
    if (!this.metadata) {
      const request = this.fetchMetadata();
      this.metadata = request;
      void request.catch(() => {
        if (this.metadata === request) this.metadata = undefined;
      });
    }
    return this.metadata;
  }

  private loadKeys(
    metadata: TrustedOpenIdConfiguration,
    forceRefresh: boolean
  ): Promise<MicrosoftSigningKey[]> {
    const request = this.fetchKeys(
      metadata.jwksUri,
      metadata.issuer,
      forceRefresh
    );
    this.keys = request;
    void request.catch(() => {
      if (this.keys === request) this.keys = undefined;
    });
    return request;
  }

  private async fetchMetadata(): Promise<TrustedOpenIdConfiguration> {
    const authority = trustedMicrosoftUrl(this.config.authority, "authority");
    const discoveryUrl = trustedMicrosoftUrl(
      authority.href.replace(/\/$/, "") +
        "/v2.0/.well-known/openid-configuration",
      "discovery"
    );
    const response = await this.fetchImplementation(discoveryUrl.href, {
      credentials: "omit",
      headers: { Accept: "application/json" },
      redirect: "error"
    });
    if (!response.ok) {
      throw new Error("Microsoft identity metadata could not be loaded.");
    }
    const metadata = (await response.json()) as MicrosoftOpenIdConfiguration;
    const issuer = normalizeTrustedIssuerPattern(metadata.issuer, "issuer");
    const jwksUri = trustedMicrosoftUrl(metadata.jwks_uri, "JWKS").href;
    if (
      !Array.isArray(metadata.id_token_signing_alg_values_supported) ||
      !metadata.id_token_signing_alg_values_supported.includes("RS256")
    ) {
      throw new Error("Microsoft identity metadata does not support RS256.");
    }
    return { issuer, jwksUri };
  }

  private async fetchKeys(
    jwksUri: string,
    issuer: string,
    forceRefresh: boolean
  ): Promise<MicrosoftSigningKey[]> {
    const response = await this.fetchImplementation(
      trustedMicrosoftUrl(jwksUri, "JWKS").href,
      {
        cache: forceRefresh ? "reload" : "default",
        credentials: "omit",
        headers: { Accept: "application/json" },
        redirect: "error"
      }
    );
    if (!response.ok) {
      throw new Error("Microsoft identity signing keys could not be loaded.");
    }
    const payload = (await response.json()) as MicrosoftJwks;
    if (!Array.isArray(payload.keys)) {
      throw new Error("Microsoft identity signing keys are invalid.");
    }
    return payload.keys.filter(
      (value): value is MicrosoftSigningKey =>
        isMicrosoftSigningKey(value) && signingKeyMatchesIssuer(value, issuer)
    );
  }
}

function decodeJwtPart<T>(value: string | undefined): T {
  if (!value) {
    throw new Error("Microsoft identity token could not be decoded.");
  }
  const bytes = decodeBase64Url(value);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function trustedMicrosoftUrl(value: string | undefined, label: string): URL {
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error(`Microsoft identity ${label} URL is invalid.`);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "login.microsoftonline.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Microsoft identity ${label} URL is not trusted.`);
  }
  return url;
}

function isMicrosoftSigningKey(value: unknown): value is MicrosoftSigningKey {
  if (!value || typeof value !== "object") return false;
  const key = value as MicrosoftSigningKey;
  return (
    key.kty === "RSA" &&
    typeof key.kid === "string" &&
    typeof key.n === "string" &&
    typeof key.e === "string" &&
    (key.use === undefined || key.use === "sig") &&
    (key.alg === undefined || key.alg === "RS256")
  );
}

function signingKeyMatchesIssuer(
  key: MicrosoftSigningKey,
  expectedIssuer: string
): boolean {
  if (
    key.cloud_instance_name !== undefined &&
    key.cloud_instance_name !== "microsoftonline.com"
  ) {
    return false;
  }
  if (!key.issuer) return true;

  try {
    const keyIssuer = normalizeTrustedIssuerPattern(
      key.issuer,
      "signing key issuer"
    );
    if (keyIssuer === expectedIssuer) return true;
    if (expectedIssuer.includes(TENANT_PLACEHOLDER)) {
      const tenantId = tenantIdFromIssuer(keyIssuer);
      return Boolean(tenantId) && resolveIssuer(expectedIssuer, tenantId) === keyIssuer;
    }
    if (keyIssuer.includes(TENANT_PLACEHOLDER)) {
      const tenantId = tenantIdFromIssuer(expectedIssuer);
      return Boolean(tenantId) && resolveIssuer(keyIssuer, tenantId) === expectedIssuer;
    }
    return false;
  } catch {
    return false;
  }
}

const TENANT_PLACEHOLDER = "{tenantid}";
const CONSUMER_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";
const TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeTrustedIssuerPattern(
  value: string | undefined,
  label: string
): string {
  if (!value) {
    throw new Error(`Microsoft identity ${label} URL is invalid.`);
  }
  const withoutPlaceholder = value.replace(TENANT_PLACEHOLDER, "");
  if (withoutPlaceholder.includes("{") || withoutPlaceholder.includes("}")) {
    throw new Error(`Microsoft identity ${label} URL is invalid.`);
  }
  const probe = value.replace(
    TENANT_PLACEHOLDER,
    "00000000-0000-0000-0000-000000000000"
  );
  trustedMicrosoftUrl(probe, label);
  return value.replace(/\/$/, "");
}

function resolveIssuer(issuer: string, tenantId: string | undefined): string {
  if (!issuer.includes(TENANT_PLACEHOLDER)) return issuer;
  if (!tenantId || !TENANT_ID_PATTERN.test(tenantId)) {
    throw new Error("Microsoft identity token issuer could not be verified.");
  }
  return issuer.replace(TENANT_PLACEHOLDER, tenantId);
}

function tenantIdFromIssuer(issuer: string): string | undefined {
  if (issuer.includes(TENANT_PLACEHOLDER)) return undefined;
  const tenantId = trustedMicrosoftUrl(issuer, "issuer").pathname
    .split("/")
    .filter(Boolean)[0];
  return tenantId && TENANT_ID_PATTERN.test(tenantId) ? tenantId : undefined;
}

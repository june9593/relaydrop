import { beforeAll, describe, expect, it, vi } from "vitest";
import { MicrosoftIdTokenVerifier } from "./MicrosoftIdTokenVerifier";

const CLIENT_ID = "11111111-2222-4333-8444-555555555555";
const AUTHORITY = "https://login.microsoftonline.com/consumers";
const NOW = Date.UTC(2026, 8, 5, 10, 0, 0);
const ISSUER =
  "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0";
const DISCOVERY_URL =
  "https://login.microsoftonline.com/consumers/v2.0/.well-known/openid-configuration";
const JWKS_URL = "https://login.microsoftonline.com/consumers/discovery/v2.0/keys";

let trustedKeys: CryptoKeyPair;
let attackerKeys: CryptoKeyPair;
type TestJwk = JsonWebKey & {
  alg: "RS256";
  cloud_instance_name?: string;
  kid: string;
  use: "sig";
  issuer?: string;
};

let trustedJwk: TestJwk;

beforeAll(async () => {
  trustedKeys = await generateSigningKeys();
  attackerKeys = await generateSigningKeys();
  trustedJwk = {
    ...(await crypto.subtle.exportKey("jwk", trustedKeys.publicKey)),
    alg: "RS256",
    cloud_instance_name: "microsoftonline.com",
    issuer: ISSUER,
    kid: "trusted-key",
    use: "sig"
  };
});

describe("MicrosoftIdTokenVerifier", () => {
  it("rejects an unsigned identity token before trusting its claims", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: AUTHORITY, clientId: CLIENT_ID },
      fetchImplementation,
      () => NOW
    );
    const token = createUnsignedIdToken({
      iss: "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
      aud: CLIENT_ID,
      exp: Math.floor(NOW / 1000) + 3600,
      nonce: "expected-nonce",
      sub: "account-id"
    });

    await expect(verifier.verify(token, "expected-nonce")).rejects.toThrow(
      "signing algorithm"
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects a token whose signature does not match the Microsoft signing key", async () => {
    const fetchImplementation = createMetadataFetch([trustedJwk]);
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: AUTHORITY, clientId: CLIENT_ID },
      fetchImplementation,
      () => NOW
    );
    const token = await createSignedIdToken(
      {
        iss: ISSUER,
        aud: CLIENT_ID,
        exp: Math.floor(NOW / 1000) + 3600,
        nonce: "expected-nonce",
        sub: "account-id"
      },
      attackerKeys.privateKey,
      "trusted-key"
    );

    await expect(verifier.verify(token, "expected-nonce")).rejects.toThrow(
      "signature could not be verified"
    );
    expect(fetchImplementation).toHaveBeenCalledWith(
      DISCOVERY_URL,
      expect.any(Object)
    );
    expect(fetchImplementation).toHaveBeenCalledWith(JWKS_URL, expect.any(Object));
  });

  it("rejects a correctly signed token from a different issuer", async () => {
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: AUTHORITY, clientId: CLIENT_ID },
      createMetadataFetch([trustedJwk]),
      () => NOW
    );
    const token = await createSignedIdToken(
      {
        iss: "https://login.microsoftonline.com/organizations/v2.0",
        tid: "9188040d-6c67-4c5b-b112-36a304b66dad",
        aud: CLIENT_ID,
        exp: Math.floor(NOW / 1000) + 3600,
        nonce: "expected-nonce",
        sub: "account-id"
      },
      trustedKeys.privateKey,
      "trusted-key"
    );

    await expect(verifier.verify(token, "expected-nonce")).rejects.toThrow(
      "issuer could not be verified"
    );
  });

  it("refreshes Microsoft signing keys once when a new kid appears", async () => {
    let jwksRequests = 0;
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === DISCOVERY_URL) {
        return jsonResponse({
          issuer: ISSUER,
          jwks_uri: JWKS_URL,
          id_token_signing_alg_values_supported: ["RS256"]
        });
      }
      if (url === JWKS_URL) {
        jwksRequests += 1;
        return jsonResponse({ keys: jwksRequests === 1 ? [] : [trustedJwk] });
      }
      throw new Error("Unexpected request: " + url);
    });
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: AUTHORITY, clientId: CLIENT_ID },
      fetchImplementation,
      () => NOW
    );
    const token = await createSignedIdToken(
      validClaims(),
      trustedKeys.privateKey,
      "trusted-key"
    );

    await expect(verifier.verify(token, "expected-nonce")).resolves.toMatchObject({
      iss: ISSUER,
      aud: CLIENT_ID,
      sub: "account-id"
    });
    expect(jwksRequests).toBe(2);
    const jwksCalls = fetchImplementation.mock.calls.filter(
      ([input]) => String(input) === JWKS_URL
    );
    expect(jwksCalls[1]?.[1]).toMatchObject({ cache: "reload" });
  });

  it("rejects an unknown kid after one JWKS refresh", async () => {
    const fetchImplementation = createMetadataFetch([]);
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: AUTHORITY, clientId: CLIENT_ID },
      fetchImplementation,
      () => NOW
    );
    const token = await createSignedIdToken(
      validClaims(),
      trustedKeys.privateKey,
      "not-published"
    );

    await expect(verifier.verify(token, "expected-nonce")).rejects.toThrow(
      "signing key is unknown"
    );
    expect(
      fetchImplementation.mock.calls.filter(([input]) => String(input) === JWKS_URL)
    ).toHaveLength(2);
  });

  it("never loads discovery metadata from a non-Microsoft authority", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: "https://identity.example/consumers", clientId: CLIENT_ID },
      fetchImplementation,
      () => NOW
    );
    const token = await createSignedIdToken(
      validClaims(),
      trustedKeys.privateKey,
      "trusted-key"
    );

    await expect(verifier.verify(token, "expected-nonce")).rejects.toThrow(
      "authority URL is not trusted"
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("never follows a JWKS URL outside login.microsoftonline.com", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === DISCOVERY_URL) {
        return jsonResponse({
          issuer: ISSUER,
          jwks_uri: "https://keys.example/microsoft.json",
          id_token_signing_alg_values_supported: ["RS256"]
        });
      }
      throw new Error("The untrusted JWKS URL was fetched: " + url);
    });
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: AUTHORITY, clientId: CLIENT_ID },
      fetchImplementation,
      () => NOW
    );
    const token = await createSignedIdToken(
      validClaims(),
      trustedKeys.privateKey,
      "trusted-key"
    );

    await expect(verifier.verify(token, "expected-nonce")).rejects.toThrow(
      "JWKS URL is not trusted"
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("rejects discovery metadata with an issuer outside login.microsoftonline.com", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === DISCOVERY_URL) {
        return jsonResponse({
          issuer: "https://issuer.example/consumers/v2.0",
          jwks_uri: JWKS_URL,
          id_token_signing_alg_values_supported: ["RS256"]
        });
      }
      throw new Error("Unexpected request: " + url);
    });
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: AUTHORITY, clientId: CLIENT_ID },
      fetchImplementation,
      () => NOW
    );
    const token = await createSignedIdToken(
      validClaims(),
      trustedKeys.privateKey,
      "trusted-key"
    );

    await expect(verifier.verify(token, "expected-nonce")).rejects.toThrow(
      "issuer URL is not trusted"
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("checks the nonce only after the token signature and issuer are valid", async () => {
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: AUTHORITY, clientId: CLIENT_ID },
      createMetadataFetch([trustedJwk]),
      () => NOW
    );
    const token = await createSignedIdToken(
      { ...validClaims(), nonce: "wrong-nonce" },
      trustedKeys.privateKey,
      "trusted-key"
    );

    await expect(verifier.verify(token, "expected-nonce")).rejects.toThrow(
      "nonce could not be verified"
    );
  });

  it("rejects a signed token issued for another application", async () => {
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: AUTHORITY, clientId: CLIENT_ID },
      createMetadataFetch([trustedJwk]),
      () => NOW
    );
    const token = await createSignedIdToken(
      { ...validClaims(), aud: "another-client" },
      trustedKeys.privateKey,
      "trusted-key"
    );

    await expect(verifier.verify(token, "expected-nonce")).rejects.toThrow(
      "audience could not be verified"
    );
  });

  it("requires azp to identify RelayDrop when an ID token has multiple audiences", async () => {
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: AUTHORITY, clientId: CLIENT_ID },
      createMetadataFetch([trustedJwk]),
      () => NOW
    );
    const token = await createSignedIdToken(
      { ...validClaims(), aud: [CLIENT_ID, "another-client"], azp: "another-client" },
      trustedKeys.privateKey,
      "trusted-key"
    );

    await expect(verifier.verify(token, "expected-nonce")).rejects.toThrow(
      "authorized party could not be verified"
    );
  });

  it("rejects an expired signed token", async () => {
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: AUTHORITY, clientId: CLIENT_ID },
      createMetadataFetch([trustedJwk]),
      () => NOW
    );
    const token = await createSignedIdToken(
      { ...validClaims(), exp: Math.floor(NOW / 1000) },
      trustedKeys.privateKey,
      "trusted-key"
    );

    await expect(verifier.verify(token, "expected-nonce")).rejects.toThrow(
      "has expired"
    );
  });

  it("does not use a signing key scoped to a different issuer", async () => {
    const wrongIssuerKey: TestJwk = {
      ...trustedJwk,
      issuer: "https://login.microsoftonline.com/organizations/v2.0"
    };
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: AUTHORITY, clientId: CLIENT_ID },
      createMetadataFetch([wrongIssuerKey]),
      () => NOW
    );
    const token = await createSignedIdToken(
      validClaims(),
      trustedKeys.privateKey,
      "trusted-key"
    );

    await expect(verifier.verify(token, "expected-nonce")).rejects.toThrow(
      "signing key is unknown"
    );
  });

  it("resolves a Microsoft tenant issuer template with the signed tid claim", async () => {
    const issuerTemplate = "https://login.microsoftonline.com/{tenantid}/v2.0";
    const templateKey: TestJwk = { ...trustedJwk, issuer: issuerTemplate };
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === DISCOVERY_URL) {
        return jsonResponse({
          issuer: issuerTemplate,
          jwks_uri: JWKS_URL,
          id_token_signing_alg_values_supported: ["RS256"]
        });
      }
      if (url === JWKS_URL) return jsonResponse({ keys: [templateKey] });
      throw new Error("Unexpected request: " + url);
    });
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: AUTHORITY, clientId: CLIENT_ID },
      fetchImplementation,
      () => NOW
    );
    const token = await createSignedIdToken(
      validClaims(),
      trustedKeys.privateKey,
      "trusted-key"
    );

    await expect(verifier.verify(token, "expected-nonce")).resolves.toMatchObject({
      iss: ISSUER,
      tid: "9188040d-6c67-4c5b-b112-36a304b66dad"
    });
  });

  it("rejects a signed organizational tenant token even with issuer-template metadata", async () => {
    const issuerTemplate = "https://login.microsoftonline.com/{tenantid}/v2.0";
    const templateKey: TestJwk = { ...trustedJwk, issuer: issuerTemplate };
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === DISCOVERY_URL) {
        return jsonResponse({
          issuer: issuerTemplate,
          jwks_uri: JWKS_URL,
          id_token_signing_alg_values_supported: ["RS256"]
        });
      }
      if (url === JWKS_URL) return jsonResponse({ keys: [templateKey] });
      throw new Error("Unexpected request: " + url);
    });
    const verifier = new MicrosoftIdTokenVerifier(
      { authority: AUTHORITY, clientId: CLIENT_ID },
      fetchImplementation,
      () => NOW
    );
    const organizationTenant = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const token = await createSignedIdToken(
      {
        ...validClaims(),
        iss: `https://login.microsoftonline.com/${organizationTenant}/v2.0`,
        tid: organizationTenant
      },
      trustedKeys.privateKey,
      "trusted-key"
    );

    await expect(verifier.verify(token, "expected-nonce")).rejects.toThrow(
      "tenant could not be verified"
    );
  });
});

function validClaims(): Record<string, unknown> {
  return {
    iss: ISSUER,
    aud: CLIENT_ID,
    exp: Math.floor(NOW / 1000) + 3600,
    nonce: "expected-nonce",
    sub: "account-id",
    tid: "9188040d-6c67-4c5b-b112-36a304b66dad"
  };
}

function createMetadataFetch(keys: TestJwk[]) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === DISCOVERY_URL) {
      return jsonResponse({
        issuer: ISSUER,
        jwks_uri: JWKS_URL,
        id_token_signing_alg_values_supported: ["RS256"]
      });
    }
    if (url === JWKS_URL) return jsonResponse({ keys });
    throw new Error("Unexpected request: " + url);
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

async function generateSigningKeys(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );
}

async function createSignedIdToken(
  claims: Record<string, unknown>,
  privateKey: CryptoKey,
  kid: string
): Promise<string> {
  const header = encodeBase64Url({ alg: "RS256", kid, typ: "JWT" });
  const payload = encodeBase64Url(claims);
  const signingInput = header + "." + payload;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
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

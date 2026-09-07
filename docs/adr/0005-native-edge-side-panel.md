# ADR-0005: Build a native Edge side-panel companion

- Status: Accepted
- Date: 2026-09-05

## Context

RelayDrop's hosted PWA works across phone and desktop, but the original Edge Drop workflow was available without leaving the current browser page. Edge exposes a Manifest V3 Side Panel API that can host extension-owned HTML alongside normal tabs.

Embedding the hosted PWA in an iframe would couple the extension to framing policy, third-party cookie behavior, and web-origin MSAL storage. It would also make extension review and failure recovery harder to reason about.

## Decision

Build a native Edge side-panel extension that bundles its own React entry point and reuses RelayDrop's existing domain, repository, Graph, and interface components.

The PWA keeps using MSAL. The extension uses `chrome.identity.launchWebAuthFlow` with Authorization Code flow and PKCE, because Edge does not provide a Microsoft Graph token through `identity.getAuthToken`.

Before accepting the result, the extension validates the ID token with Microsoft consumers OIDC discovery and JWKS: RS256 signature, signing-key issuer, fixed personal-account tenant, token issuer, nonce, audience, authorized party, and expiry. Discovery and key URLs are restricted to HTTPS on `login.microsoftonline.com`, and an unknown `kid` causes one forced JWKS refresh for key rollover.

The first extension version stores access tokens only in `chrome.storage.session`. It keeps a non-sensitive account hint and an explicit-disconnect flag in trusted `chrome.storage.local` storage, then relies on the Microsoft web session for non-interactive renewal. Authentication work is scoped to a shared epoch so logout and account switches invalidate obsolete panel requests and notifications. No client secret, content script, refresh token, or remote executable code is included.

The extension uses the same Microsoft application client ID and the same OneDrive App Folder as the PWA. Its exact `https://<extension-id>.chromiumapp.org/oauth2` callback is registered as an additional SPA redirect URI.

## Consequences

- Phone and web users continue to use the PWA with no migration.
- Desktop Edge users receive a browser-native sidebar workflow.
- OneDrive data and repository behavior remain shared, while authentication caches remain origin-specific.
- The extension requires a separate build, sideload test, redirect URI, store package, privacy disclosure, and release process.
- A browser restart may require a silent Microsoft web-session round trip; if that session is unavailable, the user reconnects explicitly.
- A future content script or broader browser integration requires a new permission and threat-model review.

ADR-0006 extends the side panel's device-local state with a bounded account-scoped feed snapshot, refresh settings, and a refresh gate. Access tokens remain session-only as decided here.

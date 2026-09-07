# ADR-0003: Authenticate personal Microsoft accounts in the browser

- Status: Superseded by ADR-0004
- Date: 2026-09-04

## Context

The first RelayDrop deployment is for a personal Microsoft account. The application is a static PWA and should not operate an authentication backend or store a client secret.

## Decision

Use Microsoft Authentication Library for browser applications with:

- Authorization Code flow with PKCE
- redirect-based sign-in
- the consumers authority
- sessionStorage token caching
- delegated Files.ReadWrite.AppFolder access
- no client secret

When no Microsoft client ID is configured, the application runs in an explicitly labeled in-memory demo mode.

## Consequences

Positive:

- Sign-in works with the user's personal Microsoft account.
- No authentication server is required.
- Tokens remain session-scoped.
- The same repository can be deployed as static files.

Negative:

- An application registration and exact redirect URIs are required.
- Work and school accounts are not supported by the first configuration.
- Redirect authentication interrupts the current page and must recover cleanly.
- Browser security and static-host integrity remain part of the trust boundary.

## Follow-up

Validate the registration and consent flow with the intended personal Microsoft account before treating the OneDrive milestone as complete.

The session-scoped cache decision was replaced after production use showed that requiring a fresh app sign-in for every new tab was too disruptive for a personal transfer utility.

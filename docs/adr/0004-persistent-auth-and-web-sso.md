# ADR-0004: Persist authentication and reuse Microsoft web sessions

- Status: Accepted
- Date: 2026-09-05
- Supersedes: ADR-0003 cache-lifetime decision

## Context

Production use showed that a sessionStorage-only MSAL cache requires the user to authenticate again after closing a tab or browser window. RelayDrop is a personal utility that users expect to reopen quickly across devices.

The browser may also already have a personal Microsoft web session. RelayDrop should reuse that session when possible without assuming that an Edge profile identity is automatically available to an arbitrary website.

## Decision

- Store the MSAL durable account and token cache in localStorage.
- Keep temporary authorization-flow state in sessionStorage.
- Recover a cached account during application initialization.
- When no cached account exists, attempt `ssoSilent` through a dedicated same-origin `/auth/silent.html` callback.
- Treat silent SSO as opportunistic: failure returns to the explicit sign-in screen without an error loop.
- Do not force `prompt=select_account` for ordinary sign-in. Microsoft may reuse an existing web session or show its account chooser when needed.
- Keep the app personal-account-only and continue using the `consumers` authority.

## Consequences

Positive:

- Authentication survives tab closure and normal browser restarts while site data remains available.
- Separate RelayDrop tabs share the same authenticated account.
- An existing Microsoft web session can often complete sign-in without a password.
- Users with multiple Microsoft sessions may still be asked which account to use.

Negative:

- Authentication artifacts persist longer on the device, increasing the importance of device security, explicit sign-out, CSP, and trusted static hosting.
- Silent SSO can fail when third-party cookies are blocked or the Microsoft session has expired.
- Edge profile sign-in alone does not guarantee SSO for personal Microsoft accounts; this web app cannot directly consume the browser profile identity.

## Registration and hosting requirements

- Register `/auth/silent.html` as an exact SPA redirect URI for every deployed origin.
- Serve the callback as a minimal static page.
- Allow only that route to be framed by the same origin; the rest of RelayDrop remains protected by `frame-ancestors 'none'` and `X-Frame-Options: DENY`.

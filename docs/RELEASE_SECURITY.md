# Release security checklist

Run this checklist before publishing the repository, deploying a production
build, or uploading an extension package to a browser store.

## Automated gate

Run:

    pnpm release:check

This performs TypeScript checks, tests, both production builds, a tracked-file
privacy scan, extension permission/CSP checks, static-host header checks, and a
scan of generated build output.

Before making the repository public, also run:

    RELAYDROP_PRIVATE_TERMS="your-legal-name,private-alias" pnpm security:check:history

That command must pass from a fresh clone. Removing sensitive text from the
current branch is insufficient when it remains in commits, other branches,
tags, releases, Actions artifacts, or forks.

Run a production dependency advisory check separately because it requires
network access:

    pnpm audit --prod --audit-level high

## Repository and release controls

- Use a verified GitHub noreply address for every commit.
- Keep local `.env*`, browser profiles, screenshots, recordings, and agent
  scratch files untracked.
- Generate `pnpm-lock.yaml` against the public npm registry; do not publish
  company package-feed URLs or credentials.
- Store the Static Web Apps deployment token and build-time OAuth identifier in
  GitHub Actions secrets, never as literal workflow values.
- Require review/status checks on `main` before public collaboration begins.
- Protect the GitHub account and production environment with MFA or passkeys.
- Pin third-party GitHub Actions to reviewed commit SHAs before store release.
- Inspect the exact ZIP that will be uploaded and verify that it contains no
  `.env`, source maps, development fixtures, personal data, or remote code.
- Keep third-party license notices in both distributions. Run
  `pnpm notices:generate` after dependency updates; `pnpm release:check` verifies
  that these notices still match the installed dependencies.
- Generate the store ZIP with `pnpm package:extension:store`. The development
  manifest key must be omitted from the uploaded archive.

## Microsoft identity

- Treat the OAuth Client ID as a public identifier. A browser application cannot
  hide it and must never use a client secret.
- Allow only the intended account audience.
- Register exact HTTPS PWA and `chromiumapp.org` extension redirect URIs.
- Use a separate development registration, or remove localhost callbacks from
  the production registration before release.
- Keep implicit grant disabled and use Authorization Code flow with PKCE.
- Confirm the extension rejects unsigned, incorrectly signed, wrong-issuer,
  wrong-tenant, wrong-audience, wrong-authorized-party, wrong-nonce, and expired
  ID tokens, and refreshes Microsoft JWKS once when a previously unknown
  signing-key ID appears.
- Verify that delegated consent is limited to `Files.ReadWrite.AppFolder` plus
  the identity scopes required for sign-in.
- Recheck redirect URIs, credentials, publisher information, and consent using
  the personal tenant context before every store submission.

## Extension package

- Review every manifest permission and host permission against the store copy.
- Keep all executable JavaScript and fonts inside the package.
- Confirm that access tokens remain in `chrome.storage.session` and that logout
  clears authentication and the recent-item cache.
- Test install, update, login, account switching, restart, refresh, preview,
  download, local deletion, remote deletion, logout, and uninstall.
- Publish this repository's privacy policy at a stable public HTTPS URL.
- Resolve or explicitly document any open security-review findings before upload.
- Retest the attack cases recorded in `SECURITY_REVIEW_2026-09-07.md` against the
  exact ZIP that will be uploaded.
- Verify that GitHub Private Vulnerability Reporting is enabled in the public
  `relaydrop-support` repository and that the maintainer receives security-report
  notifications. Verify the policy, support, and `security.txt` links without a
  logged-in collaborator session before announcing the release. The application
  source repository does not need to become public.

## Hosted PWA and domain

- The site has no RelayDrop password endpoint to brute-force; Microsoft identity
  owns account authentication.
- Monitor hosting bandwidth/quota and deployment changes. Add a WAF or rate
  limiting only if abuse or a future server-side API makes it necessary.
- Protect the registrar, DNS provider, Azure account, and GitHub deployment path
  with MFA/passkeys.
- Avoid dangling custom-domain CNAME records when changing or deleting the host.
- Keep `/auth/silent.html` out of the service-worker cache and serve it with
  `Cache-Control: no-store`.

# RelayDrop security

## Security objective

RelayDrop should move private personal content between a user's devices while minimizing the systems and permissions that can access that content.

The MVP relies on Microsoft identity and OneDrive security. It does not claim independent end-to-end encryption.

## Trust boundaries

Trusted for the MVP:

- The user's devices and browser profiles
- Microsoft identity platform
- Microsoft Graph
- The user's OneDrive
- The static application build delivered by the configured host

Not trusted:

- Arbitrary feed descriptors manually placed in the app folder
- File names, media types, and file content
- Redirect parameters or deep links
- Browser extensions unrelated to RelayDrop

## Permission model

RelayDrop requests Files.ReadWrite.AppFolder instead of broad OneDrive access. This allows read and write operations only within the application's dedicated folder.

The user retains full control over the folder and may inspect, edit, move, or delete its contents. RelayDrop must tolerate those changes.

The OneDrive status surface reads only the App Folder drive item's `size` and `webUrl`, which are available through Files.ReadWrite.AppFolder. RelayDrop does not query full-account quota because `/me/drive` quota access requires the broader Files.Read permission.

## PWA browser application rules

- Use Authorization Code flow with PKCE.
- Use the consumers authority for the personal-account MVP.
- Do not use or ship a client secret.
- Do not commit access tokens, refresh tokens, tenant identifiers intended to be private, or deployment credentials.
- Store durable MSAL authentication state in localStorage so the personal utility survives tab closure; keep temporary authorization-flow state in sessionStorage.
- Clear the app's MSAL cache through explicit sign-out and do not persist RelayDrop feed contents or file bodies alongside it.
- Treat silent SSO as opportunistic and keep its callback page script-free and same-origin-frame-only.
- Configure exact redirect URIs.
- Apply a restrictive Content Security Policy.
- Avoid unsafe HTML rendering.
- Render text as text, not executable markup.
- Revoke object URLs after previews and downloads.
- Keep parsed text, links, and file metadata in memory rather than persistent application storage.
- Treat the locally stored Light/Dark appearance value as non-sensitive UI preference data.
- Key any permitted local identifiers and ETags by Microsoft account and clear them on sign-out.

## Edge extension rules

- Use a native Manifest V3 side panel rather than framing the hosted PWA.
- Use `chrome.identity.launchWebAuthFlow` with Authorization Code flow and PKCE.
- Register the exact browser-provided `chromiumapp.org` redirect URI and never ship a client secret.
- Verify every returned ID token with Web Crypto before creating a session: accept RS256 only, load discovery and JWKS only from HTTPS on `login.microsoftonline.com`, verify the Microsoft signing key, fixed personal-account tenant, and issuer, then enforce nonce, audience, authorized party, and expiry. Refresh JWKS once for an unknown `kid` to support Microsoft key rollover.
- Mark sessions created after full ID-token verification and silently renew older cached sessions instead of trusting them across an extension upgrade.
- Keep access tokens in `chrome.storage.session`; keep non-token account hints, disconnect state, sync settings, and the bounded feed snapshot in `chrome.storage.local`.
- Decode ID-token claims as UTF-8 before displaying or caching account names.
- Keep the quick-start feed snapshot in account-scoped `chrome.storage.local` keys, validate it on every load, and cap it at 50 items.
- Treat the snapshot as private local content: it may include note and link text plus file display name, size, and media type.
- Never put tokens, file bodies, thumbnail bytes, Blob URLs, preauthenticated OneDrive URLs, or temporary preview/download URLs in the feed snapshot.
- Keep account-scoped refresh settings, short refresh lease, and last-success marker separate from authentication tokens.
- Rotate an account-scoped cache generation and independently remove the feed snapshot and refresh state during Log out, so stale in-flight or second-panel writes are rejected even if one storage operation fails.
- Run automatic refresh only while the side panel is open and visible, using the two-minute open cooldown and five-minute visible interval; do not add a background worker solely for polling.
- Bind every session token to a shared authentication epoch so Disconnect invalidates other open side panels and in-flight older sign-ins.
- Scope shared silent-token requests and account notifications to that authentication epoch so obsolete work cannot return a logged-out token or clear a newer account's state.
- Require silent token renewal to return the same Microsoft account ID; switching accounts always requires an interactive sign-in.
- On a Microsoft Graph 401 response, discard the cached access token and retry once with a forced token renewal.
- Attach Graph bearer tokens only to the exact `https://graph.microsoft.com/v1.0` origin and path namespace.
- Restrict extension storage to trusted contexts and do not add content scripts without a new threat-model review.
- Do not request tab, history, active-page, native-messaging, or local-file URL access for the core workflow.
- Restrict the `downloads` permission to user-initiated saves, status checks, Show in Folder, and explicit local-copy deletion under the `RelayDrop/` download directory. Use the separate `downloads.open` permission only for an explicit Open local action; neither permission grants arbitrary file-content reads.
- Do not request Files.Read merely to display full OneDrive quota; expose accurately labeled App Folder size and `webUrl` instead.
- Bundle all executable code and fonts in the extension package.
- Treat Log out as clearing RelayDrop credentials and its current-account feed cache, not as signing the user out of every Microsoft website.
- Treat the configured mobile PWA URL as untrusted build input: accept HTTPS only, except for explicit localhost development, and reject embedded credentials.

## File handling

- Treat file names and MIME types as untrusted.
- Resolve deletion targets through the deterministic `blobs/<item-id>/` folder and verify the file's parent and storage name before deleting it.
- Apply the same deterministic parent, name, ID, and size binding before previewing or downloading a referenced file.
- Sanitize storage names while preserving a separate display name.
- Enforce the configured size limit before upload where the browser exposes size.
- Limit the MVP to 100 MB and calculate SHA-256 before publication.
- Bound descriptor documents and fields before parsing or rendering, cap Graph pagination, and reject pagination loops.
- Stream downloads and retry-reused blobs through the declared size and 100 MB bounds, then require both exact length and SHA-256 equality before use.
- Reject bidirectional and zero-width file-name controls that can disguise the effective extension.
- Never execute uploaded content.
- Preview only formats that can be handled safely by the browser.
- Prefer thumbnail bytes fetched through the authenticated Microsoft Graph endpoint and render a short-lived local Blob URL.
- If the thumbnail-content redirect cannot be fetched, use Graph's preauthenticated thumbnail URL only for the current in-memory session and fall back again to the original image or file artwork on load failure.
- Allow the Microsoft thumbnail transform host family `*.svc.ms` only for image rendering and the thumbnail-content redirect; no script execution is allowed from that domain.
- Treat OneDrive preview/download URLs as short-lived and never persist them; refresh metadata after a page refresh or media failure.
- Open unsupported formats in OneDrive first; the browser or operating system can then offer its normal download or native-app path.
- Recheck device-local download state before Open local, and refuse direct opening when the file extension can contain executable or active content or when the browser marks the download as dangerous.
- Do not persist file bodies in the service worker cache.
- Treat upload cancellation as best-effort. Never publish the descriptor after cancellation; reuse and verify any orphan blob on an explicit retry.
- Downloaded files remain under the user's operating-system and browser controls after RelayDrop logout. The extension stores only the account-scoped RelayDrop item ID, browser download ID, and display name needed to restore status.

## Feed descriptor validation

Every descriptor is validated before rendering:

- Supported schema version
- Valid UUID
- Feed filename exactly equal to `<descriptor-id>.json`
- Valid UTC timestamp
- Known item type
- Maximum text length
- Required file metadata for file-backed items
- HTTP or HTTPS scheme for link items
- No unexpected executable markup

Malformed descriptors are skipped and surfaced to the user without breaking the rest of the feed.

## Deletion semantics

Deleting an item through RelayDrop removes its descriptor and associated blob from the app folder. OneDrive recycle-bin, retention, backup, or organizational policies may preserve recoverable copies. The interface must not describe deletion as guaranteed secure erasure.

## Known limitations

- A compromised Microsoft account can access RelayDrop content.
- A compromised device or browser session can access content available to that session.
- A person or extension process with access to the same Edge profile can read the side panel's device-local cached note/link text and file metadata even while offline.
- Microsoft and organizational administrators may have access according to applicable account policies.
- OneDrive content is not additionally encrypted with a RelayDrop-only key.
- Static-host compromise could deliver malicious client code and must be mitigated through deployment controls.
- Hashing and validating a file near the 100 MB product limit can temporarily use several copies of that data in browser memory, especially on mobile devices.

## Security work required before public release or store submission

- Run the automated source, manifest, CSP, header, and build-output checks in `pnpm release:check`.
- Run `pnpm security:check:history` from a fresh clone and resolve every finding before changing repository visibility.
- Run `pnpm audit --prod --audit-level high` with network access.
- Review the exact packaged extension, permissions, privacy policy, and store disclosure text.
- Verify service-worker update/cache isolation plus multi-account sign-out and local-state clearing.
- Independently review the Microsoft identity registration, including exact redirect URIs, account audience, credentials, and delegated permissions.
- Keep GitHub Private Vulnerability Reporting enabled in the dedicated public `relaydrop-support` repository; verify access and maintainer notification settings before release.
- Review [the September 2026 adversarial security assessment](SECURITY_REVIEW_2026-09-07.md) and retest its attack cases against the exact release package.
- Follow the complete checklist in [RELEASE_SECURITY.md](RELEASE_SECURITY.md).

## Future security work

- Optional client-side encryption with a documented key-recovery model

## Reporting

The public reporting route is GitHub Private Vulnerability Reporting in the dedicated public `relaydrop-support` repository, linked from the root security policy, support page, and `/.well-known/security.txt`. A GitHub account is required to file a report. The application source repository can remain private. Sensitive user content must never be posted in a public issue.

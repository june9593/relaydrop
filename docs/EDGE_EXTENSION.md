# RelayDrop for Microsoft Edge

RelayDrop uses a native Manifest V3 side panel on desktop Microsoft Edge and an
extension-owned full-page view on Android. Both use the same authentication,
durable cache, downloads, and OneDrive App Folder implementation.

Version 0.6.0 is authorized for publication. Android Edge 151 device acceptance
will follow the store update at the owner's request and is not yet recorded.

## What the extension does

- Opens RelayDrop in the Edge sidebar from the toolbar action.
- Signs in to a personal Microsoft account through Microsoft identity.
- Reads and writes only RelayDrop's OneDrive App Folder.
- Sends notes and selected files from the desktop browser.
- Accepts pasted clipboard images or files, previews selected images, and reports real upload progress with Cancel and Retry.
- Refreshes, previews, downloads, and deletes the same items shown by the PWA.
- Restores recent cached cards immediately, then refreshes from OneDrive in the foreground when due.
- Shows a profile menu with the current Microsoft account, Settings, and Log out.
- Shows RelayDrop App Folder usage and opens that folder in OneDrive for management.
- Saves downloads under `Downloads/RelayDrop`, reconciles their device-local status, and exposes Open local, Show in Folder, and Delete local actions.
- Offers a persistent Light/Dark appearance setting without showing browser-specific branding in the product title.
- Shows Android setup guidance with the extension-store link and same-account instructions.

Android does not support `sidePanel`. The action opens an extension URL in a
normal tab instead, retaining extension storage and download APIs. It reuses
that tab when possible. The hosted web app is no longer the recommended phone
entry point. No extra browsing or host permissions are requested.

## Build

Requirements are the same as the PWA: Node.js 22 or newer and pnpm 10 or newer.

Create `.env.local` as described in [Azure setup](AZURE_SETUP.md), then run:

    pnpm install
    pnpm check:extension
    pnpm build:extension

The unpacked extension is written to:

    dist-extension/

The phone setup card uses the published extension-store URL; a hosted mobile
URL is no longer configured. The extension includes no PWA service worker or
remote executable code. The build requires `VITE_MICROSOFT_CLIENT_ID`.

## Load the developer build in Edge

1. Open `edge://extensions`.
2. Turn on Developer mode.
3. Select Load unpacked.
4. Choose the repository's `dist-extension` folder.
5. Copy the extension ID shown by Edge.
6. Register the matching Microsoft identity redirect URI before trying to sign in.

Developer builds include a fixed public manifest key, so the unpacked extension ID remains stable across folders and Edge profiles:

    jebklcjhbfnjajcpfahipgcahebmjkik

Confirm the ID in `edge://extensions` before login. Older developer packages without the fixed key use a path-derived ID, which changes when the unpacked folder is loaded from a different location; Microsoft rejects unregistered callbacks with `invalid_request` because `redirect_uri` does not match.

## Register the extension redirect URI

The extension obtains its callback from:

    chrome.identity.getRedirectURL("oauth2")

It has this form:

    https://<extension-id>.chromiumapp.org/oauth2

This is a virtual callback intercepted by Edge. It does not require a domain purchase, DNS record, web server, or TLS certificate.

In the existing RelayDrop app registration:

1. Open Authentication.
2. Edit the Single-page application platform.
3. Add the exact `chromiumapp.org` URI for the loaded extension.
4. Keep only the exact production PWA and extension redirect URIs required by the release. Use a separate development registration when practical instead of retaining localhost callbacks in production.
5. Save the application registration.

Do not add a client secret. RelayDrop uses Authorization Code flow with PKCE.

The Edge Add-ons package may receive a different final extension ID. Add its second exact redirect URI before publishing the production package.

The Edge Add-ons validator rejects the development manifest's `key` field. Use
`pnpm package:extension:store` (Python 3 is required) to create the store ZIP. This
removes `key` from the archive only, preserves the development build's stable ID,
and includes third-party license notices. Register the store-assigned callback
before certification; never assume it equals the sideload ID.

If Microsoft reports that `redirect_uri` is invalid, read the ID from the rejected `https://<id>.chromiumapp.org/oauth2` URL, confirm it matches `edge://extensions`, and append that exact URI to the SPA redirect list without removing the existing web callbacks.

## Authentication behavior

- Interactive login uses `chrome.identity.launchWebAuthFlow`.
- Startup restores a previously connected account's local inbox without waiting
  for Microsoft. This local account hint grants no network access. Token renewal
  uses a non-interactive Microsoft web-session flow before each needed remote request.
- A failed renewal keeps cached items visible with a Reconnect action. Explicit
  Log out still clears the account's cache and prevents automatic reconnect.
- Before creating a session, the extension verifies the ID token's RS256 signature through Microsoft consumers OIDC discovery and JWKS. Discovery, issuer, and key URLs are restricted to HTTPS on `login.microsoftonline.com`; the fixed personal-account tenant, nonce, audience, authorized party, expiry, and account-continuity checks remain mandatory. An unknown `kid` triggers one forced JWKS refresh for key rollover.
- Sessions created by older builds without the verification marker are silently renewed instead of reused.
- Access tokens are kept in `chrome.storage.session`, not synchronized between devices.
- Microsoft ID-token claims are decoded as UTF-8, so non-Latin account names render correctly. The current build also repairs account names stored by the earlier byte-decoding implementation.
- A non-sensitive account hint, explicit-disconnect preference, account-scoped settings, feed snapshot, and refresh gate are kept in `chrome.storage.local`.
- A shared authentication epoch invalidates cached tokens in every open side panel after Disconnect.
- Silent-token requests and account notifications are scoped to that epoch, so obsolete work cannot clear or replace a newer account's state.
- Silent renewal is accepted only when Microsoft returns the same account ID.
- The extension does not persist a refresh token in this first version.
- Log out clears the current account's feed snapshot and extension authentication state without signing the user out of Microsoft websites.
- After Disconnect, automatic SSO stays suppressed until the user explicitly reconnects.

The web app and extension use the same application client ID and OneDrive data, but their local authentication caches are separate.

## Appearance

The Light/Dark preference is stored in the extension origin's local storage and applied by a bundled bootstrap script before React starts, preventing a light-theme flash when the side panel reopens. The hosted PWA uses the same behavior in its own web origin; appearance is intentionally local rather than synchronized through OneDrive.

## Quick-start cache and refresh policy

The side panel keeps a versioned snapshot for each Microsoft account in device-local extension storage. It stores at most 50 validated feed items plus the total count, pagination cursor, and last successful refresh time. This lets the panel render useful content immediately while OneDrive remains the source of truth.

The snapshot contains the user-visible data required to rebuild feed cards, including note and link text and file display metadata. It does not contain Microsoft tokens, file bodies, thumbnail bytes, Blob URLs, preauthenticated OneDrive URLs, or temporary preview/download URLs. The snapshot and shared refresh state are removed when that account logs out. A cache-generation tombstone prevents in-flight work or another open panel from writing the logged-out snapshot back afterward. Logout independently attempts tombstone rotation and physical cache removal so one storage failure does not leave readable cached content behind.

Version 0.6.0 optionally stores OneDrive item IDs, version tags and last-modified
time alongside the existing snapshot fields. Old snapshots remain readable.
The newest directory page is fetched first; unchanged item bodies are reused.
Refresh preserves older cached cards and reconciles deletions in its observed
range. Load older requests additional history. Counts in the UI describe shown
items instead of forcing a full-folder scan. See ADR-0009.

Default foreground behavior:

- On open, check new items after a five-second cooldown, subject to the shared lease.
- While visible, check every 30 seconds. Returning to the page uses the open cooldown.
- Deduplicate overlapping refreshes, use a 15-second cross-panel lease while a request is in flight, and share the last successful refresh time across open panels.
- Let a failed or interrupted lease expire quickly instead of suppressing retries for the full open cooldown.
- Never poll while the panel is hidden or closed.
- Keep the manual Refresh command available at all times.

Settings lets the user disable “Refresh when opened” and “Refresh while open” independently. Cached cards may briefly be stale until the asynchronous OneDrive refresh completes.

## OneDrive App Folder status

The OneDrive card reads the RelayDrop App Folder drive item's aggregate `size` and `webUrl`. Selecting the card opens that folder in OneDrive, where the user can inspect or remove content. External edits are reconciled on a later RelayDrop refresh and remain subject to OneDrive recycle-bin behavior.

This is deliberately labeled as RelayDrop folder usage, not total OneDrive usage. Reading full-account quota from `/me/drive` requires the broader Files.Read permission, so the current extension does not request or display it. Failure to load this supplemental status never blocks the feed.

## Upload and local download behavior

Pasting a clipboard file into the composer switches to File mode and selects the first pasted file. Plain text paste remains unchanged. Selected images receive a local preview and can be removed before sending. Direct uploads report actual transferred bytes through XHR. Cancel is available during preparation, retry checks, and byte upload, but is disabled once descriptor publication begins. The progress animation stops immediately when cancellation starts. A cancelled transfer can leave an unpublished OneDrive blob; retry reuses the same transfer identity and creation time and verifies that blob before publishing, preventing duplicate feed entries.

Downloaded files use the browser Downloads API with a `RelayDrop/` relative path. RelayDrop stores the account-scoped browser download ID so it can distinguish Downloading, Complete, Interrupted, and Missing after the panel reopens. Feed refreshes trigger local existence checks, and delayed browser change events update the card when a file was removed outside RelayDrop. Before Open local, RelayDrop rechecks completion, existence, the current local name, and the browser's danger classification. Executable or active-content files are not opened directly; the user can reveal and inspect them in the operating system file manager instead. Completed safe files can be opened, revealed, or deleted locally without deleting the OneDrive item. Logout does not delete files already written to the device or the browser's download history.

## Permissions

| Permission | Purpose |
| --- | --- |
| `sidePanel` | Hosts the RelayDrop interface in Edge's sidebar. |
| `identity` | Runs Microsoft OAuth and receives the virtual callback. |
| `storage` | Stores the session token plus device-local account hints, sync settings, a bounded account-scoped feed snapshot, refresh timing state, and account-scoped browser download IDs. |
| `downloads` | Saves files under `Downloads/RelayDrop`, checks local status, reveals completed downloads, and deletes a selected local copy. |
| `downloads.open` | Opens a completed browser download directly after an explicit user action. |
| Microsoft Graph host access | Reads and writes the RelayDrop OneDrive App Folder. |
| Microsoft login host access | Exchanges the PKCE authorization code for an access token. |
| OneDrive media hosts | Loads authenticated file bytes and short-lived previews returned by Graph. |

RelayDrop does not request tabs, browsing history, active-page content, native messaging, or `file://` access. Edge's “Allow access to file URLs” switch is not required for choosing, pasting, uploading, or opening a downloaded file through RelayDrop.

The current OneDrive status card stays within Files.ReadWrite.AppFolder. Full-account quota would require Files.Read and is deferred unless a later privacy and consent review justifies that expansion.

## Store-readiness checklist

Before Microsoft Edge Add-ons submission:

- Obtain the production extension ID and register its redirect URI.
- Increment `manifest.json` version for every uploaded package.
- Verify permissions and host declarations against the final feature set.
- Publish a public HTTPS privacy policy explaining that content travels directly between the extension, Microsoft Graph, and the user's OneDrive.
- Verify GitHub Private Vulnerability Reporting in the public `relaydrop-support` repository, plus the published `security.txt` and support links. The source repository can remain private.
- Prepare store icon, screenshots, description, support contact, and reviewer test steps.
- Test install, update, sign-in, account switching, browser restart, preview, download, delete, and uninstall on the packaged build.
- Use `pnpm package:extension:store` so `manifest.json` is at the archive root and the development `key` field is omitted.
- Run the complete [release security checklist](RELEASE_SECURITY.md).

Microsoft Partner Center submission is intentionally a separate manual release step.

Version 0.5.2 passed owner sideload validation on September 7, 2026. Prepared
listing copy, privacy disclosures, screenshots, and certification instructions
are in [the submission kit](../release/edge-store/README.md).

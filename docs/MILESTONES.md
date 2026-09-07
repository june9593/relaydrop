# RelayDrop milestones

## v0.1 — Working cross-device foundation

Date: 2026-09-04

RelayDrop reached its first usable production milestone. The static PWA is deployed to Azure Static Web Apps and stores each user's content in that user's OneDrive App Folder.

Validated capabilities:

- Sign in with a personal Microsoft account through the production SPA.
- Grant only the delegated `Files.ReadWrite.AppFolder` permission.
- Create and retrieve text items across page reloads.
- Upload a file, retrieve its exact bytes through Microsoft Graph, and download it.
- Delete text and file items from the feed and OneDrive storage.
- Run the same responsive application on phone and desktop browsers.
- Deploy the private GitHub repository automatically from `main`.

The production PWA address is configured privately at deployment time.

The file experience has since gained distinct file artwork, image and video previews, browser-first opening, deletion, and paginated feed loading.

## Daily-use Edge side panel

Status: User-validated and approved for merge on 2026-09-06

Target capabilities:

- Render personal Microsoft account names correctly across Unicode scripts.
- Replace the one-click avatar logout with a profile menu containing account details, Settings, and Log out.
- Restore a bounded account-scoped feed snapshot immediately on open.
- Refresh after a two-minute open cooldown and every five minutes while the panel is visible, with both behaviors configurable.
- Clear the feed snapshot when the current account logs out.
- Show RelayDrop App Folder size and a OneDrive management link without adding Files.Read.
- Fit narrow and wide Edge side-panel widths without page-level horizontal scrolling; constrain long notes to an internal scroll region.

The owner validated the packaged side-panel experience and approved this milestone for `main`. Broader offline, multi-account, security, and packaged-update scenarios remain part of hardening.

## Next milestone — Transfer controls and reliability

Status: Owner-validated in 0.4.1, and included in the accepted 0.5.2 package

- Accept pasted images and files, preview selected images, and allow clearing the selection.
- Add real upload progress, cancellation, and an explicit retry interface.
- Report partial deletion failures by step and provide a safe retry path.
- Use a dedicated `Downloads/RelayDrop` directory with existence reconciliation, duplicate-download protection, Open, Show in Folder, and Delete local actions.

## v0.5.1 — Dark appearance, mobile guidance, and release hardening

Status: Owner-validated as part of the 0.5.2 package on 2026-09-07

- Add a Light/Dark preference to Settings in both the hosted PWA and extension and remember it locally per browser surface.
- Apply the selected theme before the React interface mounts and across dialogs, media previews, and transfer/error states.
- Remove the Edge suffix from the product header so the extension remains browser-neutral.
- Add side-panel guidance for opening the hosted PWA on a phone with the same account.
- Add repeatable source, manifest, CSP, header, build-output, dependency, and Git-history security checks.

Full-account OneDrive quota is deferred because it requires the broader Files.Read permission. Microsoft Edge Add-ons submission remains the final release step.

## v0.5.2 — Adversarial security hardening

Status: Packaged owner validation passed on 2026-09-07; store submission preparation in progress

- Verify extension ID tokens with Microsoft discovery/JWKS, RS256 signatures, the personal-account tenant, issuer, nonce, audience, authorized party, and expiry.
- Reject untrusted authority configuration and untrusted Graph presentation URLs.
- Close logout, account-switch, silent-token, and cached-account publication races across side panels.
- Enforce descriptor, pagination, retry-delay, download, and retry-reuse bounds; verify downloaded bytes with exact length and SHA-256.
- Harden file names, cached links, local-cache clearing, and direct opening of active-content downloads.
- Publish privacy, support, security-policy, and `security.txt` surfaces without embedding private deployment or personal identifiers.
- Record the authorized independent red-team exercise and release residual risks.

The owner reported no issues after testing the 0.5.2 package. This acceptance
does not establish a separate 100 MB low-memory mobile stress result or validate
the future store-assigned extension ID. Those checks remain distinct release
items. Submission copy, reviewer instructions, and the remaining gates are in
[the store submission kit](../release/edge-store/README.md).

## v0.5.3 — Open-source distribution

- License RelayDrop under MIT and retain third-party license texts in both builds.
- Generate separate Edge Add-ons and developer sideload archives. The store
  archive omits the developer-only manifest key.
- Keep executable assets identical to the owner-validated 0.5.2 build.
- Add checks for contributions that run without deployment credentials.
- Publish source from a clean release snapshot without importing private history.

# RelayDrop product specification

## Summary

RelayDrop moves text and files between a user's own devices through the same
personal Microsoft account. The extension uses a desktop sidebar and an Android
extension page. It restores a device-local snapshot before network authentication
and checks the newest items first. The older web build remains compatible but
is no longer the advertised mobile workflow. See ADR-0009 for the 0.6.0 decision.

## Problem

Edge Drop provided a low-friction place to send notes and files to oneself across Edge clients. Its removal leaves a gap between heavyweight messaging applications, general-purpose cloud drives, and platform-specific sharing tools.

Cloud drives can already hold files, but they do not provide a compact chronological feed for mixed text, links, images, and files. Messaging applications provide that feed, but using a chat service solely to move personal content adds unrelated concepts and dependencies.

## Target user

The first user is a person who regularly switches between a phone and one or more computers and wants a private, account-backed transfer surface.

The initial repository optimizes for personal use. The architecture should not prevent additional users from signing into their own isolated OneDrive-backed feeds, but social or collaborative messaging is not a goal.

## Product principles

1. One feed, not a chat system.
2. Content belongs in the user's storage account.
3. Synchronization is understandable: manual in the PWA and bounded, configurable, and foreground-only in the Edge side panel.
4. The smallest useful cross-platform surface comes first.
5. Permissions should be narrower than general OneDrive access.

## Core user journeys

### Send from phone to computer

1. Open RelayDrop on the phone.
2. Enter text, paste an image, or choose a file.
3. Press Send and wait for upload confirmation.
4. Open RelayDrop on the computer.
5. In the Edge side panel, use the restored snapshot while a due refresh runs; in the PWA, press Refresh.
6. Copy the text or download the file.

### Send from computer to phone

1. Open RelayDrop on the computer.
2. Enter text, paste content, drag a file, or choose a file.
3. Press Send and wait for upload confirmation.
4. Open RelayDrop on the phone.
5. Press Refresh.
6. Copy, preview, or download the item.

### Remove an item

1. Choose Delete on a feed item.
2. Confirm the deletion.
3. RelayDrop removes the feed descriptor and its associated file content.
4. Other devices reflect the deletion after their next refresh.

## MVP functional requirements

### Authentication

- Sign in with a Microsoft account.
- Use the same identity on every device.
- Keep the user signed in across normal tab closure and browser restarts while site data remains available.
- Reuse an existing personal Microsoft web session when silent SSO is available.
- Sign out locally.
- Explain the requested OneDrive permission before consent.

### Feed

- Show one reverse-chronological personal feed.
- Support text, links, images, and generic files.
- Display creation time, type, original file name, and size where applicable.
- Preserve already loaded items while a refresh is in progress.
- Clearly show the last successful refresh time.
- Paginate older items.

### Sending

- Send plain text and links.
- Select files on phone and desktop.
- Support desktop drag and drop.
- Support plain-text paste plus the first pasted clipboard image or file, with a local image preview and a clear-selection action before sending.
- Show real upload progress, allow cancellation before descriptor publication, and keep failed or cancelled files ready for an explicit retry.
- Prevent files above the configured product limit.
- Limit MVP files to 100 MB.
- Do not publish a feed item until its content upload succeeds.

### Receiving

- In the PWA, fetch feed content only when the signed-in user presses Refresh.
- Restore the account-scoped feed snapshot first. Check the newest items after
  a five-second open cooldown and every 30 seconds while visible, with a shared
  15-second automatic-refresh lease. Older pages load only on request.
- Show cached items when sign-in expires, with a Reconnect action. Explicit
  logout clears the account's cached inbox.
- Keep the composer collapsed initially in the extension so recent items appear
  in the first viewport; expand it on request and return to the feed after sending.
- Keep manual Refresh available on every surface.
- Allow the side-panel user to disable refresh-on-open and refresh-while-open independently.
- Copy text and links.
- Show recognizable artwork for common image, video, PDF, Office, text, code, and archive files.
- Open image thumbnails in a focused in-app preview.
- Play supported video formats inline with native browser controls.
- Open other files in OneDrive first so the browser or device can use its available viewer.
- Download arbitrary files through the authenticated Graph content endpoint.
- In the Edge extension, save files under `Downloads/RelayDrop`, reconcile local-file existence when the feed refreshes, avoid duplicate downloads, and offer Open local, Show in Folder, and Delete local.
- Preserve the original display name.
- Show the size of RelayDrop's own OneDrive App Folder and provide a link to manage it in OneDrive.

### Deletion

- Delete individual items.
- Make partial deletion failures visible by step and safely retryable.
- Treat OneDrive as the source of truth after the next refresh.

### Installation

- Work as a normal responsive website.
- Be installable as a Progressive Web App where supported.
- Provide an application icon and standalone display mode.

## Non-functional requirements

- Use the stable Microsoft Graph API where available.
- Request only Files.ReadWrite.AppFolder plus identity scopes needed for sign-in.
- Do not request Files.Read solely to show full OneDrive quota; label App Folder size accurately instead.
- Never place a Microsoft client secret in browser code.
- Avoid storing file bodies in the service worker cache.
- Make failed uploads safely retryable without publishing duplicate feed items.
- Handle OneDrive throttling with bounded retry and clear feedback.
- Handle users manually editing or deleting the RelayDrop folder.
- Keep the initial hosting layer stateless.
- Keep extension feed snapshots account-scoped, bounded, and free of tokens, file bodies, Blob URLs, and temporary preview/download URLs.

## Data ownership and retention

Items are stored in the signed-in user's OneDrive and count against that account's quota. The MVP does not automatically expire items; content remains until the user deletes it. Automatic cleanup can be added later as an optional policy.

Deletion through RelayDrop removes the OneDrive items, subject to OneDrive recycle-bin and retention behavior.

## MVP success criteria

- A text item sent from a phone appears on a computer after manual PWA refresh or a due foreground side-panel refresh.
- A file sent from a computer can be downloaded on a phone after manual refresh.
- Closing either device during the transfer does not lose an already completed upload.
- RelayDrop cannot browse files outside its dedicated OneDrive App Folder.
- A new device can reconstruct the feed from OneDrive after sign-in and a remote refresh; no local cache is required for correctness.
- No RelayDrop-owned content database or file-storage service is required.

## Implementation gates

Resolved MVP decisions:

- Maximum file size: 100 MB
- Maximum text item length: 20,000 characters
- Account type: personal Microsoft accounts
- First page and subsequent page size: 12 items

## Appearance

- Let PWA and extension users choose Light or Dark appearance in Settings, retain the local preference for that browser surface, and apply it before the React interface mounts.
- Keep product branding browser-neutral even when distributed through a browser-specific store.

## Mobile onboarding

- Use the Edge Add-ons installation link for Android phone setup.
- Open a bundled extension page when the platform has no side panel, reusing
  extension-local caching, account binding and download tracking.
- Target Android Edge 151 for physical-device acceptance. Do not imply iOS
  support from Android results. Keep the existing web host for compatibility
  and policy documents without advertising it as the phone workflow.

## Later product questions

- Should deletion require confirmation for every item or support an undo period?
- Should RelayDrop provide a user-visible Clear all action?
- Should text items support Markdown or remain plain text?

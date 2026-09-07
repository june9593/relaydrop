# ADR-0008: Use the browser Downloads API for device-local file state

- Status: Accepted
- Date: 2026-09-06

## Context

Downloading through a temporary anchor gives RelayDrop no durable knowledge of whether a file completed, still exists, or was already downloaded. The Edge side panel needs to avoid repeated downloads and offer direct local-file actions.

## Decision

- Add the Manifest V3 `downloads` and `downloads.open` permissions to the Edge extension only.
- Continue fetching file bytes through the authenticated Microsoft Graph client.
- Hand a short-lived Blob URL to `chrome.downloads.download` with a relative `RelayDrop/<safe-file-name>` destination.
- Store an account-scoped mapping from RelayDrop item ID to browser download ID and display name.
- Resolve current state through `chrome.downloads.search` and expose Downloading, Complete, Interrupted, and Missing.
- Trigger existence checks when the feed refreshes and consume delayed `downloads.onChanged` results because `search()` may initially return a stale `exists` value.
- Reuse an existing complete or in-progress download instead of starting a duplicate.
- Let the user explicitly open a completed safe file, reveal it in the operating system file manager, or remove only the local copy with `chrome.downloads.removeFile`. Recheck existence, completion, current name, and the browser danger state before opening; active-content files are reveal-only.
- Do not request `file://` access, native messaging, or arbitrary filesystem access.

## Consequences

Positive:

- Downloads have a predictable local location and survive side-panel closure.
- RelayDrop can avoid duplicate downloads and provide useful local-file actions.
- The extension still cannot browse arbitrary local files.

Negative:

- Installing or updating the extension introduces the browser-visible `downloads` and `downloads.open` permissions.
- Browser download history and the local file outlive RelayDrop authentication.
- A moved, deleted, or history-cleared file is reported as Missing and must be downloaded again.

## Follow-up

Validate permission upgrade behavior, download completion events, interrupted downloads, renamed or deleted local files, Open, Show in Folder, and logout/relogin behavior on packaged Microsoft Edge builds.

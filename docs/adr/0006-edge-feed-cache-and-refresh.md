# ADR-0006: Cache Edge feed snapshots and use bounded foreground refresh

- Status: Accepted
- Date: 2026-09-06

## Context

The Edge side panel is opened for short, frequent interactions. Starting with an empty feed on every open makes the extension feel slow even when the same items were already fetched moments earlier. Requiring a manual Refresh every time also adds friction, but RelayDrop still does not need push notifications, a persistent connection, or a background synchronization service.

The PWA's explicit-refresh behavior remains appropriate for the cross-platform MVP recorded in ADR-0001. The extension can use its trusted, device-local storage and panel visibility lifecycle to provide a faster experience without changing the PWA or treating cached data as authoritative.

## Decision

For the Edge side panel only:

- Persist a versioned feed snapshot under a key scoped to the Microsoft account ID.
- Validate cached values on read and keep no more than 50 recent items.
- Store the item fields required to render feed cards, total count, pagination cursor, and last successful refresh time.
- Hydrate the interface from that snapshot before starting a network request.
- By default, refresh on open only when the last successful refresh is at least two minutes old.
- By default, check every five minutes while the panel is visible and refresh only when due.
- Let the user disable refresh-on-open and refresh-while-open independently.
- Claim a 15-second cross-panel lease before automatic network work, share the last successful refresh time, and deduplicate in-flight refreshes to prevent request bursts without imposing the full cooldown after a failure.
- Keep manual Refresh available at all times.
- Rotate an account-scoped cache generation and independently clear the current account's feed snapshot and automatic-refresh state during Log out. Older panels and in-flight work must not be able to write that content back, and either storage operation must still be attempted if the other fails.

The snapshot may contain private note/link text and file display metadata. It must not contain authentication tokens, file bodies, thumbnails, Blob URLs, preauthenticated OneDrive URLs, or temporary preview/download URLs. Microsoft access tokens remain in `chrome.storage.session`; OneDrive remains the source of truth.

## Consequences

Positive:

- Previously fetched cards appear immediately when the side panel opens.
- Normal use requires fewer manual refresh actions without introducing push infrastructure.
- Cooldowns are shared across panels and automatic work stops when the panel is not visible.
- The PWA preserves the simpler explicit-refresh contract.

Negative:

- Cached cards can temporarily differ from OneDrive until asynchronous reconciliation completes.
- Note/link text and file metadata remain readable to processes with access to the same Edge profile.
- Cache schema changes require validation and versioning.
- Log out must clear both authentication state and the account-scoped feed snapshot.

## Follow-up

Validate reopen speed, offline rendering, multiple-panel throttling, account switching, cache clearing, and both settings on the packaged extension before release.

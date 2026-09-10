# ADR-0009: Cached startup, newest-first refresh, and Android extension UI

- Status: Accepted for 0.6.0; physical Android acceptance pending
- Date: 2026-09-10
- Supersedes: the two-minute/five-minute intervals and mobile-distribution
  assumptions in ADR-0005 and ADR-0006

## Problem and evidence

After browser session storage is lost, startup waited for silent Microsoft
authentication. Failure unmounted the inbox although its account-scoped local
cache still existed. Refresh also scanned every directory page before showing
new items and replaced the cached history with the first twelve entries.

Android Edge 151 is the requested phone target. Microsoft's API matrix lists
action, tabs, identity, storage and downloads for Android, but not sidePanel.
The old worker accessed sidePanel before configuring trusted storage, preventing
startup on that platform. The owner wants extension-store distribution for phones.

## Decision

- Restore a previously connected account's local snapshot before network work.
  An account hint is a display binding, never a substitute for a Graph token.
- Preserve the inbox on renewal failure and offer Reconnect. Explicit logout
  still rotates authentication/cache epochs, clears the feed and suppresses SSO.
- Request the newest 50 directory entries using OneDrive's supported
  lastModifiedDateTime ordering, with a name tie-breaker where supported. Keep
  creation time separately. Render twelve item bodies and announce the first
  item as soon as available; reuse unchanged bodies by item ID and eTag.
- Fetch older directory pages only for Load older. Keep semantic cursors usable
  across restarts and locate existing cursor items by their unique filename.
- Preserve cached older cards during a head refresh, reconcile deletions inside
  the directory range observed, and retain unobserved history as a local snapshot.
  If the head no longer overlaps the cache, continue pagination from the new head
  so arrivals cannot create an unfillable gap.
- A server rejecting both supported ordering forms gets the bounded legacy scan.
  This is a compatibility fallback, not a claim of constant request cost there.
- Check on open after five seconds and every 30 seconds while visible. The
  existing 15-second cross-view automatic-refresh lease prevents request bursts.
- Android opens the bundled extension page in a normal tab. Desktop retains the
  native sidebar. The same extension-origin cache and browser download records
  are used in both views. Do not add browsing or arbitrary-host permissions.
- Display completed download status on image/file cards. Hide unsupported local
  file-manager actions on Android. Completion reflects the browser download API.
- Mobile setup links to Edge Add-ons. Keep the existing web deployment for
  compatibility and policy pages; do not distribute it as the phone workflow.

## Validation and limits

Regression tests exercise the real root under React Strict Mode with persisted
local storage, empty session storage and failed authentication. They verify that
cached content remains visible and that explicit logout still clears it.
Repository tests cover blocked history pages, early newest-item delivery,
reused bodies, bounded fallback, and deletion coverage. A 5,000-item fixture
needs one directory page for a warm head check and no unchanged item bodies.

These tests simulate the platform. Actual Android Edge 151 launch, Microsoft
OAuth, upload, download completion and restart recovery require device acceptance
before store publication. The compatibility web app cannot confirm a browser
download's filesystem completion and is not advertised as the mobile solution.

## References

- [Microsoft Edge API support](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support)
- [OneDrive sorting options](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/optional-query-parameters?view=odsp-graph-online)
- [List drive children](https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0)

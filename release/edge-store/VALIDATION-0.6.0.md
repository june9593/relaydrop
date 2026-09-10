# RelayDrop 0.6.0 acceptance record

Prepared on September 10, 2026. The owner explicitly instructed merge and store
publication before physical-device acceptance, planning to test after the store
update. Automated checks below passed; device checks are still pending.

## Automated release checks

- 185 tests in 26 files passed, including TypeScript checks for both builds.
- Web and extension production builds, license-notice checks and security scans passed.
- Production dependency audit found no known vulnerabilities.
- Both ZIPs contain 25 files. The store ZIP omits the development manifest key;
  the sideload ZIP retains it. Android device acceptance remains outstanding.

Store SHA-256: `8639100d82226bad67a264579cf7e28d9ee0d3c5ee867d7c193be268295e21df`

Sideload SHA-256: `1630a067ad531c3bfd2c4ba2babaf8e26c5eb58e874e2f6ef8e5085eec68df1c`

## Diagnosed and covered by regression checks

- Browser session loss/expired silent sign-in hid the whole inbox while its
  account-scoped cache still existed. Startup now restores the known account
  before network access; renewal failure preserves the inbox with Reconnect.
- A first-page request walked every historical directory page before returning.
  It now requests supported last-modified ordering and returns the newest page.
  The first item can render before slower item bodies finish. Unsupported
  server ordering has a bounded correctness fallback.
- Refresh replaced cached history with twelve items. It now merges the newest
  items, preserves older cached cards, and reconciles observed deletions. Older
  records load only on explicit request.
- Android startup threw when sidePanel was absent. The worker now configures
  supported APIs independently and opens a bundled extension page on Android.
- Image/file cards show browser-confirmed Downloaded state. Download identifiers
  survive view restarts; unsupported mobile file-manager actions are hidden.
- Preview reuse is bounded so expired temporary file links are requested again.

The real React root test uses Strict Mode, persisted local cache, empty session
storage and failed authentication. Cached content remains visible; explicit
logout still clears it. In a 5,000-item fixture the newest-page check reads one
directory page, reads zero unchanged item bodies after reopening, and reads only
one body when one version tag changes. These are simulated request counts,
not measured production network timings.

## Visual checks

The current components were inspected at 390 × 844 with fictional data. The
first card appears in the initial viewport, the composer starts collapsed,
successful send returns to the feed, Downloaded is visible, and Light/Dark
layouts and the Reconnect banner do not overflow horizontally. No live user
content was used for these checks.

## Device acceptance to perform after publication

1. Desktop: update a test installation without uninstalling it, reopen after
   quitting Edge, and check that previous cards appear before network refresh.
2. Desktop: reopen offline; confirm cached notes remain visible and Reconnect
   appears when cloud access is attempted. Reconnect and verify the same feed.
3. Cross-device: send a new small note/file and Refresh on the other device;
   confirm the newest item appears promptly while old cached cards remain.
4. Android Edge 151: install the 0.6.0 test package, launch from Extensions,
   complete Microsoft sign-in, send a note and upload a small image.
5. Android: download the image, verify Downloaded, close/reopen the extension,
   and confirm both the feed and download status return. Open via Edge Downloads
   if the OS/browser does not expose a direct-open action.
6. On both devices: verify account switching and explicit logout never show
   another account's cache. Test older pagination across a new-arrival gap.

No Android device is currently connected to this workspace; the Android checks
above are pending, not claimed as passed. Existing 0.5.3 packages and store
submission artifacts are preserved. The owner authorized 0.6.0 submission through
the existing Partner Center product before these physical-device checks.

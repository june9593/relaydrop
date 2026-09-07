# RelayDrop architecture

## System overview

RelayDrop is a static Progressive Web App that uses Microsoft identity for authentication and Microsoft Graph for persistence. OneDrive is both the synchronization medium and the source of truth.

    Phone or desktop PWA ----\
                              +--> Microsoft Graph --> OneDrive / Apps / RelayDrop
    Edge side panel ----------/

There is no application content server in the MVP. Static assets may be hosted on Azure Static Web Apps or another HTTPS static host.

## Components

### PWA shell

- Responsive feed and composer
- Installable manifest and application icons
- Service worker caching only the application shell
- In-memory cache for parsed feed content
- Persistent cache limited to account-scoped opaque identifiers, ETags, and refresh state

### Identity client

- Microsoft Authentication Library for browser applications
- Authorization Code flow with PKCE
- Public-client application registration with no client secret
- Delegated Microsoft Graph access
- Personal Microsoft account authority at login.microsoftonline.com/consumers
- Persistent first-party MSAL account/token cache with session-scoped transaction state
- Opportunistic `ssoSilent` recovery through a minimal same-origin callback page

### Edge side-panel companion

- Native Manifest V3 side panel with a separate Vite entry point
- Reuses the feed UI, Graph client, and OneDrive repository
- Uses `chrome.identity.launchWebAuthFlow` with Authorization Code and PKCE
- Verifies the returned ID token through Microsoft consumers OIDC discovery and JWKS, RS256 Web Crypto signature validation, the fixed personal-account tenant, issuer resolution, nonce, audience, authorized party, and expiry checks before creating a session
- Keeps access tokens in trusted extension session storage
- Decodes Microsoft ID-token claims as UTF-8 and repairs account names cached by the earlier byte-decoding implementation
- Uses Microsoft web-session SSO opportunistically after the browser restarts
- Restores an account-scoped recent-feed snapshot from trusted extension local storage before contacting Graph
- Runs configurable foreground refresh with a two-minute open cooldown and a five-minute visible-panel interval
- Exposes the signed-in account, Settings, and Log out through the account menu
- Accepts an HTTPS hosted-PWA URL at build time and exposes it as a phone setup card without loading remote executable code
- Does not embed the hosted PWA, register a second service worker, or load remote executable code

### OneDrive repository

- Resolves the application folder through the approot special folder
- Creates the required child folders lazily
- Uploads item descriptors and file bodies
- Lists and downloads items
- Deletes descriptors and associated file bodies
- Reads the App Folder's aggregate `size` and `webUrl` for a non-blocking usage and management surface
- Normalizes throttling, missing-folder, conflict, and authentication errors
- Caps descriptor fields and documents, detects pagination loops, bounds list traversal, verifies file ownership against the deterministic blob folder/name, and verifies downloaded or retry-reused bytes against the published size and SHA-256 digest

The repository deliberately does not query `/me/drive` for full-account quota. That API requires the broader Files.Read permission, while the App Folder status call remains within Files.ReadWrite.AppFolder.

### Feed service

- Translates OneDrive objects into RelayDrop feed items
- Merges refreshed data with the local view
- Paginates older content
- Reconciles content removed outside RelayDrop

### Preview service

- Classifies common file formats locally for distinct artwork without a network request
- Fetches OneDrive file metadata and authenticated thumbnail bytes only when a card approaches the viewport
- Falls back to Graph's generated thumbnail URL, then the original image, then type-specific artwork without leaving a broken image state
- Caches descriptor bodies by drive-item ETag and preview metadata in memory for the current refresh
- Uses local Blob URLs for thumbnails and short-lived OneDrive URLs for full image/video rendering
- Opens other files through the OneDrive web URL so Microsoft 365 and the device can choose the best available viewer

### Download service

- Resolves the descriptor's OneDrive file item
- Downloads through the authenticated Microsoft Graph content endpoint
- The PWA creates a short-lived local Blob URL for the browser save action
- The Edge extension passes that Blob URL to `chrome.downloads` with a `RelayDrop/` relative path
- Stores an account-scoped item-to-download-ID mapping so reopened panels can report Complete, Interrupted, or Missing
- Triggers browser file-existence checks alongside feed refresh and consumes the later `downloads.onChanged` result when the filesystem check completes
- Rechecks a completed local file before opening it, blocks direct opening for executable or browser-flagged active content, reveals it in the operating system's file manager, or removes only the local copy without deleting OneDrive content
- Revokes temporary Blob URLs after the browser download has taken ownership

## Authentication and authorization

The browser application requests delegated access for the signed-in user.

Required storage permission:

- Files.ReadWrite.AppFolder

This scope confines the application to its own folder. The folder is resolved through:

    GET /me/drive/special/approot

Microsoft Graph creates the folder on first access under:

    OneDrive / Apps / RelayDrop

Identity scopes and refresh-token behavior follow the Microsoft identity platform's SPA guidance. The first deployment uses the consumers authority and accepts personal Microsoft accounts only.

## Storage model

RelayDrop separates feed descriptors from binary content so the feed can be listed without downloading every file.

    Apps/RelayDrop/
      feed/
        <uuid>.json
      blobs/
        <uuid>/
          <sanitized-storage-name>

A descriptor is immutable after successful publication. Schema evolution adds new versions rather than rewriting historical descriptors. The normative contract is defined in SCHEMA.md. A representative descriptor contains:

    {
      "schemaVersion": 1,
      "id": "<uuid>",
      "type": "text | link | image | file",
      "createdAt": "<UTC ISO-8601 timestamp>",
      "text": "<optional text>",
      "file": {
        "driveItemId": "<optional OneDrive item id>",
        "displayName": "<original file name>",
        "size": 12345,
        "mediaType": "<reported MIME type>",
        "sha256": "<lowercase content digest>"
      }
    }

The storage name is sanitized and collision-resistant. The descriptor retains the user-facing name.

Feed ordering uses the OneDrive createdDateTime of the descriptor drive item, followed by the descriptor UUID as a stable tie-breaker. Client-provided createdAt is display metadata and must not be the sole ordering authority because device clocks can differ.

## Write flow

### Text or link

1. Generate a UUID and timestamp on the sending device.
2. Serialize and validate the descriptor at its deterministic UUID-based path.
3. Upload the descriptor to feed/<uuid>.json using create-if-absent behavior.
4. Add it to the local feed after Graph confirms success.

A retry uses the same UUID and path. If that path already contains an equivalent descriptor, the operation is treated as successful. A conflicting descriptor with the same UUID is reported instead of overwritten.

### File or image

1. Validate name, size, and allowed product policy.
2. Generate a UUID and timestamp.
3. Upload the binary into its deterministic UUID-based blob folder.
4. Create a descriptor referencing the uploaded drive item.
5. Upload the descriptor as the publication step.
6. Add it to the local feed.

If binary upload succeeds but descriptor publication fails, the binary is an orphan and does not appear in the feed. Repeating the operation with the same UUID may reuse the binary only after its byte length and SHA-256 digest are verified. If equivalence cannot be verified, the retry uses a new UUID and leaves the old binary for later orphan cleanup.

The direct Graph upload uses XHR so the client can report actual uploaded bytes. Preparing, existing-file verification, upload, and descriptor publication are distinct UI phases. Cancellation is accepted before publication; it is best-effort and may leave an unpublished orphan blob. Retry reuses the same UUID and creation timestamp, verifies any existing blob by size and SHA-256, and then safely resumes publication.

The MVP uses direct content upload and limits files to 100 MB, below Microsoft Graph's current 250 MB single-call limit. Upload sessions are not required for the first release.

## Refresh flow

RelayDrop deliberately avoids push notifications and persistent connections. The PWA remains manual; the Edge side panel adds bounded refresh only while its UI is open.

1. Resolve the app folder and ensure expected children exist.
2. List metadata for every descriptor in the feed folder, following all Graph continuation links.
3. Build the complete remote descriptor-ID and ETag set.
4. Remove locally known items that are absent from that complete remote set.
5. Sort descriptor metadata by OneDrive creation time and UUID.
6. Fetch and validate changed descriptors needed for the visible page.
7. Ignore malformed or unsupported entries with a visible warning.
8. Render the first page and load older descriptor bodies lazily when requested.
9. Record the last successful refresh time.

The repository enumerates the complete feed metadata on every remote refresh but downloads only the first 12 descriptor bodies. Scrolling near the end loads the next 12. Unchanged descriptor bodies are reused from an in-memory ETag cache. This avoids depending on unspecified listing order, keeps deletion reconciliation correct, and prevents the initial request from growing linearly with every descriptor body. Delta queries or a validated partitioning design can replace full metadata enumeration later.

File metadata and thumbnail requests are independent of feed pagination. A card triggers them only when it approaches the viewport, and a single in-flight request is shared by repeated renders or clicks. Refresh clears short-lived preview URL state.

### PWA refresh policy

The hosted PWA contacts OneDrive only when the signed-in user presses Refresh. Opening or signing in restores authentication and the application shell, but does not silently fetch feed content.

### Edge side-panel refresh policy

1. Load up to 50 recent feed items from the cache scoped to the Microsoft account ID.
2. Render that snapshot immediately, including its last successful refresh time.
3. If the snapshot is at least two minutes old, start one asynchronous OneDrive refresh.
4. While the side panel remains visible, check every five minutes and refresh only when due.
5. Claim a short cross-panel refresh lease before network work, and share the last successful refresh time so multiple panels do not create a request burst.
6. Deduplicate concurrent refresh requests inside a panel.
7. Keep manual Refresh available regardless of the automatic settings.

Both automatic behaviors default to enabled and can be disabled independently in Settings. They stop when the panel is hidden or closed; this is foreground polling, not background synchronization. Cached results can temporarily differ from OneDrive while the asynchronous reconciliation is running.

## Authentication recovery

1. Initialize MSAL and complete any redirect response.
2. Restore an account from the first-party local cache when available.
3. If no account is cached, try `ssoSilent` using `/auth/silent.html` and the existing Microsoft web session.
4. If silent SSO is unavailable, show the explicit Microsoft sign-in button.
5. Normal sign-in does not force the account picker; Microsoft decides whether it can reuse one session or must ask the user to choose.

An Edge profile identity is not exposed directly to this personal-account SPA. The reusable SSO signal is the Microsoft web session in the browser. Platform-broker/WAM SSO is not part of the personal-account implementation.

The first implementation favors correctness over minimizing request count. Microsoft Graph delta queries can be evaluated later, but the MVP must not depend on them until app-folder-scoped behavior is verified.

## Delete flow

1. Read the descriptor currently known to the client.
2. Require the feed filename to match the descriptor UUID, then resolve the item's deterministic blob folder and verify that any referenced file is a direct child with the expected storage name.
3. Delete only the verified file and deterministic blob folder; never trust a descriptor's bare drive-item ID as a deletion target.
4. Delete the descriptor.
5. Remove the item from the local feed only when the authoritative deletion succeeds.

Because OneDrive does not provide a transaction across separate drive items, deletion can partially fail. The repository records which step failed and offers a retry. A missing object is treated as already deleted.

The visible delete state distinguishes locating the descriptor, deleting file data, cleaning the blob folder, and deleting the feed descriptor. Completed steps are idempotent, so retrying continues safely rather than decrementing or hiding the local item early.

## Local state

Local state is an optimization, not the source of truth.

The PWA's allowed persistent feed data remains limited to:

- Account-scoped descriptor identifiers and ETags
- Last-refresh time

Parsed descriptors, including private text and links, remain in memory only in the PWA. Pending drafts are not persisted. File bodies must not be persistently cached by the service worker.

The Edge extension keeps a versioned, account-scoped snapshot in `chrome.storage.local` so the side panel can open without a blank loading state. The snapshot contains at most 50 validated feed items, the total count, pagination cursor, and last successful refresh time. It can therefore include user-visible note or link text and file display metadata such as name, size, and media type. It never contains access or refresh tokens, file bytes, Blob URLs, thumbnails, preauthenticated OneDrive URLs, or other temporary preview/download URLs.

The extension also stores account-scoped refresh preferences, a short refresh lease, the last successful refresh time, and a cache generation marker. Log out attempts both generation rotation and physical cache removal even if either storage operation fails, so in-flight or second-panel writes cannot restore usable logged-out content. OneDrive remains authoritative, so a later refresh may replace or remove cached cards.

The extension separately stores an account-scoped mapping from RelayDrop item IDs to browser download IDs. It contains file names and download identifiers, not file contents. The actual files and the browser's download history remain on the device after RelayDrop logout; this is required for Open local and Show in Folder to remain meaningful across normal panel restarts.

Authentication token storage follows the identity client's supported configuration and security guidance. PWA sign-out clears RelayDrop state for that web account; extension log out clears the extension feed cache for that account.

Appearance is stored as a non-sensitive Light/Dark value in each surface's local storage. A small bundled bootstrap script applies the saved theme to the root document before the main React bundle mounts. The PWA and extension intentionally keep independent appearance preferences. The installed PWA's operating-system splash remains governed by the static web-app manifest color before the document loads.

Application-shell cache names include a build version. Activation of a new service worker removes obsolete shell caches without touching browser-managed identity state.

## Error handling

The UI distinguishes:

- Sign-in or consent required
- OneDrive unavailable
- Quota exceeded
- Product file-size limit exceeded
- Upload interrupted
- Graph throttling
- File changed or deleted outside RelayDrop
- Unsupported or malformed descriptor

Retries use bounded exponential backoff and honor server retry guidance up to a finite delay. User-initiated retry remains available.

## Deployment

Initial Azure resources:

- One Microsoft Entra application registration
- One static web host, preferably Azure Static Web Apps
- HTTPS custom domain later if desired

No storage account, database, function application, or persistent server process is required for the OneDrive-backed MVP.

RelayDrop therefore has no self-operated content backend. Microsoft identity, Microsoft Graph, OneDrive, and the static HTTPS host remain server-side dependencies.

## Evolution seams

The UI depends on a storage repository interface rather than Graph directly. A future Azure Blob and database implementation can replace the OneDrive repository without redesigning the feed.

Potential later additions:

- Context-menu sending from the browser extension
- Native share extensions
- Optional PWA polling or push notifications
- Optional expiration policies
- Client-side end-to-end encryption
- Azure-hosted storage for larger-scale or multi-user operation

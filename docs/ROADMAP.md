# RelayDrop roadmap

## Current progress

- v0.1 was validated in production on 2026-09-04; see [Milestones](MILESTONES.md).
- Project documentation and architecture decisions are complete.
- The responsive PWA shell, installable manifest, demo feed, composer, file drop zone, and deletion flow are implemented.
- Domain ordering and formatting rules have automated tests.
- MSAL redirect authentication and the OneDrive App Folder repository are implemented.
- Descriptor validation, canonical serialization, Graph retry behavior, and repository flows have automated tests.
- Production build and PWA generation pass locally.
- Personal MSA sign-in, consent, App Folder creation, text upload, and text retrieval after a page reload have been validated live.
- Live file upload, Graph Blob download, content verification, and deletion have been validated.
- Rich file artwork, OneDrive thumbnails, image preview, video playback, and browser-first opening are implemented.
- The feed loads 12 descriptors at a time and reuses unchanged descriptor bodies through an in-memory ETag cache.
- Persistent MSAL caching and opportunistic personal Microsoft web SSO are implemented.
- Thumbnail rendering now uses authenticated Graph bytes and local Blob URLs rather than cached OneDrive hotlinks.
- Physical phone-to-computer validation is complete.
- A native Edge side-panel build, PKCE authentication adapter, and sideload documentation are implemented.
- The Edge account display decodes UTF-8 names correctly and exposes account details, Settings, and Log out from the avatar menu.
- The side panel restores up to 50 account-scoped feed items immediately, then uses a two-minute open cooldown and five-minute visible-panel refresh interval by default.
- Side-panel refresh-on-open and refresh-while-open are independently configurable; logout clears the current account's feed snapshot and refresh marker.
- The OneDrive card reports RelayDrop App Folder size and opens the folder's `webUrl` without adding the broader Files.Read permission.
- The Edge layout follows the side-panel width without page-level horizontal scrolling; long notes use an internal scroll region and long URLs or file names remain contained.
- The owner validated the 0.3.1 side-panel package and approved the feature branch for merge on 2026-09-06.
- An authorized independent red-team pass against authentication, storage, downloads, untrusted OneDrive data, and resource bounds has been completed; its code findings are fixed in the 0.5.2 candidate.

## Transfer controls and reliability

Status: Owner-validated in 0.4.1 and included in the accepted 0.5.2 package.

- Clipboard image and file paste handling preserves ordinary text paste, previews selected images, and allows clearing the selection.
- Direct Graph upload reports real byte progress and supports cancellation plus explicit safe retry.
- Partial deletion reports the failed step and provides an idempotent retry path.
- The Edge extension uses `Downloads/RelayDrop`, reconciles local-file existence, prevents duplicate downloads, and exposes Open local, Show in Folder, and Delete local.

Complete the automated browser, accessibility, security, and failure-scenario hardening around these features before release.

## v0.5.1 appearance and release hardening

Status: Owner-validated as part of the 0.5.2 package on 2026-09-07.

- Add a Light/Dark appearance preference to Settings in the PWA and extension.
- Persist the preference locally per browser surface and apply it before the React interface mounts on the next open.
- Verify feed cards, composer, dialogs, previews, transfer states, and focus/contrast in both themes.
- Keep the RelayDrop product title browser-neutral; Edge remains a supported distribution channel rather than part of the product name.

## Mobile onboarding

- The side panel now explains that mobile browsers use the hosted PWA rather than the extension.
- It shows a deployment-configured public host with Copy link and Open web app actions.
- It tells users to sign in with the same Microsoft account and optionally add the PWA to the home screen.
- A locally generated QR code remains an optional follow-up; RelayDrop will not use a remote QR service.

## v0.5.2 security hardening

Status: Packaged owner validation passed on 2026-09-07. Store submission preparation is in progress.

- Enforce Microsoft ID-token signatures and personal-account tenant binding.
- Isolate authentication work by epoch across concurrent side panels and account changes.
- Validate file integrity, descriptor sizes, pagination, retry delays, cached links, file names, and Microsoft presentation URLs at trust boundaries.
- Clear cached private feed content defensively and restrict direct opening of downloads that can contain active content.
- Add public privacy/support/security surfaces and a repeatable adversarial review record.

Deferred by product decision:

- Full OneDrive quota display. It remains out of scope unless a later permission review justifies requesting Files.Read and a new consent.

Final release step:

- Prepare and submit RelayDrop to Microsoft Edge Add-ons after the implementation sequence and hardening are complete.

## Milestone 0: Project foundation

- Establish product scope and architecture
- Record major decisions
- Create private GitHub repository
- Add initial issue and pull-request conventions when implementation begins

Exit condition: a contributor can explain the product, the MVP boundary, and the storage design from the repository documentation.

## Milestone 1: Application shell and identity

- Create responsive PWA shell
- Add installable manifest and icons
- Register Microsoft identity application
- Configure personal Microsoft accounts and SPA redirect URIs
- Use the decided 100 MB file-size and 20,000-character text limits
- Implement sign-in, consent, token acquisition, and sign-out
- Display account and connection state
- Establish the MVP threat model, CSP, token-cache policy, and sign-out clearing behavior

Exit condition: the application runs on phone and desktop and can obtain Files.ReadWrite.AppFolder using the user's personal Microsoft account.

## Milestone 2: OneDrive storage spike

- Resolve the OneDrive App Folder
- Create feed and blob directories
- Upload and read a text descriptor
- Upload and download a test file
- Verify personal Microsoft account behavior
- Confirm the 100 MB file policy against real Graph uploads
- Validate complete-feed enumeration, deterministic ordering, deletion reconciliation, and safe retries
- Measure full metadata-enumeration performance and define the threshold for a future delta or partition optimization

Exit condition: two browser sessions using the same account can exchange a text item and file through OneDrive.

## Milestone 3: Personal feed

- Build composer and reverse-chronological feed
- Add explicit PWA Refresh action and last-refresh state
- Add pagination and local metadata cache
- Support text and links
- Add deletion and reconciliation
- Handle malformed or externally deleted OneDrive items

Exit condition: the text-and-link workflow meets the MVP acceptance criteria.

## Milestone 4: File experience

- Add file picker, drag and drop, and paste handling
- Add upload progress, retry, and cancellation
- Add image preview and generic downloads
- Add inline video playback and browser-first file opening
- Enforce configurable file-size policy
- Add large-file upload sessions if required by the chosen limit

Exit condition: phone-to-computer and computer-to-phone file transfers are reliable, failed attempts can be retried without duplicate feed items, and completed uploads remain available after either device closes.

## Milestone 5: Hardening and private release

- Complete accessibility and responsive-layout review
- Add automated unit, integration, and browser tests
- Verify CSP and security headers
- Add secret and dependency scanning
- Test OneDrive quota, throttling, consent, and account-recovery scenarios
- Deploy private preview

Exit condition: the owner can use RelayDrop as a daily replacement for the core Edge Drop workflow.

## Later candidates

- Chrome compatibility validation
- Native share-sheet integration
- Optional automatic refresh for the PWA or push-based synchronization
- Optional content expiration
- Client-side encryption
- Alternative Azure-backed storage provider
- Multi-select, bulk download, and search

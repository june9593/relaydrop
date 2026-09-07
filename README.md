# RelayDrop

RelayDrop is a private, cross-device personal inbox for sending text, links, images, and files between a user's own devices.

RelayDrop is open source under the MIT license. Use the desktop Edge companion
and the hosted web app shown in its phone setup card, or deploy your own copy.

The initial product is intentionally small: open the same installable web app on a phone and a computer, sign in with the same Microsoft account, send an item, and retrieve it from the other device. The PWA keeps explicit manual refresh, while the Edge side-panel companion can restore a local feed snapshot immediately and run bounded foreground refreshes. RelayDrop is inspired by Edge Drop and WeChat File Transfer Assistant, without chat, contacts, push notifications, or a dedicated synchronization server.

## Status

RelayDrop PWA v0.1 is deployed and usable. Personal Microsoft account sign-in, OneDrive App Folder storage, cross-session text and file retrieval, authenticated downloads, and deletion have been validated against the production site. Edge version 0.5.2 passed owner validation on September 7, 2026. Version 0.5.3 adds MIT licensing and distribution notices for the first open-source release; its executable assets are unchanged. The owner also verified sign-in with the store extension ID. Version 0.5.3 was submitted to Edge Add-ons on September 7, 2026 and is under review; a store installation link will be added after approval.

Developer packages are available from [Releases](https://github.com/june9593/relaydrop/releases).
Follow the [sideload instructions](docs/EDGE_EXTENSION.md) when installing a ZIP.

## MVP

- Installable responsive web app for phone and desktop
- Microsoft account sign-in
- Sign-in persistence across tabs and browser restarts, with opportunistic Microsoft web SSO
- One private feed per signed-in user
- Send text, links, images, and files, including pasted clipboard files
- Explicit refresh in the PWA; cached startup plus rate-limited foreground refresh in the Edge side panel
- Copy text, preview supported content, download files, and delete items
- In the Edge side panel, track local downloads and safely retry uploads or partial deletion
- OneDrive App Folder storage through Microsoft Graph
- Configurable file-size limit
- Optional desktop Edge side-panel build using the same OneDrive feed

## Product principles

- Private by default
- Predictable synchronization with a manual PWA flow and user-controlled side-panel refresh settings
- Least-privilege access to OneDrive
- No RelayDrop backend holding user content
- Useful as a standalone web app; the Edge side panel remains an optional companion

## Out of scope for the first release

- Push notifications, real-time connections, or background synchronization while RelayDrop is closed
- Person-to-person messaging
- Contacts, groups, reactions, read receipts, or presence
- Native mobile or desktop applications
- End-to-end encryption independent of OneDrive

## Technical direction

RelayDrop starts as a static Progressive Web App. It authenticates the user with Microsoft identity and uses Microsoft Graph with the Files.ReadWrite.AppFolder permission. Content is stored in the application's dedicated OneDrive folder. The PWA fetches feed data only after the user explicitly presses Refresh. The Edge side panel restores an account-scoped snapshot first, then checks OneDrive after a two-minute open cooldown and every five minutes while the panel remains visible; either behavior can be disabled in Settings.

The side panel reports the size of RelayDrop's own App Folder and opens that folder in OneDrive for management. It does not show the account's complete OneDrive quota because that would require the broader Files.Read permission.

## Documentation

- [Product specification](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Feed data contract](docs/SCHEMA.md)
- [RelayDrop design adaptation](docs/DESIGN.md)
- [Microsoft account and Azure setup](docs/AZURE_SETUP.md)
- [Microsoft Edge side-panel extension](docs/EDGE_EXTENSION.md)
- [Security](docs/SECURITY.md)
- [Privacy policy](PRIVACY.md)
- [Support and private security reporting](SUPPORT.md)
- [Release security checklist](docs/RELEASE_SECURITY.md)
- [September 2026 security review](docs/SECURITY_REVIEW_2026-09-07.md)
- [Edge Add-ons submission materials](release/edge-store/README.md)
- [Roadmap](docs/ROADMAP.md)
- [Milestones](docs/MILESTONES.md)
- [Architecture decisions](docs/adr/)
- [Contributing](CONTRIBUTING.md)

## Current decisions

- [ADR-0001: Build a PWA with manual refresh](docs/adr/0001-pwa-manual-refresh.md)
- [ADR-0002: Store user content in a OneDrive App Folder](docs/adr/0002-onedrive-app-folder.md)
- [ADR-0004: Persist authentication and reuse Microsoft web sessions](docs/adr/0004-persistent-auth-and-web-sso.md)
- [ADR-0005: Build a native Edge side-panel companion](docs/adr/0005-native-edge-side-panel.md)
- [ADR-0006: Cache Edge feed snapshots and use bounded foreground refresh](docs/adr/0006-edge-feed-cache-and-refresh.md)
- [ADR-0007: Show App Folder usage without broadening OneDrive access](docs/adr/0007-app-folder-usage-without-files-read.md)
- [ADR-0008: Use the browser Downloads API for device-local file state](docs/adr/0008-browser-downloads-api.md)

## Run locally

Requirements:

- Node.js 22 or newer
- pnpm 10 or newer

Commands:

    pnpm install
    pnpm dev

Quality checks:

    pnpm check
    pnpm build
    pnpm release:check

Contributions are checked without deployment secrets. Production deployment is
restricted to `main` and the production environment. Run
`pnpm security:check:history` before sharing a repository snapshot.

Build the sideloadable Edge extension:

    pnpm check:extension
    pnpm build:extension

Without environment configuration, RelayDrop runs as a safe interface preview. It keeps demo items in memory and does not request Microsoft account access.

To enable personal Microsoft account and OneDrive mode:

    cp .env.example .env.local

Add the application client ID described in docs/AZURE_SETUP.md, then run:

    pnpm dev

## Implementation structure

- src/domain contains feed types, ordering, and formatting rules.
- src/repository defines the storage boundary and the in-memory demo implementation.
- src/repository also contains the Microsoft Graph client and OneDrive App Folder implementation.
- src/auth contains MSAL redirect authentication for personal Microsoft accounts.
- src/hooks coordinates refresh, cache hydration, send, delete, and App Folder status operations.
- src/components contains accessible interface components.
- The UI selects the demo or OneDrive repository from environment configuration.
- extension contains the native Edge side-panel entry, OAuth adapter, account-scoped cache and settings stores, manifest, and extension-only build.

## License

RelayDrop's source is available under the [MIT license](LICENSE).
Third-party code and fonts retain their own licenses; see
[third-party notices](public/THIRD_PARTY_NOTICES.txt). Both the web distribution
and extension packages include the project license and dependency notices.

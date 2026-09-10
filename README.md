# RelayDrop

RelayDrop is a private, cross-device personal inbox for sending text, links, images, and files between a user's own devices.

RelayDrop is free and open source under the MIT license.
[Install from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/relaydrop/haadfdpcnjildomodlbpgapoemgdejef).

Sign in with the same personal Microsoft account on your devices, send an item,
and retrieve it on the other device. RelayDrop uses your OneDrive App Folder,
with no dedicated synchronization server. The desktop extension uses Edge's
sidebar; the upcoming Android extension opens its own full-page inbox. Mobile
setup points to the extension store. The existing web build remains available
for compatibility and local development.

## Status

Version **0.5.3** is published in Edge Add-ons. This branch prepares **0.6.0**:
persistent cached startup even when Microsoft sign-in expires, newest-first
refresh, and an Android extension entry point. Android Edge 151 is the target
for device acceptance; passing desktop and simulated-platform tests does not
replace that check. Version 0.6.0 is not yet published.

Developer packages are available from [Releases](https://github.com/june9593/relaydrop/releases).
Follow the [sideload instructions](docs/EDGE_EXTENSION.md) when installing a ZIP.

## MVP

- Desktop side panel and a full-page extension view for Android
- Microsoft account sign-in
- Sign-in persistence across tabs and browser restarts, with opportunistic Microsoft web SSO
- One private feed per signed-in user
- Send text, links, images, and files, including pasted clipboard files
- Immediate cached startup, newest-first foreground refresh, and older items on demand
- Copy text, preview supported content, download files, and delete items
- In the Edge side panel, track local downloads and safely retry uploads or partial deletion
- OneDrive App Folder storage through Microsoft Graph
- Configurable file-size limit
- One extension package and OneDrive feed across supported Edge devices

## Product principles

- Private by default
- Predictable synchronization with cached items and user-controlled foreground refresh
- Least-privilege access to OneDrive
- No RelayDrop backend holding user content
- Extension-store distribution on desktop and Android

## Out of scope for the first release

- Push notifications, real-time connections, or background synchronization while RelayDrop is closed
- Person-to-person messaging
- Contacts, groups, reactions, read receipts, or presence
- Native mobile or desktop applications
- End-to-end encryption independent of OneDrive

## Technical direction

RelayDrop authenticates with Microsoft identity and uses Microsoft Graph with
the Files.ReadWrite.AppFolder permission. A remembered account selects its
device-local cache immediately; remote requests still require a valid token.
The extension checks the newest items on open with a five-second cooldown and
every 30 seconds while visible. A shared 15-second lease limits automatic
request bursts. Either behavior can be disabled in Settings. Older pages load
only on request; unchanged cached item bodies are reused by their OneDrive
version. The compatibility web build retains manual refresh.

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

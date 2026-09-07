# ADR-0002: Store user content in a OneDrive App Folder

- Status: Accepted
- Date: 2026-09-04

## Context

RelayDrop requires durable storage that is available when the sending and receiving devices are not online simultaneously. The initial product is a personal transfer assistant and should avoid operating a separate content database and file-storage service when the user already has OneDrive.

Microsoft Graph exposes a dedicated OneDrive App Folder and a least-privilege Files.ReadWrite.AppFolder permission intended for application data and cross-device experiences.

## Decision

Use Microsoft Graph and the signed-in user's OneDrive App Folder as the MVP source of truth.

The static PWA will authenticate using delegated Microsoft identity permissions. Feed descriptors and binary files will be stored under the application folder. RelayDrop will request Files.ReadWrite.AppFolder rather than broad OneDrive access.

The storage layer will be implemented behind a repository interface so an Azure-backed provider can be added later.

## Consequences

Positive:

- Content remains in the user's Microsoft account.
- RelayDrop does not need its own content backend.
- Offline receiving devices can fetch completed uploads later.
- Permission is limited to the application's folder.
- The platform exposes App Folder support for OneDrive home, work, and school scenarios; the first RelayDrop deployment enables personal Microsoft accounts only.

Negative:

- Content consumes the user's OneDrive quota.
- Microsoft identity and Graph availability become dependencies.
- Organizational tenants may restrict user consent.
- Users can manually alter or delete application data.
- OneDrive does not provide application-level transactions across separate file objects.
- The App Folder is useful for this personal MVP but may not be the best storage system for a large multi-user product.

## Follow-up

Run an early storage spike to validate account types, listing and pagination, upload sessions, throttling, and app-folder behavior before building the full feed.

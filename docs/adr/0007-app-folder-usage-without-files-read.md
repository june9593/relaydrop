# ADR-0007: Show App Folder usage without broadening OneDrive access

- Status: Accepted
- Date: 2026-09-06

## Context

The side panel should show how much RelayDrop content is stored and provide a direct way to manage it in OneDrive. Microsoft Graph exposes full drive quota through `/me/drive`, but reading that resource requires Files.Read, which would broaden RelayDrop beyond its dedicated application folder.

The App Folder drive item already exposes an aggregate `size` and a browser `webUrl` through the existing Files.ReadWrite.AppFolder permission.

## Decision

- Read `size` and `webUrl` from `/me/drive/special/approot`.
- Label the value as RelayDrop App Folder usage, never as total OneDrive usage or remaining capacity.
- Open the returned HTTPS `webUrl` when the user selects the OneDrive card.
- Cache this supplemental value briefly and invalidate it after RelayDrop creates or deletes content.
- Treat App Folder status failures as non-blocking; the feed continues to work.
- Do not request Files.Read solely to display complete OneDrive quota.

## Consequences

Positive:

- The user gets a useful storage and cleanup entry point without granting broader drive visibility.
- RelayDrop keeps the same least-privilege consent surface.
- The label accurately describes the value Graph provides.

Negative:

- RelayDrop cannot show total OneDrive capacity, remaining space, or a full-account usage percentage.
- Manual deletion in OneDrive can temporarily leave partial RelayDrop data until the next refresh reconciles it.
- A future full-quota feature requires a separate permission, consent, and security review.

## Follow-up

If full OneDrive quota becomes important, evaluate whether its user value justifies Files.Read and record that permission expansion in a new decision before implementation.

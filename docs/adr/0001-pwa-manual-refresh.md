# ADR-0001: Build a PWA with manual refresh

- Status: Accepted
- Date: 2026-09-04

## Context

RelayDrop needs to move text and files between phone and desktop devices. A browser-extension-only product would not provide consistent mobile support, while native applications would increase the initial implementation and maintenance cost.

The essential requirement is durable cross-device transfer, not immediate notification. Users are willing to open the receiving client and explicitly request the latest content.

## Decision

Build the first RelayDrop client as a responsive Progressive Web App.

Sending uploads content immediately. In the hosted PWA, receiving occurs only when a signed-in user presses Refresh. Opening or signing in to the PWA does not silently fetch feed content. The PWA MVP will not implement push notifications, WebSockets, background synchronization, or periodic polling.

## Consequences

Positive:

- One codebase supports phone and desktop browsers.
- The application can be installed where PWA support is available.
- No notification infrastructure or long-lived connection is required.
- Synchronization behavior is predictable and easy to debug.

Negative:

- New content is not visible until the receiving user refreshes.
- System share-sheet and background-transfer behavior vary by platform.
- A later native application may still be needed for the best mobile integration.

## Follow-up

Keep the feed and storage interfaces independent of the PWA UI so extensions or native clients can be added later.

ADR-0006 adds bounded, user-configurable foreground refresh to the Edge side panel. It does not change this PWA decision: the hosted web application remains explicit-refresh only.

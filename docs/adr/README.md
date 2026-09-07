# Architecture decision records

Architecture decision records capture choices that materially constrain RelayDrop.

Each record contains:

- Status
- Context
- Decision
- Consequences

Accepted records are not silently rewritten when a decision changes. A new record should supersede the old one.

Current records:

- 0001: Build a PWA with manual refresh
- 0002: Store user content in a OneDrive App Folder
- 0003: Authenticate personal Microsoft accounts in the browser (superseded cache decision)
- 0004: Persist authentication and reuse Microsoft web sessions
- 0005: Build a native Edge side-panel companion
- 0006: Cache Edge feed snapshots and use bounded foreground refresh
- 0007: Show App Folder usage without broadening OneDrive access
- 0008: Use the browser Downloads API for device-local file state

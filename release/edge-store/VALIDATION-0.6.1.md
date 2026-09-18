# RelayDrop 0.6.1 validation

Status: local candidate, not submitted to Edge Add-ons.

## Changes

- The send form is expanded by default and stays open after sending.
- Android uses a declarative native extension popup. Desktop retains the sidebar.
- An Android sidePanel object no longer selects the unsupported sidebar path;
  the old action override is explicitly cleared during setup.
- Popup dimensions fit small touch viewports; Android sends are labeled phone.
- Permissions, Microsoft app registration, token policy, and OneDrive scope are unchanged.

## Verified on September 19, 2026

- TypeScript and all 189 tests pass.
- Extension production build succeeds.
- Web production build, license notices and source/build security checks pass.
- Local browser UI checks at 320x640, 390x844 and 380x600 show the composer in
  the initial viewport, no horizontal overflow, and a visible composer after
  note and file sends. These checks use fictional local data, not OneDrive.
- Regression tests were run failing before the composer and launch fixes.
- Physical Android device: Edge 153.0.4234.32, installed store RelayDrop 0.6.0.
- Direct extension-page loading worked. Side-panel action behavior was true,
  the popup was empty, and the supposedly unsupported sidePanel API was exposed.
- Temporarily changing those entry settings restored menu launch. The owner
  confirmed the native popup displayed RelayDrop; its popup target was observed.

See [ADR-0010](../../docs/adr/0010-android-native-popup.md) for the package comparison
and root cause. The phone result is a test of the corrected launch configuration
on 0.6.0, not installation or full acceptance of the 0.6.1 candidate.

## Device checks still required for the complete candidate

- Install 0.6.1 and open it from the Extensions menu after restarting Edge.
- Fresh interactive login and reconnect from the popup.
- Send a harmless note and small file; confirm the composer remains expanded.
- Download, close/reopen the popup, and verify the browser download state.
- Confirm the desktop toolbar still opens the side panel.

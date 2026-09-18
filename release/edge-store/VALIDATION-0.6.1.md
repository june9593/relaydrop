# RelayDrop 0.6.1 validation

Status: local candidate, not submitted to Edge Add-ons.

## Changes

- The send form is expanded by default and stays open after sending.
- Android uses a declarative native extension popup. Desktop retains the sidebar.
- An Android sidePanel object no longer selects the unsupported sidebar path;
  the old action override is explicitly cleared during setup.
- Popup dimensions fit small touch viewports; Android sends are labeled phone.
- Touch popups use 24px top corners and a browser-themed outer frame.
- Permissions, Microsoft app registration, token policy, and OneDrive scope are unchanged.

## Verified on September 19, 2026

- TypeScript and all 190 tests pass.
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
- An independent unpacked RelayDrop Test was installed on the phone. Its
  intermediate tab design was rejected by the owner and removed from source.
- The real native popup rejected separate browser windows and the standard
  Fullscreen API. Live CSS inspection confirmed the rounded-corner solution.
- The final independent test installation is version 0.6.1.3, with the same
  executable assets as the 0.6.1 candidate and test-only name/version metadata.
  Reopening from the phone menu created a `POPUP` context with `tabId: -1`,
  24px corners, the composer expanded, and the original five permissions.
  Physical touch scrolling worked; content height, native-handle dragging,
  and window resizing did not increase the browser's 344x537 content viewport.
- The owner declined webpage injection after inspecting Trancy's content-script
  overlay. No activeTab/scripting permission or injectable overlay was added.

An approval-service context limit briefly blocked the phone update. After the
approval configuration changed, the update completed and its installed manifest,
computed styles and actual popup context were checked. The tab prototype and
temporary embedded-options probe were removed. The test installation is now a
persistent rounded popup build, not a live CSS override.

See [ADR-0010](../../docs/adr/0010-android-native-popup.md) for the package comparison
and root cause. The original diagnosis used store 0.6.0; the later launch and
rounding checks used the independent final test installation described above.

## Device checks still required for the complete candidate

- Reopen the final candidate from the Extensions menu after a full Edge restart.
- Fresh interactive login and reconnect from the popup.
- Send a harmless note and small file; confirm the composer remains expanded.
- Download, close/reopen the popup, and verify the browser download state.
- Confirm the desktop toolbar still opens the side panel.

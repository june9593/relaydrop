# ADR-0010: Native Android popup and explicit desktop side-panel selection

- Status: Implemented for 0.6.1; complete-package device acceptance pending
- Date: 2026-09-19
- Supersedes: Android launch selection in ADR-0009

## Physical-device evidence

On Android Edge 153.0.4234.32, the enabled store extension 0.6.0 did nothing
when selected from the Extensions menu. USB DevTools inspection established:

- `runtime.getPlatformInfo()` returned `os: "android"`.
- `chrome.sidePanel` was an object and `sidePanel.open` was a function.
- `sidePanel.getPanelBehavior()` returned `openPanelOnActionClick: true`.
- `action.getPopup({})` returned an empty string.
- Directly opening the bundled extension page rendered the application.
- Setting side-panel action behavior to false and the popup to
  `sidepanel.html?view=popup` restored native menu launch. The owner confirmed
  the popup displayed RelayDrop; DevTools exposed that exact popup URL.

The 0.6.0 tests simulated an absent or rejecting API and manually invoked the
action listener. They did not cover an exposed Android side-panel API or prove
that the real menu could reach that listener. API availability by namespace
is insufficient evidence that the platform supports its visual surface.

## Reference packages inspected

The public Edge store CRX packages were downloaded and inspected statically;
their code was not installed or copied into RelayDrop.

| Extension | Inspected version | Entry point |
| --- | --- | --- |
| SteamDB | 4.37 | `action.default_popup: options/popup.html` |
| Raindrop.io | 6.8.2 | `action.default_popup: index.html?action` |
| Trancy | 7.9.3 | `action.onClicked` sends `toggleSlider` to content scripts |
| Trancy Mobile Only | 4.2.8 | `action.onClicked` sends `toggleSlider` to content scripts |

SteamDB and Raindrop use browser-hosted popups. Trancy's overlay belongs to the
webpage's content-script UI; its full-screen appearance does not establish use
of a native sidePanel or a particular native window type. RelayDrop needs its
own private extension context, not content injection or broader host access.

## Decision

- Declare the complete bundled UI as the default popup in the manifest. It can
  open before the worker runs and does not require `action.openPopup()`.
- Explicitly reset `openPanelOnActionClick` to false on Android, including the
  value left by 0.6.0. Do not infer OS support from API object presence.
- After confirming a desktop OS and successful side-panel setup, clear the
  popup override and retain native sidebar behavior. On setup failure keep
  the popup and configure trusted storage independently.
- Reuse extension-origin authentication, cache, and downloads. Add no
  permissions, content scripts, remote code, or new OAuth callback.
- Keep the composer visible by default and after sends. Collapse is an
  explicit user action, so sending controls do not disappear automatically.

## Validation boundary

Tests cover the manifest entry, Android with an exposed sidePanel API,
unsupported setup, unknown platforms, desktop behavior, and cached UI startup.
The physical-device test changed entry settings on 0.6.0; it is not a test of
the complete 0.6.1 package or a fresh interactive login. Verify login, file
selection/upload, download, and browser restart with the candidate package.

## References

- [SteamDB store listing](https://microsoftedge.microsoft.com/addons/detail/hjknpdomhlodgaebegjopkmfafjpbblg)
- [Raindrop.io store listing](https://microsoftedge.microsoft.com/addons/detail/lpngnnjemnkjmgpoolldhiejhkmmgfge)
- [Trancy store listing](https://microsoftedge.microsoft.com/addons/detail/aepdhbcjfkpncgbmlllcaloniioihlma)
- [Trancy Mobile Only store listing](https://microsoftedge.microsoft.com/addons/detail/oomajmgkhamjhobdlibpaoljemjamffa)
- [Microsoft Edge API support](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support)

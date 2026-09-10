# Changelog

## 0.6.0 — Unreleased

- Restore the account-scoped cached inbox before network authentication after a
  browser restart. Expired sign-in keeps cached content visible with Reconnect.
- Read the newest directory page first; reuse unchanged cached item bodies by
  OneDrive version and load older pages only on request. Preserve cached history
  when refreshing and reconcile deletions within the observed directory range.
- Check on open with a short cooldown and every 30 seconds while visible.
- Open an extension-owned page on Android when the desktop side panel is absent.
  Use persistent extension download tracking, show Downloaded on images, and hide
  unsupported local file-manager actions. Mobile setup links to Edge Add-ons.
- Add startup, restart, offline, pagination, download-state and performance
  regression checks. Android Edge 151 physical-device acceptance is pending.

## 0.5.3

- Add MIT licensing and package project and third-party license texts.
- Generate separate store and sideload ZIPs, with the development key omitted
  from the Edge Add-ons archive.
- Add public contribution guidance and checks without production secrets.
- Preserve the executable assets and functionality validated in 0.5.2.

## 0.5.2

- Verify Microsoft identity-token signatures and personal-account tenant binding.
- Harden concurrent authentication, untrusted OneDrive metadata, file integrity,
  local download actions, and logout cache clearing.
- Add persistent Light/Dark appearance and mobile web guidance.

# Debug Android RelayDrop from macOS

Android USB debugging works from macOS. No root access is required.

1. Enable Android Developer options and USB debugging, connect a data-capable
   cable, and accept the Mac's debugging authorization on the unlocked phone.
2. Run `adb devices -l`; the device must show `device`, not `unauthorized`.
3. Keep Edge in the foreground and the phone unlocked. If the phone sleeps,
   DevTools requests may hang even while ADB still lists the device.
4. Open `edge://inspect/#devices` on the Mac and enable Discover USB devices.
   Open RelayDrop on the phone, then inspect its extension popup when listed.

The popup is short-lived. Closing its sheet removes the debug target; reopen
it and select the new target instead of reusing an old target ID.

## When the popup never opens

Read the exact Edge version; namespace-level API support is not enough:

```sh
adb shell dumpsys package com.microsoft.emmx | rg 'versionName=|versionCode='
adb shell cat /proc/net/unix | rg devtools_remote
```

For the tested Edge 153 device, the socket was `chrome_devtools_remote`, even
though the browser was Edge. After confirming the socket, forward a free port:

```sh
adb forward tcp:9223 localabstract:chrome_devtools_remote
curl --max-time 5 http://127.0.0.1:9223/json/version
```

Verify `Android-Package` is the intended Edge channel before inspecting targets.
`/json/list` lists page targets, but a suspended extension background worker
may be absent. Its absence does not establish a script crash. Querying the
ServiceWorker domain on the browser target was unsupported on this device.

In the extension's own DevTools console, these checks expose no message content
or tokens:

```js
await chrome.runtime.getPlatformInfo()
typeof chrome.sidePanel
await chrome.action.getPopup({})
await chrome.sidePanel?.getPanelBehavior?.()
```

For Android 0.6.1, expect a popup path and `openPanelOnActionClick: false` when
the sidePanel behavior API is exposed. Test launch through the real Extensions
menu. `action.openPopup()` failed on this phone even though menu popups worked.
Do not substitute that API call for physical menu acceptance.

## Acceptance and cleanup

- Verify the installed extension version before attributing a result to a fix.
- Verify Note and File controls are visible on open and stay visible after a send.
- Test a fresh interactive Microsoft login, harmless note/file transfer,
  download completion, and closing/reopening both the sheet and Edge.
- Check a small viewport for horizontal overflow and keyboard obstruction.
- Never collect session storage values, Microsoft tokens, or private feed content
  for a startup diagnostic report.
- Restore any temporary entry-point changes or explicitly record a temporary
  workaround left for the owner. Restore the original stay-awake setting.
- Remove temporary screenshots/XML from the phone and release the forwarding:

```sh
adb forward --remove tcp:9223
```

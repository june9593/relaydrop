# Certification notes

RelayDrop is an independent personal file and note transfer utility. All users
have the same features. There are no paid, hidden, or organization-only features.
Use a tester-owned personal Microsoft account with OneDrive provisioned and
available storage. Work or school accounts are intentionally unsupported. No
developer account credentials, passwords, or access tokens are provided.

## Before testing

The publisher must register the exact callback for the store-assigned extension
ID before submitting. The developer sideload ID alone is not sufficient proof.
The expected form is `https://<extension-id>.chromiumapp.org/oauth2`.

The store package omits the developer-only manifest key and includes required
third-party license notices. It uses the same executable assets as the
owner-validated 0.5.2 sideload build.

The local submission bundle includes `submission-urls.txt` with the actual
companion web app, privacy, and support URLs. Paste the companion URL here when
entering these notes in Partner Center.

## Test steps

1. Install the package in desktop Edge. Select the RelayDrop toolbar action to
   open its sidebar. Sign in with a personal Microsoft account and consent to
   access to the application's OneDrive folder.
2. Send a harmless note, such as “RelayDrop certification test”. Select Refresh
   if needed. Reopen the panel and confirm the note is present.
3. Open the companion web app in another browser/device, sign in with the same
   account, and choose Refresh. Confirm the same note appears. The PWA requires
   manual refresh; there are no push notifications.
4. In the extension, choose or paste a small PNG or text file. Check the image
   preview where applicable, then send it. Confirm retrieval in the web app.
5. Download that file in the extension. Inspect the local actions and use Show
   in Folder. The browser controls its download location; RelayDrop adds a
   `RelayDrop/` subfolder. Open local is available for safe completed files.
   Potentially active files intentionally require Show in Folder.
6. Delete only the local copy and refresh. It should become available to download
   again while the cloud item remains. Delete the cloud item separately when
   finished. Do not use personal or irreplaceable files in this test.
7. Open the account menu, then Settings. Choose Dark, reopen the panel, and confirm
   the appearance persists. Toggle foreground refresh preferences if desired.
8. Log out. Confirm the feed is cleared and automatic reconnect is suppressed
   until Sign in is chosen. Existing downloaded files intentionally remain.

## Expected limitations

- Internet access and a personal OneDrive account are required for cloud actions.
- Files have a 100 MB limit. Use small files for routine certification. No general
  low-memory phone stress result is claimed.
- Cached extension entries may appear before the next cloud refresh. By default,
  opening checks after a two-minute cooldown, and visible panels check every five
  minutes. Closed panels do not sync.
- The interface is in English; the mobile companion is a web app.
- The extension has no website content script and needs no access to arbitrary
  local `file://` pages.

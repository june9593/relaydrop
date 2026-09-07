# RelayDrop privacy policy

Effective date: September 7, 2026

RelayDrop is a client-side utility for sending notes and files between devices
that use the same Microsoft account.

## Data RelayDrop handles

RelayDrop may process:

- the Microsoft account name, username, and account identifier returned during sign-in;
- note text, links, file names, file types, file sizes, and file contents selected by the user;
- device-local settings, recent-item metadata, refresh timestamps, and browser download identifiers.

## Where data goes

RelayDrop signs users in through Microsoft identity and sends content directly
to Microsoft Graph. Notes, descriptors, and files are stored in the signed-in
user's RelayDrop OneDrive App Folder. RelayDrop does not operate an application
content server or database and does not receive a copy of that content.

The hosted web application is served as static files. Its hosting provider may
process ordinary connection information such as IP address, user agent, request
time, and requested asset according to that provider's terms.

## Local storage

The browser extension stores access tokens in session-only extension storage.
It may store the signed-in account hint, appearance and refresh settings, a
bounded cache of recent note/link text and file metadata, and browser download
identifiers in device-local extension storage. Logging out clears RelayDrop's
authentication state and recent-item cache. Appearance and refresh settings,
download-tracking records, and files already downloaded to the device remain
until the user clears or deletes them.

The web app stores Microsoft authentication state and the appearance preference
in browser storage so sessions can survive a tab or browser restart. It does not
persist RelayDrop file bodies or a feed cache in browser storage.

## Sharing and monetization

RelayDrop does not sell personal data, use it for advertising, or share it with
data brokers. Data is shared only with Microsoft services as required for
authentication, OneDrive storage, preview, download, and deletion requested by
the user.

## Permissions

RelayDrop requests `Files.ReadWrite.AppFolder`, which limits Microsoft Graph
access to RelayDrop's dedicated application folder. The extension also requests
browser storage and download permissions for its documented local cache and
user-initiated file actions. It does not request browsing history, active-tab
content, arbitrary local-file access, or native messaging.

## Retention and deletion

OneDrive content remains until the user removes it through RelayDrop or OneDrive.
Microsoft recycle-bin, retention, or backup policies may preserve recoverable
copies. Device-local browser data can also be removed by logging out, clearing
site or extension storage, uninstalling the extension, or deleting downloaded
files through the browser or operating system.

## Support reports

If you choose to request support through GitHub, GitHub stores the report under
its terms and privacy policy, and the maintainer can read the information you
submit. Ordinary issues are public. Private vulnerability reports are visible
to the reporter and people granted access to the advisory. Do not include
passwords, live tokens, or personal file contents in either kind of report.

## Security reports

Please use
[GitHub Private Vulnerability Reporting](https://github.com/june9593/relaydrop-support/security/advisories/new).
The dedicated public support repository accepts private reports. A GitHub
account is required. Do not include personal file contents in a public issue. General support is documented in
[SUPPORT.md](SUPPORT.md).

## Changes

Material changes to this policy will be recorded in the repository and reflected
in the policy published for the web app and browser-extension store listing.

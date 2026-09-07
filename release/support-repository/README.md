# RelayDrop support

RelayDrop is a personal inbox for sending notes, links, images, and files between
your own devices through your personal OneDrive account. The desktop extension
opens in the Microsoft Edge sidebar; phones use the companion web app.

This repository hosts public support and private vulnerability reporting. It
does not contain the RelayDrop application source or your OneDrive content.

## Get help

[Report a bug or request a feature](https://github.com/june9593/relaydrop-support/issues/new/choose).
GitHub issues are public. Use fictional file names and remove account details,
private notes, tokens, OneDrive download links, and personal screenshots before
posting. A GitHub account is required to submit a report.

For a suspected security vulnerability, use
[private vulnerability reporting](https://github.com/june9593/relaydrop-support/security/advisories/new).
Do not post the vulnerability in a public issue. See [SECURITY.md](SECURITY.md).

## Common questions

**Which accounts work?** Personal Microsoft accounts with OneDrive. Work and
school accounts are not supported.

**How do I use it on a phone?** Open the web link shown in the extension's phone
setup card, sign in with the same Microsoft account, and tap Refresh. You can add
the web app to your Home Screen.

**Where are my files?** Cloud content is in RelayDrop's OneDrive App Folder.
Downloaded files are in the browser's download location under `RelayDrop`.
Deleting a local copy does not delete the cloud item.

**Why do I need to refresh?** The web app refreshes manually. The extension can
refresh on open after a cooldown and periodically while visible. It does not
receive push notifications or sync while closed.

**What happens when I log out?** Authentication and the recent-item cache are
cleared. Downloaded files, download-tracking records, and preferences remain
until separately removed.

**Can you reset my Microsoft password or recover OneDrive data?** No. Use
Microsoft's account and OneDrive support for those services.

Read the [privacy policy](PRIVACY.md) for data handling and deletion details.
The interface is currently in English. RelayDrop is an independent project and
is not affiliated with or endorsed by Microsoft.

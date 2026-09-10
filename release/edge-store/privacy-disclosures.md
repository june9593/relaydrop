# Partner Center privacy disclosures

These answers describe version 0.6.0. Match the actual field labels displayed by
Partner Center; do not select “no user data” merely because there is no RelayDrop
content backend. The client accesses personal data and transmits selected
content to Microsoft services.

## Single purpose

RelayDrop lets a user send and retrieve notes, links, images, and files between their own devices using a dedicated folder in their personal OneDrive account.

## Permission justifications

| Manifest permission | Text for the review form |
| --- | --- |
| `sidePanel` | Displays the RelayDrop personal inbox and file composer in the browser sidebar. |
| `identity` | Uses Microsoft OAuth with PKCE to sign in to a personal Microsoft account and receive the browser's extension-specific callback. |
| `storage` | Keeps access tokens in session-only extension storage. Local storage holds account hints, preferences, up to 50 recent note/link texts and file metadata, OneDrive item IDs and version tags, refresh state, and account-scoped browser download IDs. Expired sign-in keeps cached items available; explicit logout clears authentication and the recent-item cache. |
| `downloads` | Saves files selected by the user in the RelayDrop download folder, checks their local availability, reveals completed downloads, and removes a local copy on explicit request. |
| `downloads.open` | Opens a completed, existing, safe download only after the user chooses Open local. Files that may contain active content are sent to Show in Folder instead. |
| `https://graph.microsoft.com/*` | Reads and writes RelayDrop's dedicated OneDrive App Folder using the signed-in user's delegated Files.ReadWrite.AppFolder permission. |
| `https://login.microsoftonline.com/*` | Exchanges authorization codes and retrieves Microsoft's discovery and public signing keys to verify identity tokens. |
| OneDrive content hosts listed below | Follows Microsoft Graph file-content redirects and loads file bytes or previews returned by the user's OneDrive. Microsoft Graph bearer tokens are not forwarded to these content hosts. |

OneDrive host patterns:

- `https://*.microsoftpersonalcontent.com/*`
- `https://*.files.1drv.com/*`
- `https://*.1drv.com/*`
- `https://*.storage.live.com/*`
- `https://*.livefilestore.com/*`
- `https://*.svc.ms/*`

## Remote code

No. All executable JavaScript and fonts are bundled with the extension. Microsoft OAuth responses, public signing keys, and user-selected OneDrive content are data, not remotely executed extension code.

## Data categories to disclose

| Category shown in the form, or closest equivalent | Handling |
| --- | --- |
| Personally identifiable information | Microsoft account display name, username/email, and account identifier for sign-in and account-scoped state. |
| Authentication information | OAuth authorization results and session access tokens. Microsoft hosts password entry; RelayDrop does not collect account passwords. |
| Personal communications / user-provided content | Notes, links, file names, metadata, images, and file contents deliberately provided by the user. Select all form categories that cover this content. |
| Download information | Browser download identifiers, status, and local file paths needed for requested local file actions. |

There is no background collection of browsing history, visited pages, website
content, keystrokes, location, health information, or payment information. Users
can voluntarily place sensitive content in a note or file; do not market that
content as outside the privacy policy merely because it was user-provided.

## Limited-use certifications

The implementation supports these statements: user data is not sold, used for
advertising or credit decisions, or transferred for unrelated purposes. Data is
used for the disclosed personal transfer functionality. Confirm the exact
statements presented by Partner Center before the account owner submits them.

## Retention and recipients

Content goes directly to Microsoft identity, Microsoft Graph, and the user's
OneDrive. Local cached note/link text and metadata may persist when sign-in expires.
Logout clears authentication and the recent-item cache; downloaded files,
download-tracking records, and preferences remain until separately removed.
OneDrive retention and recycle-bin policies apply to cloud deletions. The hosted
PWA provider may process ordinary connection logs. See the published privacy
policy for the complete disclosure.

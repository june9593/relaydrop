# RelayDrop adversarial security review — September 7, 2026

## Scope and method

This was an authorized local review of the browser extension and shared web
client code. An independent coding-agent session approached the build as an
attacker and created isolated proofs of concept for authentication, untrusted
OneDrive data, download handling, local cache behavior, and resource-exhaustion
boundaries. No third-party account, production user content, or unrelated
system was targeted.

The review followed a reproduce, minimize, fix, and regression-test loop. Proofs
of concept remained outside the repository; only safe regression tests and the
resulting protections are retained here.

## Findings and resolutions

| Area | Pre-fix risk | Resolution | Status |
| --- | --- | --- | --- |
| Extension ID tokens | An unsigned or forged token could be trusted by the client-side session parser. | Accept RS256 only; verify the signature through Microsoft discovery/JWKS; restrict identity URLs; enforce the personal-account tenant, issuer, nonce, audience, authorized party, and expiry; renew legacy sessions. | Fixed and regression-tested |
| Authority configuration | A malicious build-time authority could redirect sign-in to an attacker-controlled origin. | Accept only the exact Microsoft `consumers` authority in both web and extension configuration. | Fixed and regression-tested |
| Cross-panel authentication races | A logout or account switch could race a cached token read or stale account notification. | Bind sessions, shared token requests, commits, and notifications to an authentication epoch; fail closed when account binding is missing. | Fixed and regression-tested |
| File ownership and integrity | A descriptor could point previews at a different App Folder item, or replaced bytes could be accepted during download or upload retry. | Bind the drive item to the deterministic blob folder, ID, storage name, and size; never use a preauthenticated download URL as a generic open target; require exact size and SHA-256 equality for downloads and retry-reused blobs. | Fixed and regression-tested |
| Untrusted metadata and pagination | Oversized descriptors, fields, or cyclic continuation links could consume excessive resources. | Add descriptor and field limits, a 100 MB file ceiling, page/item caps, loop detection, and bounded Graph retry delays. | Fixed and regression-tested |
| Presentation and link URLs | Untrusted URLs in Graph metadata or a tampered local cache could reach navigation/rendering paths. | Allow only expected HTTPS Microsoft/OneDrive content hosts and downgrade unsafe cached links to inert text. | Fixed and regression-tested |
| File-name spoofing and local opening | Directional controls could disguise extensions; active-content files could be opened directly. | Reject or strip bidirectional/zero-width controls, recheck current download state/name, honor the browser danger signal, and require potentially active content to be reviewed through Show in Folder. | Fixed and regression-tested |
| Logout cache clearing | Failure to rotate the cache generation could leave the previous plaintext feed snapshot readable. | Attempt generation rotation and physical cache removal independently; either successful path makes the old snapshot unavailable. | Fixed and regression-tested |

## Verification completed

- TypeScript checks for the PWA and extension
- Full automated unit suite, including new adversarial regression tests
- Production PWA and extension builds
- Manifest permission, CSP, static-host header, secret, privacy, and build-output scans
- Production dependency advisory audit
- Personal-account Entra registration review: personal accounts only, no client secret or certificate, implicit grants disabled, and delegated Graph access limited to `Files.ReadWrite.AppFolder`

## Residual risks and release gates

- RelayDrop does not provide end-to-end encryption independent of Microsoft and
  OneDrive. A compromised account, device, browser profile, or static host can
  expose content available to that trust boundary.
- The extension's quick-start cache intentionally stores up to 50 recent notes,
  links, and file metadata locally. Logout clears it, but device compromise can
  expose it while present.
- Processing a file near the 100 MB limit remains memory intensive even after
  incremental hashing removed the largest avoidable copy. The security boundary
  is enforced, but low-memory mobile devices still require real-device stress
  testing or a lower mobile release limit.
- Verified presentation metadata is cached only until the next feed refresh.
  Moving or replacing a OneDrive item during that short window is detected on
  the next refresh or authenticated download, not continuously in the background.
- Descriptor publication uses a deterministic path with post-error equivalence
  checks, but Microsoft Graph does not provide an atomic create-only transaction
  across the current two-object file publication flow.
- The final Edge Add-ons package ID must be registered as an exact redirect URI
  and the packaged Open local flow must be tested in Edge, because browser user
  activation behavior can differ across releases.
- Development localhost redirects should be moved to a separate development
  registration or removed from the production registration before a public
  store release.
- GitHub Private Vulnerability Reporting must be enabled immediately after the
  repository becomes public. The policy, support page, and `security.txt` are
  prepared, but GitHub does not expose that feature for this private repository.
- The general support and vulnerability links also remain inaccessible to
  non-collaborators while the repository is private. If the extension is
  distributed before the source repository becomes public, replace them with a
  public support repository, form, or dedicated security mailbox first.
- Add a `Canonical` field to `security.txt` when the final custom production
  domain is selected.

No unresolved critical or high-severity code finding from this review remains
in the 0.5.2 candidate. The residual items above are operational, compatibility,
or bounded resource-use work and must be rechecked against the exact store
archive.

## Release preparation update — September 7, 2026

After this review, the owner accepted the 0.5.2 package. A separate public
`relaydrop-support` repository was created and GitHub Private Vulnerability
Reporting was enabled there. The support, privacy, and security policy files now
point to that dedicated channel. This resolves the need to make application
source public merely to offer support. The earlier observations above describe
the state at review time; they do not supersede this update.

The application source remains private. Old GitHub commit objects are still
reachable by known SHA despite the cleaned branch history; public source release
remains a separate unresolved item. Store-ID authentication and low-memory phone
stress checks also remain distinct from the owner's normal-use acceptance.

## Open-source distribution update

Version 0.5.3 distributes the same executable assets with MIT licensing and
packaged third-party notices. Public source starts from an independent clean
release snapshot; the private history described above is not imported into it.
These historical review notes do not imply that old private objects belong to
the new public repository.

# Edge Add-ons submission kit

Target package: **0.5.3**, with executable assets validated in 0.5.2 on **September 7, 2026**.

The accepted 0.5.2 sideload archive remains unchanged. Version 0.5.3 adds the
MIT project license and third-party notices and omits the development manifest `key`, which
Edge Add-ons rejects. Its executable assets are byte-identical to the accepted
build. Version 0.5.3 passed package validation and was submitted on September 7,
2026. Partner Center shows **In review**, with an estimated response within seven
business days. It is not yet available for installation from the store. The bundle under
`artifacts/edge-store-0.5.3/` combines the store ZIP, assets, copy, reviewer notes,
hashes, and deployment-specific URLs. The latter stay outside Git so private
deployment configuration is not added to source history.

## Form materials

- [English listing](listing.en-US.md): extension description and search terms.
- [Simplified Chinese listing](listing.zh-CN.md): optional additional store language;
  the product interface remains English.
- [Privacy and permission disclosures](privacy-disclosures.md).
- [Certification notes](reviewer-notes.md).
- [Verification record](VALIDATION.md).
- `assets/`: logo and screenshots, with sample content only.

Suggested category: **Productivity**. The package's current name and short
description already match the English listing. Website should point to the
hosted PWA, Privacy Policy URL to its `/privacy.html`, and Support contact to the
public support page or repository.

## Submission status and follow-up

The package, availability, properties, privacy declarations, and English listing
are Complete. Developer verification is Authorized. The owner approved the three
data-use attestations and publication; the final submission is now In review.

The owner confirmed the actual store CRX ID and successfully signed in with the
0.5.3 test distribution. Its exact OAuth callback is registered. Production uses
four HTTPS callbacks; localhost callbacks were removed. Use a separate app
registration for development.

After approval, verify installation and updates through Edge Add-ons and add the
store URL to the README. Public support, private vulnerability reporting, and
privacy pages were checked anonymously. The maintainer's notification preference
was not readable with the current GitHub CLI token and is not claimed as verified.

The English listing includes the prepared logo, description, seven search terms,
and all three screenshots. The dashboard's Add a language control is disabled
for the current package; the Chinese copy remains a prepared local artifact for
a future manifest-localization update.

Package validation and submission are not store certification. The observed
submission status is recorded in the local receipt.

Public source is licensed under MIT and starts from a clean release snapshot.
Earlier private history is retained separately and is not imported into the
public repository. Rewriting branch history alone does not prove that a hosting
service has purged old objects.

The owner has accepted normal 0.5.2 usage. A separate real-device test near the
100 MB limit on low-memory phones remains outstanding and must not be reported
as covered by that acceptance. It is not evidence of a desktop security bypass.

## Asset requirements verified on 2026-09-07

| Item | Microsoft requirement | Prepared format |
| --- | --- | --- |
| Logo | Square, at least 128 × 128; 300 × 300 recommended | 300 × 300 PNG |
| Screenshots | Up to six, 640 × 480 or 1280 × 800 | 1280 × 800 PNG |
| Long description | 250–10,000 characters | English and optional Chinese copy |
| Search terms | Up to seven; each ≤30 characters; ≤21 words total | Seven per language |

Promotional tiles and video are optional and are not required for this package.
Screenshots use the real 0.5.2 React components with isolated fictional data;
their sample content does not represent a live account or test evidence.

## Sources

- [Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)
- [Configure GitHub private vulnerability reporting](https://docs.github.com/code-security/security-advisories/repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository)

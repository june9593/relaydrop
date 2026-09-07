# Release preparation verification — September 7, 2026

The owner accepted the normal-use 0.5.2 sideload package before this preparation
work began. This change updates support/privacy pages, release documentation,
and isolated screenshot tooling; it does not change extension application code.

## Verified during 0.5.2 preparation

- 168 tests in 23 files passed; PWA and extension TypeScript/build checks passed.
- Source, build output, manifest permissions/CSP, headers, and workflow security
  scans passed. Production dependency audit reported no known vulnerabilities.
- The accepted sideload 0.5.2 ZIP has 23 files and remains unchanged. Its SHA-256 is
  `a644ebcf737880009ec5e4be99eaa2c88af3fa07dd8e44f994b511feeec49a82`.
- The store ZIP contains 24 files. It adds `THIRD_PARTY_NOTICES.txt` and removes
  only the development `key` from the manifest; all executable assets remain
  byte-identical. Its SHA-256 is
  `1b7f9ec67fb9bc6d880ddeadb5610a982ca3d28c7bef06d2e4fdc8040f7ffdfb`.
  Partner Center accepted this package and shows its package step as Complete.
- Notices preserve the installed license texts for 14 production/PWA packages.
  `pnpm notices:check` verifies that both distributions contain current notices.
- The developer verification summary shows Authorized. The existing draft's
  package, availability, properties, and English store listing are Complete.
  The English listing contains the logo, seven search terms, description, and
  all three screenshots; the draft has not been published.
- The actual store CRX ID was read from the draft identity page. Its exact OAuth
  callback was added through the chosen personal account context, and a fresh
  read confirmed the new callback plus all five existing callbacks. The app
  remains personal-account-only, with no client password or certificate.
- Three screenshots were rendered in isolated headless Microsoft Edge from real
  components with fictional account/content fixtures. The render made no
  external HTTP requests and produced no page errors. All are 1280 × 800 PNG;
  the existing logo was exported as a 300 × 300 PNG.
- The English and Chinese descriptions meet the 250–10,000 character range;
  both sets of search terms meet the count and length requirements.
- `june9593/relaydrop-support` is public and its private vulnerability reporting
  API returns `enabled: true`. Anonymous requests can read the support repository,
  issue listing, security policy, and privacy policy. Starting a private report
  redirects anonymous users to the expected GitHub sign-in page.
- The public support snapshot contains only six support/privacy/template files,
  with no application source, deployment configuration, or inherited history.

## Still to verify

- Maintainer GitHub notification subscription. The current CLI token lacks the
  permission to read that account preference; no new token scope was requested.
- Separate near-limit file tests on low-memory phones. Normal owner acceptance
  and desktop checks do not establish that result.

These materials are not evidence of Microsoft certification or a published
store listing. Public source uses an independent
clean release snapshot; earlier private history is not imported.

## 0.5.3 publication preparation

The owner authorized MIT open-source publication, store submission, and all
three data-use attestations. The privacy page has been saved as Complete.
Production localhost callbacks were removed and a fresh read verified four
HTTPS callbacks, unchanged Graph permissions, personal accounts only, and no
client password or certificate.

Version 0.5.3 adds the project MIT license to both distributions. Store and
sideload archives have 25 files, and their executable assets remain identical
to the accepted 0.5.2 build. The store archive omits the developer key; the
sideload archive retains it for a stable ID.

- Store SHA-256: `86365132f7a251b32f52c1529ebf995fcc0bdabcb79db0d021e2cd0d74a2a22c`
- Sideload SHA-256: `13810338bd464cb47f319221a32cdb78ec7983e503a37570c4698df89eaea009`

The owner loaded the 0.5.3 test distribution with the store public key, confirmed
the extension ID `haadfdpcnjildomodlbpgapoemgdejef`, and successfully signed in.
This verifies the native store-ID OAuth flow before submission. Installation
and updates through the published store remain dependent on certification.

Version 0.5.3 was uploaded and passed package validation. All five submission
sections showed Complete. After the certification notes and final Publish
action, Partner Center showed **In review** for 0.5.3 on September 7, 2026, with
an estimated response within seven business days. A store URL is not yet available.

## Reproduce screenshots

Use a local Vite server bound to loopback on port 4186, then run
`python3 scripts/capture-store-assets.py`. The renderer requires Python
Playwright, Pillow, and installed Microsoft Edge. It never loads the real
authentication service or Microsoft Graph client. Fixture entry points live
under `scripts/store-preview/`, outside both production build inputs.

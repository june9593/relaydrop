# Contributing to RelayDrop

Use an issue to describe a bug or proposed improvement before making a large
change. Keep contributions focused on sending private notes and files between
a user's own devices.

## Local development

Install Node.js 22 or newer and pnpm 10 or newer, then run:

    pnpm install
    pnpm dev

Without local environment configuration, the app runs with in-memory sample
content. Microsoft sign-in is not needed for interface development or unit
tests. Use your own development application registration for live OneDrive
testing; see [Azure setup](docs/AZURE_SETUP.md).

Before opening a pull request, run:

    pnpm check
    pnpm notices:check
    pnpm build
    pnpm security:check

Run `pnpm notices:generate` after changing dependencies. The production release
also runs `pnpm release:check`, using deployment configuration stored outside
the repository. Pull-request checks do not receive production credentials.

Include the behavior changed and relevant validation in the pull request.
Keep credentials, personal account details, real user content, recordings,
and machine-specific paths out of commits and issue reports. Use fictional
sample data and retain third-party copyright notices.

## Security reports

Please follow [SECURITY.md](SECURITY.md) instead of opening a public issue for a
suspected vulnerability. Test only accounts, devices, and files you own or have
explicit permission to test.

## License

Contributions to this repository are provided under its [MIT license](LICENSE).
Third-party components retain their respective licenses.

# Security policy

Sarab includes a privileged Windows driver installation path, registry writes, Windows service management and a locally served control API. Treat these as security-sensitive components.

## Supported versions

Security fixes are prioritized for the most recent published release and the current `main` branch. No long-term support commitment is currently published for earlier releases. See [Releases](https://github.com/TheMRVX/sarab/releases) for the latest available version.

## Reporting a vulnerability

**Do not publish exploit details, tokens, recovery keys or vulnerabilities in public issues, pull requests or GitHub Discussions.**

As reviewed on 2026-10-31, GitHub Private Vulnerability Reporting is **not enabled** for this repository, and no dedicated security email address is published. Before reporting, check the repository's [Security tab](https://github.com/TheMRVX/sarab/security) for any newly enabled private report mechanism. If one exists, use it. Otherwise, contact the maintainer **privately** using an appropriate contact method they have made available on their [GitHub profile](https://github.com/TheMRVX); do not disclose details publicly while a secure channel is being arranged. If no private channel is available, do not post exploit details to an issue.

In your private report, include affected versions/commits, prerequisites, minimal reproduction steps, impact and possible mitigations. Omit real credentials or personal location histories unless absolutely necessary and authorized.

There is no published guaranteed response time or bug-bounty program. Please allow the maintainer to triage and coordinate a fix before public disclosure.

## Security assumptions

- Test Signing and Secure Boot changes lower platform protections; follow [installation safety instructions](docs/INSTALLATION.md).
- The distributed driver signing approach is for testing, **not** a production-trusted or Microsoft-attested driver guarantee.
- The dashboard is intended to bind to loopback (`127.0.0.1` by default). Never expose its privileged API to the public internet.
- The local `.session_token` file contains a credential. Treat it as secret and redact it from reports.
- Driver install/uninstall and certificate-store changes should be performed only on machines you are authorized to administer.
- CI build success does not prove that driver installation, rollback, Windows service isolation or anti-spoofing behavior is secure.

For security-related maintenance work, see [CONTRIBUTING.md](CONTRIBUTING.md#driver-and-security-changes).

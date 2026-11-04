# Security policy

Sarab includes a privileged Windows driver installation path, registry writes, Windows service management and a locally served control API. Treat these as security-sensitive components.

## Supported versions

Security fixes are prioritized for the most recent published release and the current `main` branch. No long-term support commitment is currently published for earlier releases. See [Releases](https://github.com/TheMRVX/sarab/releases) for the latest available version.

## Reporting a vulnerability

**Do not publish exploit details, tokens, recovery keys or vulnerabilities in public issues, pull requests or GitHub Discussions.**

Use GitHub's [private vulnerability reporting form](https://github.com/TheMRVX/sarab/security/advisories/new), enabled for this repository on 2026-11-02. Reports are private to the maintainers and people explicitly involved in the advisory. If the form is unavailable, check the [Security tab](https://github.com/TheMRVX/sarab/security) or contact the maintainer privately using a contact method published on their [GitHub profile](https://github.com/TheMRVX). Do not post exploit details publicly while a secure channel is being arranged.

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

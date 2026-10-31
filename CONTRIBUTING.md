# Contributing to Sarab

Thanks for helping improve Sarab. Contributions include bug reports, reproducible tests, code, documentation and accessibility improvements.

Read the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md) before participating. This project has privileged Windows components; use a disposable VM or dedicated test machine for driver experiments.

## Before filing an issue

Search [existing issues](https://github.com/TheMRVX/sarab/issues) and check the [troubleshooting guide](docs/USAGE.md#limitations-and-troubleshooting). Include your Windows version/build, x64 architecture, Sarab version, installation mode, exact steps, expected/actual behavior and **sanitized** diagnostics. Never post session tokens, private keys, recovery keys, system identifiers or other sensitive logs. Use the issue templates.

For a feature proposal, describe the use case and acceptance criteria rather than only an implementation idea. Discuss potentially disruptive architecture changes in an issue before investing in them.

**Security vulnerabilities must not be filed as public issues.** See [SECURITY.md](SECURITY.md).

## Set up a development environment

See [docs/BUILDING.md](docs/BUILDING.md). The project has three independent parts: the Rust CLI/server (`app/`), the C++ UMDF driver (`driver/`), and React/TypeScript dashboard (`gui/`).

On Windows:

```powershell
cd gui
npm ci
npm run build
cd ..\app
cargo fmt --check
cargo clippy --locked -- -D warnings
cargo test --locked
```

Run driver-specific Windows tests where relevant. Record whether tests were executed, skipped or blocked. CI compilation is not evidence that privileged installation and real GNSS reporting were tested.

## Make a focused pull request

- Base your work on the latest `main`; prefer a small, single-purpose branch.
- Link the issue and explain what behavior changed and why.
- Use descriptive [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), e.g. `fix(driver): handle expired GNSS fix sessions`.
- Include regression tests for bug fixes where feasible.
- Update documentation in the same PR as user-visible behavior changes.
- Describe actual testing, security/compatibility risks, screenshots for visual UI changes, and any untested Windows configurations.
- Avoid broad formatting changes mixed with fixes, generated build output, credentials and unsourced compatibility claims.
- Respect maintainers' review feedback. Do not merge with failing mandatory checks or bypass repository rules.

Sarab is currently a small project: contributions may require maintainer review and can be delayed. Automated self-review does not substitute for independent human approval when required.

## Driver and security changes

UMDF driver, certificate, privilege, Windows registry, firewall, service or API-authentication changes deserve extra care. Document ownership/lifetime boundaries for Rust/C++ interoperability, verify rollback and uninstall behavior, and do not silently relax safeguards to pass tests. Obtain explicit authorization before testing privileged changes on shared or production systems.

## Licensing

The project is offered under [MIT](LICENSE-MIT) OR [Apache-2.0](LICENSE-APACHE), at your option. Unless explicitly stated otherwise, a contribution intentionally submitted for inclusion is provided under the same dual-license terms, with no additional terms or conditions. Confirm you have the right to submit code and assets; do not copy proprietary code or copyrighted assets without appropriate permission.

For help, see [SUPPORT.md](SUPPORT.md).

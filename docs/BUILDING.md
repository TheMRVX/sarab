# Building and validating Sarab

## Toolchain

Build on Windows x64 with the current stable Rust MSVC toolchain, Visual Studio 2022 C++ build tools, compatible Windows SDK and WDK, and Node.js/npm for the dashboard. Cross-building or non-Windows Rust tests do not replace real driver verification on Windows.

## Dashboard and Rust

```powershell
cd gui
npm ci
npm run build
cd ..\app
cargo fmt --check
cargo clippy --locked -- -D warnings
cargo test --locked
cargo build --release --locked
```

`app/src/web.rs` embeds `gui/dist/` using `rust-embed`: build the dashboard before compiling the Rust executable if frontend assets were changed.

## Driver

Build `driver/SarabGnss.vcxproj` in Release/x64 with a compatible WDK. Driver packaging also requires an INF, a generated catalog and a test signature for a Test Signing installation. Review [the CI build](../.github/workflows/ci.yml) and [release workflow](../.github/workflows/release.yml) for current automation. They build on GitHub-hosted Windows runners but cannot establish successful runtime behavior of the driver on a real target PC.

**Do not install test drivers, modify boot settings or import a trusted root certificate as part of an ordinary automated PR test.** These are privileged operations, not standard unit-test gates.

## Repository contribution workflow

1. Search for or create an issue describing the problem, scope and acceptance criteria.
2. Create a short-lived branch from current `main` (optionally with a separate Git worktree).
3. Implement a focused change, update relevant docs and add appropriate tests.
4. Inspect the diff and commit using Conventional Commits, e.g. `docs(readme): clarify test-signing requirements`.
5. Open a pull request using the repository template; describe actual validation, limitations and risks.
6. Address review findings and CI results before merging. No silent bypass of required reviews or checks.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for details and [the GitHub community guide](https://docs.github.com/en/communities).

## Releases

The repository has an Actions workflow that builds an archive, signs test driver components, compiles an optional installer and publishes release assets on version tags or manual dispatch. Do not assume signing equals production trust. Check each asset and checksum before installation.

The current `scripts/release.sh` can create a local version-bump commit, tag and push. It should **not** be run directly on a protected `main` branch in a PR-first workflow without an approved release procedure. Release engineering improvements should be scoped separately.

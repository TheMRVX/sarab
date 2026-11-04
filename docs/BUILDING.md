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

Merge the version bump and generated assets through a PR first. From a clean `main` synchronized with `origin/main`, run `bash scripts/release.sh vX.Y.Z`. The script requires all eight checks in the main branch ruleset to succeed on that exact commit, prompts before tagging (or accepts `--yes`), and pins the annotated tag to the verified SHA. Missing, skipped, pending, failed or non-GitHub-Actions required checks block tagging.

Version tags matching `v*` must not be moved or deleted. To correct a published version, prepare a new version through a PR. A manual Release run is a dry run unless `publish=true`; publishing also requires an existing version tag whose commit is on `main` and has passed all required checks. A supplied `release_tag` is checked out explicitly so the built code matches the tag.

The publishing job creates a draft, uploads all four assets, then publishes it. It never overwrites an existing release or draft. A failed upload leaves an unpublished draft for maintainer inspection. Release immutability locks the assets and associated tag once published; it applies to future releases, not retroactively to older ones. The checksum file covers the ZIP, installer and public certificate.

## Dependency updates

Dependabot checks GitHub Actions, `app/Cargo.toml` and `gui/package.json` weekly on Mondays (Asia/Tehran). Compatible Cargo/npm updates are grouped; major updates remain separate. Actions retain full commit SHA pins. Updates open ordinary PRs and must pass the same checks; auto-merge is not enabled. Existing Dependabot security updates remain enabled independently of the weekly version-update schedule.

Dependency changes may also require rebuilding `gui/dist` and regenerating `THIRD-PARTY-NOTICES.md` using the license-audit workflow's procedure. Review those generated changes and license results before merging an update PR.

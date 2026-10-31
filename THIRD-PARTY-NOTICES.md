# Third-party notices and license inventory

Sarab uses third-party software. This file is a **non-exhaustive inventory**, not a substitute for the actual license files of every dependency included in a release. For redistributed binaries, audit the exact resolved dependencies from `app/Cargo.lock` and `gui/package-lock.json`, plus native driver build inputs, assets, and runtime components.

## Frontend (direct dependencies)

- React and React DOM — MIT; copyright Meta Platforms, Inc. and contributors.
- Leaflet — BSD-2-Clause; copyright Volodymyr Agafonkin and other contributors.
- Material UI and MUI icons — MIT; copyright respective MUI contributors.
- Emotion — MIT; copyright respective Emotion contributors.

These are direct dependencies, **not the complete frontend dependency tree**. Preserve any additional notices shipped with the resolved packages.

## Rust (direct dependencies)

The CLI and daemon use `clap`, `serde`, `serde_json`, `toml`, `anyhow`, `rust-embed`, `tiny_http`, `mime_guess`, `quick-xml`, `ureq`, `getrandom`, `windows`, and `windows-service` (the last two Windows-specific). Verify their exact resolved versions, features, license expressions and transitive dependencies against `app/Cargo.lock` and the upstream license texts before release. Do not infer license compliance from this summary.

## Other materials

Windows SDK/WDK, generated driver files, test-signing certificates, map tiles, route services, bundled fonts, icons and installer/runtime dependencies have different origins and distribution considerations. Do not assume these materials are covered by Sarab's MIT/Apache dual license. Identify and retain applicable terms for anything actually redistributed.

## Audit procedure

1. Resolve and record dependency versions using lockfiles and build manifests.
2. Generate a dependency/license inventory using maintained tooling, then inspect exceptions and multiple-license expressions manually.
3. Collect the required license and copyright notices for **redistributed** components, including transitives and assets.
4. Compare the inventory with the final installer and ZIP contents; keep release-specific evidence.
5. Do not claim a full compliance audit until the inventory and notices are complete.

See [licensing and redistribution](docs/LICENSING.md) for project-license terms.

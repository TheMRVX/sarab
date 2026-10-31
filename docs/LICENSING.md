# Licensing and redistribution

Sarab source is offered under **MIT OR Apache-2.0**, at your option, as stated in `app/Cargo.toml` and `gui/package.json`. Read the full texts in [LICENSE-MIT](../LICENSE-MIT) and [LICENSE-APACHE](../LICENSE-APACHE).

This repository uses the two-file dual-license convention. No custom root LICENSE is required. The [NOTICE](../NOTICE) is intentionally minimal because Apache-2.0 §4(d) can require preservation of its attribution notices in derivative distributions.

## Contributions

Unless explicitly stated otherwise, any contribution intentionally submitted for inclusion in Sarab by you, as defined in Apache-2.0, shall be dual licensed under MIT OR Apache-2.0, without any additional terms or conditions. This does not override separate contributor agreements or rights of third parties.

## Distribution

Preserve the copyright and license terms of Sarab and **all applicable redistributed third-party components**. The [third-party notices](../THIRD-PARTY-NOTICES.md) are not a verified complete dependency inventory. In particular, Leaflet's BSD-2-Clause terms require reproduction of its copyright, conditions and disclaimer in documentation and/or other materials accompanying binary redistribution. Do not remove those notices.

Use exact lockfile-resolved dependency versions to audit the release with `cargo about` or `cargo deny`, and a Node dependency-license checker. Review transitive packages, bundled fonts/icons and map-tile attribution. A tool-generated list must be manually checked against actual shipped artifacts.

Existing releases keep their original license grants; changes to repository documents do not retroactively alter them.

## Release verification

Before publishing a release, confirm the archive and installer include `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE` and complete third-party license notices, then inspect the built outputs. CI compilation alone is insufficient to prove redistribution compliance.

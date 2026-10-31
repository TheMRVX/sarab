# Licensing and redistribution

Sarab's current source is offered under **MIT OR Apache-2.0**, at the recipient's option. The complete license texts are in [LICENSE-MIT](../LICENSE-MIT) and [LICENSE-APACHE](../LICENSE-APACHE). The root [LICENSE](../LICENSE) explains this dual-license choice. The [NOTICE](../NOTICE) contains attribution information; it does not change the license.

## Redistribution checklist

- Include both license texts and the dual-license explanation when distributing the current source or binaries. Retain applicable copyright notices.
- Under Apache-2.0, follow section 4, including prominent notices on modified files and retention of applicable NOTICE content in derivative distributions.
- Third-party dependencies, embedded resources, icons, map assets and build tools may have **different** terms. Inspect exact resolved versions and their original license files; [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) is a starting inventory, **not** a complete legal bill of materials.
- Review the actual ZIP and installer contents on every release. Do not assume source-only dev dependencies are redistributed, or that all binary dependencies appear in direct-dependency manifests.
- This policy describes the current source tree. **Historical releases retain the licenses under which they were published**; do not retroactively describe v1.0.0 or other prior artifacts as having newly added terms.
- Contributors must own or have permission to submit their work under both project licenses; [CONTRIBUTING.md](../CONTRIBUTING.md) documents the default contribution terms.

## Release verification

The release workflow copies the full license texts, LICENSE explanation, NOTICE and third-party notices into the ZIP and the Inno Setup payload. Before publication, inspect the produced artifacts, compare dependency lockfiles and license data, and resolve any missing attribution. No claim of complete third-party compliance is made without an audited software bill of materials.

## Upstream/downstream projects

Independent projects using Sarab may choose the terms of either applicable project license for the version they received, while honoring third-party licenses and applicable attribution conditions. Independence and compatibility do not imply official endorsement.

This guide is technical compliance documentation, not legal advice.

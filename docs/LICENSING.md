# Licensing and redistribution

Sarab source is offered under **MIT OR Apache-2.0**, at your option, as stated in `app/Cargo.toml` and `gui/package.json`. Read the full texts in [LICENSE-MIT](../LICENSE-MIT) and [LICENSE-APACHE](../LICENSE-APACHE).

This repository uses the two-file dual-license convention; there is no custom root LICENSE file. The [NOTICE](../NOTICE) is intentionally minimal because Apache-2.0 §4(d) can require preservation of its attribution notices in derivative distributions.

## Contributions

Unless explicitly stated otherwise, any contribution intentionally submitted for inclusion in Sarab by you, as defined in Apache-2.0, shall be dual licensed under MIT OR Apache-2.0, without any additional terms or conditions. This does not override separate contributor agreements or rights of third parties.

## Distribution

Preserve the copyright and license terms of Sarab and **all applicable redistributed third-party components**. The [third-party notices](../THIRD-PARTY-NOTICES.md) are not a verified complete dependency inventory. In particular, Leaflet's BSD-2-Clause terms require reproduction of its copyright, conditions and disclaimer in documentation and/or other materials accompanying binary redistribution. Do not remove those notices.

Use exact lockfile-resolved dependency versions to audit the release with `cargo about` or `cargo deny`, and a Node dependency-license checker. Review transitive packages, bundled fonts/icons and map-tile attribution. A tool-generated list must be manually checked against actual shipped artifacts.

Existing releases keep their original license grants; changes to repository documents do not retroactively alter them.

## Release verification and automated inventory

The committed [third-party license report](../THIRD-PARTY-NOTICES.md) is generated from exact lockfile versions by the license-audit workflow. Before packaging, the release workflow runs cargo-deny, generates Rust license texts with cargo-about from the Windows-target Cargo.lock graph, runs license-checker for frontend production dependencies from package-lock.json, and assembles a fresh redistribution notice using scripts/generate_third_party_notices.py. The audit CI job verifies that the committed notice is up to date, and retains its source reports as downloadable artifacts.

The Inno Setup license dialog displays an OR choice together with both full, unmodified project license texts. All source and binary releases also include the separate LICENSE-MIT and LICENSE-APACHE files. Manual workflow_dispatch runs are dry runs by default; only explicit publish=true may publish a release.

Review any native driver assets, fonts, icons, service integrations, geospatial data, and other bundled or runtime-sourced materials separately. Scanners do not certify these. Inspect actual ZIP and Installer payloads before publication; CI compilation does not establish legal compliance or driver runtime behavior.

## OpenStreetMap tiles

The Leaflet UI requests https://tile.openstreetmap.org/{z}/{x}/{y}.png and includes visible contributor attribution with a link to https://www.openstreetmap.org/copyright. The OpenStreetMap Foundation tile-use rules (https://operations.osmfoundation.org/policies/tiles/) additionally govern live network requests: preserve a browser Referer, honor caching and rate restrictions, and do not bulk-prefetch. These hosted tiles are not bundled into the product.

## Geocoding and Nominatim

Map search uses a **configured** Nominatim-compatible JSON search endpoint through the frontend build-time setting `VITE_GEOCODING_SEARCH_URL` (HTTPS except localhost). Without configuration, interactive maps and manual coordinates continue to work, while location search reports that a provider is required. Sarab deliberately does **not** default to the public Nominatim service. This setting is embedded at frontend build time; operators must rebuild to change the provider.

The public Nominatim service has a distinct policy (https://operations.osmfoundation.org/policies/nominatim/): no heavy use, **at most one request per second**, identifying application User-Agent or Referer, appropriate attribution, and no autocomplete/systematic queries. The UI only searches on submit and locally limits requests to at least 1.1 seconds apart, but this does **not** enforce a global limit across installations. Browser fetch cannot set User-Agent, and a loopback Referer alone is not reliable app identification. Use a provider authorized for distributed client use, or a properly identified geocoding service with shared limits, privacy terms, and provider attribution. Do not expose confidential queries to an untrusted provider.

For OSM tiles, browser Referer may be the loopback address of the local GUI rather than a public project URL. Validate real packaged traffic, caching and identification against https://operations.osmfoundation.org/policies/tiles/; do not claim that loopback Referer necessarily satisfies the operator-identification requirement.

## Road snapping (OSRM)

The optional "Snap to Roads" action makes the local Sarab server send the route's coordinates to the public OSRM demonstration server at https://router.project-osrm.org (the address is hard-coded in `app/src/web.rs`). It runs only when the user clicks the button. The coordinates leave the machine and are subject to that service's usage terms and privacy practices. Sarab currently does not throttle these requests, set an application-specific User-Agent, or let operators choose another endpoint, and the routing data derives from OpenStreetMap (© OpenStreetMap contributors).

Do not treat the demonstration server as a production dependency. Deployments that need guaranteed availability or defined usage terms should use an operator-run or otherwise authorized routing service. This remains an open item of the licensing audit.

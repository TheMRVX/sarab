<!-- SPDX-License-Identifier: MIT OR Apache-2.0 -->
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.5] - 2026-11-07

### Fixed
- Fixed Inno Setup installer compilation under Inno Setup 6 by removing duplicate `HWND_BROADCAST` constant declaration and configuring `ChangesEnvironment=yes`.
- Synchronized release version metadata across Rust manifest, GUI package manifest, and Inno Setup installer.

## [1.0.4] - 2026-11-07

### Added
- Inno Setup installer task (`addtopath`) enabled by default for elevated system-wide Windows PATH integration without `setx` buffer limits.
- Registry ownership tracking (`HKLM\Software\TheMRVX\Sarab\PathAdded`) preserving pre-existing matching PATH entries while ensuring clean removal on uninstall or opt-out.
- Windows environment change broadcast (`WM_SETTINGCHANGE` via `SendMessageTimeoutW`) notifying running shell windows of PATH updates.
- `checkAuthConnection` client method distinguishing `authenticated`, `unauthenticated`, and `unreachable` backend states.
- Non-disruptive map tile status monitoring and advisory banner when external map imagery is unavailable or policy-blocked, ensuring positioning controls remain functional without claiming driver failure.
- Automated browser integration test suite (`scripts/test_browser_security.mjs`) verifying exact-origin `Referer` headers on tile requests and graceful 403 failure handling.

### Fixed
- Fixed `sarab` command-line tool not recognized on fresh Windows installations.
- Fixed dashboard onboarding state reporting missing data as confirmed `Driver: Offline` or `Test Mode: OFF` before authentication or status retrieval.
- Fixed OpenStreetMap 403 Forbidden tile-policy blocks by configuring Leaflet tile layers with `referrerPolicy: 'origin'`.
- Fixed dashboard unlock instructions to support non-PATH and portable execution (`.\sarab.exe token`, PowerShell `& "<path>\sarab.exe" token`, and the Start Menu shortcut).
- Aligned documentation in `docs/USAGE.md` with implementation reality (`X-Sarab-Token` header and origin-isolated `sessionStorage`; active eviction of legacy cookies).
- Synchronized release version metadata across Rust manifest, GUI package manifest, and Inno Setup installer.

### Security
- Preserved token confidentiality: outgoing cross-origin tile requests send only exact origin (`http://127.0.0.1:<port>/`), strictly omitting query parameters and internal tokens.
- Maintained server-side global security headers (`Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`).

## [1.0.3] - 2026-11-04

### Added
- Deterministic canonical SHA-256 frontend content fingerprinting in `app/build.rs`.
- Origin-isolated session token handling with `X-Sarab-Token` header and `sessionStorage`.
- Automated regression test suite covering build integrity, license audit, and real-browser security.

### Fixed
- Eliminated unauthenticated delivery of session tokens via HTML meta tags.
- Fixed dependency vulnerabilities in `rustls` and `vite`.

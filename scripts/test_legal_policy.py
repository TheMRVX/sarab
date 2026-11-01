#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Static invariants for dual-licensing and safe release verification."""
from pathlib import Path
import json
import re
import tomllib
from tempfile import TemporaryDirectory
from generate_third_party_notices import sha256 as canonical_lock_hash

repo = Path(__file__).resolve().parents[1]

assert not (repo / "LICENSE").exists(), "Unexpected custom root LICENSE"
assert (repo / "LICENSE-MIT").is_file()
assert (repo / "LICENSE-APACHE").is_file()

manifest = tomllib.loads((repo / "app/Cargo.toml").read_text())
pkg = json.loads((repo / "gui/package.json").read_text())
assert manifest["package"]["license"] == "MIT OR Apache-2.0"
assert pkg["license"] == "MIT OR Apache-2.0"

# Check LF/CRLF checkout invariance for generated report fingerprints.
with TemporaryDirectory() as tmp:
    lf = Path(tmp, "lf")
    crlf = Path(tmp, "crlf")
    lf.write_bytes(b"one\ntwo\n")
    crlf.write_bytes(b"one\r\ntwo\r\n")
    assert canonical_lock_hash(lf) == canonical_lock_hash(crlf)
    original = (repo / "app/Cargo.lock").read_bytes()
    crlf.write_bytes(original.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
    assert canonical_lock_hash(repo / "app/Cargo.lock") == canonical_lock_hash(crlf)

release = (repo / ".github/workflows/release.yml").read_text()
inno = (repo / "installer/sarab_installer.iss").read_text()
assert 'LicenseFile=..\\release_package\\LICENSE-CHOICE.txt' in inno
assert 'Copy-Item "LICENSE-APACHE"' in release
assert 'Copy-Item "LICENSE-MIT"' in release
assert '"LICENSE-CHOICE.txt"' in release
assert "Publish GitHub Release" in release
assert "inputs.publish == true" in release
assert "Upload release build artifacts" in release
assert "branches: [legal/license-compliance-audit]" in release
assert "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')" in release
assert "contents: read" in release

view = (repo / "gui/src/components/MapView.tsx").read_text()
assert "https://tile.openstreetmap.org/{z}/{x}/{y}.png" in view
assert "https://www.openstreetmap.org/copyright" in view
assert "https://www.openstreetmap.org/edit" in view
assert "attribution:" in view
assert "VITE_GEOCODING_SEARCH_URL" in view
assert "SEARCH_INTERVAL_MS" in view
assert "nominatim.openstreetmap.org/search" not in view
assert "{geocodingSearchUrl && (" in view
assert not re.search(r"attributionControl\s*:\s*false", view)

web = (repo / "app/src/web.rs").read_text()
assert "SARAB_OSRM_BASE_URL" in web
assert "router.project-osrm.org" not in web
assert '"/api/route/osrm/status"' in web
assert '.set("User-Agent", &user_agent)' in web
assert "OSRM_MIN_REQUEST_INTERVAL" in web
assert "validate_osrm_base_url" in web

route_ui = (repo / "gui/src/components/RouteSimulator.tsx").read_text()
assert "/api/route/osrm/status" in route_ui
assert "window.confirm(" in route_ui
assert "osrmEnabled" in route_ui
assert "https://project-osrm.org/" in route_ui
assert "https://www.openstreetmap.org/edit" in route_ui

for workflow in ("legal-audit.yml", "release.yml"):
    content = (repo / ".github/workflows" / workflow).read_text()
    assert "--excludePrivatePackages" in content, f"Missing private-project exclusion: {workflow}"
    assert "--onlyAllow" in content, f"Missing frontend license enforcement: {workflow}"

licensing = (repo / "docs/LICENSING.md").read_text()
usage = (repo / "docs/USAGE.md").read_text()
generator = (repo / "scripts/generate_third_party_notices.py").read_text()
assert "disabled by default" in licensing
assert "SARAB_OSRM_BASE_URL" in licensing
assert "SARAB_OSRM_BASE_URL" in usage
assert "SARAB_OSRM_BASE_URL" in generator
assert "VITE_GEOCODING_SEARCH_URL" in generator
assert "VITE_GEOCODING_SEARCH_URL" not in release

notice_report = (repo / "THIRD-PARTY-NOTICES.md").read_text()
assert "SARAB_OSRM_BASE_URL" in notice_report
assert "VITE_GEOCODING_SEARCH_URL" in notice_report
assert "Hosted map services" in notice_report

assert "git diff --exit-code -- THIRD-PARTY-NOTICES.md" in release
notice = (repo / "NOTICE").read_text()
assert notice.startswith("Sarab (Mirage)")
assert "Apache-2.0 section" not in notice
print("License, hosted-service, and safe-release invariants passed.")

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
assert "Upload dry-run artifacts without publishing" in release

view = (repo / "gui/src/components/MapView.tsx").read_text()
assert "https://tile.openstreetmap.org/{z}/{x}/{y}.png" in view
assert "https://www.openstreetmap.org/copyright" in view
assert "attribution:" in view
assert not re.search(r"attributionControl\s*:\s*false", view)

notice = (repo / "NOTICE").read_text()
assert notice.startswith("Sarab (Mirage)")
assert "Apache-2.0 section" not in notice
print("License policy and safe-release invariants passed.")

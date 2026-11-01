#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Automated regression suite for Sarab security, build-integrity, and privacy invariants."""

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
APP_DIR = REPO_ROOT / "app"
GUI_DIR = REPO_ROOT / "gui"
DIST_DIR = GUI_DIR / "dist"
SCRIPTS_DIR = REPO_ROOT / "scripts"


def run(cmd, cwd=REPO_ROOT, env=None, check=True):
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    res = subprocess.run(cmd, cwd=cwd, env=full_env, capture_output=True, text=True)
    if check and res.returncode != 0:
        raise RuntimeError(
            f"Command failed ({res.returncode}): {' '.join(cmd)}\n"
            f"STDOUT:\n{res.stdout}\nSTDERR:\n{res.stderr}"
        )
    return res


def test_embedded_frontend_freshness():
    print("[*] Testing Embedded Frontend Freshness & Strict Fingerprint Enforcement...")
    
    # 1. Clean build with SARAB_STRICT_EMBED=1 must succeed
    res = run(["cargo", "check"], cwd=APP_DIR, env={"SARAB_STRICT_EMBED": "1"})
    assert res.returncode == 0, "Clean cargo check failed under SARAB_STRICT_EMBED=1"

    # 2. Touch frontend source file to make it newer than gui/dist/index.html
    main_tsx = GUI_DIR / "src" / "main.tsx"
    assert main_tsx.exists(), "gui/src/main.tsx not found"
    
    index_html = DIST_DIR / "index.html"
    assert index_html.exists(), "gui/dist/index.html not found"
    
    # Save original atime and mtime
    orig_stat = os.stat(main_tsx)
    dist_mtime = os.stat(index_html).st_mtime

    try:
        # Set main_tsx mtime to 60 seconds into the future of index_html
        future_time = dist_mtime + 60.0
        os.utime(main_tsx, (future_time, future_time))

        # 3. Verify cargo check fails with exit code 101 and panic message
        res = run(["cargo", "check"], cwd=APP_DIR, env={"SARAB_STRICT_EMBED": "1"}, check=False)
        assert res.returncode != 0, "cargo check unexpectedly succeeded with stale frontend under SARAB_STRICT_EMBED=1"
        assert (
            "Build integrity violation: frontend source" in res.stderr
            or "Build integrity violation: frontend source" in res.stdout
        ), f"Expected panic message not found in output:\n{res.stderr}"
        print("  [+] Stale source negative test passed: cargo check rejected stale frontend assets.")
    finally:
        # Restore original timestamp or rebuild
        os.utime(main_tsx, (orig_stat.st_atime, dist_mtime - 10.0))

    # 4. Verify recovery passes
    res = run(["cargo", "check"], cwd=APP_DIR, env={"SARAB_STRICT_EMBED": "1"})
    assert res.returncode == 0, "cargo check failed to recover after timestamp restoration"
    print("  [+] Clean build recovery test passed.")


def test_dependencies_and_vulnerabilities():
    print("[*] Testing Dependency Versions and Vulnerability Remediation...")
    
    # 1. Verify Cargo.lock contains patched rustls
    cargo_lock = (APP_DIR / "Cargo.lock").read_text(encoding="utf-8")
    assert 'name = "rustls"' in cargo_lock
    assert 'version = "0.23.46"' in cargo_lock, "Expected rustls 0.23.46 in Cargo.lock"
    assert 'version = "0.23.45"' not in cargo_lock, "Found vulnerable rustls 0.23.45 in Cargo.lock"
    print("  [+] rustls version 0.23.46 confirmed in Cargo.lock.")

    # 2. Verify gui package.json and package-lock.json
    pkg = json.loads((GUI_DIR / "package.json").read_text(encoding="utf-8"))
    vite_ver = pkg.get("devDependencies", {}).get("vite", "")
    assert vite_ver.startswith("^6.") or vite_ver.startswith("6."), f"Expected Vite 6.x, got: {vite_ver}"
    
    pkg_lock = json.loads((GUI_DIR / "package-lock.json").read_text(encoding="utf-8"))
    packages = pkg_lock.get("packages", {})
    vite_pkg = packages.get("node_modules/vite", {})
    resolved_vite = vite_pkg.get("version", "")
    assert resolved_vite.startswith("6.4."), f"Expected Vite 6.4.x resolved, got: {resolved_vite}"
    print(f"  [+] Vite resolved version: {resolved_vite} (safe from CVE advisories).")

    # 3. Run npm audit in gui
    res = run(["npm", "audit", "--audit-level=high"], cwd=GUI_DIR, check=False)
    assert res.returncode == 0, f"npm audit reported vulnerabilities:\n{res.stdout}\n{res.stderr}"
    print("  [+] npm audit clean: 0 high/critical vulnerabilities.")


def test_network_privacy_and_hosted_services():
    print("[*] Testing Network Privacy & Hosted Service Consent Boundaries...")
    
    # 1. Scan compiled assets for forbidden external services
    dist_js = list((DIST_DIR / "assets").glob("*.js"))
    assert dist_js, "No compiled JS bundle found in gui/dist/assets"
    for js in dist_js:
        content = js.read_text(encoding="utf-8")
        assert not re.search(r"nominatim\.openstreetmap\.org", content), (
            f"Found forbidden Nominatim reference in compiled bundle: {js.name}"
        )
    print(f"  [+] Zero Nominatim references in {len(dist_js)} compiled JS bundle(s).")

    # 2. Scan web.rs for OSRM privacy gate
    web_rs = (APP_DIR / "src" / "web.rs").read_text(encoding="utf-8")
    assert "SARAB_OSRM_BASE_URL" in web_rs, "web.rs missing SARAB_OSRM_BASE_URL configuration gate"
    assert "router.project-osrm.org" not in web_rs, "web.rs contains hardcoded demo OSRM URL"
    assert "validate_osrm_base_url" in web_rs, "web.rs missing URL scheme and format validator"
    print("  [+] OSRM routing correctly requires explicit local/private configuration.")


def test_release_integrity_and_dry_run_safeguards():
    print("[*] Testing Release Workflow & Dry-Run Safeguards...")
    
    release_yml = (REPO_ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")
    
    # Verify default publish is false
    assert "default: false" in release_yml, "release.yml does not default publish to false"
    
    # Verify publish condition requires explicit flag or push tag
    assert "if: (github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')) || (github.event_name == 'workflow_dispatch' && inputs.publish == true)" in release_yml, (
        "release.yml publish job condition allows unintended publishing on dry runs"
    )
    
    # Verify legal files checked in release packaging
    for legal in ["LICENSE-MIT", "LICENSE-APACHE", "LICENSE-CHOICE.txt", "NOTICE", "THIRD-PARTY-NOTICES.md", "LICENSING.md"]:
        assert f'"{legal}"' in release_yml, f"release.yml missing legal file check for {legal}"
    
    print("  [+] Release workflow invariants and dry-run safeguards verified.")


def main():
    print("=== Running Sarab Milestone Regression Test Suite ===")
    test_embedded_frontend_freshness()
    test_dependencies_and_vulnerabilities()
    test_network_privacy_and_hosted_services()
    test_release_integrity_and_dry_run_safeguards()
    print("=== All Regression Invariants Passed Successfully (4/4) ===")


if __name__ == "__main__":
    main()

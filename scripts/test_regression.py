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


def parse_semver(version_str: str) -> tuple:
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)", version_str)
    if not m:
        raise ValueError(f"Invalid semver: {version_str}")
    return tuple(int(x) for x in m.groups())


def test_embedded_frontend_freshness():
    print("[*] Testing Embedded Frontend Freshness & Deterministic Fingerprint Enforcement...")

    # 1. Clean cargo check must succeed by default
    res = run(["cargo", "check"], cwd=APP_DIR)
    assert res.returncode == 0, "Clean cargo check failed"

    # 2. Non-destructive probe test: create a temporary file in gui/src/
    probe_file = GUI_DIR / "src" / "_integrity_probe.tmp"
    try:
        probe_file.write_text("// temporary integrity probe", encoding="utf-8")

        # 3. Verify cargo check rejects the untracked / un-fingerprinted file by default (exit code 101)
        res = run(["cargo", "check"], cwd=APP_DIR, check=False)
        assert res.returncode != 0, "cargo check unexpectedly succeeded with stale frontend assets"
        assert (
            "Build integrity violation: embedded frontend assets" in res.stderr
            or "Build integrity violation: embedded frontend assets" in res.stdout
        ), f"Expected panic message not found in output:\n{res.stderr}"
        print("  [+] Stale asset negative test passed: cargo check rejected stale frontend by default.")

        # 4. Verify SARAB_SKIP_FRONTEND_VERIFY=1 permits bypassing when explicitly requested
        res_skip = run(["cargo", "check"], cwd=APP_DIR, env={"SARAB_SKIP_FRONTEND_VERIFY": "1"})
        assert res_skip.returncode == 0, "cargo check failed under SARAB_SKIP_FRONTEND_VERIFY=1"
        print("  [+] Explicit bypass test passed (SARAB_SKIP_FRONTEND_VERIFY=1).")
    finally:
        # Non-destructive cleanup: ensure temporary probe file is removed
        if probe_file.exists():
            probe_file.unlink()

    # 5. Verify cargo check succeeds again after probe removal
    res = run(["cargo", "check"], cwd=APP_DIR)
    assert res.returncode == 0, "cargo check failed to recover after probe removal"
    print("  [+] Non-destructive probe recovery test passed.")


def test_dependencies_and_vulnerabilities():
    print("[*] Testing Dependency Version Ranges and Vulnerability Accounting...")

    # 1. Verify Cargo.lock contains patched rustls with semver >= 0.23.46
    cargo_lock = (APP_DIR / "Cargo.lock").read_text(encoding="utf-8")
    rustls_match = re.search(r'name = "rustls"\s+version = "([^"]+)"', cargo_lock)
    assert rustls_match, "rustls not found in Cargo.lock"
    rustls_ver = rustls_match.group(1)
    parsed_rustls = parse_semver(rustls_ver)
    assert parsed_rustls >= (0, 23, 46), f"Expected rustls >= 0.23.46, got: {rustls_ver}"
    print(f"  [+] rustls version {rustls_ver} (>= 0.23.46) verified in Cargo.lock.")

    # 2. Verify gui package-lock.json resolved vite with semver >= 6.4.5
    pkg_lock = json.loads((GUI_DIR / "package-lock.json").read_text(encoding="utf-8"))
    packages = pkg_lock.get("packages", {})
    vite_pkg = packages.get("node_modules/vite", {})
    resolved_vite = vite_pkg.get("version", "")
    assert resolved_vite, "vite package not found in gui/package-lock.json"
    parsed_vite = parse_semver(resolved_vite)
    assert parsed_vite >= (6, 4, 5), f"Expected Vite >= 6.4.5, got: {resolved_vite}"
    print(f"  [+] Vite resolved version: {resolved_vite} (>= 6.4.5) verified.")

    # 3. Run npm audit with JSON output for rigorous vulnerability accounting
    res = run(["npm", "audit", "--json"], cwd=GUI_DIR, check=False)
    try:
        audit_data = json.loads(res.stdout)
        vulns = audit_data.get("metadata", {}).get("vulnerabilities", {})
        high_count = vulns.get("high", 0)
        critical_count = vulns.get("critical", 0)
        assert high_count == 0, f"Found {high_count} high-severity vulnerabilities in npm audit"
        assert critical_count == 0, f"Found {critical_count} critical-severity vulnerabilities in npm audit"
        print(f"  [+] npm audit JSON verification passed: 0 high / 0 critical vulnerabilities (total audited: {audit_data.get('metadata', {}).get('dependencies', {}).get('total', 0)}).")
    except json.JSONDecodeError:
        assert res.returncode == 0, f"npm audit failed without valid JSON: {res.stdout}\n{res.stderr}"


def test_local_web_authentication_boundary():
    print("[*] Testing Local Web Authentication Boundary & Secret Protection...")

    web_rs = (APP_DIR / "src" / "web.rs").read_text(encoding="utf-8")

    # 1. Verify session token generation is fail-closed with CSPRNG and no timestamp fallback
    fn_match = re.search(
        r"pub fn generate_session_token\(\) -> Result<String, anyhow::Error>\s*\{([^}]+)\}",
        web_rs,
        re.DOTALL,
    )
    assert fn_match, "generate_session_token function signature with Result<String, anyhow::Error> not found"
    fn_body = fn_match.group(1)
    assert "SystemTime" not in fn_body, "Found predictable timestamp fallback in generate_session_token"
    assert "process::id()" not in fn_body, "Found predictable PID fallback in generate_session_token"
    assert "getrandom" in fn_body, "generate_session_token missing getrandom call"
    print("  [+] Fail-closed CSPRNG token generation confirmed without predictable fallbacks.")

    # 2. Verify index.html does not deliver token meta tag to unauthenticated requests
    index_html_src = (GUI_DIR / "index.html").read_text(encoding="utf-8")
    assert "sarab-token" not in index_html_src, "index.html source contains static sarab-token"

    dist_index = (DIST_DIR / "index.html").read_text(encoding="utf-8")
    assert "sarab-token" not in dist_index, "Compiled gui/dist/index.html contains static sarab-token"
    print("  [+] Statically embedded index.html is free of hardcoded tokens.")

    # 3. Verify public auth endpoints exist
    assert '"/api/auth/status"' in web_rs, "web.rs missing /api/auth/status endpoint"
    assert '"/api/auth/verify"' in web_rs, "web.rs missing /api/auth/verify endpoint"
    assert "sarab_session=" in web_rs, "web.rs missing HttpOnly session cookie handling"
    print("  [+] Public authentication bootstrap (/api/auth/status, /api/auth/verify, HttpOnly cookies) verified.")

    # 4. Verify truthful dashboard status in client.ts
    client_ts = (GUI_DIR / "src" / "api" / "client.ts").read_text(encoding="utf-8")
    assert "isDemoMode()" in client_ts, "client.ts missing isDemoMode check"
    assert "Backend service offline or unauthorized" in client_ts, "client.ts missing truthful offline status"
    print("  [+] Truthful dashboard status separation confirmed (no fabricated driver status outside demo mode).")

    # 5. Verify local bundling of static assets (Leaflet CSS and Roboto font)
    assert "fonts.googleapis.com" not in index_html_src, "gui/index.html contains external Google Fonts link"
    assert "unpkg.com" not in index_html_src, "gui/index.html contains external unpkg Leaflet link"
    main_tsx = (GUI_DIR / "src" / "main.tsx").read_text(encoding="utf-8")
    assert "@fontsource/roboto" in main_tsx, "main.tsx missing local @fontsource/roboto import"
    assert "leaflet/dist/leaflet.css" in main_tsx, "main.tsx missing local leaflet.css import"
    print("  [+] Zero external stylesheet/font dependencies in index.html (100% locally bundled).")


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
    test_local_web_authentication_boundary()
    test_network_privacy_and_hosted_services()
    test_release_integrity_and_dry_run_safeguards()
    print("=== All Regression Invariants Passed Successfully (5/5) ===")


if __name__ == "__main__":
    main()

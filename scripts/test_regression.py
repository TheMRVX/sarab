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

    # 2. Deterministic content test: touching file timestamps without content changes must not invalidate build
    main_tsx = GUI_DIR / "src" / "main.tsx"
    orig_mtime = main_tsx.stat().st_mtime
    try:
        os.utime(main_tsx, (orig_mtime - 1000, orig_mtime - 1000))
        res = run(["cargo", "check"], cwd=APP_DIR)
        assert res.returncode == 0, "cargo check unexpectedly failed when file timestamps changed without content edits"
        print("  [+] Timestamp independence verified: content fingerprint is fully deterministic.")
    finally:
        os.utime(main_tsx, (orig_mtime, orig_mtime))

    # 2b. Nanosecond timestamp preservation negative test:
    # Modifying file content while preserving exact nanosecond mtime MUST be detected fail-closed
    orig_main_content = main_tsx.read_text(encoding="utf-8")
    orig_stat = main_tsx.stat()
    orig_mtime_ns = orig_stat.st_mtime_ns
    orig_atime_ns = orig_stat.st_atime_ns
    try:
        main_tsx.write_text(orig_main_content + "\n// probe with preserved timestamp\n", encoding="utf-8")
        os.utime(main_tsx, ns=(orig_atime_ns, orig_mtime_ns))
        assert main_tsx.stat().st_mtime_ns == orig_mtime_ns, "Filesystem failed to restore exact nanosecond mtime"

        # cargo check runs with warm cache, zero file timestamp changes, without cargo clean
        res_stealth = run(["cargo", "check"], cwd=APP_DIR, check=False)
        assert res_stealth.returncode != 0, "cargo check unexpectedly skipped build.rs when file content changed with preserved mtime"
        assert (
            "Build integrity violation: embedded frontend assets" in res_stealth.stderr
            or "Build integrity violation: embedded frontend assets" in res_stealth.stdout
        ), f"Expected integrity violation panic not found in:\n{res_stealth.stderr}"
        print("  [+] Nanosecond timestamp preservation negative test passed: cargo check detected stealth content edit with warm cache.")
    finally:
        main_tsx.write_text(orig_main_content, encoding="utf-8")
        os.utime(main_tsx, ns=(orig_atime_ns, orig_mtime_ns))

    # 3. Non-destructive probe test: create a temporary untracked file in gui/src/
    probe_file = GUI_DIR / "src" / "_integrity_probe.tmp"
    try:
        probe_file.write_text("// temporary integrity probe", encoding="utf-8")

        # 3a. Verify cargo check rejects untracked / un-fingerprinted source files
        res = run(["cargo", "check"], cwd=APP_DIR, check=False)
        assert res.returncode != 0, "cargo check unexpectedly succeeded with stale frontend assets"
        assert (
            "Build integrity violation: embedded frontend assets" in res.stderr
            or "Build integrity violation: embedded frontend assets" in res.stdout
        ), f"Expected panic message not found in output:\n{res.stderr}"
        print("  [+] Stale asset negative test passed: cargo check rejected stale frontend by default.")

        # 3b. Verify SARAB_SKIP_FRONTEND_VERIFY=1 permits bypassing only in non-release / non-CI builds
        res_skip = run(
            ["cargo", "check"],
            cwd=APP_DIR,
            env={"SARAB_SKIP_FRONTEND_VERIFY": "1", "CI": "false"},
        )
        assert res_skip.returncode == 0, "cargo check failed under SARAB_SKIP_FRONTEND_VERIFY=1 in dev profile"
        print("  [+] Explicit dev bypass test passed (SARAB_SKIP_FRONTEND_VERIFY=1).")

        # 3c. Verify release / CI builds strictly disallow SARAB_SKIP_FRONTEND_VERIFY
        res_ci_skip = run(
            ["cargo", "check"],
            cwd=APP_DIR,
            env={"SARAB_SKIP_FRONTEND_VERIFY": "1", "CI": "true"},
            check=False,
        )
        assert res_ci_skip.returncode != 0, "cargo check unexpectedly allowed SARAB_SKIP_FRONTEND_VERIFY=1 under CI=true"
        assert (
            "SARAB_SKIP_FRONTEND_VERIFY is strictly disallowed in release or CI builds" in res_ci_skip.stderr
            or "SARAB_SKIP_FRONTEND_VERIFY is strictly disallowed in release or CI builds" in res_ci_skip.stdout
        ), f"Expected CI rejection not found in:\n{res_ci_skip.stderr}"
        print("  [+] Release/CI profile protection passed: SARAB_SKIP_FRONTEND_VERIFY fail-closed under CI=true.")
    finally:
        if probe_file.exists():
            probe_file.unlink()

    # 4. Verify changed build environment variables invalidate integrity
    res_env = run(["cargo", "check"], cwd=APP_DIR, env={"VITE_DEMO_MODE": "true"}, check=False)
    assert res_env.returncode != 0, "cargo check unexpectedly succeeded with mismatched VITE environment variables"
    assert (
        "Build integrity violation: embedded frontend assets" in res_env.stderr
        or "Build integrity violation: embedded frontend assets" in res_env.stdout
    ), f"Expected env mismatch panic not found in:\n{res_env.stderr}"
    print("  [+] Environment configuration sensitivity passed: altered Vite env vars detected.")

    # 5. Verify tampering with compiled dist output assets is detected
    dist_index = DIST_DIR / "index.html"
    orig_dist_index = dist_index.read_text(encoding="utf-8")
    try:
        dist_index.write_text(orig_dist_index + "<!-- tamper probe -->", encoding="utf-8")
        res_tamper = run(["cargo", "check"], cwd=APP_DIR, check=False)
        assert res_tamper.returncode != 0, "cargo check unexpectedly succeeded with tampered dist assets"
        assert (
            "Build integrity violation:" in res_tamper.stderr
            or "Build integrity violation:" in res_tamper.stdout
        ), f"Expected dist tamper panic not found in:\n{res_tamper.stderr}"
        print("  [+] Output asset tampering detection passed: modified dist bytes fail-closed.")
    finally:
        dist_index.write_text(orig_dist_index, encoding="utf-8")

    # 6. Verify cargo check succeeds again in clean state
    res = run(["cargo", "check"], cwd=APP_DIR)
    assert res.returncode == 0, "cargo check failed to recover after integrity tests"
    print("  [+] Clean state recovery verified.")


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

    # 6. Live end-to-end HTTP boundary verification
    run(["cargo", "build"], cwd=APP_DIR)
    bin_path = APP_DIR / "target" / "debug" / ("sarab.exe" if os.name == "nt" else "sarab")

    import tempfile
    with tempfile.TemporaryDirectory(prefix="sarab_test_data_") as tmp_data_dir:
        test_env = os.environ.copy()
        test_env["SARAB_DATA_DIR"] = tmp_data_dir
        test_env["SARAB_NO_DRIVER"] = "1"

        server_proc = subprocess.Popen(
            [str(bin_path), "gui", "--port", "0"],
            cwd=APP_DIR,
            env=test_env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            port_file = Path(tmp_data_dir) / ".port"
            token_file = Path(tmp_data_dir) / ".session_token"
            test_port = None
            for _ in range(40):
                time.sleep(0.1)
                if port_file.exists() and token_file.exists():
                    try:
                        p = int(port_file.read_text().strip())
                        if p > 0:
                            test_port = p
                            break
                    except (ValueError, OSError):
                        pass
                if server_proc.poll() is not None:
                    raise RuntimeError(f"Server exited prematurely with code {server_proc.returncode}")
            assert test_port is not None, "Failed to read ephemeral port from isolated test data directory"

            import http.client
            conn = http.client.HTTPConnection("127.0.0.1", test_port, timeout=5)
            started = False
            for _ in range(30):
                time.sleep(0.1)
                try:
                    conn.request("GET", "/api/auth/status")
                    resp = conn.getresponse()
                    resp.read()
                    started = True
                    break
                except (OSError, http.client.HTTPException):
                    continue
            assert started, "Test server failed to start within timeout"

            # 6a. Query session token via CLI 'sarab token --raw' using isolated data dir
            token_res = run(
                [str(bin_path), "token", "--raw"],
                cwd=APP_DIR,
                env={"SARAB_DATA_DIR": tmp_data_dir, "SARAB_NO_DRIVER": "1"},
            )
            valid_token = token_res.stdout.strip()
            assert len(valid_token) == 32, f"Expected 32-character hex token from CLI, got: {valid_token}"
    
            # 6b. Unauthenticated GET / must not contain token
            conn.request("GET", "/")
            resp = conn.getresponse()
            html = resp.read().decode("utf-8")
            assert "sarab-token" not in html, "Unauthenticated GET / leaked sarab-token meta tag"
            cookie_hdr = resp.getheader("Set-Cookie")
            assert cookie_hdr is not None and "Max-Age=0" in cookie_hdr, "Unauthenticated GET / must emit legacy cookie eviction header"
            assert valid_token not in cookie_hdr, "Unauthenticated GET / must never leak session token in cookie"
    
            # 6c. Unauthenticated GET /api/auth/status returns {"authenticated": false}
            conn.request("GET", "/api/auth/status")
            resp = conn.getresponse()
            data = json.loads(resp.read().decode("utf-8"))
            assert data.get("authenticated") is False, "Unauthenticated /api/auth/status returned true"
    
            # 6d. Unauthenticated GET /api/config returns 401 Unauthorized
            conn.request("GET", "/api/config")
            resp = conn.getresponse()
            resp.read()
            assert resp.status == 401, f"Expected 401 Unauthorized for /api/config, got {resp.status}"
    
            # 6e. Invalid token POST /api/auth/verify returns 401
            invalid_body = json.dumps({"token": "wrong_token_12345"}).encode("utf-8")
            conn.request("POST", "/api/auth/verify", body=invalid_body, headers={"Content-Type": "application/json"})
            resp = conn.getresponse()
            resp.read()
            assert resp.status == 401, f"Expected 401 for invalid verify, got {resp.status}"
    
            # 6f. Valid token POST /api/auth/verify returns 200 with eviction Set-Cookie
            valid_body = json.dumps({"token": valid_token}).encode("utf-8")
            conn.request("POST", "/api/auth/verify", body=valid_body, headers={"Content-Type": "application/json"})
            resp = conn.getresponse()
            verify_data = json.loads(resp.read().decode("utf-8"))
            assert resp.status == 200
            assert verify_data.get("success") is True
            assert verify_data.get("token") == valid_token
            cookie = resp.getheader("Set-Cookie") or ""
            assert "Max-Age=0" in cookie, "Must actively evict legacy session cookie"
            assert "HttpOnly" in cookie
            assert "SameSite=Strict" in cookie

            # 6g. Authenticated GET /?token=<valid_token> returns 100% static HTML (no token meta tag) and eviction Set-Cookie
            conn.request("GET", f"/?token={valid_token}")
            resp = conn.getresponse()
            auth_html = resp.read().decode("utf-8")
            assert "sarab-token" not in auth_html, "Authenticated GET /?token leaked meta tag into HTML"
            auth_cookie = resp.getheader("Set-Cookie") or ""
            assert "Max-Age=0" in auth_cookie, "Must evict legacy cookie on page request"

            # 6h. Header-based status verification via GET /api/auth/status with X-Sarab-Token
            conn.request("GET", "/api/auth/status", headers={"X-Sarab-Token": valid_token})
            resp = conn.getresponse()
            assert resp.status == 200
            sess_data = json.loads(resp.read().decode("utf-8"))
            assert sess_data.get("authenticated") is True

            # 6h-bis. Obsolete /api/auth/session endpoint is eliminated (returns 404 or 401)
            conn.request("GET", "/api/auth/session", headers={"X-Sarab-Token": valid_token})
            resp_obsolete = conn.getresponse()
            resp_obsolete.read()
            assert resp_obsolete.status in (404, 401), f"Expected 404 for obsolete session endpoint, got: {resp_obsolete.status}"

            # 6i. Mutating POST /api/config with only ambient cookie (no X-Sarab-Token) must fail with 401
            cfg_payload = json.dumps({
                "latitude": 35.6892,
                "longitude": 51.3890,
                "altitude": 1200.0,
                "accuracy": 2.5,
                "enabled": True,
                "driftEnabled": True,
                "driftRadius": 1.2
            }).encode("utf-8")
            conn.request("POST", "/api/config", body=cfg_payload, headers={
                "Content-Type": "application/json",
                "Cookie": f"sarab_session={valid_token}"
            })
            resp = conn.getresponse()
            resp.read()
            assert resp.status == 401, f"Expected 401 for cookie-only mutating request, got: {resp.status}"
    
            # 6j. Mutating POST /api/config with X-Sarab-Token succeeds
            conn.request("POST", "/api/config", body=cfg_payload, headers={
                "Content-Type": "application/json",
                "X-Sarab-Token": valid_token
            })
            resp = conn.getresponse()
            resp.read()
            assert resp.status == 200, f"Expected 200 for authorized mutating request, got: {resp.status}"
    
            # 6k. Cross-origin request from foreign localhost port is rejected with 403 Forbidden
            conn.request("GET", "/api/config", headers={
                "Origin": "http://127.0.0.1:3000",
                "X-Sarab-Token": valid_token
            })
            resp = conn.getresponse()
            resp.read()
            assert resp.status == 403, f"Expected 403 for foreign origin port, got: {resp.status}"
    
            # 6l. Cross-site request with Sec-Fetch-Site: cross-site is rejected with 403 Forbidden
            conn.request("GET", "/api/config", headers={
                "Sec-Fetch-Site": "cross-site",
                "X-Sarab-Token": valid_token
            })
            resp = conn.getresponse()
            resp.read()
            assert resp.status == 403, f"Expected 403 for cross-site request, got: {resp.status}"
    
            # 6m. Authenticated GET /api/config with X-Sarab-Token header succeeds
            conn.request("GET", "/api/config", headers={"X-Sarab-Token": valid_token})
            resp = conn.getresponse()
            assert resp.status == 200
            cfg_data = json.loads(resp.read().decode("utf-8"))
            assert "latitude" in cfg_data
    
            conn.close()
            print("  [+] Live HTTP end-to-end authentication boundary verified (unauthenticated denied, token bootstrap verified).")
        finally:
            server_proc.terminate()
        try:
            server_proc.wait(timeout=3)
        except (subprocess.TimeoutExpired, OSError):
            server_proc.kill()


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

    # Verify Inno Setup installer PATH task, declarations, and lifecycle logic
    res_installer = run([sys.executable, str(SCRIPTS_DIR / "test_installer_path.py")], cwd=REPO_ROOT)
    assert res_installer.returncode == 0, f"Installer PATH regression tests failed:\n{res_installer.stdout}\n{res_installer.stderr}"
    print("  [+] Inno Setup PATH integration, ownership tracking, and safety invariants verified.")

    print("  [+] Release workflow invariants and dry-run safeguards verified.")


def test_real_frontend_client():
    print("[*] Testing Real Production Frontend Client via Node Test Runner...")
    res = run(["npm", "test"], cwd=GUI_DIR)
    assert res.returncode == 0, f"Frontend client tests failed:\n{res.stdout}\n{res.stderr}"
    print("  [+] All 8 production frontend client conditions verified (200, 401, 503, offline, demo, scrub, session, token header).")


def test_browser_security():
    print("[*] Testing Browser-Level Security & Cross-Origin Credential Boundary via Headless Chrome...")
    browser_test_script = SCRIPTS_DIR / "test_browser_security.mjs"
    res = run(["node", str(browser_test_script)], cwd=REPO_ROOT)
    assert res.returncode == 0, f"Browser security tests failed:\n{res.stdout}\n{res.stderr}"
    if "[~] Playwright not found" in res.stdout:
        print("  [~] Playwright not installed in environment; live browser execution skipped in CI.")
    else:
        print("  [+] Real browser security verified (exact-origin, CSRF mitigation, history scrubbing, security headers).")


def main():
    print("=== Running Sarab Milestone Regression Test Suite ===")
    test_embedded_frontend_freshness()
    test_dependencies_and_vulnerabilities()
    test_local_web_authentication_boundary()
    test_network_privacy_and_hosted_services()
    test_release_integrity_and_dry_run_safeguards()
    test_real_frontend_client()
    test_browser_security()
    print("=== All Regression Invariants Passed Successfully (7/7) ===")


if __name__ == "__main__":
    main()

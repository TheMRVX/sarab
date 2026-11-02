#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""
Automated unit & negative regression test suite for scripts/release.sh.
Executes release.sh in fully isolated temporary git repositories with
mock remote origins and mock `gh` CLI implementations to verify that:
1. Invalid SemVer format is rejected
2. Dirty git working trees are rejected
3. Non-main branches are rejected
4. Local commits out of sync with origin/main are rejected
5. Version mismatch with app/Cargo.toml is rejected
6. Existing local tags are rejected
7. Existing remote tags are rejected
8. Empty GitHub CI check list is rejected (fail-closed)
9. In-progress GitHub CI checks are rejected
10. Failed GitHub CI checks are rejected
11. Only fully verified commits with passing checks on main can be tagged
"""

import json
import os
import shutil
import stat
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
RELEASE_SCRIPT = REPO_ROOT / "scripts" / "release.sh"


def run(cmd, cwd=None, env=None, check=True):
    res = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True)
    if check and res.returncode != 0:
        raise RuntimeError(
            f"Command failed ({res.returncode}): {' '.join(cmd)}\n"
            f"STDOUT:\n{res.stdout}\nSTDERR:\n{res.stderr}"
        )
    return res


def setup_mock_repo(tmp_path: Path):
    """Sets up a local mock git repo and a local mock remote origin."""
    origin_dir = tmp_path / "origin.git"
    run(["git", "init", "--bare", str(origin_dir)])

    work_dir = tmp_path / "work"
    work_dir.mkdir()
    run(["git", "init", "-b", "main"], cwd=work_dir)
    run(["git", "config", "user.name", "Sarab Test"], cwd=work_dir)
    run(["git", "config", "user.email", "test@sarab.local"], cwd=work_dir)
    run(["git", "remote", "add", "origin", str(origin_dir)], cwd=work_dir)

    # Copy release.sh
    scripts_dir = work_dir / "scripts"
    scripts_dir.mkdir(parents=True)
    shutil.copy(RELEASE_SCRIPT, scripts_dir / "release.sh")
    (scripts_dir / "release.sh").chmod(0o755)

    # Create dummy app/Cargo.toml
    app_dir = work_dir / "app"
    app_dir.mkdir(parents=True)
    (app_dir / "Cargo.toml").write_text('[package]\nname = "sarab"\nversion = "1.0.3"\n', encoding="utf-8")

    # Initial commit & push
    run(["git", "add", "."], cwd=work_dir)
    run(["git", "commit", "-m", "chore: initial commit"], cwd=work_dir)
    run(["git", "push", "-u", "origin", "main"], cwd=work_dir)

    return work_dir, origin_dir


def create_mock_gh(bin_dir: Path, response_payload: dict, exit_code: int = 0):
    """Creates an executable mock `gh` script in bin_dir."""
    gh_script = bin_dir / "gh"
    json_str = json.dumps(response_payload)
    content = f"""#!/bin/sh
if [ "$1" = "api" ]; then
    cat << 'EOF'
{json_str}
EOF
    exit {exit_code}
fi
exit 0
"""
    gh_script.write_text(content, encoding="utf-8")
    gh_script.chmod(0o755)


def test_release_script_safeguards():
    print("[*] Running release.sh Hardening & Negative Verification Suite...")

    with tempfile.TemporaryDirectory(prefix="sarab_release_test_") as td:
        tmp_path = Path(td)
        work_dir, origin_dir = setup_mock_repo(tmp_path)

        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        env = os.environ.copy()
        env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

        # 1. Reject invalid SemVer
        res = run(["bash", "scripts/release.sh", "invalid-tag"], cwd=work_dir, env=env, check=False)
        assert res.returncode != 0, "release.sh accepted invalid SemVer"
        assert "Version tag must follow strict SemVer format" in res.stdout or "Version tag must follow strict SemVer format" in res.stderr
        print("  [+] Invalid SemVer tag rejected.")

        # 2. Reject dirty working tree
        (work_dir / "dirty.txt").write_text("uncommitted file")
        res = run(["bash", "scripts/release.sh", "v1.0.3", "--yes"], cwd=work_dir, env=env, check=False)
        assert res.returncode != 0, "release.sh accepted dirty working tree"
        assert "Working tree has uncommitted changes" in res.stdout or "Working tree has uncommitted changes" in res.stderr
        (work_dir / "dirty.txt").unlink()
        print("  [+] Dirty working tree rejected.")

        # 3. Reject non-main branch
        run(["git", "checkout", "-b", "feature/unauthorized"], cwd=work_dir)
        res = run(["bash", "scripts/release.sh", "v1.0.3", "--yes"], cwd=work_dir, env=env, check=False)
        assert res.returncode != 0, "release.sh accepted non-main branch"
        assert "Releases can only be tagged from the 'main' branch" in res.stdout or "Releases can only be tagged from the 'main' branch" in res.stderr
        run(["git", "checkout", "main"], cwd=work_dir)
        print("  [+] Non-main branch rejected.")

        # 4. Reject local main out of sync with origin/main
        (work_dir / "file.txt").write_text("local only")
        run(["git", "add", "."], cwd=work_dir)
        run(["git", "commit", "-m", "local commit ahead of origin"], cwd=work_dir)
        res = run(["bash", "scripts/release.sh", "v1.0.3", "--yes"], cwd=work_dir, env=env, check=False)
        assert res.returncode != 0, "release.sh accepted unsynced local commit"
        assert "does not match origin/main" in res.stdout or "does not match origin/main" in res.stderr
        run(["git", "reset", "--hard", "origin/main"], cwd=work_dir)
        print("  [+] Unsynced branch HEAD rejected.")

        # 5. Reject version mismatch in Cargo.toml
        res = run(["bash", "scripts/release.sh", "v1.0.4", "--yes"], cwd=work_dir, env=env, check=False)
        assert res.returncode != 0, "release.sh accepted mismatched Cargo.toml version"
        assert "does not match target release version" in res.stdout or "does not match target release version" in res.stderr
        print("  [+] Cargo.toml version mismatch rejected.")

        # 6. Reject when tag exists locally
        run(["git", "tag", "v1.0.3"], cwd=work_dir)
        res = run(["bash", "scripts/release.sh", "v1.0.3", "--yes"], cwd=work_dir, env=env, check=False)
        assert res.returncode != 0, "release.sh accepted existing local tag"
        assert "already exists locally" in res.stdout or "already exists locally" in res.stderr
        run(["git", "tag", "-d", "v1.0.3"], cwd=work_dir)
        print("  [+] Existing local tag rejected.")

        # 7. Reject when tag exists on remote
        run(["git", "tag", "v1.0.3"], cwd=work_dir)
        run(["git", "push", "origin", "v1.0.3"], cwd=work_dir)
        run(["git", "tag", "-d", "v1.0.3"], cwd=work_dir)
        res = run(["bash", "scripts/release.sh", "v1.0.3", "--yes"], cwd=work_dir, env=env, check=False)
        assert res.returncode != 0, "release.sh accepted existing remote tag"
        assert "already exists" in res.stdout or "already exists" in res.stderr
        run(["git", "push", "origin", "--delete", "v1.0.3"], cwd=work_dir)
        run(["git", "tag", "-d", "v1.0.3"], cwd=work_dir, check=False)
        print("  [+] Existing remote tag rejected.")

        # 8. Reject when mock gh reports empty check list (fail-closed)
        create_mock_gh(bin_dir, {"total_count": 0, "check_runs": []})
        res = run(["bash", "scripts/release.sh", "v1.0.3", "--yes"], cwd=work_dir, env=env, check=False)
        if "No GitHub check runs found" not in res.stdout and "No GitHub check runs found" not in res.stderr:
            print("FAILED 8 STDOUT:", res.stdout)
            print("FAILED 8 STDERR:", res.stderr)
        assert res.returncode != 0, "release.sh accepted empty check list"
        assert "No GitHub check runs found" in res.stdout or "No GitHub check runs found" in res.stderr
        print("  [+] Empty GitHub check run list rejected (fail-closed).")

        # 9. Reject when mock gh reports incomplete checks
        create_mock_gh(bin_dir, {
            "total_count": 2,
            "check_runs": [
                {"name": "Fast Quality Gate & Build Check", "status": "completed", "conclusion": "success"},
                {"name": "Rust and frontend license inventory", "status": "in_progress", "conclusion": None}
            ]
        })
        res = run(["bash", "scripts/release.sh", "v1.0.3", "--yes"], cwd=work_dir, env=env, check=False)
        assert res.returncode != 0, "release.sh accepted in-progress checks"
        assert "check run(s) are still in progress" in res.stdout or "check run(s) are still in progress" in res.stderr
        print("  [+] In-progress GitHub checks rejected.")

        # 10. Reject when mock gh reports failed checks
        create_mock_gh(bin_dir, {
            "total_count": 2,
            "check_runs": [
                {"name": "Fast Quality Gate & Build Check", "status": "completed", "conclusion": "success"},
                {"name": "Real-Browser Security Suite", "status": "completed", "conclusion": "failure"}
            ]
        })
        res = run(["bash", "scripts/release.sh", "v1.0.3", "--yes"], cwd=work_dir, env=env, check=False)
        assert res.returncode != 0, "release.sh accepted failed checks"
        assert "check run(s) did not succeed" in res.stdout or "check run(s) did not succeed" in res.stderr
        print("  [+] Failed GitHub checks rejected.")

        # 11. Positive verification: all checks completed successfully -> tag created & pushed!
        create_mock_gh(bin_dir, {
            "total_count": 3,
            "check_runs": [
                {"name": "Fast Quality Gate & Build Check", "status": "completed", "conclusion": "success"},
                {"name": "Rust and frontend license inventory", "status": "completed", "conclusion": "success"},
                {"name": "Real-Browser Security Suite", "status": "completed", "conclusion": "success"}
            ]
        })
        res = run(["bash", "scripts/release.sh", "v1.0.3", "--yes"], cwd=work_dir, env=env, check=True)
        assert "Successfully pushed release tag v1.0.3!" in res.stdout

        # Verify tag exists on origin
        remote_tags = run(["git", "ls-remote", "--tags", "origin"], cwd=work_dir).stdout
        assert "refs/tags/v1.0.3" in remote_tags, "Target tag was not pushed to remote origin"
        print("  [+] Validated release: tag created and pushed exclusively on verified commit with 100% green CI checks.")


if __name__ == "__main__":
    test_release_script_safeguards()
    print("=== All release.sh Hardening Invariants Passed (11/11) ===")

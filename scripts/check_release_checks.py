#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Require successful GitHub Actions checks on the exact release commit."""

import argparse
import json
import re
import subprocess
import sys

REQUIRED_CHECKS = (
    "Fast Quality Gate & Build Check",
    "Rust and frontend license inventory",
    "Real-Browser Security Suite",
    "Analyze (actions)",
    "Analyze (c-cpp)",
    "Analyze (javascript-typescript)",
    "Analyze (python)",
    "Analyze (rust)",
)


def verify_checks(pages, sha):
    """Fail closed for missing, skipped, stale or untrusted required checks."""
    if not isinstance(pages, list) or not pages:
        raise ValueError("No GitHub check runs found")
    runs = []
    for page in pages:
        if not isinstance(page, dict) or not isinstance(page.get("check_runs"), list):
            raise ValueError("Malformed GitHub check response")
        runs.extend(page["check_runs"])
    if not runs:
        raise ValueError("No GitHub check runs found")
    errors = []
    for name in REQUIRED_CHECKS:
        matching = [r for r in runs if isinstance(r, dict) and r.get("name") == name
                    and (r.get("app") or {}).get("slug") == "github-actions"]
        if not matching:
            errors.append(f"Missing required GitHub Actions check: {name}")
            continue
        # GitHub's filter=latest removes superseded runs per check/app. If
        # names collide across workflows, every returned match must pass.
        for run in matching:
            if run.get("head_sha") != sha:
                errors.append(f"Wrong commit for {name}")
            elif run.get("status") != "completed":
                errors.append(f"Required check still in progress: {name}")
            elif run.get("conclusion") != "success":
                errors.append(f"Required check did not succeed: {name} ({run.get('conclusion')})")
    if errors:
        raise ValueError("\n".join(errors))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--repo", default=":owner/:repo")
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.sha):
        parser.error("--sha must be a complete commit SHA")
    if args.repo != ":owner/:repo" and not re.fullmatch(r"[\w.-]+/[\w.-]+", args.repo):
        parser.error("--repo must be owner/repo")
    endpoint = f"repos/{args.repo}/commits/{args.sha}/check-runs?per_page=100&filter=latest"
    try:
        response = subprocess.run(
            ["gh", "api", "--paginate", "--slurp", endpoint],
            check=True, capture_output=True, text=True,
        )
        verify_checks(json.loads(response.stdout), args.sha)
    except (OSError, subprocess.CalledProcessError, ValueError, TypeError) as error:
        print(f"Release CI verification failed: {error}", file=sys.stderr)
        return 1
    print(f"All {len(REQUIRED_CHECKS)} required GitHub Actions checks passed for {args.sha}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

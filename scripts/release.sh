#!/usr/bin/env bash
# SPDX-License-Identifier: MIT OR Apache-2.0
set -euo pipefail

# Sarab Release Automation Script
# Usage: ./scripts/release.sh <version-tag> [--yes]
# Example: ./scripts/release.sh v1.0.3 --yes

if [ $# -lt 1 ]; then
    echo "Usage: $0 <version-tag> [--yes]"
    echo "Example: $0 v1.0.3"
    exit 1
fi

TAG="$1"
AUTO_CONFIRM=false
if [ "${2:-}" = "--yes" ] || [ "${2:-}" = "-y" ]; then
    AUTO_CONFIRM=true
fi

# 1. Ensure tag starts with 'v' and follows SemVer
if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
    echo "[-] Error: Version tag must follow strict SemVer format, e.g. v1.0.3 or v1.0.3-beta.1"
    exit 1
fi

VERSION="${TAG#v}"
BASE_VERSION="${VERSION%%-*}"

echo "[*] Initiating release checks for: $TAG (Base Version: $BASE_VERSION)"

# 2. Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo "[-] Error: Working tree has uncommitted changes. Commit, stash, or clean them first."
    git status -s
    exit 1
fi

# 3. Check current branch is strictly 'main'
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "[-] Error: Releases can only be tagged from the 'main' branch (current: '$CURRENT_BRANCH')."
    echo "    Merge your release PR into main before running this script."
    exit 1
fi

# 4. Fetch origin to ensure we are up to date with remote
echo "[*] Fetching latest refs and tags from origin..."
git fetch origin main --tags

# 5. Check local HEAD matches origin/main
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse origin/main)"
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
    echo "[-] Error: Local main ($LOCAL_SHA) does not match origin/main ($REMOTE_SHA)."
    echo "    Please pull the latest changes: git pull --ff-only origin main"
    exit 1
fi

# 6. Verify version in app/Cargo.toml matches target release tag
CARGO_TOML="app/Cargo.toml"
if [ ! -f "$CARGO_TOML" ]; then
    echo "[-] Error: $CARGO_TOML not found."
    exit 1
fi

CARGO_VER="$(grep -E '^version = ' "$CARGO_TOML" | head -n 1 | cut -d'"' -f2)"
if [ "$CARGO_VER" != "$BASE_VERSION" ]; then
    echo "[-] Error: app/Cargo.toml version '$CARGO_VER' does not match target release version '$BASE_VERSION'."
    echo "    Version bump must be committed and merged to main via PR before tagging."
    exit 1
fi

# 7. Check if tag already exists locally or remotely
if git tag -l "$TAG" | grep -qx "$TAG"; then
    echo "[-] Error: Tag '$TAG' already exists locally."
    exit 1
fi

if git ls-remote --tags origin "refs/tags/$TAG" | grep -q "$TAG"; then
    echo "[-] Error: Tag '$TAG' already exists on remote origin."
    exit 1
fi

# 8. Verify CI check runs on GitHub for this exact commit SHA
echo "[*] Verifying GitHub CI check status for commit $LOCAL_SHA..."
if ! command -v gh >/dev/null 2>&1; then
    echo "[-] Error: 'gh' CLI tool is required to verify CI checks before release."
    exit 1
fi

CHECKS_JSON="$(gh api "repos/:owner/:repo/commits/$LOCAL_SHA/check-runs" 2>/dev/null || true)"
if [ -z "$CHECKS_JSON" ]; then
    echo "[-] Error: Failed to fetch check runs from GitHub API for commit $LOCAL_SHA."
    exit 1
fi

CHECK_SUMMARY="$(echo "$CHECKS_JSON" | python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
except Exception as e:
    print(f"ERROR:Invalid JSON: {e}")
    sys.exit(1)

total = data.get("total_count", len(data.get("check_runs", [])))
runs = data.get("check_runs", [])
incomplete = [r for r in runs if r.get("status") != "completed"]
failed = [r for r in runs if r.get("conclusion") not in ("success", "skipped")]
success = [r for r in runs if r.get("conclusion") == "success"]

print(f"TOTAL={total}")
print(f"INCOMPLETE={len(incomplete)}")
print(f"FAILED={len(failed)}")
print(f"SUCCESS={len(success)}")
for r in runs:
    n = r.get("name", "")
    s = r.get("status", "")
    c = r.get("conclusion", "")
    print(f"CHECK:{n}:{s}:{c}")
' 2>&1)"

TOTAL_CHECKS="$(echo "$CHECK_SUMMARY" | grep -E '^TOTAL=' | cut -d'=' -f2 || echo 0)"
INCOMPLETE_COUNT="$(echo "$CHECK_SUMMARY" | grep -E '^INCOMPLETE=' | cut -d'=' -f2 || echo 0)"
FAILED_COUNT="$(echo "$CHECK_SUMMARY" | grep -E '^FAILED=' | cut -d'=' -f2 || echo 0)"
SUCCESS_COUNT="$(echo "$CHECK_SUMMARY" | grep -E '^SUCCESS=' | cut -d'=' -f2 || echo 0)"

if [ "$TOTAL_CHECKS" -eq 0 ]; then
    echo "[-] Error: No GitHub check runs found for commit $LOCAL_SHA."
    echo "    A release cannot be tagged without passing CI checks."
    exit 1
fi

if [ "$INCOMPLETE_COUNT" -gt 0 ]; then
    echo "[-] Error: $INCOMPLETE_COUNT check run(s) are still in progress for commit $LOCAL_SHA:"
    echo "$CHECK_SUMMARY" | grep -E '^CHECK:' | grep -v ':completed:' | while IFS=':' read -r _ name status conclusion; do
        echo "  - $name ($status)"
    done
    exit 1
fi

if [ "$FAILED_COUNT" -gt 0 ]; then
    echo "[-] Error: $FAILED_COUNT check run(s) did not succeed for commit $LOCAL_SHA:"
    echo "$CHECK_SUMMARY" | grep -E '^CHECK:' | grep -v ':success' | grep -v ':skipped' | while IFS=':' read -r _ name status conclusion; do
        echo "  - $name ($conclusion)"
    done
    exit 1
fi

echo "[+] All $TOTAL_CHECKS CI check run(s) completed successfully ($SUCCESS_COUNT passed, remainder skipped)."
echo "$CHECK_SUMMARY" | grep -E '^CHECK:' | while IFS=':' read -r _ name status conclusion; do
    echo "    [✓] $name: $conclusion"
done

# 9. Confirmation
echo ""
echo "========================================================"
echo "  Target Tag:    $TAG"
echo "  Commit SHA:    $LOCAL_SHA"
echo "  Branch:        main (synced with origin/main)"
echo "  Cargo Version: $CARGO_VER"
echo "  CI Checks:     $TOTAL_CHECKS checks verified (100% success)"
echo "========================================================"
echo ""

if [ "$AUTO_CONFIRM" = false ]; then
    read -rp "Proceed with creating and pushing tag $TAG to origin? [y/N]: " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "[-] Release aborted by user."
        exit 0
    fi
fi

# 10. Create and push annotated tag
echo "[*] Creating annotated tag $TAG on verified commit $LOCAL_SHA..."
git tag -a "$TAG" -m "Release $TAG"

echo "[*] Pushing tag $TAG to origin..."
git push origin "$TAG"

echo "[+] Successfully pushed release tag $TAG!"
echo "[+] GitHub Release workflow will build, sign, and publish the release."
echo "[+] Track progress at: https://github.com/TheMRVX/sarab/actions"

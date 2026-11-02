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

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
python3 "$SCRIPT_DIR/check_release_checks.py" --sha "$LOCAL_SHA"

# 9. Confirmation
echo ""
echo "========================================================"
echo "  Target Tag:    $TAG"
echo "  Commit SHA:    $LOCAL_SHA"
echo "  Branch:        main (synced with origin/main)"
echo "  Cargo Version: $CARGO_VER"
echo "  CI Checks:     All required GitHub Actions checks passed"
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
if [ "$(git rev-parse HEAD)" != "$LOCAL_SHA" ] ||
   [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ] ||
   [ -n "$(git status --porcelain)" ]; then
    echo "[-] Error: Working tree or HEAD changed after verification. Start again."
    exit 1
fi
git tag -a "$TAG" "$LOCAL_SHA" -m "Release $TAG"

echo "[*] Pushing tag $TAG to origin..."
git push origin "$TAG"

echo "[+] Successfully pushed release tag $TAG!"
echo "[+] GitHub Release workflow will build, sign, and publish the release."
echo "[+] Track progress at: https://github.com/TheMRVX/sarab/actions"

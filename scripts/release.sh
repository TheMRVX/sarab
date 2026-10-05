#!/usr/bin/env bash
set -euo pipefail

# Sarab Release Automation Script
# Usage: ./scripts/release.sh v0.1.1-alpha

if [ $# -lt 1 ]; then
    echo "Usage: $0 <version-tag> (e.g. v0.1.1-alpha or v0.2.0)"
    exit 1
fi

TAG="$1"

# Ensure tag starts with 'v' and follows SemVer
if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
    echo "[-] Error: Version tag must follow SemVer format, e.g. v0.1.1 or v0.1.1-alpha"
    exit 1
fi

VERSION="${TAG#v}"
BASE_VERSION="${VERSION%%-*}"

echo "[*] Target Tag: $TAG (Version: $VERSION, Base: $BASE_VERSION)"

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo "[-] Error: Working tree has uncommitted changes. Commit or stash them first."
    git status -s
    exit 1
fi

# Update app/Cargo.toml
CARGO_TOML="app/Cargo.toml"
if [ -f "$CARGO_TOML" ]; then
    echo "[*] Updating $CARGO_TOML to version $BASE_VERSION..."
    sed -i "s/^version = \".*\"/version = \"$BASE_VERSION\"/" "$CARGO_TOML"
    git add "$CARGO_TOML"
fi

# Commit version bump if modified
if ! git diff --cached --quiet; then
    git commit -m "chore(release): bump version to $TAG"
fi

# Create annotated tag
echo "[*] Creating annotated git tag $TAG..."
git tag -a "$TAG" -m "Release $TAG"

# Push commit and tag to origin
echo "[*] Pushing commit and tag to origin..."
git push origin main
git push origin "$TAG"

echo "[+] Successfully pushed $TAG! GitHub Actions will now automatically build, sign, and publish the release."
echo "[+] View release workflow at: https://github.com/TheMRVX/sarab/actions"

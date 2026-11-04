#!/usr/bin/env bash
# SPDX-License-Identifier: MIT OR Apache-2.0
# Assets must be complete before the draft is published and becomes immutable.
set -euo pipefail

: "${TAG:?TAG is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] ||
   [[ ! "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Invalid release tag or commit SHA" >&2
    exit 1
fi

# Fetch the exact tag, never let gh implicitly create a tag on another commit.
git fetch --no-tags origin "refs/tags/$TAG"
TAG_SHA="$(git rev-parse 'FETCH_HEAD^{commit}')"
if [[ "$TAG_SHA" != "$RELEASE_SHA" ]] || [[ "$(git rev-parse HEAD)" != "$RELEASE_SHA" ]]; then
    echo "Release tag, checkout and built commit must match" >&2
    exit 1
fi

# Fail closed on API failures and on existing drafts or published releases.
# A failed prior draft must be inspected by the maintainer before retrying.
RELEASES="$(gh api --paginate --slurp "repos/$GITHUB_REPOSITORY/releases?per_page=100")"
if ! printf '%s' "$RELEASES" | python3 -c '
import json, os, sys
pages = json.load(sys.stdin)
assert isinstance(pages, list) and all(isinstance(p, list) for p in pages)
if any(r["tag_name"] == os.environ["TAG"] for p in pages for r in p):
    sys.exit("A release or draft already exists for this tag; refusing to overwrite it")
'; then
    exit 1
fi

shopt -s nullglob
assets=(release_assets/*)
if [[ ${#assets[@]} -ne 4 ]] || [[ ! -s release_assets/SHA256SUMS.txt ]] ||
   [[ ! -s "release_assets/sarab-$TAG-x64.zip" ]] ||
   [[ ! -s "release_assets/SarabSetup-$TAG.exe" ]] ||
   [[ ! -s release_assets/SarabGnss.cer ]]; then
    echo "Expected the ZIP, installer, certificate and SHA256SUMS.txt" >&2
    exit 1
fi
(cd release_assets && sha256sum --check --strict SHA256SUMS.txt)

prerelease=()
if [[ "$TAG" == *-* ]]; then
    prerelease=(--prerelease)
fi
gh release create "$TAG" --repo "$GITHUB_REPOSITORY" \
    --verify-tag --target "$RELEASE_SHA" --draft \
    --title "Sarab $TAG" --generate-notes "${prerelease[@]}"
gh release upload "$TAG" "${assets[@]}" --repo "$GITHUB_REPOSITORY"
gh release edit "$TAG" --repo "$GITHUB_REPOSITORY" --draft=false
echo "Published $TAG at $RELEASE_SHA with all assets attached before publication."

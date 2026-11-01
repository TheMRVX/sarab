#!/usr/bin/env python3
"""Verify repository-local Markdown links without network requests or dependencies."""
from __future__ import annotations

import pathlib
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = pathlib.Path(__file__).resolve().parents[1]
LINK = re.compile(r"(?<!!)\[[^\]]*\]\((<?[^\s)]+>?)")
errors = []
checked = 0

for doc in sorted(ROOT.rglob("*.md")):
    if any(part in {".git", "target", "node_modules", "dist"} for part in doc.relative_to(ROOT).parts):
        continue
    content = doc.read_text(encoding="utf-8")
    for match in LINK.finditer(content):
        target = match.group(1).strip("<>")
        if target.startswith(("#", "mailto:")) or "://" in target:
            continue
        route = unquote(urlsplit(target).path)
        if not route:
            continue
        path = (doc.parent / route).resolve()
        checked += 1
        if not path.is_relative_to(ROOT) or not path.exists():
            line = content.count("\n", 0, match.start()) + 1
            errors.append(f"{doc.relative_to(ROOT)}:{line}: missing local target {target}")

if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)
print(f"Validated {checked} local links in Markdown documentation.")

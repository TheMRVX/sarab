#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Check first-party source headers without touching generated or vendored files."""
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def files():
    for directory, suffixes in [
        ("app/src", {".rs"}),
        ("gui/src", {".ts", ".tsx"}),
        ("driver", {".cpp", ".h", ".hpp"}),
        ("scripts", {".py"}),
    ]:
        for p in (ROOT / directory).rglob("*"):
            if p.is_file() and p.suffix in suffixes:
                yield p
    yield ROOT / "app/build.rs"
    yield ROOT / "gui/vite.config.ts"
    yield ROOT / "installer/sarab_installer.iss"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fix", action="store_true", help="Insert missing first-party headers")
    args = parser.parse_args()
    problems = []
    changed = 0
    visited = 0
    for p in sorted(set(files())):
        if not p.exists():
            continue
        visited += 1
        contents = p.read_text(encoding="utf-8")
        if "SPDX-License-Identifier: MIT OR Apache-2.0" in "\n".join(contents.splitlines()[:6]):
            continue
        if p.suffix == ".iss":
            marker = ";"
        elif p.suffix == ".py":
            marker = "#"
        else:
            marker = "//"
        header = f"{marker} SPDX-License-Identifier: MIT OR Apache-2.0\n"
        if p.suffix == ".py" and contents.startswith("#!"):
            first_line, rest = contents.split("\n", 1)
            updated = first_line + "\n" + header + rest
        else:
            updated = header + contents
        if args.fix:
            p.write_text(updated, encoding="utf-8")
            changed += 1
        else:
            problems.append(str(p.relative_to(ROOT)))
    print(f"SPDX audit: {visited} first-party files checked; {changed} headers added")
    if problems:
        print("Missing dual-license SPDX headers:\n" + "\n".join(problems), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

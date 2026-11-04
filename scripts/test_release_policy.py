#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Exercise release check identity, pagination and draft publication failures."""

import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from check_release_checks import REQUIRED_CHECKS, verify_checks
from test_release_negative import create_mock_gh, run, setup_mock_repo

ROOT = Path(__file__).resolve().parents[1]
SHA = "a" * 40


def checks(sha=SHA):
    return [{"name": name, "head_sha": sha, "app": {"slug": "github-actions"},
             "status": "completed", "conclusion": "success"} for name in REQUIRED_CHECKS]


class RequiredChecksTests(unittest.TestCase):
    def test_success_across_pages(self):
        runs = checks()
        verify_checks([{"check_runs": runs[:2]}, {"check_runs": runs[2:]}], SHA)

    def test_reject_invalid_and_empty_responses(self):
        for data in (None, {}, [], [{}], [{"check_runs": []}]):
            with self.subTest(data=data), self.assertRaises(ValueError):
                verify_checks(data, SHA)

    def test_reject_missing_check(self):
        for name in REQUIRED_CHECKS:
            with self.subTest(name=name), self.assertRaises(ValueError):
                verify_checks([{"check_runs": [r for r in checks() if r["name"] != name]}], SHA)

    def test_reject_skipped_failed_pending_wrong_sha_and_wrong_app(self):
        for change in ({"conclusion": "skipped"}, {"conclusion": "neutral"},
                       {"conclusion": "failure"}, {"status": "in_progress"},
                       {"head_sha": "b" * 40}, {"app": {"slug": "untrusted-app"}}):
            data = checks()
            data[0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                verify_checks([{"check_runs": data}], SHA)

    def test_duplicate_failed_workflow_is_not_hidden_by_success(self):
        data = checks()
        failed = copy.deepcopy(data[0])
        failed["conclusion"] = "failure"
        data.append(failed)
        with self.assertRaises(ValueError):
            verify_checks([{"check_runs": data}], SHA)

    def test_release_script_rejects_changed_head(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            work, _ = setup_mock_repo(base)
            bindir = base / "bin"
            bindir.mkdir()
            sha = run(["git", "rev-parse", "HEAD"], cwd=work).stdout.strip()
            create_mock_gh(bindir, {"check_runs": checks(sha)})
            mock = bindir / "gh"
            mock.write_text(mock.read_text().replace(
                'if [ "$1" = "api" ]; then',
                'if [ "$1" = "api" ]; then\n    git commit --allow-empty -m changed-after-check >/dev/null'))
            env = {**os.environ, "PATH": f"{bindir}:{os.environ['PATH']}"}
            result = run(["bash", "scripts/release.sh", "v1.0.3", "--yes"],
                         cwd=work, env=env, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("HEAD changed after verification", result.stdout)
            self.assertEqual(run(["git", "tag", "-l", "v1.0.3"], cwd=work).stdout, "")


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        base = Path(self.tmp.name)
        self.work, _ = setup_mock_repo(base)
        self.sha = run(["git", "rev-parse", "HEAD"], cwd=self.work).stdout.strip()
        run(["git", "tag", "v1.0.3"], cwd=self.work)
        run(["git", "push", "origin", "v1.0.3"], cwd=self.work)
        self.bindir = base / "bin"
        self.bindir.mkdir()
        self.log = base / "gh-calls.jsonl"
        self.env = {**os.environ, "PATH": f"{self.bindir}:{os.environ['PATH']}",
                    "TAG": "v1.0.3", "RELEASE_SHA": self.sha,
                    "GITHUB_REPOSITORY": "example/sarab", "MOCK_LOG": str(self.log)}
        assets = self.work / "release_assets"
        assets.mkdir()
        sums = []
        for name in ("sarab-v1.0.3-x64.zip", "SarabSetup-v1.0.3.exe", "SarabGnss.cer"):
            content = name.encode()
            (assets / name).write_bytes(content)
            sums.append(f"{hashlib.sha256(content).hexdigest()}  {name}\n")
        (assets / "SHA256SUMS.txt").write_bytes("".join(sums).replace("\n", "\r\n").encode())
        mock = self.bindir / "gh"
        mock.write_text('''#!/usr/bin/env python3
import json, os, sys
with open(os.environ["MOCK_LOG"], "a") as log:
    log.write(json.dumps(sys.argv[1:]) + "\\n")
if sys.argv[1] == "api":
    if os.environ.get("API_FAIL"):
        sys.exit(1)
    print(os.environ.get("RELEASES", "[[]]"))
elif sys.argv[1:3] == ["release", "upload"] and os.environ.get("UPLOAD_FAIL"):
    sys.exit(1)
''')
        mock.chmod(0o755)

    def publish(self):
        return subprocess.run(["bash", str(ROOT / "scripts/publish_release.sh")],
                              cwd=self.work, env=self.env, capture_output=True, text=True)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_draft_upload_publish_in_order(self):
        result = self.publish()
        self.assertEqual(result.returncode, 0, result.stderr)
        mutations = [call for call in self.calls() if call[0] == "release"]
        self.assertEqual([call[1] for call in mutations], ["create", "upload", "edit"])
        self.assertIn("--draft", mutations[0])
        self.assertIn("--verify-tag", mutations[0])
        self.assertIn(self.sha, mutations[0])
        self.assertIn("--draft=false", mutations[2])
        self.assertNotIn("--clobber", str(mutations))

    def test_existing_draft_or_release_and_api_failure_block_writes(self):
        for extra in ({"RELEASES": '[[{"tag_name":"v1.0.3","draft":false}]]'},
                      {"RELEASES": '[[{"tag_name":"v1.0.3","draft":true}]]'},
                      {"API_FAIL": "1"}):
            with self.subTest(extra=extra):
                self.env.update(extra)
                self.assertNotEqual(self.publish().returncode, 0)
                self.assertFalse(any(call[0] == "release" for call in self.calls()))
                for key in extra:
                    self.env.pop(key)

    def test_upload_failure_never_publishes(self):
        self.env["UPLOAD_FAIL"] = "1"
        self.assertNotEqual(self.publish().returncode, 0)
        self.assertFalse(any(call[:2] == ["release", "edit"] for call in self.calls()))

    def test_wrong_commit_never_creates_release(self):
        self.env["RELEASE_SHA"] = "b" * 40
        self.assertNotEqual(self.publish().returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_corrupt_or_missing_assets_never_create_release(self):
        assets = self.work / "release_assets"
        (assets / "SarabGnss.cer").write_text("tampered")
        self.assertNotEqual(self.publish().returncode, 0)
        (assets / "SarabGnss.cer").unlink()
        self.assertNotEqual(self.publish().returncode, 0)
        self.assertFalse(any(call[0] == "release" for call in self.calls()))


if __name__ == "__main__":
    unittest.main()

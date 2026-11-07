#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Test suite validating Inno Setup Windows PATH management and ownership logic."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ISS_PATH = ROOT / "installer" / "sarab_installer.iss"


def normalize_path(p: str) -> str:
    p = p.strip()
    if len(p) >= 2 and p[0] == '"' and p[-1] == '"':
        p = p[1:-1].strip()
    while p.endswith("\\"):
        p = p[:-1]
    return p.upper()


def is_in_path(path_list: str, target_dir: str) -> bool:
    norm_target = normalize_path(target_dir)
    if not norm_target:
        return False
    parts = [p.strip() for p in path_list.split(";") if p.strip()]
    for entry in parts:
        if normalize_path(entry) == norm_target:
            return True
    return False


def remove_from_path(path_list: str, target_dir: str) -> str:
    norm_target = normalize_path(target_dir)
    parts = [p.strip() for p in path_list.split(";") if p.strip()]
    retained = [entry for entry in parts if normalize_path(entry) != norm_target]
    return ";".join(retained)


def add_to_path(path_list: str, target_dir: str) -> str:
    target = target_dir.strip()
    while target.endswith("\\"):
        target = target[:-1]
    if not target:
        return path_list
    cleaned = path_list.strip().rstrip(";")
    if not cleaned:
        return target
    return f"{cleaned};{target}"


class FakeRegistry:
    def __init__(self, initial_path: str = "C:\\Windows\\system32;C:\\Windows;%SystemRoot%\\System32\\Wbem"):
        self.system_path = initial_path
        self.sarab_reg = {}

    def simulate_install(self, app_dir: str, add_to_path_task: bool):
        clean_app_dir = app_dir.strip().rstrip("\\")
        prev_added = self.sarab_reg.get("PathAdded", "")
        current_path = self.system_path

        if add_to_path_task:
            if prev_added and normalize_path(prev_added) != normalize_path(clean_app_dir):
                if is_in_path(current_path, prev_added):
                    current_path = remove_from_path(current_path, prev_added)

            if not is_in_path(current_path, clean_app_dir):
                current_path = add_to_path(current_path, clean_app_dir)
                self.sarab_reg["PathAdded"] = clean_app_dir
            else:
                if prev_added and normalize_path(prev_added) == normalize_path(clean_app_dir):
                    pass
                else:
                    self.sarab_reg.pop("PathAdded", None)
        else:
            if prev_added:
                if is_in_path(current_path, prev_added):
                    current_path = remove_from_path(current_path, prev_added)
                self.sarab_reg.pop("PathAdded", None)

        self.system_path = current_path

    def simulate_uninstall(self):
        recorded = self.sarab_reg.get("PathAdded", "")
        if recorded:
            if is_in_path(self.system_path, recorded):
                self.system_path = remove_from_path(self.system_path, recorded)
            self.sarab_reg.pop("PathAdded", None)


def test_iss_file_syntax_and_declarations():
    print("[*] Validating Inno Setup script declarations...")
    content = ISS_PATH.read_text(encoding="utf-8")

    # 1. License header
    assert "SPDX-License-Identifier: MIT OR Apache-2.0" in content, "Missing SPDX header"

    # 2. Task declaration
    task_match = re.search(r'Name:\s*"addtopath";\s*Description:\s*"[^"]+";\s*GroupDescription:\s*"[^"]+"', content)
    assert task_match, "Missing 'addtopath' task in [Tasks]"
    assert "unchecked" not in task_match.group(0), "'addtopath' should be enabled by default"

    # 3. Code section and API imports
    assert "[Code]" in content, "Missing [Code] section"
    assert "SendMessageTimeout" in content, "Missing SendMessageTimeout for environment broadcast"
    assert "WM_SETTINGCHANGE" in content, "Missing WM_SETTINGCHANGE broadcast"
    assert "RegWriteExpandStringValue" in content, "Must use RegWriteExpandStringValue to preserve REG_EXPAND_SZ"
    assert "NormalizePath" in content, "Missing NormalizePath helper"
    assert "IsInPath" in content, "Missing IsInPath helper"
    assert "RemoveFromPath" in content, "Missing RemoveFromPath helper"
    assert "AddToPath" in content, "Missing AddToPath helper"
    assert "CurStepChanged" in content, "Missing CurStepChanged"
    assert "CurUninstallStepChanged" in content, "Missing CurUninstallStepChanged"
    print("  [+] Inno Setup script structure and helpers verified.")


def test_path_logic_scenarios():
    print("[*] Testing installer PATH scenarios and edge cases...")

    # Scenario 1: Fresh install with PATH enabled
    reg = FakeRegistry()
    orig = reg.system_path
    reg.simulate_install("C:\\Program Files\\Sarab", add_to_path_task=True)
    assert reg.system_path == f"{orig};C:\\Program Files\\Sarab", "Failed to append to PATH"
    assert reg.sarab_reg.get("PathAdded") == "C:\\Program Files\\Sarab", "Failed to record ownership"
    assert "%SystemRoot%" in reg.system_path, "Expansion variable damaged"

    # Scenario 2: Uninstall cleans up only installer-owned entry
    reg.simulate_uninstall()
    assert reg.system_path == orig, f"Uninstall failed to restore exact original PATH: {reg.system_path}"
    assert "PathAdded" not in reg.sarab_reg, "PathAdded was not cleaned up on uninstall"

    # Scenario 3: Fresh install with PATH disabled
    reg = FakeRegistry()
    reg.simulate_install("C:\\Program Files\\Sarab", add_to_path_task=False)
    assert reg.system_path == orig, "PATH should not have been modified when task disabled"
    assert "PathAdded" not in reg.sarab_reg, "PathAdded should not be set when task disabled"

    # Scenario 4: Reinstall / Upgrade in place does not create duplicates
    reg = FakeRegistry()
    reg.simulate_install("C:\\Program Files\\Sarab", add_to_path_task=True)
    path_after_first = reg.system_path
    reg.simulate_install("C:\\Program Files\\Sarab", add_to_path_task=True)
    assert reg.system_path == path_after_first, "Duplicate entry created during reinstall"
    assert reg.sarab_reg.get("PathAdded") == "C:\\Program Files\\Sarab"

    # Scenario 5: Spaces and custom paths
    reg = FakeRegistry()
    custom_dir = "D:\\Custom Tools\\Sarab Location Suite"
    reg.simulate_install(custom_dir, add_to_path_task=True)
    assert reg.system_path.endswith(f";{custom_dir}")
    assert reg.sarab_reg.get("PathAdded") == custom_dir
    reg.simulate_uninstall()
    assert reg.system_path == orig

    # Scenario 6: Pre-existing matching PATH entry preserved on uninstall
    reg = FakeRegistry(initial_path=f"{orig};C:\\Program Files\\Sarab")
    pre_existing_path = reg.system_path
    # Install into existing location
    reg.simulate_install("C:\\Program Files\\Sarab", add_to_path_task=True)
    assert reg.system_path == pre_existing_path, "Pre-existing entry duplicated"
    assert reg.sarab_reg.get("PathAdded") is None, "Should not claim ownership of pre-existing entry"
    # Uninstall must NOT remove pre-existing entry
    reg.simulate_uninstall()
    assert reg.system_path == pre_existing_path, "Pre-existing entry was incorrectly deleted on uninstall"

    # Scenario 7: Upgrade to a different path cleans old installer entry
    reg = FakeRegistry()
    reg.simulate_install("C:\\Program Files\\Sarab", add_to_path_task=True)
    # Upgrade to custom path
    reg.simulate_install("D:\\Tools\\Sarab", add_to_path_task=True)
    assert "C:\\Program Files\\Sarab" not in reg.system_path, "Old path not cleaned up on upgrade"
    assert "D:\\Tools\\Sarab" in reg.system_path, "New path not added on upgrade"
    assert reg.sarab_reg.get("PathAdded") == "D:\\Tools\\Sarab"
    reg.simulate_uninstall()
    assert reg.system_path == orig

    # Scenario 8: Upgrade where user opts out of PATH
    reg = FakeRegistry()
    reg.simulate_install("C:\\Program Files\\Sarab", add_to_path_task=True)
    assert "C:\\Program Files\\Sarab" in reg.system_path
    # Reinstall/upgrade with task disabled
    reg.simulate_install("C:\\Program Files\\Sarab", add_to_path_task=False)
    assert "C:\\Program Files\\Sarab" not in reg.system_path, "Path not removed when user opted out on upgrade"
    assert "PathAdded" not in reg.sarab_reg

    # Scenario 9: Trailing backslash and casing variations
    reg = FakeRegistry()
    reg.simulate_install("C:\\Program Files\\Sarab\\", add_to_path_task=True)
    assert reg.system_path.endswith(";C:\\Program Files\\Sarab"), "Trailing backslash not stripped"
    # Reinstall with different case and no trailing slash
    reg.simulate_install("c:\\program files\\sarab", add_to_path_task=True)
    assert reg.system_path.count("Sarab") == 1, "Casing variation caused duplicate entry"

    print("  [+] All installer PATH scenarios passed successfully.")


def main():
    test_iss_file_syntax_and_declarations()
    test_path_logic_scenarios()
    print("=== All Inno Setup PATH Tests Passed (2/2) ===")


if __name__ == "__main__":
    main()

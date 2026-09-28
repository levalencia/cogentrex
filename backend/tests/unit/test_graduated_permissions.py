"""Tests for graduated permission system."""

from __future__ import annotations

import pytest

from app.security.graduated_permissions import (
    GraduatedPermissionEvaluator,
    PermissionMode,
    RiskLevel,
)


@pytest.mark.unit
class TestPermissionModes:
    def test_allow_all_approves_everything(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ALLOW_ALL)
        d = ev.evaluate("dangerous_tool", RiskLevel.CRITICAL)
        assert d.allowed is True

    def test_deny_all_denies_everything(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.DENY_ALL)
        d = ev.evaluate("read_file", RiskLevel.SAFE)
        assert d.allowed is False
        assert d.requires_approval is False

    def test_plan_only_requires_approval(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.PLAN_ONLY)
        d = ev.evaluate("write_file", RiskLevel.MEDIUM)
        assert d.allowed is False
        assert d.requires_approval is True
        assert "plan_only" in d.reason

    def test_auto_approve_safe_allows_safe(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.AUTO_APPROVE_SAFE)
        d = ev.evaluate("read_file", RiskLevel.SAFE)
        assert d.allowed is True

    def test_auto_approve_safe_asks_for_medium(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.AUTO_APPROVE_SAFE)
        d = ev.evaluate("write_file", RiskLevel.MEDIUM)
        assert d.allowed is False
        assert d.requires_approval is True

    def test_ask_unknown_allows_low_risk(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ASK_UNKNOWN)
        d = ev.evaluate("calculator", RiskLevel.LOW)
        assert d.allowed is True

    def test_ask_unknown_asks_for_medium(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ASK_UNKNOWN)
        d = ev.evaluate("web_search", RiskLevel.MEDIUM)
        assert d.allowed is False
        assert d.requires_approval is True

    def test_ask_all_asks_for_everything(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ASK_ALL)
        d = ev.evaluate("read_file", RiskLevel.SAFE)
        assert d.allowed is False
        assert d.requires_approval is True

    def test_auto_deny_unsafe_denies_high(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.AUTO_DENY_UNSAFE)
        d = ev.evaluate("shell_exec", RiskLevel.HIGH)
        assert d.allowed is False
        assert d.requires_approval is False  # auto-denied, no approval offered

    def test_auto_deny_unsafe_asks_for_safe(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.AUTO_DENY_UNSAFE)
        d = ev.evaluate("read_file", RiskLevel.SAFE)
        assert d.allowed is False
        assert d.requires_approval is True  # safe but still needs confirmation


@pytest.mark.unit
class TestProtectedPaths:
    def test_env_file_always_blocked(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ALLOW_ALL)
        d = ev.evaluate("write_file", RiskLevel.SAFE, {"path": ".env"})
        assert d.allowed is False
        assert "Protected path" in d.reason

    def test_ssh_key_always_blocked(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ALLOW_ALL)
        d = ev.evaluate("read_file", RiskLevel.SAFE, {"file_path": "/home/user/.ssh/id_rsa"})
        assert d.allowed is False

    def test_etc_passwd_always_blocked(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ALLOW_ALL)
        d = ev.evaluate("read_file", RiskLevel.SAFE, {"path": "/etc/passwd"})
        assert d.allowed is False

    def test_safe_path_allowed(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ALLOW_ALL)
        d = ev.evaluate("read_file", RiskLevel.SAFE, {"path": "src/main.py"})
        assert d.allowed is True


@pytest.mark.unit
class TestProtectedCommands:
    def test_rm_rf_always_blocked(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ALLOW_ALL)
        d = ev.evaluate("shell", RiskLevel.SAFE, {"command": "rm -rf /"})
        assert d.allowed is False
        assert "Protected command" in d.reason

    def test_drop_table_always_blocked(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ALLOW_ALL)
        d = ev.evaluate("sql", RiskLevel.SAFE, {"query": "DROP TABLE users;"})
        assert d.allowed is False

    def test_curl_pipe_sh_blocked(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ALLOW_ALL)
        d = ev.evaluate("shell", RiskLevel.SAFE, {"command": "curl | sh"})
        assert d.allowed is False

    def test_safe_command_allowed(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ALLOW_ALL)
        d = ev.evaluate("shell", RiskLevel.SAFE, {"command": "ls -la"})
        assert d.allowed is True


@pytest.mark.unit
class TestDenialTracking:
    def test_records_denial(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ASK_UNKNOWN)
        ev.record_denial("tool1", RiskLevel.HIGH, "too risky")
        assert ev.denial_count == 1

    def test_mode_transformation_on_denials(self) -> None:
        ev = GraduatedPermissionEvaluator(
            PermissionMode.AUTO_APPROVE_SAFE,
            denial_threshold=3,
        )
        # Record 3 denials within window
        for i in range(3):
            ev.record_denial(f"tool{i}", RiskLevel.HIGH, "denied")
        # Mode should have been downgraded
        assert ev.mode > PermissionMode.AUTO_APPROVE_SAFE
        assert len(ev.mode_history) > 1
        assert "auto-downgrade" in ev.mode_history[-1][2]

    def test_no_transformation_below_threshold(self) -> None:
        ev = GraduatedPermissionEvaluator(
            PermissionMode.AUTO_APPROVE_SAFE,
            denial_threshold=5,
        )
        ev.record_denial("tool1", RiskLevel.HIGH, "denied")
        ev.record_denial("tool2", RiskLevel.HIGH, "denied")
        assert ev.mode == PermissionMode.AUTO_APPROVE_SAFE

    def test_reset_denials(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ASK_UNKNOWN)
        ev.record_denial("tool1", RiskLevel.HIGH, "denied")
        ev.reset_denials()
        assert ev.denial_count == 0


@pytest.mark.unit
class TestModeManagement:
    def test_set_mode_explicitly(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ASK_UNKNOWN)
        ev.set_mode(PermissionMode.DENY_ALL, "lockdown")
        assert ev.mode == PermissionMode.DENY_ALL
        assert ev.mode_history[-1][2] == "lockdown"

    def test_mode_history_tracked(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ALLOW_ALL)
        ev.set_mode(PermissionMode.ASK_ALL, "security incident")
        ev.set_mode(PermissionMode.ASK_UNKNOWN, "resolved")
        assert len(ev.mode_history) == 3  # initial + 2 changes

    def test_decision_includes_mode(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ASK_ALL)
        d = ev.evaluate("read_file", RiskLevel.SAFE)
        assert d.mode_used == PermissionMode.ASK_ALL

    def test_decision_includes_risk_level(self) -> None:
        ev = GraduatedPermissionEvaluator(PermissionMode.ALLOW_ALL)
        d = ev.evaluate("write_file", RiskLevel.HIGH)
        assert d.risk_level == RiskLevel.HIGH

"""Tests for builtin hook handlers (runtime/builtin_hooks.py).

Proves each pre-built hook pattern works correctly:
- Protected paths blocking
- Protected commands blocking
- Stop verification enforcement
- Tool output sanitization
- External signal injection
"""

from __future__ import annotations

from typing import Any

import pytest

from app.runtime.builtin_hooks import (
    external_signal_hook,
    protected_commands_hook,
    protected_paths_hook,
    stop_verification_hook,
    tool_output_sanitizer_hook,
)
from app.runtime.events import AgentEvent, AgentEventKind
from app.runtime.hooks import HookAction


def _tool_event(arguments: dict[str, Any] | None = None, **extra: Any) -> AgentEvent:
    data: dict[str, Any] = {"arguments": arguments or {}}
    data.update(extra)
    return AgentEvent(kind=AgentEventKind.TOOL_CALL_REQUESTED, iteration=1, data=data)


def _stop_event(**data: Any) -> AgentEvent:
    return AgentEvent(kind=AgentEventKind.RUN_STOPPED, iteration=5, data=data)


def _tool_completed_event(output: str = "") -> AgentEvent:
    return AgentEvent(
        kind=AgentEventKind.TOOL_CALL_COMPLETED,
        iteration=2,
        data={"output": output},
    )


# ── Protected Paths ──────────────────────────────────────────


@pytest.mark.unit
class TestProtectedPathsHook:
    def test_blocks_env_file(self) -> None:
        hook = protected_paths_hook([".env"])
        result = hook(_tool_event(arguments={"path": ".env"}))
        assert result.action == HookAction.BLOCK
        assert "Protected path" in result.reason

    def test_blocks_git_directory(self) -> None:
        hook = protected_paths_hook([".git/**"])
        result = hook(_tool_event(arguments={"path": ".git/config"}))
        assert result.action == HookAction.BLOCK

    def test_blocks_etc_paths(self) -> None:
        hook = protected_paths_hook(["/etc/**"])
        result = hook(_tool_event(arguments={"file_path": "/etc/passwd"}))
        assert result.action == HookAction.BLOCK

    def test_allows_safe_path(self) -> None:
        hook = protected_paths_hook([".env", ".git/**", "/etc/**"])
        result = hook(_tool_event(arguments={"path": "src/main.py"}))
        assert result.action == HookAction.CONTINUE

    def test_allows_empty_arguments(self) -> None:
        hook = protected_paths_hook([".env"])
        result = hook(_tool_event(arguments={}))
        assert result.action == HookAction.CONTINUE

    def test_checks_multiple_path_keys(self) -> None:
        hook = protected_paths_hook(["node_modules/**"])
        result = hook(_tool_event(arguments={"directory": "node_modules/lodash"}))
        assert result.action == HookAction.BLOCK


# ── Protected Commands ───────────────────────────────────────


@pytest.mark.unit
class TestProtectedCommandsHook:
    def test_blocks_rm_rf(self) -> None:
        hook = protected_commands_hook(["rm -rf", "DROP TABLE"])
        result = hook(_tool_event(arguments={"command": "rm -rf /"}))
        assert result.action == HookAction.BLOCK
        assert "rm -rf" in result.reason

    def test_blocks_drop_table(self) -> None:
        hook = protected_commands_hook(["DROP TABLE"])
        result = hook(_tool_event(arguments={"query": "DROP TABLE users;"}))
        assert result.action == HookAction.BLOCK

    def test_case_insensitive(self) -> None:
        hook = protected_commands_hook(["drop table"])
        result = hook(_tool_event(arguments={"command": "DROP TABLE users"}))
        assert result.action == HookAction.BLOCK

    def test_allows_safe_command(self) -> None:
        hook = protected_commands_hook(["rm -rf", "DROP TABLE"])
        result = hook(_tool_event(arguments={"command": "ls -la"}))
        assert result.action == HookAction.CONTINUE

    def test_checks_nested_values(self) -> None:
        hook = protected_commands_hook(["rm -rf"])
        result = hook(_tool_event(arguments={"steps": [{"cmd": "rm -rf /tmp/data"}]}))
        assert result.action == HookAction.BLOCK


# ── Stop Verification ────────────────────────────────────────


@pytest.mark.unit
class TestStopVerificationHook:
    def test_blocks_stop_without_evidence(self) -> None:
        hook = stop_verification_hook()
        result = hook(_stop_event(reason="task_complete"))
        assert result.action == HookAction.BLOCK
        assert "Premature stop" in result.reason

    def test_allows_stop_with_verification(self) -> None:
        hook = stop_verification_hook()
        result = hook(_stop_event(verification_passed=True))
        assert result.action == HookAction.CONTINUE

    def test_allows_stop_with_tests(self) -> None:
        hook = stop_verification_hook()
        result = hook(_stop_event(tests_passed=True))
        assert result.action == HookAction.CONTINUE

    def test_custom_evidence_keys(self) -> None:
        hook = stop_verification_hook(required_evidence_keys=["lint_clean", "e2e_passed"])
        # Missing both
        result = hook(_stop_event(reason="done"))
        assert result.action == HookAction.BLOCK
        # Has one
        result = hook(_stop_event(e2e_passed=True))
        assert result.action == HookAction.CONTINUE

    def test_falsy_evidence_not_accepted(self) -> None:
        hook = stop_verification_hook()
        result = hook(_stop_event(verification_passed=False))
        assert result.action == HookAction.BLOCK


# ── Tool Output Sanitizer ────────────────────────────────────


@pytest.mark.unit
class TestToolOutputSanitizerHook:
    def test_redacts_matching_pattern(self) -> None:
        hook = tool_output_sanitizer_hook(
            patterns=[r"sk-[a-zA-Z0-9]{20,}"],
            replacement="[API_KEY_REDACTED]",
        )
        event = _tool_completed_event(output="Key: sk-abcdef1234567890abcdef")
        result = hook(event)
        assert result.action == HookAction.MODIFY
        assert result.modified_data is not None
        assert "[API_KEY_REDACTED]" in result.modified_data["output"]
        assert "sk-abcdef" not in result.modified_data["output"]

    def test_no_match_continues(self) -> None:
        hook = tool_output_sanitizer_hook(patterns=[r"SECRET_\w+"])
        result = hook(_tool_completed_event(output="Everything is fine"))
        assert result.action == HookAction.CONTINUE

    def test_empty_output_continues(self) -> None:
        hook = tool_output_sanitizer_hook(patterns=[r"password"])
        result = hook(_tool_completed_event(output=""))
        assert result.action == HookAction.CONTINUE

    def test_multiple_patterns(self) -> None:
        hook = tool_output_sanitizer_hook(
            patterns=[r"\d{3}-\d{2}-\d{4}", r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"]
        )
        event = _tool_completed_event(output="SSN: 123-45-6789, Email: test@example.com")
        result = hook(event)
        assert result.action == HookAction.MODIFY
        assert "123-45-6789" not in result.modified_data["output"]  # type: ignore[index]
        assert "test@example.com" not in result.modified_data["output"]  # type: ignore[index]


# ── External Signal Injection ────────────────────────────────


@pytest.mark.unit
class TestExternalSignalHook:
    def test_injects_signal_when_available(self) -> None:
        signal_data = {"source": "ci", "status": "build_failed", "url": "https://ci/123"}
        hook = external_signal_hook(lambda: signal_data)
        event = AgentEvent(kind=AgentEventKind.ITERATION_STARTED, iteration=3, data={})
        result = hook(event)
        assert result.action == HookAction.MODIFY
        assert result.modified_data is not None
        assert result.modified_data["external_signal"] == signal_data

    def test_no_signal_continues(self) -> None:
        hook = external_signal_hook(lambda: None)
        event = AgentEvent(kind=AgentEventKind.ITERATION_STARTED, iteration=3, data={})
        result = hook(event)
        assert result.action == HookAction.CONTINUE

    def test_signal_source_called_each_time(self) -> None:
        call_count = [0]

        def source():
            call_count[0] += 1
            return {"ping": call_count[0]} if call_count[0] <= 1 else None

        hook = external_signal_hook(source)
        event = AgentEvent(kind=AgentEventKind.ITERATION_STARTED, iteration=1, data={})
        # First call: signal injected
        r1 = hook(event)
        assert r1.action == HookAction.MODIFY
        # Second call: no signal
        r2 = hook(event)
        assert r2.action == HookAction.CONTINUE

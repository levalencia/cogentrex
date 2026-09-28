"""Tests for tool concurrency classification and parallel execution."""

from __future__ import annotations

import asyncio
import time

import pytest

from app.tools.concurrency import (
    ToolClassification,
    ToolSafetyReview,
    classify_tool,
    execute_tool_batch,
)


@pytest.mark.unit
class TestClassifyTool:
    def test_known_read_only_tool(self) -> None:
        c = classify_tool("read_file")
        assert c.is_read_only is True
        assert c.is_concurrent_safe is True
        assert c.risk_level == "safe"

    def test_known_write_tool(self) -> None:
        c = classify_tool("write_file")
        assert c.is_read_only is False
        assert c.is_concurrent_safe is False

    def test_unknown_tool_defaults_unsafe(self) -> None:
        c = classify_tool("custom_danger_tool")
        assert c.is_read_only is False
        assert c.is_concurrent_safe is False
        assert c.risk_level == "medium"

    def test_custom_rules_override(self) -> None:
        custom = {
            "my_tool": ToolClassification(
                "my_tool", is_read_only=True, is_concurrent_safe=True, risk_level="safe"
            )
        }
        c = classify_tool("my_tool", custom_rules=custom)
        assert c.is_concurrent_safe is True

    def test_sandbox_exec_concurrent_safe(self) -> None:
        c = classify_tool("sandbox_exec")
        assert c.is_concurrent_safe is True  # sandboxed = isolated


@pytest.mark.unit
class TestExecuteToolBatch:
    @pytest.mark.asyncio
    async def test_parallel_tools_run_concurrently(self) -> None:
        execution_times: dict[str, float] = {}

        async def slow_executor(name: str, args: dict) -> str:
            start = time.monotonic()
            await asyncio.sleep(0.05)
            execution_times[name] = time.monotonic() - start
            return f"result_{name}"

        calls = [
            ("read_file", {"path": "a.txt"}),
            ("calculator", {"expr": "1+1"}),
            ("list_directory", {"path": "."}),
        ]
        start = time.monotonic()
        results = await execute_tool_batch(calls, slow_executor)
        total_time = time.monotonic() - start

        assert len(results) == 3
        # All should be parallel — total time should be close to one sleep, not three
        assert total_time < 0.15  # 3 × 0.05 serial would be 0.15+

    @pytest.mark.asyncio
    async def test_serial_tools_run_sequentially(self) -> None:
        order: list[str] = []

        async def tracking_executor(name: str, args: dict) -> str:
            order.append(name)
            return "ok"

        calls = [
            ("write_file", {"path": "a.txt", "content": "x"}),
            ("shell_exec", {"command": "ls"}),
        ]
        results = await execute_tool_batch(calls, tracking_executor)
        assert order == ["write_file", "shell_exec"]
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_mixed_parallel_then_serial(self) -> None:
        order: list[str] = []

        async def executor(name: str, args: dict) -> str:
            order.append(name)
            return f"done_{name}"

        calls = [
            ("read_file", {"path": "a.txt"}),  # parallel
            ("calculator", {"expr": "2+2"}),  # parallel
            ("write_file", {"path": "b.txt", "content": "x"}),  # serial
        ]
        results = await execute_tool_batch(calls, executor)
        assert len(results) == 3
        # write_file should be last (serial runs after parallel)
        assert results[-1][0] == "write_file"

    @pytest.mark.asyncio
    async def test_empty_batch(self) -> None:
        async def executor(name: str, args: dict) -> str:
            return "ok"

        results = await execute_tool_batch([], executor)
        assert results == []

    @pytest.mark.asyncio
    async def test_sync_executor_works(self) -> None:
        def sync_executor(name: str, args: dict) -> str:
            return f"sync_{name}"

        calls = [("calculator", {"expr": "1+1"})]
        results = await execute_tool_batch(calls, sync_executor)
        assert results[0] == ("calculator", "sync_calculator")


@pytest.mark.unit
class TestToolSafetyReview:
    def test_complete_checklist(self) -> None:
        review = ToolSafetyReview(
            tool_name="new_tool",
            risk_assessment="Medium — writes to filesystem",
            read_only=False,
            concurrent_safe=False,
            permission_requirements="Requires file write approval",
            test_scenarios=["Write to allowed path", "Write to protected path"],
            approved=True,
            reviewer="admin",
        )
        assert review.checklist_complete() is True

    def test_incomplete_checklist(self) -> None:
        review = ToolSafetyReview(tool_name="new_tool")
        assert review.checklist_complete() is False

    def test_partial_checklist(self) -> None:
        review = ToolSafetyReview(
            tool_name="new_tool",
            risk_assessment="Low",
            read_only=True,
            # Missing: concurrent_safe, permission_requirements, test_scenarios
        )
        assert review.checklist_complete() is False

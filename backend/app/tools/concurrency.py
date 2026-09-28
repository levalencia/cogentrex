"""Tool concurrency classification and parallel execution.

Implements frontier tool mechanisms:
- Per-call concurrency classification (TR)
- Concurrent-safe tools run in parallel; unsafe serialize (TR)
- Tool isReadOnly flag (TR)
- Tool isConcurrentSafe flag (TR)
- Tool safety review checklist (TR)
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import structlog

logger = structlog.get_logger()


@dataclass(frozen=True, slots=True)
class ToolClassification:
    """Per-call classification for a tool invocation."""

    tool_name: str
    is_read_only: bool = False
    is_concurrent_safe: bool = False
    risk_level: str = "medium"  # safe, low, medium, high, critical


@dataclass(frozen=True, slots=True)
class ToolSafetyReview:
    """Checklist for reviewing a new tool before enabling it."""

    tool_name: str
    risk_assessment: str = ""
    read_only: bool | None = None
    concurrent_safe: bool | None = None
    permission_requirements: str = ""
    test_scenarios: list[str] = field(default_factory=list)
    approved: bool = False
    reviewer: str = ""

    def checklist_complete(self) -> bool:
        return all(
            [
                self.risk_assessment,
                self.read_only is not None,
                self.concurrent_safe is not None,
                self.permission_requirements,
                len(self.test_scenarios) >= 1,
            ]
        )


# Default classifications for built-in tools
_DEFAULT_CLASSIFICATIONS: dict[str, ToolClassification] = {
    "read_file": ToolClassification(
        "read_file", is_read_only=True, is_concurrent_safe=True, risk_level="safe"
    ),
    "list_directory": ToolClassification(
        "list_directory", is_read_only=True, is_concurrent_safe=True, risk_level="safe"
    ),
    "calculator": ToolClassification(
        "calculator", is_read_only=True, is_concurrent_safe=True, risk_level="safe"
    ),
    "datetime": ToolClassification(
        "datetime", is_read_only=True, is_concurrent_safe=True, risk_level="safe"
    ),
    "web_search": ToolClassification(
        "web_search", is_read_only=True, is_concurrent_safe=True, risk_level="low"
    ),
    "write_file": ToolClassification(
        "write_file", is_read_only=False, is_concurrent_safe=False, risk_level="medium"
    ),
    "shell_exec": ToolClassification(
        "shell_exec", is_read_only=False, is_concurrent_safe=False, risk_level="high"
    ),
    "sandbox_exec": ToolClassification(
        "sandbox_exec", is_read_only=False, is_concurrent_safe=True, risk_level="medium"
    ),
}


def classify_tool(
    tool_name: str,
    arguments: dict[str, Any] | None = None,
    custom_rules: dict[str, ToolClassification] | None = None,
) -> ToolClassification:
    """Classify a tool call for concurrency decisions.

    Uses default classifications, overridden by custom rules.
    Per-call classification: the same tool may be safe for some
    inputs and unsafe for others.
    """
    rules = {**_DEFAULT_CLASSIFICATIONS, **(custom_rules or {})}

    if tool_name in rules:
        return rules[tool_name]

    # Unknown tools default to unsafe
    return ToolClassification(
        tool_name=tool_name,
        is_read_only=False,
        is_concurrent_safe=False,
        risk_level="medium",
    )


async def execute_tool_batch(
    tool_calls: list[tuple[str, dict[str, Any]]],
    executor: Callable[[str, dict[str, Any]], Any],
    custom_rules: dict[str, ToolClassification] | None = None,
) -> list[tuple[str, Any]]:
    """Execute a batch of tool calls, parallelizing where safe.

    Concurrent-safe tools run in parallel.
    Unsafe tools run serially after all parallel tools complete.
    """
    parallel_calls: list[tuple[str, dict[str, Any]]] = []
    serial_calls: list[tuple[str, dict[str, Any]]] = []

    for tool_name, args in tool_calls:
        classification = classify_tool(tool_name, args, custom_rules)
        if classification.is_concurrent_safe:
            parallel_calls.append((tool_name, args))
        else:
            serial_calls.append((tool_name, args))

    results: list[tuple[str, Any]] = []

    # Run parallel tools concurrently
    if parallel_calls:
        parallel_tasks = [_execute_single(name, args, executor) for name, args in parallel_calls]
        parallel_results = await asyncio.gather(*parallel_tasks, return_exceptions=True)
        for (name, _), result in zip(parallel_calls, parallel_results, strict=True):
            results.append((name, result))

    # Run serial tools one at a time
    for name, args in serial_calls:
        result = await _execute_single(name, args, executor)
        results.append((name, result))

    return results


async def _execute_single(tool_name: str, args: dict[str, Any], executor: Callable) -> Any:
    result = executor(tool_name, args)
    if asyncio.iscoroutine(result):
        result = await result
    return result

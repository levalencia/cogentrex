"""Tests for message history filtering and context budget tracking."""

from __future__ import annotations

import pytest

from app.services.context_filters import (
    ContextBudget,
    ContextUsage,
    MemoizedContextBuilder,
    apply_filters,
    content_length_filter,
    metadata_filter,
    role_filter,
)


def _msg(role: str, content: str, **extra) -> dict:
    m = {"role": role, "content": content}
    m.update(extra)
    return m


# ── Context Budget ───────────────────────────────────────────


@pytest.mark.unit
class TestContextBudget:
    def test_default_budget_validates(self) -> None:
        budget = ContextBudget()
        issues = budget.validate()
        assert issues == []

    def test_over_allocated_budget(self) -> None:
        budget = ContextBudget(
            system_prompt=100_000,
            instructions=100_000,
            skills=50_000,
            total=200_000,
        )
        issues = budget.validate()
        assert len(issues) == 1
        assert "exceeds" in issues[0]


@pytest.mark.unit
class TestContextUsage:
    def test_total_used(self) -> None:
        usage = ContextUsage(system_prompt=100, instructions=200, history=1000)
        assert usage.total_used == 1300

    def test_utilization(self) -> None:
        budget = ContextBudget(system_prompt=1000, instructions=2000, total=200_000)
        usage = ContextUsage(system_prompt=500, instructions=1000)
        util = usage.utilization(budget)
        assert util["system_prompt"] == pytest.approx(0.5)
        assert util["instructions"] == pytest.approx(0.5)

    def test_exceeds(self) -> None:
        budget = ContextBudget(system_prompt=100, instructions=200)
        usage = ContextUsage(system_prompt=150, instructions=100)
        violations = usage.exceeds(budget)
        assert "system_prompt" in violations
        assert "instructions" not in violations

    def test_no_violations(self) -> None:
        budget = ContextBudget()
        usage = ContextUsage(system_prompt=100, instructions=100)
        assert usage.exceeds(budget) == []


# ── Message Filters ──────────────────────────────────────────


@pytest.mark.unit
class TestRoleFilter:
    def test_filters_tool_messages(self) -> None:
        msgs = [
            _msg("user", "hello"),
            _msg("tool", "result"),
            _msg("assistant", "hi"),
        ]
        filtered = role_filter("tool")(msgs)
        assert len(filtered) == 2
        assert all(m["role"] != "tool" for m in filtered)

    def test_filters_multiple_roles(self) -> None:
        msgs = [
            _msg("system", "prompt"),
            _msg("user", "hello"),
            _msg("tool", "result"),
        ]
        filtered = role_filter("system", "tool")(msgs)
        assert len(filtered) == 1


@pytest.mark.unit
class TestContentLengthFilter:
    def test_truncates_long_content(self) -> None:
        msgs = [_msg("user", "x" * 1000)]
        filtered = content_length_filter(100)(msgs)
        assert len(filtered[0]["content"]) == 101  # 100 + "…"
        assert filtered[0]["content"].endswith("…")

    def test_preserves_short_content(self) -> None:
        msgs = [_msg("user", "short")]
        filtered = content_length_filter(100)(msgs)
        assert filtered[0]["content"] == "short"


@pytest.mark.unit
class TestMetadataFilter:
    def test_removes_internal_keys(self) -> None:
        msgs = [
            _msg("user", "hello", _source_message_id=42, _recovery_pointer="abc"),
        ]
        filtered = metadata_filter("_source_message_id", "_recovery_pointer")(msgs)
        assert "_source_message_id" not in filtered[0]
        assert "_recovery_pointer" not in filtered[0]
        assert filtered[0]["content"] == "hello"

    def test_preserves_standard_keys(self) -> None:
        msgs = [_msg("user", "hello")]
        filtered = metadata_filter("_internal")(msgs)
        assert filtered[0]["role"] == "user"
        assert filtered[0]["content"] == "hello"


@pytest.mark.unit
class TestApplyFilters:
    def test_chains_filters(self) -> None:
        msgs = [
            _msg("system", "prompt"),
            _msg("user", "x" * 500),
            _msg("tool", "result"),
        ]
        result = apply_filters(
            msgs,
            [role_filter("tool"), content_length_filter(100)],
        )
        assert len(result) == 2  # tool removed
        assert len(result[1]["content"]) <= 101  # truncated

    def test_empty_filters(self) -> None:
        msgs = [_msg("user", "hello")]
        result = apply_filters(msgs, [])
        assert result == msgs


# ── Memoized Context Builder ─────────────────────────────────


@pytest.mark.unit
class TestMemoizedContextBuilder:
    def test_caches_on_same_input(self) -> None:
        call_count = [0]

        def builder(msgs):
            call_count[0] += 1
            return [{"role": "system", "content": "built"}]

        memo = MemoizedContextBuilder(builder)
        msgs = [_msg("user", "hello")]
        r1 = memo.build(msgs)
        r2 = memo.build(msgs)
        assert r1 == r2
        assert call_count[0] == 1  # built only once
        assert memo.stats["hits"] == 1
        assert memo.stats["misses"] == 1

    def test_rebuilds_on_different_input(self) -> None:
        call_count = [0]

        def builder(msgs):
            call_count[0] += 1
            return msgs

        memo = MemoizedContextBuilder(builder)
        memo.build([_msg("user", "hello")])
        memo.build([_msg("user", "world")])
        assert call_count[0] == 2
        assert memo.stats["misses"] == 2

    def test_invalidate_forces_rebuild(self) -> None:
        call_count = [0]

        def builder(msgs):
            call_count[0] += 1
            return msgs

        memo = MemoizedContextBuilder(builder)
        msgs = [_msg("user", "hello")]
        memo.build(msgs)
        memo.invalidate()
        memo.build(msgs)
        assert call_count[0] == 2

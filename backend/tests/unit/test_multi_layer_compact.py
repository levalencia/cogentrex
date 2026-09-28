"""Tests for multi-layer context compaction pipeline."""

from __future__ import annotations

import pytest

from app.services.multi_layer_compact import (
    CompactionConfig,
    CompactionStats,
    lossless_prune,
    lossy_summarize,
    multi_layer_compact,
    structured_distill,
)


def _msg(role: str, content: str, **extra) -> dict:
    m = {"role": role, "content": content}
    m.update(extra)
    return m


def _tool_msg(name: str, content: str) -> dict:
    return {"role": "tool", "name": name, "content": content, "tool_call_id": f"tc_{name}"}


def _many_messages(n: int, content_size: int = 100) -> list[dict]:
    """Generate n messages alternating user/assistant with specified content size."""
    msgs = [_msg("system", "You are a helpful assistant.")]
    for i in range(n):
        role = "user" if i % 2 == 0 else "assistant"
        msgs.append(_msg(role, f"Message {i}: " + "x" * content_size))
    return msgs


# ── Layer 1: Lossless Pruning ────────────────────────────────


@pytest.mark.unit
class TestLosslessPrune:
    def test_removes_empty_assistant_messages(self) -> None:
        msgs = [
            _msg("user", "hello"),
            _msg("assistant", ""),
            _msg("assistant", "   "),
            _msg("assistant", "real response"),
        ]
        result, removed = lossless_prune(msgs)
        assert removed == 2
        assert len(result) == 2

    def test_deduplicates_identical_tool_results(self) -> None:
        msgs = [
            _tool_msg("calculator", "42"),
            _msg("assistant", "The answer is 42"),
            _tool_msg("calculator", "42"),  # duplicate
        ]
        result, removed = lossless_prune(msgs)
        assert removed == 1
        assert "Duplicate tool result" in result[2]["content"]

    def test_keeps_different_tool_results(self) -> None:
        msgs = [
            _tool_msg("calculator", "42"),
            _tool_msg("calculator", "100"),  # different output
        ]
        result, removed = lossless_prune(msgs)
        assert removed == 0
        assert len(result) == 2

    def test_preserves_normal_messages(self) -> None:
        msgs = [
            _msg("system", "system prompt"),
            _msg("user", "hello"),
            _msg("assistant", "hi there"),
        ]
        result, removed = lossless_prune(msgs)
        assert removed == 0
        assert len(result) == 3


# ── Layer 2: Structured Distillation ─────────────────────────


@pytest.mark.unit
class TestStructuredDistill:
    def test_truncates_long_messages(self) -> None:
        long_content = "x" * 5000
        msgs = [_msg("tool", long_content)]
        result, trimmed = structured_distill(msgs, max_content_length=200)
        assert trimmed == 1
        assert len(result[0]["content"]) < len(long_content)
        assert "truncated" in result[0]["content"]

    def test_preserves_short_messages(self) -> None:
        msgs = [_msg("user", "short message")]
        result, trimmed = structured_distill(msgs, max_content_length=200)
        assert trimmed == 0
        assert result[0]["content"] == "short message"

    def test_adds_recovery_pointer(self) -> None:
        msgs = [_msg("assistant", "y" * 3000)]
        result, _ = structured_distill(msgs, max_content_length=500)
        assert "_recovery_pointer" in result[0]


# ── Layer 3: Lossy Summarization ─────────────────────────────


@pytest.mark.unit
class TestLossySummarize:
    @pytest.mark.asyncio
    async def test_summarizes_old_messages(self) -> None:
        msgs = _many_messages(20, content_size=50)
        result, summarized, pointers = await lossy_summarize(msgs, keep_recent=5)
        assert summarized > 0
        assert len(pointers) > 0
        # Should have system + summary + recent
        assert any("CONTEXT COMPACTION" in m.get("content", "") for m in result)

    @pytest.mark.asyncio
    async def test_no_summarization_when_few_messages(self) -> None:
        msgs = _many_messages(3, content_size=50)
        result, summarized, pointers = await lossy_summarize(msgs, keep_recent=10)
        assert summarized == 0
        assert pointers == []

    @pytest.mark.asyncio
    async def test_recovery_pointers_generated(self) -> None:
        msgs = _many_messages(15, content_size=50)
        _, _, pointers = await lossy_summarize(msgs, keep_recent=5)
        assert len(pointers) > 0
        assert all(isinstance(p, str) and len(p) == 16 for p in pointers)


# ── Multi-Layer Pipeline ─────────────────────────────────────


@pytest.mark.unit
class TestMultiLayerCompact:
    @pytest.mark.asyncio
    async def test_no_compaction_when_under_threshold(self) -> None:
        msgs = _many_messages(5, content_size=10)
        result, stats = await multi_layer_compact(msgs)
        assert stats.layer_applied == "none"
        assert result == msgs

    @pytest.mark.asyncio
    async def test_lossless_prune_applied_first(self) -> None:
        # Create messages with duplicates that push over threshold
        msgs = [_msg("system", "sys")] + [
            _tool_msg("calc", "same result " * 100) for _ in range(50)
        ]
        config = CompactionConfig(max_tokens=500, trigger_threshold=0.5)
        result, stats = await multi_layer_compact(msgs, config=config)
        assert stats.messages_pruned > 0

    @pytest.mark.asyncio
    async def test_full_pipeline_reduces_tokens(self) -> None:
        # Generate enough messages to trigger all layers
        msgs = _many_messages(100, content_size=500)
        config = CompactionConfig(
            max_tokens=5000,
            trigger_threshold=0.3,
            keep_recent=5,
            max_compaction_cycles=2,
        )
        result, stats = await multi_layer_compact(msgs, config=config)
        assert stats.tokens_after < stats.tokens_before
        assert stats.messages_after < stats.messages_before

    @pytest.mark.asyncio
    async def test_circuit_breaker_trips(self) -> None:
        # Very small budget with lots of messages
        msgs = _many_messages(50, content_size=200)
        config = CompactionConfig(
            max_tokens=100,
            trigger_threshold=0.1,
            keep_recent=3,
            max_compaction_cycles=1,
        )
        result, stats = await multi_layer_compact(msgs, config=config)
        assert stats.circuit_breaker_tripped is True

    @pytest.mark.asyncio
    async def test_custom_config_respected(self) -> None:
        msgs = _many_messages(30, content_size=100)
        config = CompactionConfig(
            max_tokens=1000,
            trigger_threshold=0.2,
            keep_recent=3,
            max_compaction_cycles=2,
            custom_summary_prompt="Summarize briefly",
        )
        result, stats = await multi_layer_compact(msgs, config=config)
        # Should have compacted since tokens exceed 200 (1000 * 0.2)
        assert stats.layer_applied != "none"

    @pytest.mark.asyncio
    async def test_stats_contain_recovery_pointers(self) -> None:
        msgs = _many_messages(50, content_size=200)
        config = CompactionConfig(
            max_tokens=2000,
            trigger_threshold=0.2,
            keep_recent=5,
        )
        result, stats = await multi_layer_compact(msgs, config=config)
        if stats.messages_summarized > 0:
            assert len(stats.recovery_pointers) > 0

    @pytest.mark.asyncio
    async def test_stats_type(self) -> None:
        msgs = _many_messages(5, content_size=10)
        _, stats = await multi_layer_compact(msgs)
        assert isinstance(stats, CompactionStats)
        assert stats.tokens_before >= 0
        assert stats.tokens_after >= 0

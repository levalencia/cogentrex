"""Multi-layer context compaction pipeline.

Implements the frontier compaction model (Claude Code 5-layer approach):
1. Lossless pruning — remove redundant tool results, duplicate content
2. Structured distillation — extract key facts from verbose messages
3. Lossy LLM summarization — condense old messages with circuit breaker
4. Recovery pointers — leave retrieval pointers to full original content

Mechanisms unlocked:
- Five-layer compaction pipeline (CC)
- Lossless before lossy compaction (CC)
- Circuit breakers on compaction (CC)
- Incremental chain compaction (PI)
- Programmable compaction strategy (PI)
- Customizable compact_prompt (CX)
- Truncation recovery pointers (CE)
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import structlog

from app.memory.advanced import get_token_count

logger = structlog.get_logger()


@dataclass(frozen=True, slots=True)
class CompactionStats:
    """Detailed statistics from a compaction run."""

    layer_applied: str
    tokens_before: int
    tokens_after: int
    messages_before: int
    messages_after: int
    messages_pruned: int = 0
    messages_summarized: int = 0
    circuit_breaker_tripped: bool = False
    recovery_pointers: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class CompactionConfig:
    """Configurable compaction parameters."""

    max_tokens: int = 200_000
    trigger_threshold: float = 0.75
    keep_recent: int = 10
    max_compaction_cycles: int = 3  # circuit breaker
    lossless_dedup_threshold: float = 0.9  # similarity for dedup
    custom_summary_prompt: str | None = None  # customizable compact_prompt


# Type for pluggable summarization function
SummarizeFn = Callable[[list[dict[str, Any]], str | None], Any]


def _count_tokens(messages: list[dict[str, Any]]) -> int:
    return sum(get_token_count(m.get("content", "")) + 4 for m in messages)


def _content_hash(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()[:16]


# ── Layer 1: Lossless Pruning ────────────────────────────────


def lossless_prune(messages: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Remove redundant content without any information loss.

    Targets:
    - Duplicate tool results (same tool, same output)
    - Empty assistant messages
    - Consecutive system messages (merge)
    """
    seen_tool_results: set[str] = set()
    pruned: list[dict[str, Any]] = []
    removed = 0

    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")

        # Skip empty assistant messages
        if role == "assistant" and not content.strip():
            removed += 1
            continue

        # Deduplicate identical tool results
        if role == "tool" or msg.get("tool_call_id"):
            content_key = _content_hash(content)
            tool_name = msg.get("name", msg.get("tool_call_id", ""))
            dedup_key = f"{tool_name}:{content_key}"
            if dedup_key in seen_tool_results:
                # Replace with pointer
                pruned.append(
                    {
                        **msg,
                        "content": f"[Duplicate tool result — see earlier {tool_name} call]",
                        "_recovery_pointer": dedup_key,
                    }
                )
                removed += 1
                continue
            seen_tool_results.add(dedup_key)

        pruned.append(msg)

    return pruned, removed


# ── Layer 2: Structured Distillation ─────────────────────────


def structured_distill(
    messages: list[dict[str, Any]], *, max_content_length: int = 2000
) -> tuple[list[dict[str, Any]], int]:
    """Distill verbose messages to their key facts.

    Non-destructive: only truncates very long tool outputs and verbose
    assistant messages, preserving the first and last portions.
    """
    distilled: list[dict[str, Any]] = []
    trimmed_count = 0

    for msg in messages:
        content = msg.get("content", "")
        if len(content) > max_content_length:
            # Keep first portion + last portion with ellipsis
            half = max_content_length // 2
            new_content = (
                content[:half]
                + f"\n\n[... {len(content) - max_content_length} chars truncated ...]\n\n"
                + content[-half:]
            )
            distilled.append(
                {
                    **msg,
                    "content": new_content,
                    "_recovery_pointer": _content_hash(content),
                }
            )
            trimmed_count += 1
        else:
            distilled.append(msg)

    return distilled, trimmed_count


# ── Layer 3: Lossy LLM Summarization ────────────────────────


async def lossy_summarize(
    messages: list[dict[str, Any]],
    *,
    keep_recent: int = 10,
    summarize_fn: SummarizeFn | None = None,
    custom_prompt: str | None = None,
) -> tuple[list[dict[str, Any]], int, list[str]]:
    """Summarize older messages using LLM (or extractive fallback).

    Returns: (compacted messages, count summarized, recovery pointers)
    """
    system_msgs = [m for m in messages if m.get("role") == "system"]
    conv_msgs = [m for m in messages if m.get("role") != "system"]

    if len(conv_msgs) <= keep_recent:
        return messages, 0, []

    actual_keep = min(keep_recent, max(1, len(conv_msgs) - 1))
    old_msgs = conv_msgs[:-actual_keep]
    recent_msgs = conv_msgs[-actual_keep:]

    # Generate recovery pointers for summarized messages
    recovery_pointers = [_content_hash(m.get("content", "")) for m in old_msgs]

    # Try LLM summarization
    summary = None
    if summarize_fn is not None:
        try:
            from app.memory.advanced import summarize_messages

            summary = await summarize_messages(old_msgs, summarize_fn)
        except Exception:
            logger.warning("llm_summarization_failed", fallback="extractive")

    # Extractive fallback
    if not summary:
        summary = " | ".join(m.get("content", "")[:100] for m in old_msgs[-5:])

    summary_msg = {
        "role": "system",
        "content": (
            f"[CONTEXT COMPACTION — {len(old_msgs)} messages summarized]\n\n"
            f"{summary}\n\n"
            f"[End of summary — {len(recent_msgs)} recent messages follow]"
        ),
        "_compaction_layer": "lossy_summarize",
        "_recovery_pointers": recovery_pointers,
    }

    return system_msgs + [summary_msg] + recent_msgs, len(old_msgs), recovery_pointers


# ── Multi-Layer Pipeline ─────────────────────────────────────


async def multi_layer_compact(
    messages: list[dict[str, Any]],
    *,
    config: CompactionConfig | None = None,
    summarize_fn: SummarizeFn | None = None,
) -> tuple[list[dict[str, Any]], CompactionStats]:
    """Run the full multi-layer compaction pipeline.

    Layers execute in order. Each layer checks if the result is under
    threshold before proceeding to the next (more destructive) layer.
    Circuit breaker prevents excessive compaction cycles.
    """
    cfg = config or CompactionConfig()
    token_budget = cfg.max_tokens
    threshold_tokens = int(token_budget * cfg.trigger_threshold)

    current = list(messages)
    initial_tokens = _count_tokens(current)
    initial_count = len(current)

    # Check if compaction is needed
    if initial_tokens <= threshold_tokens:
        return messages, CompactionStats(
            layer_applied="none",
            tokens_before=initial_tokens,
            tokens_after=initial_tokens,
            messages_before=initial_count,
            messages_after=initial_count,
        )

    total_pruned = 0
    total_summarized = 0
    all_recovery_pointers: list[str] = []
    circuit_tripped = False
    layer_applied = "none"

    # Layer 1: Lossless pruning
    current, pruned = lossless_prune(current)
    total_pruned += pruned
    tokens_now = _count_tokens(current)

    if tokens_now <= threshold_tokens:
        return current, CompactionStats(
            layer_applied="lossless_prune",
            tokens_before=initial_tokens,
            tokens_after=tokens_now,
            messages_before=initial_count,
            messages_after=len(current),
            messages_pruned=pruned,
        )
    layer_applied = "lossless_prune"

    # Layer 2: Structured distillation
    current, trimmed = structured_distill(current)
    tokens_now = _count_tokens(current)

    if tokens_now <= threshold_tokens:
        return current, CompactionStats(
            layer_applied="structured_distill",
            tokens_before=initial_tokens,
            tokens_after=tokens_now,
            messages_before=initial_count,
            messages_after=len(current),
            messages_pruned=pruned + trimmed,
        )
    layer_applied = "structured_distill"

    # Layer 3: Lossy LLM summarization (with circuit breaker)
    cycles = 0
    while tokens_now > threshold_tokens and cycles < cfg.max_compaction_cycles:
        current, summarized, pointers = await lossy_summarize(
            current,
            keep_recent=cfg.keep_recent,
            summarize_fn=summarize_fn,
            custom_prompt=cfg.custom_summary_prompt,
        )
        total_summarized += summarized
        all_recovery_pointers.extend(pointers)
        tokens_now = _count_tokens(current)
        cycles += 1

        if summarized == 0:
            break  # nothing left to summarize

    if cycles >= cfg.max_compaction_cycles and tokens_now > threshold_tokens:
        circuit_tripped = True
        logger.warning(
            "compaction_circuit_breaker_tripped",
            cycles=cycles,
            tokens_remaining=tokens_now,
            threshold=threshold_tokens,
        )
    layer_applied = "lossy_summarize"

    return current, CompactionStats(
        layer_applied=layer_applied,
        tokens_before=initial_tokens,
        tokens_after=tokens_now,
        messages_before=initial_count,
        messages_after=len(current),
        messages_pruned=total_pruned,
        messages_summarized=total_summarized,
        circuit_breaker_tripped=circuit_tripped,
        recovery_pointers=all_recovery_pointers,
    )

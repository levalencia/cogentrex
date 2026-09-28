"""Message history filtering and context budget tracking.

Implements frontier context engineering mechanisms:
- Message history filtering — filter messages before they reach the model (PI)
- Context budget tracking — explicit token budget per category (CE)
- Hard caps per context block (CE)
- Memoized context builders — cache expensive assembly (CE)
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class ContextBudget:
    """Token budget allocation per category."""

    system_prompt: int = 4000
    instructions: int = 8000
    skills: int = 6000
    memory: int = 2000
    history: int = 150_000
    working: int = 30_000
    total: int = 200_000

    def validate(self) -> list[str]:
        """Check that allocations don't exceed total."""
        allocated = (
            self.system_prompt
            + self.instructions
            + self.skills
            + self.memory
            + self.history
            + self.working
        )
        issues = []
        if allocated > self.total:
            issues.append(
                f"Allocated {allocated} exceeds total {self.total}"
            )
        return issues


@dataclass
class ContextUsage:
    """Track actual token usage per category."""

    system_prompt: int = 0
    instructions: int = 0
    skills: int = 0
    memory: int = 0
    history: int = 0
    working: int = 0

    @property
    def total_used(self) -> int:
        return (
            self.system_prompt
            + self.instructions
            + self.skills
            + self.memory
            + self.history
            + self.working
        )

    def utilization(self, budget: ContextBudget) -> dict[str, float]:
        """Calculate utilization percentage per category."""
        sp = self.system_prompt / budget.system_prompt if budget.system_prompt else 0
        return {
            "system_prompt": sp,
            "instructions": self.instructions / budget.instructions if budget.instructions else 0,
            "skills": self.skills / budget.skills if budget.skills else 0,
            "memory": self.memory / budget.memory if budget.memory else 0,
            "history": self.history / budget.history if budget.history else 0,
            "working": self.working / budget.working if budget.working else 0,
            "total": self.total_used / budget.total if budget.total else 0,
        }

    def exceeds(self, budget: ContextBudget) -> list[str]:
        """Return list of categories that exceed their budget."""
        violations = []
        if self.system_prompt > budget.system_prompt:
            violations.append("system_prompt")
        if self.instructions > budget.instructions:
            violations.append("instructions")
        if self.skills > budget.skills:
            violations.append("skills")
        if self.memory > budget.memory:
            violations.append("memory")
        if self.history > budget.history:
            violations.append("history")
        if self.working > budget.working:
            violations.append("working")
        return violations


# ── Message Filters ──────────────────────────────────────────

MessageFilter = Callable[[list[dict[str, Any]]], list[dict[str, Any]]]


def role_filter(*excluded_roles: str) -> MessageFilter:
    """Filter out messages with specified roles."""
    excluded = set(excluded_roles)

    def _filter(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [m for m in messages if m.get("role") not in excluded]

    return _filter


def content_length_filter(max_length: int) -> MessageFilter:
    """Truncate messages exceeding max content length."""

    def _filter(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        for m in messages:
            content = m.get("content", "")
            if len(content) > max_length:
                result.append({**m, "content": content[:max_length] + "…"})
            else:
                result.append(m)
        return result

    return _filter


def metadata_filter(*excluded_keys: str) -> MessageFilter:
    """Remove internal metadata keys from messages before model sees them."""
    excluded = set(excluded_keys)

    def _filter(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {k: v for k, v in m.items() if k not in excluded}
            for m in messages
        ]

    return _filter


def apply_filters(
    messages: list[dict[str, Any]], filters: list[MessageFilter]
) -> list[dict[str, Any]]:
    """Apply a chain of filters to messages."""
    result = messages
    for f in filters:
        result = f(result)
    return result


# ── Memoized Context Builder ─────────────────────────────────


class MemoizedContextBuilder:
    """Caches expensive context assembly, invalidated on mutation.

    Tracks a content hash of the input; only rebuilds when the hash changes.
    """

    def __init__(self, builder: Callable[[list[dict[str, Any]]], list[dict[str, Any]]]) -> None:
        self._builder = builder
        self._cache_key: str | None = None
        self._cached_result: list[dict[str, Any]] | None = None
        self._hit_count = 0
        self._miss_count = 0

    def build(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Build context, using cache if input unchanged."""
        key = self._compute_key(messages)
        if key == self._cache_key and self._cached_result is not None:
            self._hit_count += 1
            return self._cached_result
        self._miss_count += 1
        result = self._builder(messages)
        self._cache_key = key
        self._cached_result = result
        return result

    def invalidate(self) -> None:
        """Force cache invalidation on next build."""
        self._cache_key = None
        self._cached_result = None

    @property
    def stats(self) -> dict[str, int]:
        return {"hits": self._hit_count, "misses": self._miss_count}

    @staticmethod
    def _compute_key(messages: list[dict[str, Any]]) -> str:
        content = "".join(
            f"{m.get('role', '')}:{m.get('content', '')}" for m in messages
        )
        return hashlib.sha256(content.encode()).hexdigest()[:16]

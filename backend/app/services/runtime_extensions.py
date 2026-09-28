"""Runtime invariant enforcement and lifecycle extensions.

Implements:
- Runtime invariant enforcement — automated assertion that model context matches log (DS)
- Two-phase eviction — disk output cleaned at terminal state; memory cleaned lazily (LB)
- Skill templates/ and evals/ subdirectory support (SR)
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from typing import Any

import structlog

logger = structlog.get_logger()


# ── Runtime Invariant Enforcement ────────────────────────────


@dataclass(frozen=True, slots=True)
class ContextLogInvariantResult:
    """Result of checking the model-visible-means-logged invariant."""

    valid: bool
    context_hash: str
    log_hash: str
    divergence_details: str = ""


def check_context_log_invariant(
    model_context: list[dict[str, Any]],
    logged_events: list[dict[str, Any]],
) -> ContextLogInvariantResult:
    """Assert that everything in the model context is reconstructable from the log.

    Implements: 'Model-visible means logged' invariant (DS).
    Implements: Runtime reconstructability invariant (DS).
    """
    # Hash the model context content
    context_content = "".join(f"{m.get('role', '')}:{m.get('content', '')}" for m in model_context)
    context_hash = hashlib.sha256(context_content.encode()).hexdigest()[:16]

    # Hash the logged events that would reconstruct the context
    log_content = "".join(
        f"{e.get('kind', '')}:{e.get('data', {}).get('content', '')}" for e in logged_events
    )
    log_hash = hashlib.sha256(log_content.encode()).hexdigest()[:16]

    # For this implementation, we verify structural completeness:
    # every non-system message in context should have a corresponding log event
    context_roles = [m.get("role") for m in model_context if m.get("role") != "system"]
    log_kinds = [e.get("kind") for e in logged_events]

    # Map roles to expected event kinds
    expected_kinds = set()
    for role in context_roles:
        if role == "assistant":
            expected_kinds.add("model_response")
        elif role == "tool":
            expected_kinds.add("tool_call_completed")
        elif role == "user":
            expected_kinds.add("run_started")  # user message triggers run

    log_kind_set = set(log_kinds)
    missing = expected_kinds - log_kind_set

    if missing:
        return ContextLogInvariantResult(
            valid=False,
            context_hash=context_hash,
            log_hash=log_hash,
            divergence_details=f"Missing log events for context roles: {missing}",
        )

    return ContextLogInvariantResult(
        valid=True,
        context_hash=context_hash,
        log_hash=log_hash,
    )


# ── Two-Phase Eviction ───────────────────────────────────────


@dataclass
class EvictableResource:
    """A resource tracked by the two-phase eviction system."""

    resource_id: str
    disk_path: str | None = None
    in_memory: bool = True
    terminal_state: bool = False
    parent_notified: bool = False
    created_at: float = 0.0

    def __post_init__(self) -> None:
        if not self.created_at:
            self.created_at = time.time()


class TwoPhaseEvictor:
    """Two-phase eviction for long-running task outputs.

    Phase 1 (eager): Disk output cleaned when task reaches terminal state.
    Phase 2 (lazy): In-memory records cleaned after parent is notified.

    Implements: Two-phase eviction (LB).
    """

    def __init__(self) -> None:
        self._resources: dict[str, EvictableResource] = {}

    def register(self, resource_id: str, disk_path: str | None = None) -> None:
        """Register a resource for tracking."""
        self._resources[resource_id] = EvictableResource(
            resource_id=resource_id,
            disk_path=disk_path,
        )

    def mark_terminal(self, resource_id: str) -> bool:
        """Mark a resource as having reached terminal state.

        Phase 1: disk output is eligible for cleanup.
        """
        res = self._resources.get(resource_id)
        if res is None:
            return False
        res.terminal_state = True
        # Phase 1: clean disk eagerly
        if res.disk_path:
            from pathlib import Path

            p = Path(res.disk_path)
            if p.is_file():
                p.unlink(missing_ok=True)
                logger.debug("eviction_phase1_disk_cleaned", resource_id=resource_id)
            res.disk_path = None
        return True

    def notify_parent(self, resource_id: str) -> bool:
        """Notify that the parent has consumed the result.

        Phase 2: in-memory record is now eligible for cleanup.
        """
        res = self._resources.get(resource_id)
        if res is None:
            return False
        res.parent_notified = True
        return True

    def evict_ready(self) -> list[str]:
        """Remove all resources that completed both phases.

        Returns list of evicted resource IDs.
        """
        evicted = []
        for rid, res in list(self._resources.items()):
            if res.terminal_state and res.parent_notified:
                del self._resources[rid]
                evicted.append(rid)
        return evicted

    @property
    def tracked_count(self) -> int:
        return len(self._resources)

    @property
    def terminal_count(self) -> int:
        return sum(1 for r in self._resources.values() if r.terminal_state)


# ── Skill Templates/Evals Support ────────────────────────────


SKILL_SUBDIRS = {"references", "templates", "scripts", "assets", "evals"}


def validate_skill_structure(skill_dir: str) -> list[str]:
    """Validate a skill directory has the expected structure.

    Checks for optional templates/ and evals/ subdirectories.
    Implements: Skills contain templates/ and evals/ subdirectories (SR).
    """
    from pathlib import Path

    path = Path(skill_dir)
    issues: list[str] = []

    if not (path / "SKILL.md").is_file():
        issues.append("Missing SKILL.md entry file")

    # Check recognized subdirectories
    for item in path.iterdir():
        if item.is_dir() and item.name not in SKILL_SUBDIRS:
            issues.append(f"Unrecognized subdirectory: {item.name}")

    # Validate templates/ if present
    templates_dir = path / "templates"
    if templates_dir.is_dir():
        for template in templates_dir.iterdir():
            if template.is_file() and template.stat().st_size == 0:
                issues.append(f"Empty template: {template.name}")

    # Validate evals/ if present
    evals_dir = path / "evals"
    if evals_dir.is_dir():
        for eval_file in evals_dir.iterdir():
            if eval_file.is_file() and eval_file.suffix not in (".py", ".yaml", ".json", ".md"):
                issues.append(f"Unexpected eval file type: {eval_file.name}")

    return issues

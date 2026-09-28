"""Four-stage bootstrap with memoization and trust boundary.

Implements frontier lifecycle mechanisms:
- Four-stage bootstrap (LB): minimal → read-only tools → trust boundary → full tools
- Memoized bootstrap stages (LB): re-init is fast; completed stages not re-run
- Trust boundary as bootstrap gate (LB): security-sensitive subsystems blocked until trust
- Safe-mode fallback (LB): if any stage fails, session remains read-only
- Local-level instruction file (.local.md gitignored) (CC)
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import IntEnum, StrEnum
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()


class BootstrapStage(IntEnum):
    """Four-stage bootstrap sequence."""

    MINIMAL = 0  # Core context only
    READ_ONLY_TOOLS = 1  # Read-only tools loaded
    TRUST_BOUNDARY = 2  # Trust evaluation
    FULL_TOOLS = 3  # All tools including write/execute


class TrustLevel(StrEnum):
    UNTRUSTED = "untrusted"
    TRUSTED = "trusted"
    ELEVATED = "elevated"  # explicit user elevation


@dataclass
class BootstrapState:
    """Tracks the current bootstrap state with memoization."""

    current_stage: BootstrapStage = BootstrapStage.MINIMAL
    trust_level: TrustLevel = TrustLevel.UNTRUSTED
    completed_stages: set[BootstrapStage] = field(default_factory=set)
    stage_durations: dict[BootstrapStage, float] = field(default_factory=dict)
    errors: list[tuple[BootstrapStage, str]] = field(default_factory=list)
    safe_mode: bool = False
    consent_recorded: bool = False
    consent_timestamp: float | None = None

    @property
    def is_fully_bootstrapped(self) -> bool:
        return self.current_stage == BootstrapStage.FULL_TOOLS

    @property
    def available_tools_mode(self) -> str:
        if self.safe_mode or self.current_stage < BootstrapStage.TRUST_BOUNDARY:
            return "read_only"
        if self.current_stage < BootstrapStage.FULL_TOOLS:
            return "read_only"
        return "full"


@dataclass(frozen=True, slots=True)
class StageResult:
    """Result of executing a bootstrap stage."""

    stage: BootstrapStage
    success: bool
    duration_seconds: float
    message: str = ""


class BootstrapManager:
    """Manages the four-stage bootstrap sequence with memoization.

    Stages execute in order. Each stage checks preconditions.
    Completed stages are memoized — re-calling bootstrap skips them.
    If any stage fails, the session enters safe mode (read-only).
    """

    def __init__(self) -> None:
        self._state = BootstrapState()
        self._stage_handlers: dict[BootstrapStage, Any] = {}

    @property
    def state(self) -> BootstrapState:
        return self._state

    def register_stage_handler(
        self,
        stage: BootstrapStage,
        handler: Any,  # Callable that returns StageResult
    ) -> None:
        """Register a handler for a bootstrap stage."""
        self._stage_handlers[stage] = handler

    async def bootstrap(self, trust_decision: TrustLevel | None = None) -> BootstrapState:
        """Run the full bootstrap sequence, skipping completed stages.

        Args:
            trust_decision: Override trust level (e.g., from user consent).
        """
        for stage in BootstrapStage:
            if stage in self._state.completed_stages:
                logger.debug("bootstrap_stage_skipped", stage=stage.name, reason="memoized")
                continue

            if stage == BootstrapStage.TRUST_BOUNDARY and trust_decision:
                self._state.trust_level = trust_decision
                self._state.consent_recorded = True
                self._state.consent_timestamp = time.time()

            result = await self._execute_stage(stage)
            if not result.success:
                logger.warning(
                    "bootstrap_stage_failed",
                    stage=stage.name,
                    message=result.message,
                )
                self._state.errors.append((stage, result.message))
                self._state.safe_mode = True
                break

            self._state.completed_stages.add(stage)
            self._state.stage_durations[stage] = result.duration_seconds
            self._state.current_stage = stage

        return self._state

    async def _execute_stage(self, stage: BootstrapStage) -> StageResult:
        """Execute a single bootstrap stage."""
        start = time.time()
        handler = self._stage_handlers.get(stage)

        if handler is None:
            # Default behavior per stage
            return self._default_stage(stage, start)

        try:
            import asyncio

            result = handler(stage)
            if asyncio.iscoroutine(result):
                result = await result
            if isinstance(result, StageResult):
                return result
            return StageResult(
                stage=stage,
                success=True,
                duration_seconds=time.time() - start,
            )
        except Exception as exc:
            return StageResult(
                stage=stage,
                success=False,
                duration_seconds=time.time() - start,
                message=str(exc),
            )

    def _default_stage(self, stage: BootstrapStage, start: float) -> StageResult:
        """Default behavior for stages without custom handlers."""
        if stage == BootstrapStage.MINIMAL:
            return StageResult(stage=stage, success=True, duration_seconds=time.time() - start)
        if stage == BootstrapStage.READ_ONLY_TOOLS:
            return StageResult(stage=stage, success=True, duration_seconds=time.time() - start)
        if stage == BootstrapStage.TRUST_BOUNDARY:
            # Default: trust if consent recorded or trust_level already set
            success = self._state.trust_level != TrustLevel.UNTRUSTED
            return StageResult(
                stage=stage,
                success=success,
                duration_seconds=time.time() - start,
                message="" if success else "Trust not established",
            )
        if stage == BootstrapStage.FULL_TOOLS:
            return StageResult(stage=stage, success=True, duration_seconds=time.time() - start)
        return StageResult(stage=stage, success=False, duration_seconds=time.time() - start)

    def reset(self) -> None:
        """Reset bootstrap state (for testing)."""
        self._state = BootstrapState()


# ── Local Instruction File ───────────────────────────────────


def load_local_instructions(repo_root: str | Path, filename: str = ".local.md") -> str | None:
    """Load a .local.md instruction file (gitignored, per-developer).

    Implements: Local-level instruction file (.local.md gitignored) (CC).
    Returns None if the file doesn't exist.
    """
    path = Path(repo_root) / filename
    if path.is_file():
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            return None
    return None

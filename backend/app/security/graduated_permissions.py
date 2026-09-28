"""Graduated permission system with seven modes.

Implements frontier security mechanisms:
- Seven permission modes (CC) — graduated from allow-all to deny-all
- Stateful permission evaluator (TR) — tracks denials, downgrades modes
- Permission mode transformation on denial (TR)
- Permission denial tracking (TR)
- Protected paths list — hardcoded bypass-immune paths (TR, CC)
- Protected commands list — always require confirmation (TR)
- Plan mode — produce plan, request approval before execution (CX)
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass
from enum import IntEnum
from typing import Any


class PermissionMode(IntEnum):
    """Seven graduated permission modes, from most to least permissive.

    Mirrors Claude Code's graduated permission system.
    """

    ALLOW_ALL = 0  # Everything auto-approved (development/testing only)
    AUTO_APPROVE_SAFE = 1  # Read-only and known-safe auto-approved; others ask
    ASK_UNKNOWN = 2  # Known-safe approved; unknown operations ask
    ASK_ALL = 3  # Every operation requires confirmation
    AUTO_DENY_UNSAFE = 4  # Safe operations ask; unsafe auto-denied
    DENY_ALL = 5  # Everything denied (lockdown)
    PLAN_ONLY = 6  # Generate plan only; no execution without approval


class RiskLevel(IntEnum):
    """Risk classification for tool operations."""

    SAFE = 0  # Read-only, no side effects
    LOW = 1  # Minor side effects, reversible
    MEDIUM = 2  # Significant side effects
    HIGH = 3  # Destructive or irreversible
    CRITICAL = 4  # System-level, credential access


@dataclass(frozen=True, slots=True)
class PermissionDecision:
    """Result of a permission evaluation."""

    allowed: bool
    requires_approval: bool = False
    reason: str = ""
    mode_used: PermissionMode = PermissionMode.ASK_UNKNOWN
    risk_level: RiskLevel = RiskLevel.SAFE


@dataclass
class DenialRecord:
    """Tracks a permission denial event."""

    tool_name: str
    risk_level: RiskLevel
    timestamp: float
    reason: str


# Bypass-immune paths — NEVER auto-approved regardless of mode
PROTECTED_PATHS: frozenset[str] = frozenset(
    {
        ".env",
        ".env.local",
        ".env.production",
        ".git/config",
        ".git/hooks",
        ".ssh",
        "/etc/passwd",
        "/etc/shadow",
        "/etc/sudoers",
        "node_modules/.cache",
        "id_rsa",
        "id_ed25519",
    }
)

# Bypass-immune commands — ALWAYS require confirmation
PROTECTED_COMMANDS: frozenset[str] = frozenset(
    {
        "rm -rf",
        "drop table",
        "drop database",
        "format",
        "mkfs",
        "dd if=",
        "chmod 777",
        "curl | sh",
        "curl | bash",
        "wget | sh",
        "eval(",
        "> /dev/sd",
        "shutdown",
        "reboot",
        "kill -9",
    }
)


class GraduatedPermissionEvaluator:
    """Stateful permission evaluator with mode transformation.

    Tracks denial history and automatically downgrades the permission
    mode when too many denials occur (mode transformation on denial).
    """

    def __init__(
        self,
        mode: PermissionMode = PermissionMode.ASK_UNKNOWN,
        *,
        denial_threshold: int = 3,
        downgrade_window_seconds: float = 300.0,
    ) -> None:
        self._mode = mode
        self._denial_threshold = denial_threshold
        self._downgrade_window = downgrade_window_seconds
        self._denials: list[DenialRecord] = []
        self._denial_counts: dict[str, int] = defaultdict(int)
        self._mode_history: list[tuple[float, PermissionMode, str]] = [
            (time.time(), mode, "initial")
        ]

    @property
    def mode(self) -> PermissionMode:
        return self._mode

    @property
    def denial_count(self) -> int:
        return len(self._denials)

    @property
    def mode_history(self) -> list[tuple[float, PermissionMode, str]]:
        return list(self._mode_history)

    def evaluate(
        self,
        tool_name: str,
        risk_level: RiskLevel,
        arguments: dict[str, Any] | None = None,
    ) -> PermissionDecision:
        """Evaluate a tool call against the current permission mode.

        Bypass-immune paths and commands are always checked first.
        """
        args = arguments or {}

        # Check bypass-immune paths
        for key in ("path", "file_path", "directory", "target"):
            path_val = str(args.get(key, ""))
            if path_val:
                for protected in PROTECTED_PATHS:
                    if protected in path_val:
                        return PermissionDecision(
                            allowed=False,
                            requires_approval=True,
                            reason=f"Protected path: {path_val}",
                            mode_used=self._mode,
                            risk_level=risk_level,
                        )

        # Check bypass-immune commands
        for value in _flatten_string_values(args):
            val_lower = value.lower()
            for cmd in PROTECTED_COMMANDS:
                if cmd in val_lower:
                    return PermissionDecision(
                        allowed=False,
                        requires_approval=True,
                        reason=f"Protected command: {cmd}",
                        mode_used=self._mode,
                        risk_level=risk_level,
                    )

        # Evaluate based on current mode
        return self._evaluate_mode(tool_name, risk_level)

    def record_denial(self, tool_name: str, risk_level: RiskLevel, reason: str) -> None:
        """Record a denial and check for mode transformation."""
        self._denials.append(
            DenialRecord(
                tool_name=tool_name,
                risk_level=risk_level,
                timestamp=time.time(),
                reason=reason,
            )
        )
        self._denial_counts[tool_name] += 1
        self._check_mode_transformation()

    def reset_denials(self) -> None:
        """Clear denial history."""
        self._denials.clear()
        self._denial_counts.clear()

    def set_mode(self, mode: PermissionMode, reason: str = "manual") -> None:
        """Explicitly set the permission mode."""
        self._mode = mode
        self._mode_history.append((time.time(), mode, reason))

    def _evaluate_mode(self, tool_name: str, risk: RiskLevel) -> PermissionDecision:
        mode = self._mode

        if mode == PermissionMode.ALLOW_ALL:
            return PermissionDecision(
                allowed=True, reason="allow_all mode", mode_used=mode, risk_level=risk
            )

        if mode == PermissionMode.DENY_ALL:
            return PermissionDecision(
                allowed=False, reason="deny_all mode", mode_used=mode, risk_level=risk
            )

        if mode == PermissionMode.PLAN_ONLY:
            return PermissionDecision(
                allowed=False,
                requires_approval=True,
                reason="plan_only mode — approval required for execution",
                mode_used=mode,
                risk_level=risk,
            )

        if mode == PermissionMode.AUTO_APPROVE_SAFE:
            if risk <= RiskLevel.SAFE:
                return PermissionDecision(
                    allowed=True, reason="safe operation", mode_used=mode, risk_level=risk
                )
            return PermissionDecision(
                allowed=False,
                requires_approval=True,
                reason=f"risk level {risk.name} requires approval",
                mode_used=mode,
                risk_level=risk,
            )

        if mode == PermissionMode.ASK_UNKNOWN:
            if risk <= RiskLevel.LOW:
                return PermissionDecision(
                    allowed=True, reason="known-safe operation", mode_used=mode, risk_level=risk
                )
            return PermissionDecision(
                allowed=False,
                requires_approval=True,
                reason=f"risk level {risk.name} requires approval",
                mode_used=mode,
                risk_level=risk,
            )

        if mode == PermissionMode.ASK_ALL:
            return PermissionDecision(
                allowed=False,
                requires_approval=True,
                reason="ask_all mode — all operations require approval",
                mode_used=mode,
                risk_level=risk,
            )

        if mode == PermissionMode.AUTO_DENY_UNSAFE:
            if risk <= RiskLevel.SAFE:
                return PermissionDecision(
                    allowed=False,
                    requires_approval=True,
                    reason="safe operation — confirmation required",
                    mode_used=mode,
                    risk_level=risk,
                )
            return PermissionDecision(
                allowed=False, reason=f"auto-denied: {risk.name}", mode_used=mode, risk_level=risk
            )

        # Fallback
        return PermissionDecision(
            allowed=False,
            requires_approval=True,
            reason="unknown mode",
            mode_used=mode,
            risk_level=risk,
        )

    def _check_mode_transformation(self) -> None:
        """Downgrade mode if too many denials in the window."""
        now = time.time()
        recent_denials = [d for d in self._denials if now - d.timestamp < self._downgrade_window]
        if len(recent_denials) >= self._denial_threshold and self._mode < PermissionMode.ASK_ALL:
            new_mode = PermissionMode(min(self._mode + 1, PermissionMode.ASK_ALL))
            self._mode = new_mode
            self._mode_history.append(
                (now, new_mode, f"auto-downgrade after {len(recent_denials)} denials")
            )


def _flatten_string_values(obj: Any, *, max_depth: int = 5) -> list[str]:
    result: list[str] = []
    if max_depth <= 0:
        return result
    if isinstance(obj, str):
        result.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            result.extend(_flatten_string_values(v, max_depth=max_depth - 1))
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            result.extend(_flatten_string_values(v, max_depth=max_depth - 1))
    return result

"""Pre-built hook handlers for common harness patterns.

These are ready-to-use hooks that implement frontier harness mechanisms:
- Protected path enforcement (CC, PI, TR)
- Protected command enforcement (TR)
- Stop prevention / premature victory detection (CC)
- Tool output sanitization (PI, DS)
- External signal injection (PI, DS)
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from app.runtime.events import AgentEvent
from app.runtime.hooks import HookAction, HookResult


def protected_paths_hook(
    protected_patterns: Sequence[str],
) -> Callable[[AgentEvent], HookResult]:
    """Block tool calls that target protected filesystem paths.

    Implements: bypass-immune protected paths (TR, CC, PI).

    Args:
        protected_patterns: Glob-like patterns to block.
            Examples: ['/etc/**', '.git/**', '.env', 'node_modules/**']
    """
    compiled = [re.compile(_glob_to_regex(p)) for p in protected_patterns]

    def handler(event: AgentEvent) -> HookResult:
        args = event.data.get("arguments", {})
        # Check common path argument names
        for key in ("path", "file_path", "directory", "target"):
            path_val = args.get(key, "")
            if isinstance(path_val, str) and path_val:
                for pattern in compiled:
                    if pattern.search(path_val):
                        return HookResult(
                            action=HookAction.BLOCK,
                            reason=f"Protected path: {path_val} matches {pattern.pattern}",
                        )
        return HookResult(action=HookAction.CONTINUE)

    return handler


def protected_commands_hook(
    blocked_commands: Sequence[str],
) -> Callable[[AgentEvent], HookResult]:
    """Block tool calls containing dangerous shell commands.

    Implements: bypass-immune protected commands (TR).

    Args:
        blocked_commands: Command substrings to block.
            Examples: ['rm -rf', 'DROP TABLE', 'FORMAT', 'mkfs']
    """
    lowered = [cmd.lower() for cmd in blocked_commands]

    def handler(event: AgentEvent) -> HookResult:
        args = event.data.get("arguments", {})
        for value in _flatten_string_values(args):
            val_lower = value.lower()
            for cmd in lowered:
                if cmd in val_lower:
                    return HookResult(
                        action=HookAction.BLOCK,
                        reason=f"Protected command detected: '{cmd}' in argument",
                    )
        return HookResult(action=HookAction.CONTINUE)

    return handler


def stop_verification_hook(
    required_evidence_keys: Sequence[str] | None = None,
) -> Callable[[AgentEvent], HookResult]:
    """Prevent premature run completion without verification evidence.

    Implements: Stop hooks — prevent premature victory (CC).

    If the run_stopped event lacks required evidence keys in its data,
    the hook blocks the stop (forcing the agent to continue).

    Args:
        required_evidence_keys: Data keys that must be present and truthy
            for the stop to be allowed. Defaults to checking for
            'verification_passed' or 'tests_passed'.
    """
    keys = list(required_evidence_keys or ["verification_passed", "tests_passed"])

    def handler(event: AgentEvent) -> HookResult:
        data = event.data
        for key in keys:
            if data.get(key):
                return HookResult(action=HookAction.CONTINUE)
        return HookResult(
            action=HookAction.BLOCK,
            reason=f"Premature stop: none of {keys} found in stop event data",
        )

    return handler


def tool_output_sanitizer_hook(
    patterns: Sequence[str],
    replacement: str = "[REDACTED]",
) -> Callable[[AgentEvent], HookResult]:
    """Sanitize sensitive patterns from tool output before it reaches the model.

    Implements: Tool output modification via hooks (PI, DS).

    Args:
        patterns: Regex patterns to redact from tool output.
        replacement: Replacement text for matched patterns.
    """
    compiled = [re.compile(p) for p in patterns]

    def handler(event: AgentEvent) -> HookResult:
        output = event.data.get("output", "")
        if not isinstance(output, str) or not output:
            return HookResult(action=HookAction.CONTINUE)
        modified = output
        changed = False
        for pattern in compiled:
            new_val = pattern.sub(replacement, modified)
            if new_val != modified:
                modified = new_val
                changed = True
        if changed:
            new_data = dict(event.data)
            new_data["output"] = modified
            return HookResult(action=HookAction.MODIFY, modified_data=new_data)
        return HookResult(action=HookAction.CONTINUE)

    return handler


def external_signal_hook(
    signal_source: Callable[[], Mapping[str, Any] | None],
) -> Callable[[AgentEvent], HookResult]:
    """Inject external signals (webhooks, file watchers, CI) into the agent context.

    Implements: External signal injection (PI, DS).

    The signal_source callable is invoked before each iteration. If it
    returns a non-None mapping, the data is injected into the event.

    Args:
        signal_source: Callable that returns signal data or None.
    """

    def handler(event: AgentEvent) -> HookResult:
        signal = signal_source()
        if signal is not None:
            new_data = dict(event.data)
            new_data["external_signal"] = dict(signal)
            return HookResult(action=HookAction.MODIFY, modified_data=new_data)
        return HookResult(action=HookAction.CONTINUE)

    return handler


# ── Helpers ──────────────────────────────────────────────────


def _glob_to_regex(pattern: str) -> str:
    """Convert a simple glob pattern to regex. Supports * and **."""
    escaped = re.escape(pattern)
    # ** matches any path depth
    escaped = escaped.replace(r"\*\*", ".*")
    # * matches any single path component
    escaped = escaped.replace(r"\*", "[^/]*")
    return f"(?:^|/)(?:{escaped})(?:$|/)"


def _flatten_string_values(obj: Any, *, max_depth: int = 5) -> list[str]:
    """Extract all string values from a nested dict/list structure."""
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

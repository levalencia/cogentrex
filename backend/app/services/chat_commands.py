"""Chat commands: /compact, /resume, /clear, /init.

Implements frontier user-facing commands for context management:
- /compact — manual context compaction (CC, CX)
- /resume — resume a previous session from event log (CC)
- /clear — clear current context (CC)
- /init — initialize/analyze codebase (CC)
"""

from __future__ import annotations

import contextlib
import re
from dataclasses import dataclass
from typing import Any

from app.services.multi_layer_compact import CompactionConfig, multi_layer_compact
from app.services.session_tree import SessionTree


@dataclass(frozen=True, slots=True)
class CommandResult:
    """Result of a chat command execution."""

    command: str
    success: bool
    message: str
    data: dict[str, Any] | None = None


_COMMAND_PATTERN = re.compile(r"^/(\w+)(?:\s+(.*))?$", re.DOTALL)


def parse_command(text: str) -> tuple[str, str] | None:
    """Parse a /command from user input. Returns (command, args) or None."""
    text = text.strip()
    match = _COMMAND_PATTERN.match(text)
    if match:
        return match.group(1).lower(), (match.group(2) or "").strip()
    return None


async def handle_compact(
    messages: list[dict[str, Any]],
    args: str = "",
    config: CompactionConfig | None = None,
) -> tuple[list[dict[str, Any]], CommandResult]:
    """Handle /compact command — manually trigger context compaction."""
    cfg = config or CompactionConfig()

    # Parse optional args like "/compact keep=5"
    if args:
        for part in args.split():
            if part.startswith("keep="):
                with contextlib.suppress(ValueError):
                    cfg = CompactionConfig(
                        max_tokens=cfg.max_tokens,
                        trigger_threshold=0.0,  # force compaction
                        keep_recent=int(part.split("=")[1]),
                        max_compaction_cycles=cfg.max_compaction_cycles,
                        custom_summary_prompt=cfg.custom_summary_prompt,
                    )

    # Force compaction by setting threshold to 0
    force_cfg = CompactionConfig(
        max_tokens=cfg.max_tokens,
        trigger_threshold=0.0,
        keep_recent=cfg.keep_recent,
        max_compaction_cycles=cfg.max_compaction_cycles,
        custom_summary_prompt=cfg.custom_summary_prompt,
    )

    compacted, stats = await multi_layer_compact(messages, config=force_cfg)

    return compacted, CommandResult(
        command="compact",
        success=True,
        message=(
            f"Compacted: {stats.tokens_before} → {stats.tokens_after} tokens "
            f"({stats.messages_before} → {stats.messages_after} messages, "
            f"layer: {stats.layer_applied})"
        ),
        data={
            "tokens_before": stats.tokens_before,
            "tokens_after": stats.tokens_after,
            "messages_before": stats.messages_before,
            "messages_after": stats.messages_after,
            "layer": stats.layer_applied,
            "circuit_breaker_tripped": stats.circuit_breaker_tripped,
        },
    )


def handle_clear(messages: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], CommandResult]:
    """Handle /clear command — clear conversation, keep system messages."""
    system_msgs = [m for m in messages if m.get("role") == "system"]
    cleared_count = len(messages) - len(system_msgs)
    return system_msgs, CommandResult(
        command="clear",
        success=True,
        message=f"Cleared {cleared_count} messages. System prompt preserved.",
        data={"cleared_count": cleared_count, "remaining": len(system_msgs)},
    )


def handle_resume(
    session_tree: SessionTree,
    node_id: str,
) -> tuple[list[dict[str, Any]], CommandResult]:
    """Handle /resume command — resume from a session tree node."""
    try:
        resumed = session_tree.resume_from(node_id)
        session_tree.switch_to(resumed.node_id)
        return resumed.messages, CommandResult(
            command="resume",
            success=True,
            message=(
                f"Resumed from {node_id[:8]}… "
                f"({resumed.message_count} messages, branch: {resumed.label})"
            ),
            data={
                "node_id": resumed.node_id,
                "parent_id": resumed.parent_id,
                "message_count": resumed.message_count,
            },
        )
    except ValueError as exc:
        return [], CommandResult(
            command="resume",
            success=False,
            message=str(exc),
        )


def handle_init() -> CommandResult:
    """Handle /init command — report codebase analysis results."""
    # In a real implementation, this would scan the codebase.
    # For now, it returns the project structure summary.
    return CommandResult(
        command="init",
        success=True,
        message=(
            "Cogentrex initialized. "
            "Read AGENTS.md for startup workflow. "
            "Run ./init.sh to verify environment health. "
            "Check session-handoff.md for current state."
        ),
        data={
            "agents_md": "AGENTS.md",
            "init_script": "init.sh",
            "handoff": "session-handoff.md",
        },
    )


async def dispatch_command(
    command_text: str,
    messages: list[dict[str, Any]],
    session_tree: SessionTree | None = None,
    compact_config: CompactionConfig | None = None,
) -> tuple[list[dict[str, Any]] | None, CommandResult | None]:
    """Parse and dispatch a chat command.

    Returns (new_messages, result) or (None, None) if not a command.
    """
    parsed = parse_command(command_text)
    if parsed is None:
        return None, None

    cmd, args = parsed

    if cmd == "compact":
        return await handle_compact(messages, args, compact_config)
    elif cmd == "clear":
        return handle_clear(messages)
    elif cmd == "resume":
        if not args:
            return None, CommandResult(
                command="resume",
                success=False,
                message="Usage: /resume <node_id>",
            )
        if session_tree is None:
            return None, CommandResult(
                command="resume",
                success=False,
                message="Session tree not available",
            )
        return handle_resume(session_tree, args)
    elif cmd == "init":
        return None, handle_init()
    else:
        return None, CommandResult(
            command=cmd,
            success=False,
            message=f"Unknown command: /{cmd}. Available: /compact, /clear, /resume, /init",
        )

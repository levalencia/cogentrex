"""Tests for chat commands (/compact, /clear, /resume, /init)."""

from __future__ import annotations

import pytest

from app.services.chat_commands import (
    dispatch_command,
    handle_clear,
    handle_compact,
    handle_init,
    handle_resume,
    parse_command,
)
from app.services.multi_layer_compact import CompactionConfig
from app.services.session_tree import SessionTree


def _msg(role: str, content: str) -> dict:
    return {"role": role, "content": content}


def _conversation(n: int = 20, content_size: int = 100) -> list[dict]:
    msgs = [_msg("system", "You are helpful.")]
    for i in range(n):
        role = "user" if i % 2 == 0 else "assistant"
        msgs.append(_msg(role, f"Msg {i}: " + "x" * content_size))
    return msgs


@pytest.mark.unit
class TestParseCommand:
    def test_parses_simple_command(self) -> None:
        assert parse_command("/compact") == ("compact", "")

    def test_parses_command_with_args(self) -> None:
        assert parse_command("/resume abc123") == ("resume", "abc123")

    def test_parses_command_with_multiple_args(self) -> None:
        assert parse_command("/compact keep=5") == ("compact", "keep=5")

    def test_returns_none_for_non_command(self) -> None:
        assert parse_command("hello world") is None

    def test_returns_none_for_empty(self) -> None:
        assert parse_command("") is None

    def test_case_insensitive(self) -> None:
        assert parse_command("/COMPACT") == ("compact", "")

    def test_strips_whitespace(self) -> None:
        assert parse_command("  /clear  ") == ("clear", "")


@pytest.mark.unit
class TestHandleCompact:
    @pytest.mark.asyncio
    async def test_compact_reduces_messages(self) -> None:
        msgs = _conversation(30, content_size=200)
        config = CompactionConfig(max_tokens=2000, keep_recent=5)
        result_msgs, cmd = await handle_compact(msgs, config=config)
        assert cmd.success is True
        assert cmd.command == "compact"
        assert len(result_msgs) < len(msgs)
        assert cmd.data is not None
        assert cmd.data["tokens_before"] > cmd.data["tokens_after"]

    @pytest.mark.asyncio
    async def test_compact_with_keep_arg(self) -> None:
        msgs = _conversation(20, content_size=200)
        config = CompactionConfig(max_tokens=2000, keep_recent=10)
        result_msgs, cmd = await handle_compact(msgs, args="keep=3", config=config)
        assert cmd.success is True

    @pytest.mark.asyncio
    async def test_compact_forces_even_under_threshold(self) -> None:
        msgs = _conversation(5, content_size=10)
        result_msgs, cmd = await handle_compact(msgs)
        assert cmd.success is True
        # Even small conversations get compacted when forced


@pytest.mark.unit
class TestHandleClear:
    def test_clear_removes_non_system(self) -> None:
        msgs = [
            _msg("system", "prompt"),
            _msg("user", "hello"),
            _msg("assistant", "hi"),
            _msg("user", "bye"),
        ]
        result_msgs, cmd = handle_clear(msgs)
        assert cmd.success is True
        assert len(result_msgs) == 1
        assert result_msgs[0]["role"] == "system"
        assert cmd.data["cleared_count"] == 3

    def test_clear_empty_conversation(self) -> None:
        result_msgs, cmd = handle_clear([])
        assert cmd.success is True
        assert len(result_msgs) == 0

    def test_clear_preserves_multiple_system(self) -> None:
        msgs = [
            _msg("system", "prompt1"),
            _msg("system", "prompt2"),
            _msg("user", "hello"),
        ]
        result_msgs, cmd = handle_clear(msgs)
        assert len(result_msgs) == 2


@pytest.mark.unit
class TestHandleResume:
    def test_resume_from_node(self) -> None:
        tree = SessionTree()
        root = tree.create_root(messages=[_msg("user", "hi"), _msg("assistant", "hello")])
        result_msgs, cmd = handle_resume(tree, root.node_id)
        assert cmd.success is True
        assert len(result_msgs) == 2
        assert cmd.data["parent_id"] == root.node_id

    def test_resume_unknown_node(self) -> None:
        tree = SessionTree()
        tree.create_root()
        _, cmd = handle_resume(tree, "nonexistent")
        assert cmd.success is False


@pytest.mark.unit
class TestHandleInit:
    def test_init_returns_info(self) -> None:
        cmd = handle_init()
        assert cmd.success is True
        assert "AGENTS.md" in cmd.message
        assert cmd.data["agents_md"] == "AGENTS.md"


@pytest.mark.unit
class TestDispatchCommand:
    @pytest.mark.asyncio
    async def test_dispatch_compact(self) -> None:
        msgs = _conversation(10)
        result_msgs, cmd = await dispatch_command("/compact", msgs)
        assert cmd is not None
        assert cmd.command == "compact"

    @pytest.mark.asyncio
    async def test_dispatch_clear(self) -> None:
        msgs = _conversation(5)
        result_msgs, cmd = await dispatch_command("/clear", msgs)
        assert cmd is not None
        assert cmd.command == "clear"

    @pytest.mark.asyncio
    async def test_dispatch_init(self) -> None:
        msgs = _conversation(5)
        _, cmd = await dispatch_command("/init", msgs)
        assert cmd is not None
        assert cmd.command == "init"

    @pytest.mark.asyncio
    async def test_dispatch_resume_no_args(self) -> None:
        msgs = _conversation(5)
        _, cmd = await dispatch_command("/resume", msgs)
        assert cmd is not None
        assert cmd.success is False
        assert "Usage" in cmd.message

    @pytest.mark.asyncio
    async def test_dispatch_resume_no_tree(self) -> None:
        msgs = _conversation(5)
        _, cmd = await dispatch_command("/resume abc123", msgs)
        assert cmd is not None
        assert cmd.success is False
        assert "not available" in cmd.message

    @pytest.mark.asyncio
    async def test_dispatch_resume_with_tree(self) -> None:
        tree = SessionTree()
        root = tree.create_root(messages=[_msg("user", "hi")])
        result_msgs, cmd = await dispatch_command(
            f"/resume {root.node_id}", [_msg("user", "hi")], session_tree=tree
        )
        assert cmd is not None
        assert cmd.success is True

    @pytest.mark.asyncio
    async def test_dispatch_unknown_command(self) -> None:
        msgs = _conversation(5)
        _, cmd = await dispatch_command("/banana", msgs)
        assert cmd is not None
        assert cmd.success is False
        assert "Unknown command" in cmd.message

    @pytest.mark.asyncio
    async def test_dispatch_non_command(self) -> None:
        msgs = _conversation(5)
        result_msgs, cmd = await dispatch_command("just a normal message", msgs)
        assert result_msgs is None
        assert cmd is None

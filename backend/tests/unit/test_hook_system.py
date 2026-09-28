"""Tests for the hook system (runtime/hooks.py).

Proves all hook lifecycle operations: register, unregister, list, clear,
before/after dispatch, blocking, modification, timeout, error isolation,
priority ordering, and trust boundary enforcement.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.runtime.events import AgentEvent, AgentEventKind, RecordingEventSink
from app.runtime.hooks import (
    HookAction,
    HookPhase,
    HookRegistration,
    HookRegistry,
    HookResult,
)


def _make_event(
    kind: AgentEventKind = AgentEventKind.TOOL_CALL_REQUESTED,
    iteration: int = 1,
    data: dict[str, Any] | None = None,
) -> AgentEvent:
    return AgentEvent(kind=kind, iteration=iteration, data=data or {})


# ── Registration ──────────────────────────────────────────────


@pytest.mark.unit
class TestHookRegistration:
    @pytest.mark.asyncio
    async def test_register_and_list(self) -> None:
        registry = HookRegistry(RecordingEventSink())
        hook = HookRegistration(
            hook_id="h1",
            event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
            phase=HookPhase.BEFORE,
            handler=lambda e: None,
            description="test hook",
        )
        await registry.register(hook)
        hooks = await registry.list_hooks(AgentEventKind.TOOL_CALL_REQUESTED)
        assert len(hooks) == 1
        assert hooks[0].hook_id == "h1"

    @pytest.mark.asyncio
    async def test_register_rejects_duplicate_id(self) -> None:
        registry = HookRegistry(RecordingEventSink())
        hook = HookRegistration(
            hook_id="dup",
            event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
            phase=HookPhase.BEFORE,
            handler=lambda e: None,
        )
        await registry.register(hook)
        with pytest.raises(ValueError, match="already registered"):
            await registry.register(hook)

    @pytest.mark.asyncio
    async def test_register_rejects_when_limit_reached(self) -> None:
        registry = HookRegistry(RecordingEventSink(), max_hooks_per_event=2)
        for i in range(2):
            await registry.register(
                HookRegistration(
                    hook_id=f"h{i}",
                    event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
                    phase=HookPhase.BEFORE,
                    handler=lambda e: None,
                )
            )
        with pytest.raises(ValueError, match="Maximum hooks"):
            await registry.register(
                HookRegistration(
                    hook_id="h2",
                    event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
                    phase=HookPhase.BEFORE,
                    handler=lambda e: None,
                )
            )

    @pytest.mark.asyncio
    async def test_unregister_removes_hook(self) -> None:
        registry = HookRegistry(RecordingEventSink())
        await registry.register(
            HookRegistration(
                hook_id="rem",
                event_kind=AgentEventKind.RUN_STARTED,
                phase=HookPhase.AFTER,
                handler=lambda e: None,
            )
        )
        assert await registry.unregister("rem") is True
        assert await registry.list_hooks(AgentEventKind.RUN_STARTED) == []

    @pytest.mark.asyncio
    async def test_unregister_returns_false_for_missing(self) -> None:
        registry = HookRegistry(RecordingEventSink())
        assert await registry.unregister("nonexistent") is False

    @pytest.mark.asyncio
    async def test_clear_removes_all(self) -> None:
        registry = HookRegistry(RecordingEventSink())
        for kind in (AgentEventKind.RUN_STARTED, AgentEventKind.RUN_STOPPED):
            await registry.register(
                HookRegistration(
                    hook_id=f"h-{kind.value}",
                    event_kind=kind,
                    phase=HookPhase.BEFORE,
                    handler=lambda e: None,
                )
            )
        count = await registry.clear()
        assert count == 2
        assert await registry.list_hooks() == []

    @pytest.mark.asyncio
    async def test_list_all_hooks(self) -> None:
        registry = HookRegistry(RecordingEventSink())
        await registry.register(
            HookRegistration(
                hook_id="a",
                event_kind=AgentEventKind.RUN_STARTED,
                phase=HookPhase.BEFORE,
                handler=lambda e: None,
            )
        )
        await registry.register(
            HookRegistration(
                hook_id="b",
                event_kind=AgentEventKind.RUN_STOPPED,
                phase=HookPhase.AFTER,
                handler=lambda e: None,
            )
        )
        all_hooks = await registry.list_hooks()
        assert len(all_hooks) == 2


# ── Before-hook dispatch ─────────────────────────────────────


@pytest.mark.unit
class TestBeforeHooks:
    @pytest.mark.asyncio
    async def test_before_hook_receives_event(self) -> None:
        sink = RecordingEventSink()
        registry = HookRegistry(sink)
        received: list[AgentEvent] = []

        async def handler(event: AgentEvent) -> None:
            received.append(event)

        await registry.register(
            HookRegistration(
                hook_id="spy",
                event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
                phase=HookPhase.BEFORE,
                handler=handler,
            )
        )
        event = _make_event(data={"tool": "calculator"})
        await registry.emit(event)
        assert len(received) == 1
        assert received[0].data["tool"] == "calculator"
        assert len(sink.events) == 1  # forwarded to inner sink

    @pytest.mark.asyncio
    async def test_before_hook_blocks_event(self) -> None:
        sink = RecordingEventSink()
        registry = HookRegistry(sink)

        async def blocker(event: AgentEvent) -> HookResult:
            return HookResult(action=HookAction.BLOCK, reason="unsafe tool")

        await registry.register(
            HookRegistration(
                hook_id="guard",
                event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
                phase=HookPhase.BEFORE,
                handler=blocker,
            )
        )
        await registry.emit(_make_event())
        assert len(sink.events) == 0  # blocked — not forwarded

    @pytest.mark.asyncio
    async def test_before_hook_modifies_event_data(self) -> None:
        sink = RecordingEventSink()
        registry = HookRegistry(sink)

        async def modifier(event: AgentEvent) -> HookResult:
            new_data = dict(event.data)
            new_data["injected"] = True
            return HookResult(action=HookAction.MODIFY, modified_data=new_data)

        await registry.register(
            HookRegistration(
                hook_id="enrich",
                event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
                phase=HookPhase.BEFORE,
                handler=modifier,
            )
        )
        await registry.emit(_make_event(data={"tool": "web_search"}))
        assert len(sink.events) == 1
        assert sink.events[0].data["injected"] is True
        assert sink.events[0].data["tool"] == "web_search"

    @pytest.mark.asyncio
    async def test_priority_ordering(self) -> None:
        sink = RecordingEventSink()
        registry = HookRegistry(sink)
        order: list[str] = []

        async def make_handler(name: str):
            async def handler(event: AgentEvent) -> None:
                order.append(name)

            return handler

        await registry.register(
            HookRegistration(
                hook_id="low-pri",
                event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
                phase=HookPhase.BEFORE,
                handler=await make_handler("low"),
                priority=200,
            )
        )
        await registry.register(
            HookRegistration(
                hook_id="high-pri",
                event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
                phase=HookPhase.BEFORE,
                handler=await make_handler("high"),
                priority=50,
            )
        )
        await registry.emit(_make_event())
        assert order == ["high", "low"]


# ── After-hook dispatch ──────────────────────────────────────


@pytest.mark.unit
class TestAfterHooks:
    @pytest.mark.asyncio
    async def test_after_hook_runs_after_inner_sink(self) -> None:
        sink = RecordingEventSink()
        registry = HookRegistry(sink)
        after_called: list[bool] = []

        async def after_handler(event: AgentEvent) -> None:
            after_called.append(True)

        await registry.register(
            HookRegistration(
                hook_id="audit",
                event_kind=AgentEventKind.TOOL_CALL_COMPLETED,
                phase=HookPhase.AFTER,
                handler=after_handler,
            )
        )
        await registry.emit(_make_event(kind=AgentEventKind.TOOL_CALL_COMPLETED))
        assert len(sink.events) == 1
        assert len(after_called) == 1

    @pytest.mark.asyncio
    async def test_after_hook_runs_even_when_blocked(self) -> None:
        sink = RecordingEventSink()
        registry = HookRegistry(sink)
        after_called: list[bool] = []

        async def blocker(event: AgentEvent) -> HookResult:
            return HookResult(action=HookAction.BLOCK, reason="test")

        async def after_handler(event: AgentEvent) -> None:
            after_called.append(True)

        await registry.register(
            HookRegistration(
                hook_id="blocker",
                event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
                phase=HookPhase.BEFORE,
                handler=blocker,
            )
        )
        await registry.register(
            HookRegistration(
                hook_id="after",
                event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
                phase=HookPhase.AFTER,
                handler=after_handler,
            )
        )
        await registry.emit(_make_event())
        assert len(sink.events) == 0  # blocked
        assert len(after_called) == 1  # after-hook still ran


# ── Error isolation ──────────────────────────────────────────


@pytest.mark.unit
class TestHookErrorIsolation:
    @pytest.mark.asyncio
    async def test_handler_exception_does_not_crash_pipeline(self) -> None:
        sink = RecordingEventSink()
        registry = HookRegistry(sink)

        async def broken(event: AgentEvent) -> HookResult:
            raise RuntimeError("hook crashed")

        await registry.register(
            HookRegistration(
                hook_id="broken",
                event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
                phase=HookPhase.BEFORE,
                handler=broken,
            )
        )
        # Should not raise — event still forwarded
        await registry.emit(_make_event())
        assert len(sink.events) == 1

    @pytest.mark.asyncio
    async def test_handler_timeout_does_not_block_pipeline(self) -> None:
        sink = RecordingEventSink()
        registry = HookRegistry(sink, hook_timeout_seconds=0.1)

        async def slow(event: AgentEvent) -> None:
            await asyncio.sleep(10)

        await registry.register(
            HookRegistration(
                hook_id="slow",
                event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
                phase=HookPhase.BEFORE,
                handler=slow,
            )
        )
        await registry.emit(_make_event())
        assert len(sink.events) == 1  # timed out but event still forwarded


# ── Trust boundary ───────────────────────────────────────────


@pytest.mark.unit
class TestTrustBoundary:
    @pytest.mark.asyncio
    async def test_untrusted_workspace_blocks_registration(self) -> None:
        registry = HookRegistry(RecordingEventSink(), trusted=False)
        with pytest.raises(ValueError, match="untrusted"):
            await registry.register(
                HookRegistration(
                    hook_id="evil",
                    event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
                    phase=HookPhase.BEFORE,
                    handler=lambda e: None,
                )
            )

    @pytest.mark.asyncio
    async def test_untrusted_workspace_passes_events_through(self) -> None:
        sink = RecordingEventSink()
        registry = HookRegistry(sink, trusted=False)
        await registry.emit(_make_event())
        assert len(sink.events) == 1  # passed through without hooks

    def test_trusted_property(self) -> None:
        assert HookRegistry(RecordingEventSink(), trusted=True).trusted is True
        assert HookRegistry(RecordingEventSink(), trusted=False).trusted is False


# ── Sync handler support ─────────────────────────────────────


@pytest.mark.unit
class TestSyncHandlers:
    @pytest.mark.asyncio
    async def test_sync_handler_works(self) -> None:
        sink = RecordingEventSink()
        registry = HookRegistry(sink)
        called: list[bool] = []

        def sync_handler(event: AgentEvent) -> None:
            called.append(True)

        await registry.register(
            HookRegistration(
                hook_id="sync",
                event_kind=AgentEventKind.RUN_STARTED,
                phase=HookPhase.BEFORE,
                handler=sync_handler,
            )
        )
        await registry.emit(_make_event(kind=AgentEventKind.RUN_STARTED))
        assert len(called) == 1

    @pytest.mark.asyncio
    async def test_sync_handler_block(self) -> None:
        sink = RecordingEventSink()
        registry = HookRegistry(sink)

        def sync_blocker(event: AgentEvent) -> HookResult:
            return HookResult(action=HookAction.BLOCK, reason="sync block")

        await registry.register(
            HookRegistration(
                hook_id="sync-block",
                event_kind=AgentEventKind.TOOL_CALL_REQUESTED,
                phase=HookPhase.BEFORE,
                handler=sync_blocker,
            )
        )
        await registry.emit(_make_event())
        assert len(sink.events) == 0


# ── EventSink protocol compliance ────────────────────────────


@pytest.mark.unit
class TestEventSinkProtocol:
    @pytest.mark.asyncio
    async def test_hook_registry_is_event_sink(self) -> None:
        """HookRegistry implements EventSink protocol — can replace any sink."""
        registry = HookRegistry(RecordingEventSink())
        # Protocol requires async emit(AgentEvent) -> None
        assert hasattr(registry, "emit")
        event = _make_event(kind=AgentEventKind.RUN_STARTED)
        await registry.emit(event)  # should not raise

    @pytest.mark.asyncio
    async def test_composable_with_recording_sink(self) -> None:
        """Inner recording sink receives all non-blocked events."""
        inner = RecordingEventSink()
        registry = HookRegistry(inner)
        await registry.emit(_make_event(kind=AgentEventKind.RUN_STARTED))
        await registry.emit(_make_event(kind=AgentEventKind.MODEL_RESPONSE))
        await registry.emit(_make_event(kind=AgentEventKind.RUN_STOPPED))
        assert len(inner.events) == 3
        assert [e.kind for e in inner.events] == [
            AgentEventKind.RUN_STARTED,
            AgentEventKind.MODEL_RESPONSE,
            AgentEventKind.RUN_STOPPED,
        ]

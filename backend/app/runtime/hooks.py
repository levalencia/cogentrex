"""User-registrable hook system built on top of the event infrastructure.

Hooks let users attach custom logic to agent lifecycle events without
modifying the core runtime. The ``HookRegistry`` wraps an ``EventSink``
and dispatches events to matching hook handlers before forwarding to
the underlying sink.

Frontier harness mechanisms unlocked:
- PreToolUse hooks (CC, PI, DS)
- PostToolUse hooks (CC, PI, DS)
- Stop hooks — prevent premature victory (CC)
- Pre/post prompt submit hooks (LB)
- External signal injection (PI, DS)
- Hook trust boundary (LB)
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from app.runtime.events import AgentEvent, AgentEventKind, EventSink

logger = logging.getLogger(__name__)


class HookPhase(StrEnum):
    """When the hook fires relative to the event."""

    BEFORE = "before"
    AFTER = "after"


class HookAction(StrEnum):
    """Outcome a before-hook can signal."""

    CONTINUE = "continue"
    BLOCK = "block"
    MODIFY = "modify"


@dataclass(frozen=True, slots=True)
class HookResult:
    """Value returned by a hook handler."""

    action: HookAction = HookAction.CONTINUE
    modified_data: Mapping[str, Any] | None = None
    reason: str = ""


# Type for async hook handlers
HookHandler = Callable[[AgentEvent], Any]  # Returns HookResult or None


@dataclass(frozen=True, slots=True)
class HookRegistration:
    """A registered hook binding."""

    hook_id: str
    event_kind: AgentEventKind
    phase: HookPhase
    handler: HookHandler
    priority: int = 100  # lower = fires first
    description: str = ""


class HookRegistry:
    """Manages user-registrable hooks and dispatches them at event emission time.

    Wraps an underlying ``EventSink`` and intercepts events to run hooks.
    Before-hooks can block or modify event data. After-hooks are informational.

    Thread-safety: all mutations are guarded by an asyncio.Lock.
    """

    def __init__(
        self,
        inner_sink: EventSink,
        *,
        trusted: bool = True,
        max_hooks_per_event: int = 20,
        hook_timeout_seconds: float = 5.0,
    ) -> None:
        self._inner = inner_sink
        self._trusted = trusted
        self._max_per_event = max_hooks_per_event
        self._hook_timeout = hook_timeout_seconds
        self._hooks: dict[AgentEventKind, list[HookRegistration]] = defaultdict(list)
        self._lock = asyncio.Lock()

    @property
    def trusted(self) -> bool:
        return self._trusted

    async def register(self, registration: HookRegistration) -> None:
        """Register a hook. Raises ValueError if limits exceeded or untrusted."""
        if not self._trusted:
            raise ValueError(
                "Hook registration blocked: workspace is untrusted. "
                "All hooks are disabled in untrusted workspaces."
            )
        async with self._lock:
            existing = self._hooks[registration.event_kind]
            if len(existing) >= self._max_per_event:
                raise ValueError(
                    f"Maximum hooks ({self._max_per_event}) reached for "
                    f"{registration.event_kind.value}"
                )
            if any(h.hook_id == registration.hook_id for h in existing):
                raise ValueError(f"Hook ID already registered: {registration.hook_id}")
            existing.append(registration)
            existing.sort(key=lambda h: h.priority)

    async def unregister(self, hook_id: str) -> bool:
        """Remove a hook by ID. Returns True if found and removed."""
        async with self._lock:
            for _kind, hooks in self._hooks.items():
                for i, h in enumerate(hooks):
                    if h.hook_id == hook_id:
                        hooks.pop(i)
                        return True
        return False

    async def list_hooks(self, event_kind: AgentEventKind | None = None) -> list[HookRegistration]:
        """List registered hooks, optionally filtered by event kind."""
        async with self._lock:
            if event_kind is not None:
                return list(self._hooks.get(event_kind, []))
            result: list[HookRegistration] = []
            for hooks in self._hooks.values():
                result.extend(hooks)
            return result

    async def clear(self) -> int:
        """Remove all hooks. Returns count removed."""
        async with self._lock:
            count = sum(len(hooks) for hooks in self._hooks.values())
            self._hooks.clear()
            return count

    async def emit(self, event: AgentEvent) -> None:
        """Dispatch event through hooks, then forward to inner sink.

        Before-hooks run first (by priority). If any returns BLOCK, the event
        is NOT forwarded to the inner sink. If any returns MODIFY, the event
        data is replaced before forwarding.

        After-hooks run after the inner sink, regardless of blocking.
        """
        if not self._trusted:
            # Untrusted: skip all hooks, pass through directly
            await self._inner.emit(event)
            return

        # Run before-hooks
        before_hooks = await self._get_hooks(event.kind, HookPhase.BEFORE)
        blocked = False
        current_event = event

        for hook in before_hooks:
            try:
                result = await asyncio.wait_for(
                    self._call_handler(hook.handler, current_event),
                    timeout=self._hook_timeout,
                )
                if result is not None:
                    if result.action == HookAction.BLOCK:
                        logger.info(
                            "Hook %s blocked event %s: %s",
                            hook.hook_id,
                            event.kind.value,
                            result.reason,
                        )
                        blocked = True
                        break
                    if result.action == HookAction.MODIFY and result.modified_data is not None:
                        current_event = AgentEvent(
                            kind=current_event.kind,
                            iteration=current_event.iteration,
                            data=dict(result.modified_data),
                            usage=current_event.usage,
                        )
            except TimeoutError:
                logger.warning(
                    "Hook %s timed out on %s (%.1fs limit)",
                    hook.hook_id,
                    event.kind.value,
                    self._hook_timeout,
                )
            except Exception:
                logger.exception("Hook %s failed on %s", hook.hook_id, event.kind.value)

        # Forward to inner sink (unless blocked)
        if not blocked:
            await self._inner.emit(current_event)

        # Run after-hooks (always, even if blocked)
        after_hooks = await self._get_hooks(event.kind, HookPhase.AFTER)
        for hook in after_hooks:
            try:
                await asyncio.wait_for(
                    self._call_handler(hook.handler, current_event),
                    timeout=self._hook_timeout,
                )
            except TimeoutError:
                logger.warning("After-hook %s timed out on %s", hook.hook_id, event.kind.value)
            except Exception:
                logger.exception("After-hook %s failed on %s", hook.hook_id, event.kind.value)

    async def _get_hooks(self, kind: AgentEventKind, phase: HookPhase) -> list[HookRegistration]:
        async with self._lock:
            return [h for h in self._hooks.get(kind, []) if h.phase == phase]

    @staticmethod
    async def _call_handler(handler: HookHandler, event: AgentEvent) -> HookResult | None:
        result = handler(event)
        if asyncio.iscoroutine(result):
            result = await result
        if result is None:
            return None
        if not isinstance(result, HookResult):
            return None
        return result

"""Hook management API routes.

Provides REST endpoints for registering, listing, and removing hooks
at runtime. Hooks are session-scoped (cleared on server restart).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.runtime.builtin_hooks import (
    protected_commands_hook,
    protected_paths_hook,
    stop_verification_hook,
    tool_output_sanitizer_hook,
)
from app.runtime.events import AgentEventKind
from app.runtime.hooks import (
    HookPhase,
    HookRegistration,
    HookRegistry,
)

router = APIRouter(prefix="/api/hooks", tags=["hooks"])


# ── Request / Response models ────────────────────────────────


class BuiltinHookRequest(BaseModel):
    """Register a pre-built hook by type."""

    hook_id: str = Field(..., min_length=1, max_length=128)
    hook_type: str = Field(
        ...,
        description="protected_paths, protected_commands, stop_verification, output_sanitizer",
    )
    event_kind: str = Field(..., description="AgentEventKind value to attach the hook to")
    phase: str = Field(default="before", description="before or after")
    priority: int = Field(default=100, ge=1, le=1000)
    config: dict[str, Any] = Field(
        default_factory=dict, description="Hook-type-specific configuration"
    )
    description: str = ""


class HookResponse(BaseModel):
    hook_id: str
    event_kind: str
    phase: str
    priority: int
    description: str


class HookListResponse(BaseModel):
    hooks: list[HookResponse]
    count: int


class HookRemovedResponse(BaseModel):
    hook_id: str
    removed: bool


class HooksClearedResponse(BaseModel):
    removed_count: int


# ── Hook factory ─────────────────────────────────────────────

_BUILTIN_FACTORIES = {
    "protected_paths": lambda cfg: protected_paths_hook(
        cfg.get("patterns", [".env", ".git/**", "/etc/**", "node_modules/**"])
    ),
    "protected_commands": lambda cfg: protected_commands_hook(
        cfg.get("commands", ["rm -rf", "DROP TABLE", "FORMAT", "mkfs"])
    ),
    "stop_verification": lambda cfg: stop_verification_hook(cfg.get("required_evidence_keys")),
    "output_sanitizer": lambda cfg: tool_output_sanitizer_hook(
        patterns=cfg.get("patterns", [r"sk-[a-zA-Z0-9]{20,}"]),
        replacement=cfg.get("replacement", "[REDACTED]"),
    ),
}


def _get_hook_registry(request: Request) -> HookRegistry:
    registry = getattr(request.app.state, "hook_registry", None)
    if registry is None:
        raise HTTPException(status_code=503, detail="Hook system not initialized")
    return registry


# ── Endpoints ────────────────────────────────────────────────


@router.post("", response_model=HookResponse, status_code=201)
async def register_hook(body: BuiltinHookRequest, request: Request) -> HookResponse:
    """Register a built-in hook."""
    registry = _get_hook_registry(request)

    factory = _BUILTIN_FACTORIES.get(body.hook_type)
    if factory is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown hook type: {body.hook_type}. "
            f"Available: {', '.join(_BUILTIN_FACTORIES)}",
        )

    try:
        event_kind = AgentEventKind(body.event_kind)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown event kind: {body.event_kind}. "
            f"Available: {', '.join(k.value for k in AgentEventKind)}",
        ) from None

    try:
        phase = HookPhase(body.phase)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown phase: {body.phase}. Use 'before' or 'after'",
        ) from None

    handler = factory(body.config)
    registration = HookRegistration(
        hook_id=body.hook_id,
        event_kind=event_kind,
        phase=phase,
        handler=handler,
        priority=body.priority,
        description=body.description,
    )

    try:
        await registry.register(registration)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None

    return HookResponse(
        hook_id=body.hook_id,
        event_kind=event_kind.value,
        phase=phase.value,
        priority=body.priority,
        description=body.description,
    )


@router.get("", response_model=HookListResponse)
async def list_hooks(request: Request, event_kind: str | None = None) -> HookListResponse:
    """List registered hooks, optionally filtered by event kind."""
    registry = _get_hook_registry(request)

    kind_filter = None
    if event_kind is not None:
        try:
            kind_filter = AgentEventKind(event_kind)
        except ValueError:
            raise HTTPException(
                status_code=400, detail=f"Unknown event kind: {event_kind}"
            ) from None

    hooks = await registry.list_hooks(kind_filter)
    items = [
        HookResponse(
            hook_id=h.hook_id,
            event_kind=h.event_kind.value,
            phase=h.phase.value,
            priority=h.priority,
            description=h.description,
        )
        for h in hooks
    ]
    return HookListResponse(hooks=items, count=len(items))


@router.delete("/{hook_id}", response_model=HookRemovedResponse)
async def remove_hook(hook_id: str, request: Request) -> HookRemovedResponse:
    """Remove a hook by ID."""
    registry = _get_hook_registry(request)
    removed = await registry.unregister(hook_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Hook not found: {hook_id}")
    return HookRemovedResponse(hook_id=hook_id, removed=True)


@router.delete("", response_model=HooksClearedResponse)
async def clear_hooks(request: Request) -> HooksClearedResponse:
    """Remove all hooks."""
    registry = _get_hook_registry(request)
    count = await registry.clear()
    return HooksClearedResponse(removed_count=count)

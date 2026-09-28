# Code walkthrough: Hook system

> **Sources:** `app/runtime/hooks.py`, `app/runtime/builtin_hooks.py`, `app/routes/hooks.py`

## Entry point: HookRegistry wraps EventSink

```python
# app/runtime/hooks.py

class HookRegistry:
    def __init__(self, inner_sink: EventSink, *, trusted: bool = True):
        self._inner = inner_sink
        self._trusted = trusted
        self._hooks: dict[AgentEventKind, list[HookRegistration]] = defaultdict(list)
```

The registry implements the `EventSink` protocol — it has an `async emit(event)` method. This means it can replace any EventSink in the system without changing callers.

## Dispatch flow: emit()

```python
async def emit(self, event: AgentEvent) -> None:
    if not self._trusted:
        await self._inner.emit(event)  # bypass all hooks
        return

    # 1. Run before-hooks (can block or modify)
    for hook in before_hooks:
        result = await self._call_handler(hook.handler, event)
        if result.action == HookAction.BLOCK:
            blocked = True; break
        if result.action == HookAction.MODIFY:
            current_event = AgentEvent(..., data=result.modified_data)

    # 2. Forward to inner sink (unless blocked)
    if not blocked:
        await self._inner.emit(current_event)

    # 3. Run after-hooks (always, for audit)
    for hook in after_hooks:
        await self._call_handler(hook.handler, current_event)
```

## Built-in hook: protected_paths_hook

```python
# app/runtime/builtin_hooks.py

def protected_paths_hook(protected_patterns):
    compiled = [re.compile(_glob_to_regex(p)) for p in protected_patterns]

    def handler(event: AgentEvent) -> HookResult:
        args = event.data.get("arguments", {})
        for key in ("path", "file_path", "directory", "target"):
            path_val = args.get(key, "")
            for pattern in compiled:
                if pattern.search(path_val):
                    return HookResult(action=HookAction.BLOCK, reason=...)
        return HookResult(action=HookAction.CONTINUE)

    return handler
```

The hook is a closure: it captures the compiled patterns at registration time and checks every tool call's path arguments against them.

## REST API: register via HTTP

```python
# app/routes/hooks.py

@router.post("", response_model=HookResponse, status_code=201)
async def register_hook(body: BuiltinHookRequest, request: Request):
    factory = _BUILTIN_FACTORIES[body.hook_type]  # e.g., "protected_paths"
    handler = factory(body.config)                 # creates the closure
    registration = HookRegistration(
        hook_id=body.hook_id,
        event_kind=AgentEventKind(body.event_kind),
        phase=HookPhase(body.phase),
        handler=handler,
    )
    await registry.register(registration)
```

## Wiring in main.py

```python
# app/main.py (startup)

app.state.hook_registry = HookRegistry(NullEventSink())
app.include_router(hooks_router)
```

The HookRegistry starts with NullEventSink as the inner target. The orchestration layer wraps it with SSE/recording sinks per request.

## Test example: block + after-hook still runs

```python
# tests/unit/test_hook_system.py

async def test_after_hook_runs_even_when_blocked():
    registry = HookRegistry(sink)
    await registry.register(blocker_hook)   # BLOCK on TOOL_CALL_REQUESTED
    await registry.register(after_hook)     # AFTER on TOOL_CALL_REQUESTED

    await registry.emit(tool_event)

    assert len(sink.events) == 0     # blocked — not forwarded
    assert len(after_called) == 1    # after-hook still ran
```

This proves the "after-hooks always run" invariant, critical for audit logging.

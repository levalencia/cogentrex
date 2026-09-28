# Code walkthrough: Context compaction pipeline

> **Sources:** `app/services/multi_layer_compact.py`, `app/services/context_filters.py`, `app/services/chat_commands.py`

## Entry point: multi_layer_compact()

```python
# app/services/multi_layer_compact.py

async def multi_layer_compact(messages, *, config=None, summarize_fn=None):
    cfg = config or CompactionConfig()
    threshold_tokens = int(cfg.max_tokens * cfg.trigger_threshold)

    if _count_tokens(messages) <= threshold_tokens:
        return messages, CompactionStats(layer_applied="none", ...)

    # Layer 1: Lossless — no information loss
    current, pruned = lossless_prune(current)
    if under_threshold: return current, stats

    # Layer 2: Structured — truncate verbose content
    current, trimmed = structured_distill(current)
    if under_threshold: return current, stats

    # Layer 3: Lossy — LLM summarize with circuit breaker
    while over_threshold and cycles < max_compaction_cycles:
        current, summarized, pointers = await lossy_summarize(current, ...)
        cycles += 1
```

The key design: each layer checks budget before escalating. Lossless is always safe. Lossy has a circuit breaker.

## Layer 1: Lossless pruning

```python
def lossless_prune(messages):
    for msg in messages:
        # Skip empty assistant messages
        if role == "assistant" and not content.strip():
            removed += 1; continue

        # Deduplicate identical tool results
        if role == "tool":
            content_key = _content_hash(content)
            dedup_key = f"{tool_name}:{content_key}"
            if dedup_key in seen_tool_results:
                pruned.append({...msg, "content": "[Duplicate]", "_recovery_pointer": dedup_key})
                continue
            seen_tool_results.add(dedup_key)
```

Recovery pointers allow retrieving the original content later.

## Message filtering chain

```python
# app/services/context_filters.py

def apply_filters(messages, filters):
    result = messages
    for f in filters:
        result = f(result)
    return result

# Usage:
filtered = apply_filters(messages, [
    role_filter("tool"),            # remove tool messages
    content_length_filter(2000),    # truncate long content
    metadata_filter("_source_id"),  # strip internal keys
])
```

Filters are composable closures — each takes and returns a message list.

## Chat commands dispatch

```python
# app/services/chat_commands.py

async def dispatch_command(text, messages, session_tree=None):
    parsed = parse_command(text)  # returns ("compact", "keep=5") or None
    if parsed is None:
        return None, None  # not a command

    cmd, args = parsed
    if cmd == "compact":
        return await handle_compact(messages, args)
    elif cmd == "clear":
        return handle_clear(messages)  # keeps system messages
    elif cmd == "resume":
        return handle_resume(session_tree, args)
```

## Context budget tracking

```python
budget = ContextBudget(system_prompt=4000, instructions=8000, ...)
usage = ContextUsage(system_prompt=500, instructions=1200)
violations = usage.exceeds(budget)  # ["instructions"] if over
utilization = usage.utilization(budget)  # {"system_prompt": 0.125, ...}
```

## Test example: circuit breaker trips

```python
async def test_circuit_breaker_trips():
    msgs = _many_messages(50, content_size=200)
    config = CompactionConfig(max_tokens=100, max_compaction_cycles=1)
    result, stats = await multi_layer_compact(msgs, config=config)
    assert stats.circuit_breaker_tripped is True
```

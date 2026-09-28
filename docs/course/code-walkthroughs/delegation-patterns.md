# Code walkthrough: Delegation patterns

> **Sources:** `app/delegation/patterns.py`, `app/delegation/service.py`

## Coordinator pattern: zero context inheritance

```python
# app/delegation/patterns.py

class CoordinatorDelegation:
    async def delegate(self, tasks, parallel=True):
        if parallel:
            results = await asyncio.gather(
                *(self._execute_worker(task) for task in tasks),
                return_exceptions=True,
            )
        else:
            for task in tasks:
                result = await self._execute_worker(task)
```

Each task is a `DelegationTask` with a self-contained `context` field. The coordinator synthesizes findings into precise specs — workers never see the parent conversation.

## Fork pattern: full inheritance, single-level only

```python
class ForkDelegation:
    def fork(self, parent_messages, task):
        if self._is_forked:
            raise ValueError("Recursive fork blocked")

        forked_context = copy.deepcopy(parent_messages)
        task.context = f"[FORKED CONTEXT]\n{context_text}\n\n{task.description}"
        return task

    def create_child(self):
        child = ForkDelegation(self._executor)
        child._is_forked = True  # blocks recursive forking
        return child
```

Deep copy prevents mutation leakage. `_is_forked` flag prevents context explosion.

## Swarm pattern: shared task queue

```python
class SwarmDelegation:
    def submit_task(self, task):
        self._task_queue.append(task)

    def claim_task(self, worker_id):
        if worker_id not in self._peers:
            raise ValueError("Unknown peer")
        if not self._task_queue:
            return None
        return self._task_queue.pop(0)  # FIFO

    def post_result(self, result):
        self._results[result.worker_id] = result
```

Peers are registered, tasks queued, results posted back. No peer can spawn more peers.

## Per-worker tool filtering

```python
def filter_tools_for_worker(all_tools, config):
    read_tools = {"read_file", "list_directory", "calculator", ...}
    if config.read_only:
        return [t for t in all_tools if t in read_tools]
    if config.tool_filter is not None:
        return [t for t in all_tools if t in set(config.tool_filter)]
    return list(all_tools)
```

## Config file loading

```python
def load_worker_configs(config_dir):
    for yaml_file in sorted(config_path.glob("*.yaml")):
        data = yaml.safe_load(yaml_file.open())
        config = WorkerConfig(
            worker_id=data.get("worker_id", yaml_file.stem),
            read_only=data.get("read_only", False),
            tool_filter=data.get("tool_filter"),
        )
        configs[config.worker_id] = config
```

Config files live in `.cogentrex/agents/`, one YAML per agent type.

## Test example: parallel failure isolation

```python
async def test_parallel_failure_isolation():
    async def mixed_executor(task):
        if "fail" in task.description:
            raise RuntimeError("intentional")
        return "success"

    coord = CoordinatorDelegation(executor=mixed_executor)
    tasks = [_task("good"), _task("fail"), _task("also good")]
    results = await coord.delegate(tasks, parallel=True)
    assert statuses.count(WorkerStatus.COMPLETED) == 2
    assert statuses.count(WorkerStatus.FAILED) == 1
```

One worker failing doesn't crash the others — asyncio.gather with return_exceptions=True.

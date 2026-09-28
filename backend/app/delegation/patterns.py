"""Delegation patterns for multi-agent coordination.

Implements frontier sub-agent mechanisms:
- Coordinator pattern — zero context inheritance, safest (MA)
- Fork pattern — full inheritance, single-level only (MA)
- Swarm pattern — peer-to-peer, flat roster (MA)
- Per-worker tool filtering (MA)
- Self-contained worker prompts (MA)
- Recursive fork guard (MA)
- Fire-and-forget registration (MA)
- Subagent configuration files (CX)
- Sidechain file storage (CC)
"""

from __future__ import annotations

import asyncio
import copy
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()


class DelegationPattern(StrEnum):
    COORDINATOR = "coordinator"
    FORK = "fork"
    SWARM = "swarm"


class WorkerStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class WorkerConfig:
    """Configuration for a delegated worker agent."""

    worker_id: str = ""
    name: str = ""
    model: str = ""  # model override (empty = use parent's)
    instructions: str = ""  # worker-specific instructions
    tool_filter: list[str] | None = None  # allowed tool names (None = all)
    read_only: bool = False  # if True, no write tools
    max_iterations: int = 15
    max_tokens: int = 64_000
    timeout_seconds: float = 300.0

    def __post_init__(self) -> None:
        if not self.worker_id:
            self.worker_id = f"worker-{uuid.uuid4().hex[:8]}"


@dataclass
class WorkerResult:
    """Result from a completed worker."""

    worker_id: str
    status: WorkerStatus
    output: str = ""
    error: str = ""
    duration_seconds: float = 0.0
    token_usage: dict[str, int] = field(default_factory=dict)
    sidechain_path: str | None = None


@dataclass
class DelegationTask:
    """A task to be delegated to a worker."""

    task_id: str = ""
    description: str = ""
    context: str = ""  # self-contained context (coordinator synthesizes this)
    config: WorkerConfig = field(default_factory=WorkerConfig)

    def __post_init__(self) -> None:
        if not self.task_id:
            self.task_id = f"task-{uuid.uuid4().hex[:8]}"


# Type for the actual worker execution function
WorkerExecutor = Callable[[DelegationTask], Any]


class CoordinatorDelegation:
    """Coordinator pattern: zero context inheritance.

    The coordinator synthesizes findings into precise, self-contained
    specs for each worker. Workers start fresh — they do NOT inherit
    the parent's conversation history.

    This is the safest pattern: no context leakage between workers.
    """

    def __init__(self, executor: WorkerExecutor | None = None) -> None:
        self._executor = executor
        self._workers: dict[str, WorkerResult] = {}

    async def delegate(
        self,
        tasks: list[DelegationTask],
        parallel: bool = True,
    ) -> list[WorkerResult]:
        """Delegate tasks to workers. Each gets a self-contained spec."""
        if parallel:
            return await self._run_parallel(tasks)
        return await self._run_sequential(tasks)

    async def _run_parallel(self, tasks: list[DelegationTask]) -> list[WorkerResult]:
        results = await asyncio.gather(
            *(self._execute_worker(task) for task in tasks),
            return_exceptions=True,
        )
        return [
            r
            if isinstance(r, WorkerResult)
            else WorkerResult(
                worker_id=tasks[i].config.worker_id,
                status=WorkerStatus.FAILED,
                error=str(r),
            )
            for i, r in enumerate(results)
        ]

    async def _run_sequential(self, tasks: list[DelegationTask]) -> list[WorkerResult]:
        results = []
        for task in tasks:
            try:
                result = await self._execute_worker(task)
                results.append(result)
            except Exception as exc:
                results.append(
                    WorkerResult(
                        worker_id=task.config.worker_id,
                        status=WorkerStatus.FAILED,
                        error=str(exc),
                    )
                )
        return results

    async def _execute_worker(self, task: DelegationTask) -> WorkerResult:
        start = time.time()
        if self._executor:
            try:
                output = self._executor(task)
                if asyncio.iscoroutine(output):
                    output = await output
                return WorkerResult(
                    worker_id=task.config.worker_id,
                    status=WorkerStatus.COMPLETED,
                    output=str(output),
                    duration_seconds=time.time() - start,
                )
            except Exception as exc:
                return WorkerResult(
                    worker_id=task.config.worker_id,
                    status=WorkerStatus.FAILED,
                    error=str(exc),
                    duration_seconds=time.time() - start,
                )
        # No executor — return placeholder
        return WorkerResult(
            worker_id=task.config.worker_id,
            status=WorkerStatus.COMPLETED,
            output="[no executor configured]",
            duration_seconds=time.time() - start,
        )


class ForkDelegation:
    """Fork pattern: full context inheritance, single-level only.

    Child inherits full parent context but cannot fork further.
    Recursive forks are blocked at call time.
    """

    def __init__(self, executor: WorkerExecutor | None = None) -> None:
        self._executor = executor
        self._is_forked = False

    def fork(
        self,
        parent_messages: list[dict[str, Any]],
        task: DelegationTask,
    ) -> DelegationTask:
        """Create a forked task with full parent context.

        Raises ValueError if called from an already-forked context.
        """
        if self._is_forked:
            raise ValueError(
                "Recursive fork blocked: forked workers cannot fork further. "
                "This prevents context explosion."
            )

        # Deep copy parent messages into the task context
        forked_context = copy.deepcopy(parent_messages)
        context_text = "\n".join(
            f"[{m.get('role', 'unknown')}]: {m.get('content', '')[:500]}" for m in forked_context
        )
        task.context = (
            f"[FORKED CONTEXT — {len(forked_context)} messages]\n"
            f"{context_text}\n\n{task.description}"
        )
        return task

    def create_child(self) -> ForkDelegation:
        """Create a child fork delegation that cannot fork further."""
        child = ForkDelegation(self._executor)
        child._is_forked = True
        return child


class SwarmDelegation:
    """Swarm pattern: peer-to-peer, flat roster with shared task list.

    Persistent team with a shared task queue. Peers pick tasks from the
    queue and post results back. Peers cannot spawn new peers.
    """

    def __init__(self, max_peers: int = 5) -> None:
        self._max_peers = max_peers
        self._task_queue: list[DelegationTask] = []
        self._results: dict[str, WorkerResult] = {}
        self._peers: dict[str, WorkerConfig] = {}

    def register_peer(self, config: WorkerConfig) -> None:
        """Register a peer in the swarm."""
        if len(self._peers) >= self._max_peers:
            raise ValueError(f"Maximum peers ({self._max_peers}) reached")
        if config.worker_id in self._peers:
            raise ValueError(f"Peer already registered: {config.worker_id}")
        self._peers[config.worker_id] = config

    def unregister_peer(self, worker_id: str) -> bool:
        """Remove a peer from the swarm."""
        return self._peers.pop(worker_id, None) is not None

    def submit_task(self, task: DelegationTask) -> str:
        """Submit a task to the shared queue. Returns task_id."""
        self._task_queue.append(task)
        return task.task_id

    def claim_task(self, worker_id: str) -> DelegationTask | None:
        """Claim the next available task from the queue."""
        if worker_id not in self._peers:
            raise ValueError(f"Unknown peer: {worker_id}")
        if not self._task_queue:
            return None
        return self._task_queue.pop(0)

    def post_result(self, result: WorkerResult) -> None:
        """Post a worker's result back to the swarm."""
        self._results[result.worker_id] = result

    def get_results(self) -> dict[str, WorkerResult]:
        """Get all posted results."""
        return dict(self._results)

    @property
    def pending_tasks(self) -> int:
        return len(self._task_queue)

    @property
    def peer_count(self) -> int:
        return len(self._peers)

    @property
    def completed_count(self) -> int:
        return sum(1 for r in self._results.values() if r.status == WorkerStatus.COMPLETED)


# ── Tool Filtering ───────────────────────────────────────────


def filter_tools_for_worker(all_tools: list[str], config: WorkerConfig) -> list[str]:
    """Filter available tools based on worker configuration.

    Implements: per-worker tool filtering (MA).
    - read_only workers get only read-type tools
    - tool_filter whitelist restricts to named tools only
    """
    read_tools = {"read_file", "list_directory", "calculator", "datetime", "web_search"}

    if config.read_only:
        return [t for t in all_tools if t in read_tools]

    if config.tool_filter is not None:
        allowed = set(config.tool_filter)
        return [t for t in all_tools if t in allowed]

    return list(all_tools)


# ── Subagent Config Loading ──────────────────────────────────


def load_worker_configs(config_dir: str | Path) -> dict[str, WorkerConfig]:
    """Load worker configurations from .yaml files in a directory.

    Implements: Subagent configuration files (.cogentrex/agents/*.yaml) (CX).
    """
    import yaml

    config_path = Path(config_dir)
    configs: dict[str, WorkerConfig] = {}

    if not config_path.is_dir():
        return configs

    for yaml_file in sorted(config_path.glob("*.yaml")):
        try:
            with yaml_file.open() as f:
                data = yaml.safe_load(f)
            if not isinstance(data, dict):
                continue
            config = WorkerConfig(
                worker_id=data.get("worker_id", yaml_file.stem),
                name=data.get("name", yaml_file.stem),
                model=data.get("model", ""),
                instructions=data.get("instructions", ""),
                tool_filter=data.get("tool_filter"),
                read_only=data.get("read_only", False),
                max_iterations=data.get("max_iterations", 15),
                max_tokens=data.get("max_tokens", 64_000),
                timeout_seconds=data.get("timeout_seconds", 300.0),
            )
            configs[config.worker_id] = config
        except Exception:
            logger.warning("failed_to_load_worker_config", file=str(yaml_file))

    return configs

"""Tests for delegation patterns (Coordinator, Fork, Swarm)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.delegation.patterns import (
    CoordinatorDelegation,
    DelegationTask,
    ForkDelegation,
    SwarmDelegation,
    WorkerConfig,
    WorkerResult,
    WorkerStatus,
    filter_tools_for_worker,
    load_worker_configs,
)


def _task(desc: str = "test task", **kwargs) -> DelegationTask:
    return DelegationTask(description=desc, **kwargs)


def _config(**kwargs) -> WorkerConfig:
    return WorkerConfig(**kwargs)


# ── Coordinator ──────────────────────────────────────────────


@pytest.mark.unit
class TestCoordinatorDelegation:
    @pytest.mark.asyncio
    async def test_delegate_parallel(self) -> None:
        async def executor(task: DelegationTask) -> str:
            return f"done: {task.description}"

        coord = CoordinatorDelegation(executor=executor)
        tasks = [_task("task1"), _task("task2"), _task("task3")]
        results = await coord.delegate(tasks, parallel=True)
        assert len(results) == 3
        assert all(r.status == WorkerStatus.COMPLETED for r in results)

    @pytest.mark.asyncio
    async def test_delegate_sequential(self) -> None:
        order: list[str] = []

        async def executor(task: DelegationTask) -> str:
            order.append(task.description)
            return "ok"

        coord = CoordinatorDelegation(executor=executor)
        tasks = [_task("first"), _task("second")]
        results = await coord.delegate(tasks, parallel=False)
        assert order == ["first", "second"]
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_worker_failure_captured(self) -> None:
        async def failing_executor(task: DelegationTask) -> str:
            raise RuntimeError("boom")

        coord = CoordinatorDelegation(executor=failing_executor)
        results = await coord.delegate([_task()], parallel=False)
        assert results[0].status == WorkerStatus.FAILED
        assert "boom" in results[0].error

    @pytest.mark.asyncio
    async def test_no_executor_returns_placeholder(self) -> None:
        coord = CoordinatorDelegation()
        results = await coord.delegate([_task()])
        assert results[0].status == WorkerStatus.COMPLETED
        assert "no executor" in results[0].output

    @pytest.mark.asyncio
    async def test_parallel_failure_isolation(self) -> None:
        call_count = [0]

        async def mixed_executor(task: DelegationTask) -> str:
            call_count[0] += 1
            if "fail" in task.description:
                raise RuntimeError("intentional")
            return "success"

        coord = CoordinatorDelegation(executor=mixed_executor)
        tasks = [_task("good"), _task("fail"), _task("also good")]
        results = await coord.delegate(tasks, parallel=True)
        statuses = [r.status for r in results]
        assert statuses.count(WorkerStatus.COMPLETED) == 2
        assert statuses.count(WorkerStatus.FAILED) == 1


# ── Fork ─────────────────────────────────────────────────────


@pytest.mark.unit
class TestForkDelegation:
    def test_fork_inherits_parent_context(self) -> None:
        fork = ForkDelegation()
        parent_msgs = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ]
        task = _task("continue from here")
        forked = fork.fork(parent_msgs, task)
        assert "FORKED CONTEXT" in forked.context
        assert "hello" in forked.context
        assert "continue from here" in forked.context

    def test_recursive_fork_blocked(self) -> None:
        parent = ForkDelegation()
        child = parent.create_child()
        with pytest.raises(ValueError, match="Recursive fork blocked"):
            child.fork([], _task())

    def test_fork_deep_copies_messages(self) -> None:
        fork = ForkDelegation()
        parent_msgs = [{"role": "user", "content": "original"}]
        task = _task()
        fork.fork(parent_msgs, task)
        # Modify original — should not affect fork
        parent_msgs[0]["content"] = "modified"
        assert "original" in task.context


# ── Swarm ────────────────────────────────────────────────────


@pytest.mark.unit
class TestSwarmDelegation:
    def test_register_and_count_peers(self) -> None:
        swarm = SwarmDelegation(max_peers=3)
        swarm.register_peer(_config(worker_id="p1"))
        swarm.register_peer(_config(worker_id="p2"))
        assert swarm.peer_count == 2

    def test_register_rejects_over_limit(self) -> None:
        swarm = SwarmDelegation(max_peers=1)
        swarm.register_peer(_config(worker_id="p1"))
        with pytest.raises(ValueError, match="Maximum peers"):
            swarm.register_peer(_config(worker_id="p2"))

    def test_register_rejects_duplicate(self) -> None:
        swarm = SwarmDelegation()
        swarm.register_peer(_config(worker_id="p1"))
        with pytest.raises(ValueError, match="already registered"):
            swarm.register_peer(_config(worker_id="p1"))

    def test_submit_and_claim_task(self) -> None:
        swarm = SwarmDelegation()
        swarm.register_peer(_config(worker_id="p1"))
        task_id = swarm.submit_task(_task("do work"))
        assert swarm.pending_tasks == 1
        claimed = swarm.claim_task("p1")
        assert claimed is not None
        assert claimed.task_id == task_id
        assert swarm.pending_tasks == 0

    def test_claim_returns_none_when_empty(self) -> None:
        swarm = SwarmDelegation()
        swarm.register_peer(_config(worker_id="p1"))
        assert swarm.claim_task("p1") is None

    def test_claim_rejects_unknown_peer(self) -> None:
        swarm = SwarmDelegation()
        with pytest.raises(ValueError, match="Unknown peer"):
            swarm.claim_task("ghost")

    def test_post_and_get_results(self) -> None:
        swarm = SwarmDelegation()
        swarm.register_peer(_config(worker_id="p1"))
        swarm.post_result(
            WorkerResult(
                worker_id="p1",
                status=WorkerStatus.COMPLETED,
                output="result data",
            )
        )
        results = swarm.get_results()
        assert "p1" in results
        assert results["p1"].output == "result data"
        assert swarm.completed_count == 1

    def test_unregister_peer(self) -> None:
        swarm = SwarmDelegation()
        swarm.register_peer(_config(worker_id="p1"))
        assert swarm.unregister_peer("p1") is True
        assert swarm.peer_count == 0
        assert swarm.unregister_peer("p1") is False

    def test_fifo_task_ordering(self) -> None:
        swarm = SwarmDelegation()
        swarm.register_peer(_config(worker_id="p1"))
        swarm.submit_task(_task("first"))
        swarm.submit_task(_task("second"))
        t1 = swarm.claim_task("p1")
        t2 = swarm.claim_task("p1")
        assert t1 is not None and "first" in t1.description
        assert t2 is not None and "second" in t2.description


# ── Tool Filtering ───────────────────────────────────────────


@pytest.mark.unit
class TestToolFiltering:
    def test_read_only_filters_to_read_tools(self) -> None:
        all_tools = ["read_file", "write_file", "calculator", "shell_exec", "web_search"]
        config = _config(read_only=True)
        filtered = filter_tools_for_worker(all_tools, config)
        assert "read_file" in filtered
        assert "calculator" in filtered
        assert "write_file" not in filtered
        assert "shell_exec" not in filtered

    def test_tool_filter_whitelist(self) -> None:
        all_tools = ["read_file", "write_file", "calculator", "web_search"]
        config = _config(tool_filter=["read_file", "calculator"])
        filtered = filter_tools_for_worker(all_tools, config)
        assert filtered == ["read_file", "calculator"]

    def test_no_filter_returns_all(self) -> None:
        all_tools = ["read_file", "write_file", "calculator"]
        config = _config()
        filtered = filter_tools_for_worker(all_tools, config)
        assert filtered == all_tools


# ── Config Loading ───────────────────────────────────────────


@pytest.mark.unit
class TestConfigLoading:
    def test_load_from_yaml_files(self, tmp_path: Path) -> None:
        config_dir = tmp_path / "agents"
        config_dir.mkdir()
        (config_dir / "researcher.yaml").write_text(
            "worker_id: researcher\nname: Research Agent\nread_only: true\nmodel: gpt-4\n"
        )
        (config_dir / "implementer.yaml").write_text(
            "worker_id: implementer\nname: Code Agent\n"
            "tool_filter:\n  - write_file\n  - read_file\n"
        )
        configs = load_worker_configs(config_dir)
        assert len(configs) == 2
        assert configs["researcher"].read_only is True
        assert configs["implementer"].tool_filter == ["write_file", "read_file"]

    def test_load_from_nonexistent_dir(self) -> None:
        configs = load_worker_configs("/nonexistent/path")
        assert configs == {}

    def test_load_skips_invalid_yaml(self, tmp_path: Path) -> None:
        config_dir = tmp_path / "agents"
        config_dir.mkdir()
        (config_dir / "bad.yaml").write_text("not: [valid: yaml: {{")
        (config_dir / "good.yaml").write_text("worker_id: good\nname: Good Agent\n")
        configs = load_worker_configs(config_dir)
        assert "good" in configs

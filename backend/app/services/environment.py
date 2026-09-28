"""Worktree isolation and environment delta tracking.

Implements frontier environment mechanisms:
- Git worktree isolation per task (CX)
- Environment-context deltas only (CX)
- SYSTEM.md for environment self-description (PI)
"""

from __future__ import annotations

import os
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import structlog

logger = structlog.get_logger()


@dataclass(frozen=True, slots=True)
class EnvironmentSnapshot:
    """Snapshot of the current environment state."""

    cwd: str
    git_branch: str
    git_commit: str
    python_version: str
    node_version: str
    env_vars: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class EnvironmentDelta:
    """Changes between two environment snapshots."""

    changed_fields: dict[str, tuple[str, str]]  # field -> (old, new)
    new_env_vars: dict[str, str]
    removed_env_vars: list[str]

    @property
    def has_changes(self) -> bool:
        return bool(self.changed_fields or self.new_env_vars or self.removed_env_vars)


def capture_environment(
    cwd: str | Path | None = None,
    include_env_vars: bool = False,
    env_var_prefix: str = "",
) -> EnvironmentSnapshot:
    """Capture current environment state."""
    work_dir = str(cwd or os.getcwd())

    git_branch = _run_git(work_dir, "rev-parse", "--abbrev-ref", "HEAD")
    git_commit = _run_git(work_dir, "rev-parse", "--short", "HEAD")
    python_ver = _run_cmd("python3", "--version")
    node_ver = _run_cmd("node", "--version")

    env_vars: dict[str, str] = {}
    if include_env_vars:
        for key, val in os.environ.items():
            if env_var_prefix and not key.startswith(env_var_prefix):
                continue
            env_vars[key] = val

    return EnvironmentSnapshot(
        cwd=work_dir,
        git_branch=git_branch,
        git_commit=git_commit,
        python_version=python_ver,
        node_version=node_ver,
        env_vars=env_vars,
    )


def compute_delta(old: EnvironmentSnapshot, new: EnvironmentSnapshot) -> EnvironmentDelta:
    """Compute delta between two snapshots.

    Only sends changed fields to the model — not the full environment.
    """
    changed: dict[str, tuple[str, str]] = {}

    for field_name in ("cwd", "git_branch", "git_commit", "python_version", "node_version"):
        old_val = getattr(old, field_name)
        new_val = getattr(new, field_name)
        if old_val != new_val:
            changed[field_name] = (old_val, new_val)

    new_vars = {k: v for k, v in new.env_vars.items() if k not in old.env_vars}
    removed_vars = [k for k in old.env_vars if k not in new.env_vars]

    return EnvironmentDelta(
        changed_fields=changed,
        new_env_vars=new_vars,
        removed_env_vars=removed_vars,
    )


# ── Worktree Isolation ───────────────────────────────────────


@dataclass
class WorktreeInfo:
    """Information about an isolated git worktree."""

    path: str
    branch: str
    task_id: str
    created: bool = False


def create_worktree(
    repo_dir: str | Path,
    task_id: str,
    base_branch: str = "HEAD",
    worktree_root: str | Path | None = None,
) -> WorktreeInfo:
    """Create an isolated git worktree for a task.

    Each task gets its own worktree so agents can work in parallel
    without file collisions.
    """
    repo = Path(repo_dir)
    if not (repo / ".git").exists():
        raise ValueError(f"Not a git repository: {repo}")

    root = Path(worktree_root) if worktree_root else Path(tempfile.mkdtemp(prefix="cogentrex-wt-"))
    wt_path = root / task_id
    branch_name = f"task/{task_id}"

    try:
        subprocess.run(
            ["git", "worktree", "add", "-b", branch_name, str(wt_path), base_branch],
            cwd=str(repo),
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
        return WorktreeInfo(
            path=str(wt_path),
            branch=branch_name,
            task_id=task_id,
            created=True,
        )
    except subprocess.CalledProcessError as exc:
        logger.warning(
            "worktree_create_failed",
            task_id=task_id,
            stderr=exc.stderr,
        )
        raise ValueError(f"Failed to create worktree: {exc.stderr}") from exc
    except subprocess.TimeoutExpired as exc:
        raise ValueError("Worktree creation timed out") from exc


def remove_worktree(repo_dir: str | Path, worktree_path: str | Path) -> bool:
    """Remove a git worktree and its branch."""
    try:
        subprocess.run(
            ["git", "worktree", "remove", "--force", str(worktree_path)],
            cwd=str(repo_dir),
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False


# ── SYSTEM.md Generation ─────────────────────────────────────


def generate_system_md(
    cwd: str | Path | None = None,
) -> str:
    """Generate a SYSTEM.md environment self-description.

    Users can declare their runtime environment in this file
    so agents understand the execution context.
    """
    env = capture_environment(cwd)
    lines = [
        "# SYSTEM.md — Environment Self-Description",
        "",
        "This file describes the runtime environment for AI agent sessions.",
        "",
        f"- **Working directory:** `{env.cwd}`",
        f"- **Git branch:** `{env.git_branch}`",
        f"- **Git commit:** `{env.git_commit}`",
        f"- **Python:** `{env.python_version}`",
        f"- **Node.js:** `{env.node_version}`",
        f"- **OS:** `{os.uname().sysname} {os.uname().release}`",
        f"- **Architecture:** `{os.uname().machine}`",
        "",
        "## Verification",
        "",
        "```bash",
        "./init.sh    # Full environment health check",
        "make test    # Run unit tests",
        "make lint    # Run linter",
        "```",
    ]
    return "\n".join(lines)


# ── Helpers ──────────────────────────────────────────────────


def _run_git(cwd: str, *args: str) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.stdout.strip() if result.returncode == 0 else ""
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ""


def _run_cmd(*args: str) -> str:
    try:
        result = subprocess.run(
            list(args),
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.stdout.strip() if result.returncode == 0 else ""
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ""

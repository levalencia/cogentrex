"""Tests for environment tracking and worktree isolation."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

from app.services.environment import (
    EnvironmentSnapshot,
    capture_environment,
    compute_delta,
    create_worktree,
    generate_system_md,
    remove_worktree,
)


@pytest.mark.unit
class TestCaptureEnvironment:
    def test_captures_cwd(self) -> None:
        snap = capture_environment()
        assert snap.cwd == os.getcwd()

    def test_captures_python_version(self) -> None:
        snap = capture_environment()
        assert (
            "Python" in snap.python_version
            or "python" in snap.python_version.lower()
            or snap.python_version == ""
        )

    def test_custom_cwd(self, tmp_path: Path) -> None:
        snap = capture_environment(cwd=tmp_path)
        assert snap.cwd == str(tmp_path)

    def test_env_vars_excluded_by_default(self) -> None:
        snap = capture_environment()
        assert snap.env_vars == {}

    def test_env_vars_included_when_requested(self) -> None:
        snap = capture_environment(include_env_vars=True)
        assert len(snap.env_vars) > 0

    def test_env_var_prefix_filter(self) -> None:
        os.environ["COGENTREX_TEST_VAR"] = "test_value"
        try:
            snap = capture_environment(include_env_vars=True, env_var_prefix="COGENTREX_")
            assert "COGENTREX_TEST_VAR" in snap.env_vars
            # Should not include unrelated vars
            non_prefixed = [k for k in snap.env_vars if not k.startswith("COGENTREX_")]
            assert len(non_prefixed) == 0
        finally:
            del os.environ["COGENTREX_TEST_VAR"]


@pytest.mark.unit
class TestComputeDelta:
    def test_no_changes(self) -> None:
        snap = EnvironmentSnapshot(
            cwd="/test",
            git_branch="main",
            git_commit="abc",
            python_version="3.11",
            node_version="22",
        )
        delta = compute_delta(snap, snap)
        assert not delta.has_changes

    def test_detects_branch_change(self) -> None:
        old = EnvironmentSnapshot(
            cwd="/test",
            git_branch="main",
            git_commit="abc",
            python_version="3.11",
            node_version="22",
        )
        new = EnvironmentSnapshot(
            cwd="/test",
            git_branch="feature",
            git_commit="def",
            python_version="3.11",
            node_version="22",
        )
        delta = compute_delta(old, new)
        assert delta.has_changes
        assert "git_branch" in delta.changed_fields
        assert delta.changed_fields["git_branch"] == ("main", "feature")

    def test_detects_new_env_vars(self) -> None:
        old = EnvironmentSnapshot(
            cwd="/test",
            git_branch="main",
            git_commit="abc",
            python_version="3.11",
            node_version="22",
            env_vars={"A": "1"},
        )
        new = EnvironmentSnapshot(
            cwd="/test",
            git_branch="main",
            git_commit="abc",
            python_version="3.11",
            node_version="22",
            env_vars={"A": "1", "B": "2"},
        )
        delta = compute_delta(old, new)
        assert delta.has_changes
        assert delta.new_env_vars == {"B": "2"}

    def test_detects_removed_env_vars(self) -> None:
        old = EnvironmentSnapshot(
            cwd="/test",
            git_branch="main",
            git_commit="abc",
            python_version="3.11",
            node_version="22",
            env_vars={"A": "1", "B": "2"},
        )
        new = EnvironmentSnapshot(
            cwd="/test",
            git_branch="main",
            git_commit="abc",
            python_version="3.11",
            node_version="22",
            env_vars={"A": "1"},
        )
        delta = compute_delta(old, new)
        assert delta.has_changes
        assert "B" in delta.removed_env_vars


@pytest.mark.unit
class TestWorktreeIsolation:
    def test_create_worktree_in_git_repo(self, tmp_path: Path) -> None:
        # Create a minimal git repo
        repo = tmp_path / "repo"
        repo.mkdir()
        subprocess.run(["git", "init"], cwd=str(repo), capture_output=True)
        subprocess.run(
            ["git", "commit", "--allow-empty", "-m", "init"],
            cwd=str(repo),
            capture_output=True,
            env={
                **os.environ,
                "GIT_AUTHOR_NAME": "test",
                "GIT_AUTHOR_EMAIL": "t@t",
                "GIT_COMMITTER_NAME": "test",
                "GIT_COMMITTER_EMAIL": "t@t",
            },
        )

        wt_root = tmp_path / "worktrees"
        wt_root.mkdir()
        info = create_worktree(repo, "test-task", worktree_root=wt_root)
        assert info.created is True
        assert info.task_id == "test-task"
        assert Path(info.path).exists()
        assert info.branch == "task/test-task"

        # Cleanup
        removed = remove_worktree(repo, info.path)
        assert removed is True

    def test_create_rejects_non_repo(self, tmp_path: Path) -> None:
        with pytest.raises(ValueError, match="Not a git repository"):
            create_worktree(tmp_path, "task1")


@pytest.mark.unit
class TestGenerateSystemMd:
    def test_generates_markdown(self) -> None:
        md = generate_system_md()
        assert "# SYSTEM.md" in md
        assert "Working directory" in md
        assert "Verification" in md
        assert "./init.sh" in md

    def test_includes_os_info(self) -> None:
        md = generate_system_md()
        assert "OS" in md
        assert "Architecture" in md

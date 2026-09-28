"""Tests for session artifact persistence."""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from app.services.session_artifacts import (
    ProgressEntry,
    SessionArtifactPersistence,
)


@pytest.fixture()
def artifacts(tmp_path: Path) -> SessionArtifactPersistence:
    return SessionArtifactPersistence(tmp_path)


@pytest.mark.unit
class TestProgressMd:
    def test_append_creates_file(self, artifacts: SessionArtifactPersistence) -> None:
        entry = ProgressEntry(
            timestamp=time.time(),
            goal="Implement hooks",
            completed=["HookRegistry", "builtin hooks"],
            blocked=[],
            next_steps=["Write tests"],
        )
        path = artifacts.append_progress(entry)
        assert path.is_file()
        content = path.read_text()
        assert "Implement hooks" in content
        assert "HookRegistry" in content

    def test_append_multiple(self, artifacts: SessionArtifactPersistence) -> None:
        for i in range(3):
            artifacts.append_progress(
                ProgressEntry(
                    timestamp=time.time(),
                    goal=f"Goal {i}",
                    completed=[f"item {i}"],
                    blocked=[],
                    next_steps=["next"],
                )
            )
        content = artifacts.read_progress()
        assert "Goal 0" in content
        assert "Goal 2" in content

    def test_read_empty(self, artifacts: SessionArtifactPersistence) -> None:
        assert artifacts.read_progress() == ""


@pytest.mark.unit
class TestLessonsMd:
    def test_append_lesson(self, artifacts: SessionArtifactPersistence) -> None:
        path = artifacts.append_lesson(
            "Lossless compaction should always run before lossy",
            source="context-compaction development",
        )
        assert path.is_file()
        content = path.read_text()
        assert "Lossless compaction" in content
        assert "context-compaction" in content

    def test_read_empty(self, artifacts: SessionArtifactPersistence) -> None:
        assert artifacts.read_lessons() == ""


@pytest.mark.unit
class TestVisionMd:
    def test_write_and_read(self, artifacts: SessionArtifactPersistence) -> None:
        artifacts.write_vision("# Vision\n\nBuild agents you can explain.")
        content = artifacts.read_vision()
        assert "Build agents you can explain" in content

    def test_overwrite(self, artifacts: SessionArtifactPersistence) -> None:
        artifacts.write_vision("v1")
        artifacts.write_vision("v2")
        assert artifacts.read_vision() == "v2"

    def test_read_empty(self, artifacts: SessionArtifactPersistence) -> None:
        assert artifacts.read_vision() == ""


@pytest.mark.unit
class TestSidechainStorage:
    def test_create_sidechain(self, artifacts: SessionArtifactPersistence) -> None:
        path = artifacts.create_sidechain("verifier-001")
        assert path.is_dir()

    def test_write_and_read_history(self, artifacts: SessionArtifactPersistence) -> None:
        msgs = [
            {"role": "user", "content": "Check this claim"},
            {"role": "assistant", "content": "Claim is supported"},
        ]
        artifacts.write_sidechain_history("v1", msgs)
        read_back = artifacts.read_sidechain_history("v1")
        assert len(read_back) == 2
        assert read_back[0]["content"] == "Check this claim"

    def test_read_nonexistent(self, artifacts: SessionArtifactPersistence) -> None:
        assert artifacts.read_sidechain_history("ghost") == []

    def test_append_to_existing(self, artifacts: SessionArtifactPersistence) -> None:
        artifacts.write_sidechain_history("v1", [{"role": "user", "content": "a"}])
        artifacts.write_sidechain_history("v1", [{"role": "assistant", "content": "b"}])
        history = artifacts.read_sidechain_history("v1")
        assert len(history) == 2


@pytest.mark.unit
class TestCodeCheckpointing:
    def test_checkpoint_and_restore(
        self, artifacts: SessionArtifactPersistence, tmp_path: Path
    ) -> None:
        # Create a file to checkpoint
        source = tmp_path / "main.py"
        source.write_text("version = 1")
        # Checkpoint
        cp_path = artifacts.checkpoint_file(source, "cp1")
        assert cp_path.is_file()
        # Modify original
        source.write_text("version = 2")
        assert source.read_text() == "version = 2"
        # Restore
        assert artifacts.restore_checkpoint(source, "cp1") is True
        assert source.read_text() == "version = 1"

    def test_restore_nonexistent(
        self, artifacts: SessionArtifactPersistence, tmp_path: Path
    ) -> None:
        source = tmp_path / "main.py"
        source.write_text("v1")
        assert artifacts.restore_checkpoint(source, "nonexistent") is False

    def test_checkpoint_nonexistent_file(self, artifacts: SessionArtifactPersistence) -> None:
        with pytest.raises(FileNotFoundError):
            artifacts.checkpoint_file("/nonexistent/file.py", "cp1")

    def test_list_checkpoints(self, artifacts: SessionArtifactPersistence, tmp_path: Path) -> None:
        source = tmp_path / "file.py"
        source.write_text("v1")
        artifacts.checkpoint_file(source, "cp-alpha")
        artifacts.checkpoint_file(source, "cp-beta")
        cps = artifacts.list_checkpoints()
        assert "cp-alpha" in cps
        assert "cp-beta" in cps

    def test_list_empty(self, artifacts: SessionArtifactPersistence) -> None:
        assert artifacts.list_checkpoints() == []

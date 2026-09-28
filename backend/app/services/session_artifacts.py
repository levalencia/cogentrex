"""Session artifact persistence — PROGRESS.md, LESSONS.md, VISION.md.

Implements frontier state mechanisms:
- PROGRESS.md rolling entries (PI community)
- LESSONS.md extraction (PI community)
- VISION.md / STANDARDS.md persistence (PI community)
- Sidechain file storage for sub-agents (CC)
- Code state checkpointing (PI)
"""

from __future__ import annotations

import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()


@dataclass
class ProgressEntry:
    """A single PROGRESS.md entry."""

    timestamp: float
    goal: str
    completed: list[str]
    blocked: list[str]
    next_steps: list[str]
    evidence: list[str] = field(default_factory=list)


class SessionArtifactPersistence:
    """Manages persistent session artifacts on disk.

    All artifacts live in a `.cogentrex/` directory at the repo root.
    """

    def __init__(self, repo_root: str | Path) -> None:
        self._root = Path(repo_root)
        self._artifact_dir = self._root / ".cogentrex"
        self._artifact_dir.mkdir(parents=True, exist_ok=True)

    # ── PROGRESS.md ──────────────────────────────────────────

    def append_progress(self, entry: ProgressEntry) -> Path:
        """Append a progress entry to PROGRESS.md."""
        path = self._artifact_dir / "PROGRESS.md"
        ts = time.strftime("%Y-%m-%d %H:%M", time.localtime(entry.timestamp))
        lines = [
            f"\n## {ts} — {entry.goal}\n",
            "\n**Completed:**\n",
        ]
        for item in entry.completed:
            lines.append(f"- [x] {item}\n")
        if entry.blocked:
            lines.append("\n**Blocked:**\n")
            for item in entry.blocked:
                lines.append(f"- {item}\n")
        lines.append("\n**Next steps:**\n")
        for item in entry.next_steps:
            lines.append(f"- [ ] {item}\n")
        if entry.evidence:
            lines.append("\n**Evidence:**\n")
            for item in entry.evidence:
                lines.append(f"- {item}\n")

        if not path.exists():
            with path.open("w") as f:
                f.write("# Progress Log\n\n> Rolling session progress.\n")
        with path.open("a") as f:
            f.writelines(lines)
        return path

    def read_progress(self) -> str:
        """Read the current PROGRESS.md content."""
        path = self._artifact_dir / "PROGRESS.md"
        if path.is_file():
            return path.read_text(encoding="utf-8")
        return ""

    # ── LESSONS.md ───────────────────────────────────────────

    def append_lesson(self, lesson: str, source: str = "") -> Path:
        """Append a lesson learned to LESSONS.md."""
        path = self._artifact_dir / "LESSONS.md"
        if not path.exists():
            with path.open("w") as f:
                f.write("# Lessons Learned\n\n> Extracted from agent sessions.\n")
        ts = time.strftime("%Y-%m-%d", time.localtime())
        with path.open("a") as f:
            f.write(f"\n- **{ts}:** {lesson}")
            if source:
                f.write(f" _(from: {source})_")
            f.write("\n")
        return path

    def read_lessons(self) -> str:
        path = self._artifact_dir / "LESSONS.md"
        if path.is_file():
            return path.read_text(encoding="utf-8")
        return ""

    # ── VISION.md ────────────────────────────────────────────

    def write_vision(self, content: str) -> Path:
        """Write or update VISION.md (project goals and standards)."""
        path = self._artifact_dir / "VISION.md"
        path.write_text(content, encoding="utf-8")
        return path

    def read_vision(self) -> str:
        path = self._artifact_dir / "VISION.md"
        if path.is_file():
            return path.read_text(encoding="utf-8")
        return ""

    # ── Sidechain Storage ────────────────────────────────────

    def create_sidechain(self, agent_id: str) -> Path:
        """Create a sidechain directory for a sub-agent's history.

        Implements sidechain file storage (CC).
        """
        sidechain = self._artifact_dir / "sidechains" / agent_id
        sidechain.mkdir(parents=True, exist_ok=True)
        return sidechain

    def write_sidechain_history(self, agent_id: str, messages: list[dict[str, Any]]) -> Path:
        """Write sub-agent conversation to sidechain file."""
        import json

        sidechain = self.create_sidechain(agent_id)
        history_file = sidechain / "history.jsonl"
        with history_file.open("a") as f:
            for msg in messages:
                f.write(json.dumps(msg, ensure_ascii=False) + "\n")
        return history_file

    def read_sidechain_history(self, agent_id: str) -> list[dict[str, Any]]:
        """Read a sub-agent's sidechain history."""
        import json

        history_file = self._artifact_dir / "sidechains" / agent_id / "history.jsonl"
        if not history_file.is_file():
            return []
        messages = []
        for line in history_file.read_text().strip().split("\n"):
            if line:
                messages.append(json.loads(line))
        return messages

    # ── Code State Checkpointing ─────────────────────────────

    def checkpoint_file(self, file_path: str | Path, checkpoint_id: str) -> Path:
        """Checkpoint a file's current state for rollback.

        Implements code state checkpointing (PI).
        """
        source = Path(file_path)
        if not source.is_file():
            raise FileNotFoundError(f"Cannot checkpoint: {file_path}")
        checkpoint_dir = self._artifact_dir / "checkpoints" / checkpoint_id
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        dest = checkpoint_dir / source.name
        shutil.copy2(source, dest)
        return dest

    def restore_checkpoint(self, file_path: str | Path, checkpoint_id: str) -> bool:
        """Restore a file from a checkpoint."""
        target = Path(file_path)
        checkpoint = self._artifact_dir / "checkpoints" / checkpoint_id / target.name
        if not checkpoint.is_file():
            return False
        shutil.copy2(checkpoint, target)
        return True

    def list_checkpoints(self) -> list[str]:
        """List all checkpoint IDs."""
        checkpoint_root = self._artifact_dir / "checkpoints"
        if not checkpoint_root.is_dir():
            return []
        return sorted(d.name for d in checkpoint_root.iterdir() if d.is_dir())

"""Instruction loading extensions for frontier harness compatibility.

Implements:
- CLAUDE.md compatibility — load both AGENTS.md and CLAUDE.md formats (PI)
- Subdirectory on-demand loading — instructions in subdirs loaded on access (CC)
- Auto memory from corrections — agent proactively writes notes from user corrections (CC, MP)
- Auto memory bounded — hard cap on auto-memory per session (CC, MP)
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path

import structlog

logger = structlog.get_logger()

# Supported instruction file names, in priority order
INSTRUCTION_FILE_NAMES: list[str] = [
    "AGENTS.md",
    "CLAUDE.md",
    ".cursorrules",
    "COPILOT.md",
]


def find_instruction_file(directory: str | Path) -> Path | None:
    """Find the first matching instruction file in a directory.

    Searches AGENTS.md, CLAUDE.md, .cursorrules, COPILOT.md in priority order.
    Implements CLAUDE.md compatibility (PI).
    """
    d = Path(directory)
    for name in INSTRUCTION_FILE_NAMES:
        candidate = d / name
        if candidate.is_file():
            return candidate
    return None


def load_instruction_hierarchy(
    repo_root: str | Path,
    current_dir: str | Path | None = None,
) -> list[tuple[str, str]]:
    """Load instructions from repo root down to current directory.

    Implements hierarchical AGENTS.md loading (PI) and
    subdirectory on-demand loading (CC).

    Returns list of (path, content) tuples from root to deepest match.
    """
    root = Path(repo_root).resolve()
    results: list[tuple[str, str]] = []

    # Always load root instruction
    root_file = find_instruction_file(root)
    if root_file:
        results.append((str(root_file.relative_to(root)), root_file.read_text(encoding="utf-8")))

    # Walk from root to current_dir, loading any instruction files found
    if current_dir:
        target = Path(current_dir).resolve()
        if target.is_relative_to(root) and target != root:
            relative = target.relative_to(root)
            accumulated = root
            for part in relative.parts:
                accumulated = accumulated / part
                if accumulated.is_dir():
                    subdir_file = find_instruction_file(accumulated)
                    if subdir_file:
                        rel_path = str(subdir_file.relative_to(root))
                        if not any(p == rel_path for p, _ in results):
                            results.append((rel_path, subdir_file.read_text(encoding="utf-8")))

    return results


# ── Auto Memory ──────────────────────────────────────────────


@dataclass
class MemoryEntry:
    """A single auto-memory entry."""

    content: str
    source: str  # "correction", "preference", "environment"
    timestamp: float = 0.0

    def __post_init__(self) -> None:
        if not self.timestamp:
            self.timestamp = time.time()


@dataclass
class AutoMemory:
    """Bounded auto-memory that captures corrections and preferences.

    Implements:
    - Auto memory from corrections (CC, MP)
    - Auto memory bounded (CC, MP)
    """

    max_entries: int = 50
    max_total_chars: int = 25_000  # ~25KB cap like Claude Code's 200 lines
    entries: list[MemoryEntry] = field(default_factory=list)

    @property
    def total_chars(self) -> int:
        return sum(len(e.content) for e in self.entries)

    @property
    def count(self) -> int:
        return len(self.entries)

    def add(self, content: str, source: str = "correction") -> bool:
        """Add a memory entry. Returns False if rejected (budget exceeded)."""
        if not content.strip():
            return False
        if self.count >= self.max_entries:
            # Evict oldest
            self.entries.pop(0)
        if self.total_chars + len(content) > self.max_total_chars:
            # Evict oldest until space available
            while self.entries and self.total_chars + len(content) > self.max_total_chars:
                self.entries.pop(0)
            if self.total_chars + len(content) > self.max_total_chars:
                return False  # single entry too large
        self.entries.append(MemoryEntry(content=content, source=source))
        return True

    def search(self, query: str) -> list[MemoryEntry]:
        """Simple keyword search over memory entries."""
        terms = query.lower().split()
        return [e for e in self.entries if any(t in e.content.lower() for t in terms)]

    def render_for_context(self) -> str:
        """Render memory entries as a context block for the model."""
        if not self.entries:
            return ""
        lines = ["[AUTO-MEMORY — corrections and preferences from this session]"]
        for e in self.entries:
            lines.append(f"- [{e.source}] {e.content}")
        lines.append("[END AUTO-MEMORY]")
        return "\n".join(lines)

    def clear(self) -> int:
        """Clear all entries. Returns count cleared."""
        count = len(self.entries)
        self.entries.clear()
        return count

    def detect_correction(self, user_message: str, assistant_response: str = "") -> str | None:
        """Detect if a user message contains a correction to remember.

        In frontier harnesses (Claude Code), the MODEL decides what to remember —
        not hardcoded regex patterns. This method provides the signal to the model
        by returning a structured prompt that asks the LLM to extract memories.

        The caller should pass the returned prompt to the model and store
        the model's extracted memory via self.add().

        Returns a memory-extraction prompt, or None if the message is too short
        to contain a meaningful correction.
        """
        msg = user_message.strip()
        # Too short to contain a meaningful correction
        if len(msg) < 10:
            return None

        return (
            "The user just said the following. If it contains a correction, preference, "
            "convention, or fact that should be remembered for future sessions, extract "
            "it as a single concise declarative statement (e.g., 'User prefers dark theme'). "
            "If there is nothing worth remembering, respond with exactly 'NONE'.\n\n"
            f"User message: {msg}"
        )

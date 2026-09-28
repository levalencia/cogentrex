"""Tests for instruction loading extensions and auto-memory."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.instruction_extensions import (
    AutoMemory,
    find_instruction_file,
    load_instruction_hierarchy,
)


@pytest.mark.unit
class TestFindInstructionFile:
    def test_finds_agents_md(self, tmp_path: Path) -> None:
        (tmp_path / "AGENTS.md").write_text("# Instructions")
        result = find_instruction_file(tmp_path)
        assert result is not None
        assert result.name == "AGENTS.md"

    def test_finds_claude_md(self, tmp_path: Path) -> None:
        (tmp_path / "CLAUDE.md").write_text("# Claude")
        result = find_instruction_file(tmp_path)
        assert result is not None
        assert result.name == "CLAUDE.md"

    def test_agents_takes_priority_over_claude(self, tmp_path: Path) -> None:
        (tmp_path / "AGENTS.md").write_text("agents")
        (tmp_path / "CLAUDE.md").write_text("claude")
        result = find_instruction_file(tmp_path)
        assert result is not None
        assert result.name == "AGENTS.md"

    def test_finds_cursorrules(self, tmp_path: Path) -> None:
        (tmp_path / ".cursorrules").write_text("rules")
        result = find_instruction_file(tmp_path)
        assert result is not None
        assert result.name == ".cursorrules"

    def test_returns_none_when_no_file(self, tmp_path: Path) -> None:
        assert find_instruction_file(tmp_path) is None


@pytest.mark.unit
class TestLoadInstructionHierarchy:
    def test_loads_root_only(self, tmp_path: Path) -> None:
        (tmp_path / "AGENTS.md").write_text("root instructions")
        result = load_instruction_hierarchy(tmp_path)
        assert len(result) == 1
        assert result[0][0] == "AGENTS.md"

    def test_loads_root_and_subdir(self, tmp_path: Path) -> None:
        (tmp_path / "AGENTS.md").write_text("root")
        sub = tmp_path / "backend"
        sub.mkdir()
        (sub / "CLAUDE.md").write_text("backend rules")
        result = load_instruction_hierarchy(tmp_path, current_dir=sub)
        assert len(result) == 2
        assert result[0][0] == "AGENTS.md"
        assert result[1][0] == "backend/CLAUDE.md"

    def test_loads_deeply_nested(self, tmp_path: Path) -> None:
        (tmp_path / "AGENTS.md").write_text("root")
        deep = tmp_path / "src" / "app" / "tools"
        deep.mkdir(parents=True)
        (deep / "AGENTS.md").write_text("tool-specific rules")
        result = load_instruction_hierarchy(tmp_path, current_dir=deep)
        assert len(result) == 2

    def test_no_root_file(self, tmp_path: Path) -> None:
        result = load_instruction_hierarchy(tmp_path)
        assert len(result) == 0

    def test_current_dir_outside_repo(self, tmp_path: Path) -> None:
        (tmp_path / "AGENTS.md").write_text("root")
        result = load_instruction_hierarchy(tmp_path, current_dir="/tmp")
        assert len(result) == 1  # only root


@pytest.mark.unit
class TestAutoMemory:
    def test_add_and_count(self) -> None:
        mem = AutoMemory()
        assert mem.add("User prefers dark theme", "preference")
        assert mem.count == 1

    def test_rejects_empty(self) -> None:
        mem = AutoMemory()
        assert mem.add("   ", "correction") is False
        assert mem.count == 0

    def test_max_entries_eviction(self) -> None:
        mem = AutoMemory(max_entries=3)
        for i in range(5):
            mem.add(f"entry {i}", "correction")
        assert mem.count == 3
        # Oldest evicted
        assert "entry 0" not in mem.render_for_context()
        assert "entry 4" in mem.render_for_context()

    def test_max_chars_eviction(self) -> None:
        mem = AutoMemory(max_total_chars=100)
        mem.add("x" * 50, "correction")
        mem.add("y" * 50, "correction")
        assert mem.count == 2
        # Third entry should evict first
        mem.add("z" * 50, "correction")
        assert mem.count == 2

    def test_search(self) -> None:
        mem = AutoMemory()
        mem.add("Use dark theme always", "preference")
        mem.add("Never commit secrets", "correction")
        results = mem.search("dark")
        assert len(results) == 1
        assert "dark" in results[0].content

    def test_render_for_context(self) -> None:
        mem = AutoMemory()
        mem.add("Prefers concise responses", "preference")
        rendered = mem.render_for_context()
        assert "AUTO-MEMORY" in rendered
        assert "Prefers concise" in rendered

    def test_render_empty(self) -> None:
        mem = AutoMemory()
        assert mem.render_for_context() == ""

    def test_clear(self) -> None:
        mem = AutoMemory()
        mem.add("test", "correction")
        assert mem.clear() == 1
        assert mem.count == 0

    def test_detect_correction_returns_prompt_for_long_message(self) -> None:
        mem = AutoMemory()
        result = mem.detect_correction("Remember that I use Python 3.11 always")
        assert result is not None
        assert "User message:" in result
        assert "Python 3.11" in result
        assert "correction, preference" in result

    def test_detect_correction_returns_none_for_short(self) -> None:
        mem = AutoMemory()
        result = mem.detect_correction("hi")
        assert result is None

    def test_detect_correction_returns_prompt_for_preference(self) -> None:
        mem = AutoMemory()
        result = mem.detect_correction("I prefer dark mode for all interfaces")
        assert result is not None
        assert "dark mode" in result

    def test_detect_returns_none_for_empty(self) -> None:
        mem = AutoMemory()
        assert mem.detect_correction("   ") is None

    def test_detect_prompt_asks_for_declarative_statement(self) -> None:
        mem = AutoMemory()
        result = mem.detect_correction("Always use Mermaid for diagrams, never ASCII")
        assert result is not None
        assert "declarative statement" in result
        assert "NONE" in result  # model should respond NONE if nothing to remember

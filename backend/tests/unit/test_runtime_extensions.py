"""Tests for runtime invariant enforcement, two-phase eviction, and skill validation."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.runtime_extensions import (
    TwoPhaseEvictor,
    check_context_log_invariant,
    validate_skill_structure,
)


@pytest.mark.unit
class TestContextLogInvariant:
    def test_valid_when_all_logged(self) -> None:
        context = [
            {"role": "system", "content": "prompt"},
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ]
        events = [
            {"kind": "run_started", "data": {"content": "hello"}},
            {"kind": "model_response", "data": {"content": "hi"}},
        ]
        result = check_context_log_invariant(context, events)
        assert result.valid is True

    def test_invalid_missing_model_response(self) -> None:
        context = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ]
        events = [
            {"kind": "run_started", "data": {}},
            # Missing model_response
        ]
        result = check_context_log_invariant(context, events)
        assert result.valid is False
        assert "model_response" in result.divergence_details

    def test_valid_with_tool_messages(self) -> None:
        context = [
            {"role": "user", "content": "search"},
            {"role": "assistant", "content": "calling tool"},
            {"role": "tool", "content": "result"},
        ]
        events = [
            {"kind": "run_started", "data": {}},
            {"kind": "model_response", "data": {}},
            {"kind": "tool_call_completed", "data": {"content": "result"}},
        ]
        result = check_context_log_invariant(context, events)
        assert result.valid is True

    def test_hashes_computed(self) -> None:
        result = check_context_log_invariant(
            [{"role": "user", "content": "test"}],
            [{"kind": "run_started", "data": {}}],
        )
        assert len(result.context_hash) == 16
        assert len(result.log_hash) == 16


@pytest.mark.unit
class TestTwoPhaseEvictor:
    def test_register_and_count(self) -> None:
        ev = TwoPhaseEvictor()
        ev.register("r1")
        ev.register("r2")
        assert ev.tracked_count == 2

    def test_phase1_marks_terminal(self) -> None:
        ev = TwoPhaseEvictor()
        ev.register("r1")
        assert ev.mark_terminal("r1") is True
        assert ev.terminal_count == 1

    def test_phase1_cleans_disk(self, tmp_path: Path) -> None:
        ev = TwoPhaseEvictor()
        disk_file = tmp_path / "output.txt"
        disk_file.write_text("task output")
        ev.register("r1", disk_path=str(disk_file))
        ev.mark_terminal("r1")
        assert not disk_file.exists()  # phase 1 cleaned disk

    def test_phase2_evicts_after_parent_notified(self) -> None:
        ev = TwoPhaseEvictor()
        ev.register("r1")
        ev.mark_terminal("r1")
        ev.notify_parent("r1")
        evicted = ev.evict_ready()
        assert "r1" in evicted
        assert ev.tracked_count == 0

    def test_not_evicted_without_parent_notification(self) -> None:
        ev = TwoPhaseEvictor()
        ev.register("r1")
        ev.mark_terminal("r1")
        evicted = ev.evict_ready()
        assert evicted == []
        assert ev.tracked_count == 1  # still tracked

    def test_not_evicted_without_terminal(self) -> None:
        ev = TwoPhaseEvictor()
        ev.register("r1")
        ev.notify_parent("r1")
        evicted = ev.evict_ready()
        assert evicted == []

    def test_unknown_resource(self) -> None:
        ev = TwoPhaseEvictor()
        assert ev.mark_terminal("ghost") is False
        assert ev.notify_parent("ghost") is False


@pytest.mark.unit
class TestSkillValidation:
    def test_valid_skill(self, tmp_path: Path) -> None:
        skill = tmp_path / "my-skill"
        skill.mkdir()
        (skill / "SKILL.md").write_text("# My Skill")
        (skill / "references").mkdir()
        (skill / "references" / "checklist.md").write_text("- item 1")
        issues = validate_skill_structure(str(skill))
        assert issues == []

    def test_missing_skill_md(self, tmp_path: Path) -> None:
        skill = tmp_path / "bad-skill"
        skill.mkdir()
        issues = validate_skill_structure(str(skill))
        assert any("Missing SKILL.md" in i for i in issues)

    def test_templates_validated(self, tmp_path: Path) -> None:
        skill = tmp_path / "skill"
        skill.mkdir()
        (skill / "SKILL.md").write_text("# Skill")
        (skill / "templates").mkdir()
        (skill / "templates" / "empty.md").write_text("")  # empty = issue
        (skill / "templates" / "good.md").write_text("content")
        issues = validate_skill_structure(str(skill))
        assert any("Empty template" in i for i in issues)

    def test_evals_validated(self, tmp_path: Path) -> None:
        skill = tmp_path / "skill"
        skill.mkdir()
        (skill / "SKILL.md").write_text("# Skill")
        (skill / "evals").mkdir()
        (skill / "evals" / "test_quality.py").write_text("# test")
        (skill / "evals" / "rubric.yaml").write_text("rubric: true")
        (skill / "evals" / "weird.exe").write_text("")  # bad type
        issues = validate_skill_structure(str(skill))
        assert any("Unexpected eval file" in i for i in issues)

    def test_unrecognized_subdirectory(self, tmp_path: Path) -> None:
        skill = tmp_path / "skill"
        skill.mkdir()
        (skill / "SKILL.md").write_text("# Skill")
        (skill / "random_dir").mkdir()
        issues = validate_skill_structure(str(skill))
        assert any("Unrecognized" in i for i in issues)

    def test_all_recognized_subdirs_ok(self, tmp_path: Path) -> None:
        skill = tmp_path / "skill"
        skill.mkdir()
        (skill / "SKILL.md").write_text("# Skill")
        for d in ["references", "templates", "scripts", "assets", "evals"]:
            (skill / d).mkdir()
        issues = validate_skill_structure(str(skill))
        assert issues == []

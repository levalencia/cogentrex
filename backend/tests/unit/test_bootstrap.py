"""Tests for four-stage bootstrap and local instruction loading."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.bootstrap import (
    BootstrapManager,
    BootstrapStage,
    StageResult,
    TrustLevel,
    load_local_instructions,
)


@pytest.mark.unit
class TestBootstrapManager:
    @pytest.mark.asyncio
    async def test_full_bootstrap_with_trust(self) -> None:
        mgr = BootstrapManager()
        state = await mgr.bootstrap(trust_decision=TrustLevel.TRUSTED)
        assert state.is_fully_bootstrapped
        assert state.trust_level == TrustLevel.TRUSTED
        assert not state.safe_mode
        assert state.available_tools_mode == "full"

    @pytest.mark.asyncio
    async def test_untrusted_stops_at_trust_boundary(self) -> None:
        mgr = BootstrapManager()
        state = await mgr.bootstrap()  # no trust decision
        assert not state.is_fully_bootstrapped
        assert state.safe_mode is True
        assert state.available_tools_mode == "read_only"

    @pytest.mark.asyncio
    async def test_memoized_stages_not_rerun(self) -> None:
        mgr = BootstrapManager()
        await mgr.bootstrap(trust_decision=TrustLevel.TRUSTED)
        # Bootstrap again — completed stages should be skipped
        call_count = [0]

        def counting_handler(stage):
            call_count[0] += 1
            return StageResult(stage=stage, success=True, duration_seconds=0)

        mgr.register_stage_handler(BootstrapStage.MINIMAL, counting_handler)
        await mgr.bootstrap(trust_decision=TrustLevel.TRUSTED)
        assert call_count[0] == 0  # MINIMAL already completed, not re-run

    @pytest.mark.asyncio
    async def test_stage_failure_enters_safe_mode(self) -> None:
        mgr = BootstrapManager()

        def failing_handler(stage):
            return StageResult(stage=stage, success=False, duration_seconds=0, message="broken")

        mgr.register_stage_handler(BootstrapStage.READ_ONLY_TOOLS, failing_handler)
        state = await mgr.bootstrap(trust_decision=TrustLevel.TRUSTED)
        assert state.safe_mode is True
        assert len(state.errors) == 1
        assert state.errors[0][1] == "broken"

    @pytest.mark.asyncio
    async def test_consent_recorded(self) -> None:
        mgr = BootstrapManager()
        state = await mgr.bootstrap(trust_decision=TrustLevel.ELEVATED)
        assert state.consent_recorded is True
        assert state.consent_timestamp is not None
        assert state.trust_level == TrustLevel.ELEVATED

    @pytest.mark.asyncio
    async def test_stage_durations_tracked(self) -> None:
        mgr = BootstrapManager()
        state = await mgr.bootstrap(trust_decision=TrustLevel.TRUSTED)
        assert len(state.stage_durations) == 4
        assert all(d >= 0 for d in state.stage_durations.values())

    @pytest.mark.asyncio
    async def test_reset_clears_state(self) -> None:
        mgr = BootstrapManager()
        await mgr.bootstrap(trust_decision=TrustLevel.TRUSTED)
        mgr.reset()
        assert mgr.state.current_stage == BootstrapStage.MINIMAL
        assert mgr.state.completed_stages == set()

    @pytest.mark.asyncio
    async def test_custom_stage_handler(self) -> None:
        mgr = BootstrapManager()
        custom_called = [False]

        async def custom_handler(stage):
            custom_called[0] = True
            return StageResult(stage=stage, success=True, duration_seconds=0.01)

        mgr.register_stage_handler(BootstrapStage.MINIMAL, custom_handler)
        await mgr.bootstrap(trust_decision=TrustLevel.TRUSTED)
        assert custom_called[0] is True

    @pytest.mark.asyncio
    async def test_handler_exception_enters_safe_mode(self) -> None:
        mgr = BootstrapManager()

        def exploding_handler(stage):
            raise RuntimeError("kaboom")

        mgr.register_stage_handler(BootstrapStage.MINIMAL, exploding_handler)
        state = await mgr.bootstrap(trust_decision=TrustLevel.TRUSTED)
        assert state.safe_mode is True
        assert "kaboom" in state.errors[0][1]


@pytest.mark.unit
class TestLocalInstructions:
    def test_loads_existing_file(self, tmp_path: Path) -> None:
        local_md = tmp_path / ".local.md"
        local_md.write_text("# My local preferences\nUse dark theme.")
        content = load_local_instructions(tmp_path)
        assert content is not None
        assert "dark theme" in content

    def test_returns_none_when_missing(self, tmp_path: Path) -> None:
        content = load_local_instructions(tmp_path)
        assert content is None

    def test_custom_filename(self, tmp_path: Path) -> None:
        custom = tmp_path / "my-prefs.md"
        custom.write_text("custom prefs")
        content = load_local_instructions(tmp_path, filename="my-prefs.md")
        assert content == "custom prefs"

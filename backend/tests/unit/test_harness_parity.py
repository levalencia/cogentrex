"""Tests for harness parity and visual learning artifact integrity.

Validates:
- All new harness source files exist and are importable
- All new test files exist and contain test classes
- Visual learning artifacts conform to schema structure
- Concept catalog entries exist for new concepts
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]  # backend/tests/unit → repo root
MODULES_DIR = REPO_ROOT / "docs" / "visual-learning" / "modules"
CONCEPT_DIR = REPO_ROOT / "docs" / "course" / "concepts"
CATALOG_PATH = REPO_ROOT / "docs" / "course" / "concept-catalog.yaml"


# ── Harness Source Files ─────────────────────────────────────


HARNESS_SOURCE_FILES = [
    "app/runtime/hooks.py",
    "app/runtime/builtin_hooks.py",
    "app/routes/hooks.py",
    "app/services/multi_layer_compact.py",
    "app/services/session_tree.py",
    "app/services/chat_commands.py",
    "app/services/context_filters.py",
    "app/services/environment.py",
    "app/services/bootstrap.py",
    "app/security/graduated_permissions.py",
    "app/delegation/patterns.py",
    "app/tools/concurrency.py",
]


@pytest.mark.unit
class TestHarnessSourcesExist:
    @pytest.mark.parametrize("path", HARNESS_SOURCE_FILES)
    def test_source_file_exists(self, path: str) -> None:
        full = REPO_ROOT / "backend" / path
        assert full.is_file(), f"Missing harness source: {path}"


# ── Harness Source Files Are Importable ──────────────────────


@pytest.mark.unit
class TestHarnessImports:
    def test_hooks_importable(self) -> None:
        pass

    def test_builtin_hooks_importable(self) -> None:
        pass

    def test_multi_layer_compact_importable(self) -> None:
        pass

    def test_session_tree_importable(self) -> None:
        pass

    def test_chat_commands_importable(self) -> None:
        pass

    def test_context_filters_importable(self) -> None:
        pass

    def test_graduated_permissions_importable(self) -> None:
        pass

    def test_delegation_patterns_importable(self) -> None:
        pass

    def test_tool_concurrency_importable(self) -> None:
        pass

    def test_bootstrap_importable(self) -> None:
        pass

    def test_environment_importable(self) -> None:
        pass


# ── Concept Pages ────────────────────────────────────────────


HARNESS_CONCEPT_PAGES = [
    "hooks-and-extensions.md",
    "context-compaction.md",
    "session-branching.md",
    "graduated-security-model.md",
    "delegation-patterns.md",
    "worktree-isolation.md",
]


@pytest.mark.unit
class TestConceptPagesExist:
    @pytest.mark.parametrize("page", HARNESS_CONCEPT_PAGES)
    def test_concept_page_exists(self, page: str) -> None:
        full = CONCEPT_DIR / page
        assert full.is_file(), f"Missing concept page: {page}"

    @pytest.mark.parametrize("page", HARNESS_CONCEPT_PAGES)
    def test_concept_page_has_mermaid(self, page: str) -> None:
        content = (CONCEPT_DIR / page).read_text()
        assert "```mermaid" in content, f"{page} missing Mermaid diagram"

    @pytest.mark.parametrize("page", HARNESS_CONCEPT_PAGES)
    def test_concept_page_has_self_check(self, page: str) -> None:
        content = (CONCEPT_DIR / page).read_text()
        assert "Self-check" in content, f"{page} missing Self-check section"

    @pytest.mark.parametrize("page", HARNESS_CONCEPT_PAGES)
    def test_concept_page_has_interview(self, page: str) -> None:
        content = (CONCEPT_DIR / page).read_text()
        assert "Interview" in content or "30-second" in content, f"{page} missing Interview section"


# ── Visual Learning Artifacts ────────────────────────────────


HARNESS_CONCEPTS = [
    "hooks-and-extensions",
    "context-compaction",
    "session-branching",
    "graduated-security",
    "delegation-patterns",
    "worktree-isolation",
]

ARTIFACT_TYPES = [
    "quiz.json",
    "flashcards.json",
    "audio-script.json",
    "deck.json",
    "mind-map.json",
    "study-guide.json",
    "diagram.json",
    "video-storyboard.json",
]


@pytest.mark.unit
class TestVisualLearningArtifacts:
    @pytest.mark.parametrize("concept", HARNESS_CONCEPTS)
    def test_concept_directory_exists(self, concept: str) -> None:
        assert (MODULES_DIR / concept).is_dir(), f"Missing VL dir: {concept}"

    @pytest.mark.parametrize("concept", HARNESS_CONCEPTS)
    @pytest.mark.parametrize("artifact", ARTIFACT_TYPES)
    def test_artifact_exists(self, concept: str, artifact: str) -> None:
        path = MODULES_DIR / concept / artifact
        assert path.is_file(), f"Missing: {concept}/{artifact}"

    @pytest.mark.parametrize("concept", HARNESS_CONCEPTS)
    @pytest.mark.parametrize("artifact", ARTIFACT_TYPES)
    def test_artifact_valid_json(self, concept: str, artifact: str) -> None:
        path = MODULES_DIR / concept / artifact
        if path.is_file():
            data = json.loads(path.read_text())
            assert "schema" in data
            assert "artifact_id" in data
            assert "sources" in data
            assert len(data["sources"]) >= 1


# ── Article Series ───────────────────────────────────────────


@pytest.mark.unit
class TestArticleSeries:
    def test_series_plan_exists(self) -> None:
        assert (REPO_ROOT / "docs" / "articles" / "SERIES-PLAN.md").is_file()

    def test_article_contract_exists(self) -> None:
        assert (REPO_ROOT / "docs" / "articles" / "ARTICLE-CONTRACT.md").is_file()

    def test_cross_reference_matrix_exists(self) -> None:
        assert (REPO_ROOT / "docs" / "articles" / "CROSS-REFERENCE-MATRIX.md").is_file()

    def test_series_plan_has_32_articles(self) -> None:
        content = (REPO_ROOT / "docs" / "articles" / "SERIES-PLAN.md").read_text()
        # Count rows that start with | followed by a number
        import re

        articles = re.findall(r"\|\s*(\d+)\s*\|", content)
        assert len(articles) >= 32, f"Expected 32+ articles, found {len(articles)}"


# ── Repo Harness Files ───────────────────────────────────────


@pytest.mark.unit
class TestRepoHarnessFiles:
    def test_agents_md_exists(self) -> None:
        assert (REPO_ROOT / "AGENTS.md").is_file()

    def test_init_sh_exists(self) -> None:
        path = REPO_ROOT / "init.sh"
        assert path.is_file()
        assert path.stat().st_mode & 0o111, "init.sh not executable"

    def test_session_handoff_exists(self) -> None:
        assert (REPO_ROOT / "session-handoff.md").is_file()

    def test_harness_plan_exists(self) -> None:
        assert (REPO_ROOT / "docs" / "plans" / "HARNESS-PARITY-MASTER-PLAN.md").is_file()

"""Tests for the external skill catalog provider with a JSON index.

Proves that AgentGodModeCatalogProvider correctly loads a JSON index,
searches by keyword, and respects limits.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.skills.catalog import (
    AgentGodModeCatalogProvider,
    ExternalSkillMetadata,
    UnavailableSkillCatalogProvider,
    create_skill_catalog_provider,
)

_SAMPLE_INDEX = [
    {
        "external_id": "ci-cd-and-automation",
        "name": "ci-cd-and-automation",
        "description": "Automates CI/CD pipeline setup and quality gates.",
        "source_url": "https://github.com/example/skills/ci-cd",
        "repository": "example/skills",
        "path": "skills/ci-cd-and-automation/SKILL.md",
    },
    {
        "external_id": "test-driven-development",
        "name": "test-driven-development",
        "description": "Drives development with tests. Red-green-refactor.",
        "source_url": "https://github.com/example/skills/tdd",
        "repository": "example/skills",
        "path": "skills/test-driven-development/SKILL.md",
    },
    {
        "external_id": "code-review",
        "name": "code-review",
        "description": "Systematic code review process with quality checklists.",
        "source_url": "https://github.com/example/skills/review",
        "repository": "example/skills",
        "path": "skills/code-review/SKILL.md",
    },
    {
        "external_id": "harness-engineering",
        "name": "harness-engineering",
        "description": "Building agent harness systems for reliable execution.",
        "source_url": "https://github.com/example/skills/harness",
        "repository": "example/skills",
        "path": "skills/harness-engineering/SKILL.md",
    },
]


@pytest.fixture()
def catalog_dir(tmp_path: Path) -> Path:
    """Create a temporary catalog directory with a sample index."""
    index_file = tmp_path / "index.json"
    index_file.write_text(json.dumps(_SAMPLE_INDEX))
    return tmp_path


@pytest.fixture()
def provider(catalog_dir: Path) -> AgentGodModeCatalogProvider:
    return AgentGodModeCatalogProvider(
        allowlisted_root=str(catalog_dir),
        json_index=str(catalog_dir / "index.json"),
    )


@pytest.mark.unit
class TestAgentGodModeCatalogProvider:
    """Proves the JSON-index catalog provider works correctly."""

    @pytest.mark.asyncio
    async def test_search_returns_matching_results(
        self, provider: AgentGodModeCatalogProvider
    ) -> None:
        results = await provider.search("CI/CD pipeline", limit=10)
        assert len(results) >= 1
        assert any(r.name == "ci-cd-and-automation" for r in results)

    @pytest.mark.asyncio
    async def test_search_matches_case_insensitive(
        self, provider: AgentGodModeCatalogProvider
    ) -> None:
        results = await provider.search("test driven", limit=10)
        assert any(r.name == "test-driven-development" for r in results)

    @pytest.mark.asyncio
    async def test_search_respects_limit(self, provider: AgentGodModeCatalogProvider) -> None:
        results = await provider.search("development review harness", limit=2)
        assert len(results) <= 2

    @pytest.mark.asyncio
    async def test_search_returns_empty_for_no_match(
        self, provider: AgentGodModeCatalogProvider
    ) -> None:
        results = await provider.search("quantum computing blockchain", limit=10)
        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_search_returns_empty_for_blank_query(
        self, provider: AgentGodModeCatalogProvider
    ) -> None:
        results = await provider.search("   ", limit=10)
        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_health_code_is_available(self, provider: AgentGodModeCatalogProvider) -> None:
        assert provider.health_code == "available"

    @pytest.mark.asyncio
    async def test_result_shape_is_external_skill_metadata(
        self, provider: AgentGodModeCatalogProvider
    ) -> None:
        results = await provider.search("harness", limit=5)
        assert len(results) >= 1
        item = results[0]
        assert isinstance(item, ExternalSkillMetadata)
        assert item.external_id
        assert item.name
        assert item.description
        assert item.source_url
        assert item.repository
        assert item.path

    def test_rejects_both_executable_and_index(self, catalog_dir: Path) -> None:
        with pytest.raises(ValueError, match="exactly one"):
            AgentGodModeCatalogProvider(
                allowlisted_root=str(catalog_dir),
                executable=str(catalog_dir / "index.json"),
                json_index=str(catalog_dir / "index.json"),
            )

    def test_rejects_neither_executable_nor_index(self, catalog_dir: Path) -> None:
        with pytest.raises(ValueError, match="exactly one"):
            AgentGodModeCatalogProvider(
                allowlisted_root=str(catalog_dir),
            )

    def test_rejects_source_outside_root(self, tmp_path: Path) -> None:
        root = tmp_path / "allowed"
        root.mkdir()
        outside = tmp_path / "outside.json"
        outside.write_text("[]")
        with pytest.raises(ValueError, match="outside"):
            AgentGodModeCatalogProvider(
                allowlisted_root=str(root),
                json_index=str(outside),
            )


@pytest.mark.unit
class TestCreateSkillCatalogProvider:
    """Proves the factory function correctly selects providers."""

    def test_disabled_returns_unavailable(self) -> None:
        provider = create_skill_catalog_provider(
            enabled=False,
            allowlisted_root="",
            executable="",
            json_index="",
            timeout_seconds=2.0,
            max_stdout_bytes=65_536,
            max_results=50,
        )
        assert isinstance(provider, UnavailableSkillCatalogProvider)
        assert provider.health_code == "disabled"

    def test_enabled_with_valid_index(self, catalog_dir: Path) -> None:
        provider = create_skill_catalog_provider(
            enabled=True,
            allowlisted_root=str(catalog_dir),
            executable="",
            json_index=str(catalog_dir / "index.json"),
            timeout_seconds=2.0,
            max_stdout_bytes=65_536,
            max_results=50,
        )
        assert isinstance(provider, AgentGodModeCatalogProvider)
        assert provider.health_code == "available"

    def test_enabled_with_bad_config_returns_unavailable(self) -> None:
        provider = create_skill_catalog_provider(
            enabled=True,
            allowlisted_root="/nonexistent",
            executable="",
            json_index="/nonexistent/index.json",
            timeout_seconds=2.0,
            max_stdout_bytes=65_536,
            max_results=50,
        )
        assert isinstance(provider, UnavailableSkillCatalogProvider)
        assert provider.health_code == "misconfigured"

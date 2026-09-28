"""Tests for hook management API routes."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.hooks import router
from app.runtime.events import NullEventSink
from app.runtime.hooks import HookRegistry


@pytest.fixture()
def app() -> FastAPI:
    test_app = FastAPI()
    test_app.include_router(router)
    test_app.state.hook_registry = HookRegistry(NullEventSink())
    return test_app


@pytest.fixture()
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


@pytest.mark.unit
class TestHookAPI:
    def test_register_builtin_hook(self, client: TestClient) -> None:
        resp = client.post(
            "/api/hooks",
            json={
                "hook_id": "guard-env",
                "hook_type": "protected_paths",
                "event_kind": "tool_call_requested",
                "phase": "before",
                "config": {"patterns": [".env", ".git/**"]},
                "description": "Block .env access",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["hook_id"] == "guard-env"
        assert data["event_kind"] == "tool_call_requested"
        assert data["phase"] == "before"

    def test_register_rejects_unknown_hook_type(self, client: TestClient) -> None:
        resp = client.post(
            "/api/hooks",
            json={
                "hook_id": "bad",
                "hook_type": "nonexistent",
                "event_kind": "tool_call_requested",
            },
        )
        assert resp.status_code == 400
        assert "Unknown hook type" in resp.json()["detail"]

    def test_register_rejects_unknown_event_kind(self, client: TestClient) -> None:
        resp = client.post(
            "/api/hooks",
            json={
                "hook_id": "bad",
                "hook_type": "protected_paths",
                "event_kind": "fake_event",
            },
        )
        assert resp.status_code == 400
        assert "Unknown event kind" in resp.json()["detail"]

    def test_register_rejects_duplicate_id(self, client: TestClient) -> None:
        payload = {
            "hook_id": "dup",
            "hook_type": "protected_paths",
            "event_kind": "tool_call_requested",
        }
        assert client.post("/api/hooks", json=payload).status_code == 201
        resp = client.post("/api/hooks", json=payload)
        assert resp.status_code == 409

    def test_list_hooks_empty(self, client: TestClient) -> None:
        resp = client.get("/api/hooks")
        assert resp.status_code == 200
        assert resp.json()["count"] == 0

    def test_list_hooks_after_register(self, client: TestClient) -> None:
        client.post(
            "/api/hooks",
            json={
                "hook_id": "h1",
                "hook_type": "stop_verification",
                "event_kind": "run_stopped",
                "phase": "before",
            },
        )
        resp = client.get("/api/hooks")
        assert resp.status_code == 200
        assert resp.json()["count"] == 1

    def test_list_hooks_filtered_by_event_kind(self, client: TestClient) -> None:
        client.post(
            "/api/hooks",
            json={
                "hook_id": "a",
                "hook_type": "protected_paths",
                "event_kind": "tool_call_requested",
            },
        )
        client.post(
            "/api/hooks",
            json={
                "hook_id": "b",
                "hook_type": "stop_verification",
                "event_kind": "run_stopped",
            },
        )
        resp = client.get("/api/hooks", params={"event_kind": "tool_call_requested"})
        assert resp.json()["count"] == 1
        assert resp.json()["hooks"][0]["hook_id"] == "a"

    def test_remove_hook(self, client: TestClient) -> None:
        client.post(
            "/api/hooks",
            json={
                "hook_id": "removeme",
                "hook_type": "protected_commands",
                "event_kind": "tool_call_requested",
            },
        )
        resp = client.delete("/api/hooks/removeme")
        assert resp.status_code == 200
        assert resp.json()["removed"] is True
        # Verify gone
        assert client.get("/api/hooks").json()["count"] == 0

    def test_remove_nonexistent_hook(self, client: TestClient) -> None:
        resp = client.delete("/api/hooks/ghost")
        assert resp.status_code == 404

    def test_clear_all_hooks(self, client: TestClient) -> None:
        for i in range(3):
            client.post(
                "/api/hooks",
                json={
                    "hook_id": f"h{i}",
                    "hook_type": "protected_paths",
                    "event_kind": "tool_call_requested",
                },
            )
        resp = client.delete("/api/hooks")
        assert resp.status_code == 200
        assert resp.json()["removed_count"] == 3
        assert client.get("/api/hooks").json()["count"] == 0

    def test_output_sanitizer_hook_type(self, client: TestClient) -> None:
        resp = client.post(
            "/api/hooks",
            json={
                "hook_id": "sanitize-keys",
                "hook_type": "output_sanitizer",
                "event_kind": "tool_call_completed",
                "phase": "after",
                "config": {
                    "patterns": [r"sk-[a-zA-Z0-9]+"],
                    "replacement": "[KEY]",
                },
            },
        )
        assert resp.status_code == 201

    def test_503_when_registry_not_initialized(self) -> None:
        bare_app = FastAPI()
        bare_app.include_router(router)
        # No hook_registry on app.state
        bare_client = TestClient(bare_app)
        resp = bare_client.get("/api/hooks")
        assert resp.status_code == 503

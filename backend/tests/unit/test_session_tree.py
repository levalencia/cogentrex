"""Tests for session branching and tree management."""

from __future__ import annotations

import pytest

from app.services.session_tree import BranchInfo, SessionTree


def _msg(role: str, content: str) -> dict:
    return {"role": role, "content": content}


@pytest.fixture()
def tree() -> SessionTree:
    t = SessionTree()
    t.create_root(
        messages=[
            _msg("system", "You are helpful"),
            _msg("user", "Hello"),
            _msg("assistant", "Hi there!"),
            _msg("user", "What is 2+2?"),
            _msg("assistant", "4"),
        ],
        label="main",
    )
    return t


@pytest.mark.unit
class TestSessionTree:
    def test_create_root(self) -> None:
        tree = SessionTree()
        root = tree.create_root(messages=[_msg("user", "hi")])
        assert root.parent_id is None
        assert tree.active_node_id == root.node_id
        assert tree.node_count == 1
        assert root.message_count == 1

    def test_branch_from_root(self, tree: SessionTree) -> None:
        root = tree.get_active()
        assert root is not None
        branch = tree.branch(root.node_id, at_message_index=3, label="alt")
        assert branch.parent_id == root.node_id
        assert branch.message_count == 3  # copied first 3 messages
        assert branch.label == "alt"
        assert tree.node_count == 2
        assert root.node_id in [b.node_id for b in tree.list_branches()]

    def test_branch_copies_messages_independently(self, tree: SessionTree) -> None:
        root = tree.get_active()
        assert root is not None
        branch = tree.branch(root.node_id, at_message_index=2)
        # Modify branch messages — should not affect root
        branch.messages.append(_msg("user", "branch-only"))
        assert root.message_count == 5  # unchanged
        assert branch.message_count == 3

    def test_branch_at_end(self, tree: SessionTree) -> None:
        root = tree.get_active()
        assert root is not None
        branch = tree.branch(root.node_id)  # no index = copy all
        assert branch.message_count == root.message_count

    def test_branch_rejects_invalid_index(self, tree: SessionTree) -> None:
        root = tree.get_active()
        assert root is not None
        with pytest.raises(ValueError, match="Invalid message index"):
            tree.branch(root.node_id, at_message_index=100)

    def test_branch_rejects_unknown_node(self, tree: SessionTree) -> None:
        with pytest.raises(ValueError, match="Node not found"):
            tree.branch("nonexistent")

    def test_switch_to_branch(self, tree: SessionTree) -> None:
        root = tree.get_active()
        assert root is not None
        branch = tree.branch(root.node_id, at_message_index=2)
        tree.switch_to(branch.node_id)
        assert tree.active_node_id == branch.node_id
        active = tree.get_active()
        assert active is not None
        assert active.node_id == branch.node_id

    def test_switch_to_rejects_unknown(self, tree: SessionTree) -> None:
        with pytest.raises(ValueError, match="Node not found"):
            tree.switch_to("ghost")

    def test_add_message_to_active(self, tree: SessionTree) -> None:
        root = tree.get_active()
        assert root is not None
        count_before = root.message_count
        tree.add_message(_msg("user", "new message"))
        assert root.message_count == count_before + 1

    def test_add_message_to_specific_node(self, tree: SessionTree) -> None:
        root = tree.get_active()
        assert root is not None
        branch = tree.branch(root.node_id, at_message_index=2)
        tree.add_message(_msg("user", "branch msg"), node_id=branch.node_id)
        assert branch.message_count == 3

    def test_get_ancestry(self, tree: SessionTree) -> None:
        root = tree.get_active()
        assert root is not None
        b1 = tree.branch(root.node_id, at_message_index=3)
        b2 = tree.branch(b1.node_id, at_message_index=2)
        ancestry = tree.get_ancestry(b2.node_id)
        assert len(ancestry) == 3
        assert ancestry[0] == root.node_id
        assert ancestry[1] == b1.node_id
        assert ancestry[2] == b2.node_id

    def test_list_branches(self, tree: SessionTree) -> None:
        root = tree.get_active()
        assert root is not None
        tree.branch(root.node_id, at_message_index=2, label="b1")
        tree.branch(root.node_id, at_message_index=4, label="b2")
        branches = tree.list_branches()
        assert len(branches) == 3  # root + 2 branches
        assert all(isinstance(b, BranchInfo) for b in branches)
        labels = {b.label for b in branches}
        assert "main" in labels
        assert "b1" in labels
        assert "b2" in labels

    def test_export_node(self, tree: SessionTree) -> None:
        root = tree.get_active()
        assert root is not None
        exported = tree.export_node(root.node_id)
        assert exported["node_id"] == root.node_id
        assert exported["message_count"] == 5
        assert exported["format"] == "json"
        assert len(exported["messages"]) == 5
        assert len(exported["ancestry"]) == 1

    def test_export_rejects_unknown(self, tree: SessionTree) -> None:
        with pytest.raises(ValueError, match="Node not found"):
            tree.export_node("nonexistent")

    def test_resume_from_creates_branch(self, tree: SessionTree) -> None:
        root = tree.get_active()
        assert root is not None
        resumed = tree.resume_from(root.node_id)
        assert resumed.parent_id == root.node_id
        assert resumed.message_count == root.message_count
        assert "resumed_from" in resumed.metadata

    def test_multi_level_branching(self, tree: SessionTree) -> None:
        root = tree.get_active()
        assert root is not None
        b1 = tree.branch(root.node_id, at_message_index=3)
        tree.add_message(_msg("user", "b1 question"), node_id=b1.node_id)
        tree.add_message(_msg("assistant", "b1 answer"), node_id=b1.node_id)
        b2 = tree.branch(b1.node_id, at_message_index=4)
        assert b2.parent_id == b1.node_id
        assert b2.message_count == 4
        # Root unchanged
        assert root.message_count == 5

    def test_empty_tree(self) -> None:
        tree = SessionTree()
        assert tree.active_node_id is None
        assert tree.get_active() is None
        assert tree.node_count == 0
        assert tree.list_branches() == []

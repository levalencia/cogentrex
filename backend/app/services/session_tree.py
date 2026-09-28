"""Session branching and tree management.

Implements frontier session state mechanisms:
- Session tree (branching) — sessions stored as trees (PI)
- Branch from any node — continue from any historical point (PI, CC)
- Fork branches in session history (CC)
- /resume session recovery (CC)
- Session export (PI)

Each session is a node in a tree. Branching creates a new node
that shares history up to the fork point, then diverges.
"""

from __future__ import annotations

import copy
import hashlib
import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class SessionNode:
    """A node in the session tree."""

    node_id: str
    parent_id: str | None
    created_at: float
    messages: list[dict[str, Any]]
    metadata: dict[str, Any] = field(default_factory=dict)
    children: list[str] = field(default_factory=list)
    label: str = ""

    @property
    def message_count(self) -> int:
        return len(self.messages)


@dataclass(frozen=True, slots=True)
class BranchInfo:
    """Summary of a branch point."""

    node_id: str
    parent_id: str | None
    message_count: int
    created_at: float
    label: str
    children_count: int


def _generate_node_id(parent_id: str | None, timestamp: float) -> str:
    raw = f"{parent_id or 'root'}:{timestamp}"
    return hashlib.sha256(raw.encode()).hexdigest()[:12]


class SessionTree:
    """Manages a tree of session branches.

    The root node holds the original conversation. Branching creates a
    new child node that copies messages up to a specified index, allowing
    the conversation to diverge from that point.
    """

    def __init__(self) -> None:
        self._nodes: dict[str, SessionNode] = {}
        self._active_node_id: str | None = None

    @property
    def active_node_id(self) -> str | None:
        return self._active_node_id

    @property
    def node_count(self) -> int:
        return len(self._nodes)

    def create_root(
        self,
        messages: list[dict[str, Any]] | None = None,
        label: str = "main",
        metadata: dict[str, Any] | None = None,
    ) -> SessionNode:
        """Create the root session node."""
        now = time.time()
        node_id = _generate_node_id(None, now)
        node = SessionNode(
            node_id=node_id,
            parent_id=None,
            created_at=now,
            messages=list(messages or []),
            metadata=metadata or {},
            label=label,
        )
        self._nodes[node_id] = node
        self._active_node_id = node_id
        return node

    def branch(
        self,
        from_node_id: str,
        at_message_index: int | None = None,
        label: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> SessionNode:
        """Create a new branch from an existing node at a specific message index.

        Args:
            from_node_id: The node to branch from.
            at_message_index: Fork after this message index (None = copy all).
            label: Human-readable label for the branch.
            metadata: Additional metadata for the branch.

        Returns:
            The new branch node.
        """
        parent = self._nodes.get(from_node_id)
        if parent is None:
            raise ValueError(f"Node not found: {from_node_id}")

        now = time.time()
        node_id = _generate_node_id(from_node_id, now)

        # Copy messages up to the fork point
        if at_message_index is not None:
            if at_message_index < 0 or at_message_index > len(parent.messages):
                raise ValueError(
                    f"Invalid message index: {at_message_index} "
                    f"(node has {len(parent.messages)} messages)"
                )
            forked_messages = copy.deepcopy(parent.messages[:at_message_index])
        else:
            forked_messages = copy.deepcopy(parent.messages)

        node = SessionNode(
            node_id=node_id,
            parent_id=from_node_id,
            created_at=now,
            messages=forked_messages,
            metadata=metadata or {},
            label=label or f"branch-{node_id[:6]}",
        )
        self._nodes[node_id] = node
        parent.children.append(node_id)
        return node

    def switch_to(self, node_id: str) -> SessionNode:
        """Switch the active session to a different branch."""
        node = self._nodes.get(node_id)
        if node is None:
            raise ValueError(f"Node not found: {node_id}")
        self._active_node_id = node_id
        return node

    def get_active(self) -> SessionNode | None:
        """Get the currently active session node."""
        if self._active_node_id is None:
            return None
        return self._nodes.get(self._active_node_id)

    def get_node(self, node_id: str) -> SessionNode | None:
        """Get a specific node by ID."""
        return self._nodes.get(node_id)

    def add_message(self, message: dict[str, Any], node_id: str | None = None) -> None:
        """Add a message to the specified (or active) node."""
        target_id = node_id or self._active_node_id
        if target_id is None:
            raise ValueError("No active session")
        node = self._nodes.get(target_id)
        if node is None:
            raise ValueError(f"Node not found: {target_id}")
        node.messages.append(message)

    def get_ancestry(self, node_id: str) -> list[str]:
        """Get the full ancestry path from root to the given node."""
        path: list[str] = []
        current_id: str | None = node_id
        while current_id is not None:
            path.append(current_id)
            node = self._nodes.get(current_id)
            if node is None:
                break
            current_id = node.parent_id
        path.reverse()
        return path

    def list_branches(self) -> list[BranchInfo]:
        """List all branches in the tree."""
        return [
            BranchInfo(
                node_id=node.node_id,
                parent_id=node.parent_id,
                message_count=node.message_count,
                created_at=node.created_at,
                label=node.label,
                children_count=len(node.children),
            )
            for node in self._nodes.values()
        ]

    def export_node(self, node_id: str, format: str = "json") -> dict[str, Any]:
        """Export a session node for sharing.

        Returns a serializable dict with the full conversation and metadata.
        """
        node = self._nodes.get(node_id)
        if node is None:
            raise ValueError(f"Node not found: {node_id}")

        ancestry = self.get_ancestry(node_id)
        return {
            "format": format,
            "node_id": node.node_id,
            "parent_id": node.parent_id,
            "label": node.label,
            "created_at": node.created_at,
            "message_count": node.message_count,
            "ancestry": ancestry,
            "messages": copy.deepcopy(node.messages),
            "metadata": dict(node.metadata),
        }

    def resume_from(self, node_id: str) -> SessionNode:
        """Resume a session from a specific node (creates a new branch).

        This is the /resume mechanism — it branches from the given node
        at its current message count, effectively continuing where it left off.
        """
        return self.branch(
            from_node_id=node_id,
            at_message_index=None,
            label=f"resumed-{node_id[:6]}",
            metadata={"resumed_from": node_id, "resumed_at": time.time()},
        )

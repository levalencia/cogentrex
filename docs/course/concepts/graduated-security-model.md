# Graduated security model

> **Status:** implemented
> **Module:** cross-cutting (security layer)
> **Sources:** `app/security/graduated_permissions.py`, `app/security/policy.py`, `app/security/approvals.py`
> **Tests:** `tests/unit/test_graduated_permissions.py`

## What problem this solves

Binary allow/deny permission systems force a choice: either the agent can do everything (unsafe) or nothing (useless). Real-world agent sessions need graduated control — read-only operations should flow freely while destructive operations require explicit approval.

Frontier harnesses (Claude Code, Codex, Pi) all implement graduated permission models where the security posture adapts based on risk level, workspace trust, and denial history.

## Seven permission modes

```mermaid
graph LR
    A[ALLOW_ALL] -->|most permissive| B[AUTO_APPROVE_SAFE]
    B --> C[ASK_UNKNOWN]
    C --> D[ASK_ALL]
    D --> E[AUTO_DENY_UNSAFE]
    E --> F[DENY_ALL]
    F -->|most restrictive| G[PLAN_ONLY]

    style A fill:#2d5a2d
    style B fill:#3d6a3d
    style C fill:#5a5a2d
    style D fill:#6a5a2d
    style E fill:#6a3d2d
    style F fill:#5a2d2d
    style G fill:#4a2d4a
```

| Mode | Safe ops | Medium ops | High ops | Use case |
|------|----------|-----------|----------|----------|
| ALLOW_ALL | ✅ Auto | ✅ Auto | ✅ Auto | Dev/testing only |
| AUTO_APPROVE_SAFE | ✅ Auto | 🔒 Ask | 🔒 Ask | Normal development |
| ASK_UNKNOWN | ✅ Auto (low) | 🔒 Ask | 🔒 Ask | Default mode |
| ASK_ALL | 🔒 Ask | 🔒 Ask | 🔒 Ask | Sensitive work |
| AUTO_DENY_UNSAFE | 🔒 Ask | ❌ Deny | ❌ Deny | High-security |
| DENY_ALL | ❌ Deny | ❌ Deny | ❌ Deny | Lockdown |
| PLAN_ONLY | 🔒 Plan | 🔒 Plan | 🔒 Plan | Review before execute |

## Risk levels

Every tool call is classified into one of five risk levels:

| Level | Description | Examples |
|-------|-------------|----------|
| SAFE | Read-only, no side effects | read_file, calculator |
| LOW | Minor effects, reversible | web_search, datetime |
| MEDIUM | Significant effects | write_file, API calls |
| HIGH | Destructive or irreversible | delete, shell commands |
| CRITICAL | System-level, credentials | sandbox exec, key access |

## Bypass-immune protections

Regardless of permission mode (even ALLOW_ALL), certain paths and commands are ALWAYS blocked:

**Protected paths:** `.env`, `.ssh`, `/etc/passwd`, `/etc/shadow`, `id_rsa`, `id_ed25519`, `.git/config`, `.git/hooks`

**Protected commands:** `rm -rf`, `DROP TABLE`, `DROP DATABASE`, `FORMAT`, `mkfs`, `dd if=`, `chmod 777`, `curl | sh`, `shutdown`, `reboot`, `kill -9`

These are the "bypass-immune" protections from the Tool Registry pattern — they cannot be overridden by any mode setting.

## Stateful mode transformation

The evaluator tracks denial history. When too many denials occur within a time window (default: 3 denials in 5 minutes), the permission mode automatically downgrades one level:

```
AUTO_APPROVE_SAFE → ASK_UNKNOWN (after 3 denials)
ASK_UNKNOWN → ASK_ALL (after 3 more denials)
```

This implements the "permission mode transformation on denial" pattern from the Tool Registry reference. The system becomes more restrictive when it detects repeated risky behavior, without requiring manual intervention.

## How it works with existing policy

The graduated permission system layers on top of Cogentrex's existing `PolicyEngine`:

1. **PolicyEngine** — deterministic rule evaluation (existing, unchanged)
2. **GraduatedPermissionEvaluator** — mode-based risk assessment (new)
3. **ApprovalBroker** — human-in-the-loop for operations requiring approval (existing)

The flow: PolicyEngine evaluates first → if allowed, GraduatedPermissionEvaluator checks mode and risk → if requires_approval, ApprovalBroker blocks until human decides.

## Frontier harness comparison

| Mechanism | Claude Code | Codex | Pi | Cogentrex |
|-----------|------------|-------|-----|-----------|
| Graduated modes | 7 modes | Approval policies | Extension hooks | 7 modes (PermissionMode enum) |
| Risk classification | ML classifier | — | — | RiskLevel enum (rule-based) |
| Protected paths | Yes | — | Extension-based | Hardcoded frozenset |
| Protected commands | Yes | — | Extension-based | Hardcoded frozenset |
| Denial tracking | Yes | — | — | DenialRecord with timestamps |
| Mode transformation | Auto→Ask after denial | — | — | Auto-downgrade after threshold |
| Plan mode | — | Yes | — | PLAN_ONLY mode |
| Mode history | — | — | — | Timestamped audit trail |

## Limitations

- Risk classification is rule-based (RiskLevel enum per tool), not ML-based. An ML classifier could improve accuracy for ambiguous operations.
- Protected paths/commands are hardcoded frozensets. A configuration-driven approach would be more flexible.
- Mode transformation only downgrades (never auto-upgrades). Manual `set_mode()` required to relax.
- No per-user or per-project mode isolation yet — mode is evaluator-scoped.

## Interview / 30-second answer

Cogentrex implements a seven-mode graduated permission system inspired by Claude Code. Modes range from ALLOW_ALL (development) through ASK_UNKNOWN (default) to DENY_ALL (lockdown) and PLAN_ONLY (Codex-style). Every tool call is risk-classified (SAFE through CRITICAL), and the mode determines whether it's auto-approved, requires human approval, or is auto-denied. Bypass-immune protections ensure dangerous paths (.env, .ssh, /etc/) and commands (rm -rf, DROP TABLE) are always blocked regardless of mode. The evaluator is stateful: it tracks denial history and automatically downgrades the mode when too many denials occur in a time window — the system gets more restrictive when it detects repeated risky behavior.

## Self-check

1. Why does ALLOW_ALL still block `.env` access? What mechanism enforces this?
2. What is the difference between ASK_ALL and AUTO_DENY_UNSAFE for a HIGH-risk operation?
3. Explain mode transformation: what triggers it, what direction does it go, and why?
4. Why is the denial threshold time-windowed instead of cumulative?
5. How does PLAN_ONLY mode differ from ASK_ALL? When would you choose each?
6. What would an ML-based risk classifier improve over the current enum-based approach?
7. How does the graduated system compose with the existing PolicyEngine and ApprovalBroker?

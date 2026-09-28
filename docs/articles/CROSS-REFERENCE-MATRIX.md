# Cross-Reference Matrix

Maps each article to its supporting learning assets.

| # | Article | Concept page | Module | Visual Learning | Code walkthrough | Tests | Source files |
|---|---------|-------------|--------|----------------|-----------------|-------|-------------|
| 1 | Why Capable Agents Still Fail | agent-anatomy | 00 | system-overview pack | runtime.md | test_runtime_*.py | engine.py |
| 2 | What a Harness Is | agent-anatomy | 00 | system-overview pack | runtime.md | test_runtime_*.py | engine.py |
| 3 | Repository as Truth | typed-runtime | 02 | — | runtime.md | test_typed_*.py | models.py |
| 4 | Governing an Agent Runtime | react | 03 | request-lifecycle pack | runtime.md | test_engine_*.py | engine.py |
| 5 | Tool Contracts | tool-contracts | 04 | — | tool-registry.md | test_tool_*.py | registry.py |
| 6 | Hooks and Extensions | hooks-and-extensions | 04 | harness-hooks pack | hook-system.md | test_hook_*.py | hooks.py |
| 7 | Policy and Approvals | policy-engine | 05 | — | policy-and-approval.md | test_policy_*.py | policy.py |
| 8 | Graduated Security | graduated-security-model | 05 | harness-security pack | — | test_graduated_*.py | graduated_permissions.py |
| 9 | Context Engineering | context-windows | 06 | — | memory.md | test_context_*.py | context.py |
| 10 | Context Compaction | context-compaction | 06 | harness-compaction pack | context-compaction.md | test_multi_layer_*.py | multi_layer_compact.py |
| 11 | Session Branching | session-branching | 06 | harness-branching pack | — | test_session_tree.py | session_tree.py |
| 12 | Encrypted Memory | encrypted-memory | 06 | memory-rag pack | memory.md | test_scoped_*.py | scoped.py |
| 13 | Run Ledger | run-ledger | 07 | — | run-ledger.md | test_run_*.py | run_ledger.py |
| 14 | RAG Done Right | rag | 08 | memory-rag pack | grounded-rag.md | test_grounded_*.py | grounded_rag.py |
| 15 | Faithfulness | faithfulness | 08 | — | grounded-rag.md | test_grounded_*.py | grounded_rag.py |
| 16 | Evaluation Harness | evaluation-harness | 09 | — | evaluation-harness.md | test_eval_*.py | harness.py |
| 17 | Resilience Patterns | circuit-breaker | 10 | reliability pack | resilience.md | test_circuit_*.py | circuit_breaker.py |
| 18 | Bounded Delegation | bounded-delegation | 11 | — | verifier-child.md | test_evidence_*.py | service.py |
| 19 | Delegation Patterns | delegation-patterns | 11 | harness-delegation pack | delegation-patterns.md | test_delegation_*.py | patterns.py |
| 20 | Governed MCP | mcp | 12 | — | mcp-runtime.md | test_mcp_*.py | runtime.py |
| 21 | Skills | skills-project-instructions | 12 | — | — | test_skill_*.py | discovery.py |
| 22 | Verifier Child | verifier-child | 11 | — | verifier-child.md | test_evidence_*.py | service.py |
| 23 | Bootstrap | graduated-security-model | 14 | — | — | test_bootstrap.py | bootstrap.py |
| 24 | Worktree Isolation | worktree-isolation | 14 | harness-worktree pack | — | test_environment.py | environment.py |
| 25 | Tool Concurrency | tool-contracts | 04 | — | — | test_tool_concurrency.py | concurrency.py |
| 26 | Effect Ledger | idempotency | 07 | — | — | test_effect_*.py | effect_ledger.py |
| 27 | Monetary Budgets | cost-usage-budgets | 07 | — | — | test_budgeted_*.py | monetary_budget.py |
| 28 | Bounded Reflection | generic-self-reflection | 03 | — | — | test_reflection_*.py | service.py |
| 29 | Observability | structured-logging | 13 | — | observable-request.md | test_otel_*.py | otel_exporter.py |
| 30 | Local Operations | docker-compose | 14 | — | local-deployment.md | — | docker-compose.yml |
| 31 | Complete Harness | capstone | 15 | all packs | all walkthroughs | all tests | — |
| 32 | What I Learned | capstone | 15 | — | — | — | — |

## Status key

- **planned:** article not started
- **source-grounded:** concept page and code verified
- **draft:** article written, pending review
- **reviewed:** Luis approved
- **published:** live on Medium

# Article Series Plan — Harness Engineering from Scratch

> **Goal:** 32 articles teaching developers how to build every frontier harness mechanism
> **Platform:** Medium (long-form) + LinkedIn (native posts)
> **Repo:** github.com/levalencia/cogentrex
> **Voice:** Engineering-first, beginner-accessible, evidence-backed
> **Review:** One article at a time — Luis reviews before publication

## Seasons

### Season 1: Foundations (Articles 1–8)

| # | Title | Concept page | Module | Status |
|---|-------|-------------|--------|--------|
| 1 | Why Capable Agents Still Fail | agent-anatomy | 00 | planned |
| 2 | What a Harness Actually Is — Five Subsystems | agent-anatomy | 00 | planned |
| 3 | The Repository Must Be the Source of Truth | typed-runtime | 02 | planned |
| 4 | How Cogentrex Governs an Agent Runtime | react | 03 | planned |
| 5 | Tool Contracts: Schema Validation Before Execution | tool-contracts | 04 | planned |
| 6 | Hooks and Extensions: Making the Harness Programmable | hooks-and-extensions | 04 | planned |
| 7 | Policy and Approvals: Deterministic Trust Boundaries | policy-engine | 05 | planned |
| 8 | Graduated Security: Seven Permission Modes | graduated-security-model | 05 | planned |

### Season 2: Knowledge & State (Articles 9–16)

| # | Title | Concept page | Module | Status |
|---|-------|-------------|--------|--------|
| 9 | Context Engineering: What Information Enters a Run | context-windows | 06 | planned |
| 10 | Multi-Layer Context Compaction | context-compaction | 06 | planned |
| 11 | Session Branching: Fork, Resume, and Never Lose Work | session-branching | 06 | planned |
| 12 | Encrypted Memory: Per-Conversation Key Derivation | encrypted-memory | 06 | planned |
| 13 | The Run Ledger: Append-Only Evidence You Can Replay | run-ledger | 07 | planned |
| 14 | RAG Done Right: Retrieval, Grounding, and Citations | rag | 08 | planned |
| 15 | Faithfulness and Groundedness: When Answers Lie | faithfulness | 08 | planned |
| 16 | Evaluation Harness: Measuring Agent Quality | evaluation-harness | 09 | planned |

### Season 3: Reliability & Delegation (Articles 17–22)

| # | Title | Concept page | Module | Status |
|---|-------|-------------|--------|--------|
| 17 | Resilience Patterns: Retry, Breaker, Fallback, Rate Limit | circuit-breaker | 10 | planned |
| 18 | Bounded Delegation: Adding a Second Opinion | bounded-delegation | 11 | planned |
| 19 | Delegation Patterns: Coordinator, Fork, and Swarm | delegation-patterns | 11 | planned |
| 20 | Governed MCP: External Tools Without Trust Leaks | mcp | 12 | planned |
| 21 | Skills and Project Instructions: Codified Knowledge | skills-project-instructions | 12 | planned |
| 22 | The Verifier Child: Claims, Evidence, and Structured Verdicts | verifier-child | 11 | planned |

### Season 4: Advanced Harness (Articles 23–28)

| # | Title | Concept page | Module | Status |
|---|-------|-------------|--------|--------|
| 23 | Four-Stage Bootstrap: From Minimal to Full Power | graduated-security-model | 14 | planned |
| 24 | Worktree Isolation: Parallel Agents Without Collisions | worktree-isolation | 14 | planned |
| 25 | Tool Concurrency: When to Parallelize, When to Serialize | tool-contracts | 04 | planned |
| 26 | The Effect Ledger: Exactly-Once External Effects | idempotency | 07 | planned |
| 27 | Monetary Budgets: Preventing Runaway LLM Costs | cost-usage-budgets | 07 | planned |
| 28 | Bounded Reflection: One-Pass Self-Critique | generic-self-reflection | 03 | planned |

### Season 5: Operations & Capstone (Articles 29–32)

| # | Title | Concept page | Module | Status |
|---|-------|-------------|--------|--------|
| 29 | Observability: Logs, Traces, Metrics, and Events | structured-logging | 13 | planned |
| 30 | Local Operations: Docker, Migrations, Backup, Recovery | docker-compose | 14 | planned |
| 31 | The Complete Harness: 183 Mechanisms in One Repository | capstone | 15 | planned |
| 32 | What I Learned Building Every Frontier Harness Mechanism | capstone | 15 | planned |

## Article contract

Every finished article MUST include:
1. A transferable engineering problem (not Cogentrex-specific)
2. One-sentence thesis
3. Beginner-accessible mental model
4. Mermaid architecture or sequence diagram
5. Small source excerpts with permanent code links
6. Exact tests and runtime evidence
7. Failure modes and honest limitations
8. Fair framework comparison (when relevant)
9. Bounded reader exercise
10. "Go deeper" links to the Cogentrex concept page
11. Link to next article in the series

## Cross-reference matrix

Each article maps to:
- **Understand:** concept page
- **Follow:** ordered module
- **See:** Visual Learning artifact (diagram, deck, mind map)
- **Watch/listen:** audio script / video storyboard
- **Inspect:** exact source symbols
- **Verify:** exact tests
- **Continue:** next article

## Publication workflow

```
planned → source-grounded → draft complete → Luis review →
revision → evidence recheck → ready to publish → published →
impact recorded in MVP-CONTRIBUTION-LOG.md
```

## LinkedIn strategy

- Native posts (no external links in body)
- 3-5 hashtags max: #AgenticAI #HarnessEngineering #AIEngineering #Python
- Link to Medium article in Featured section
- Hook formula: contrarian insight + evidence + one question

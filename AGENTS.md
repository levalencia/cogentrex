# AGENTS.md — Cogentrex agent instruction file

> This file orients any AI coding agent working in this repository.
> Read this first. Follow the startup workflow. Obey the hard rules.

## What this is

Cogentrex is a production AI agent control plane — FastAPI backend + SvelteKit frontend.
It teaches one auditable lifecycle: Policy → Run → Approval → Tool → Evidence → Evaluation.
The codebase implements 60+ concepts from agent anatomy through bounded delegation, governed
MCP, grounded RAG, evaluation harness, and local operations.

## Tech stack

- **Backend:** Python 3.11, FastAPI, SQLAlchemy (async), Alembic, structlog, Redis, PostgreSQL
- **Frontend:** SvelteKit, Tailwind v4, TypeScript, Vite
- **Infra:** Docker Compose (PostgreSQL, Redis, Jaeger), Helm charts
- **Testing:** pytest (unit/security/integration), vitest (frontend), Playwright (E2E)
- **CI:** GitHub Actions (`.github/workflows/ci.yml`), GitHub Copilot deploy
- **Package management:** `uv` (backend), `npm` (frontend)

## Startup workflow (clock-in)

```bash
# 1. Read progress — understand where we are
cat docs/plans/HARNESS-PARITY-MASTER-PLAN.md   # current master plan
cat docs/implementation/CAPABILITY-ACCEPTANCE.yaml  # what's implemented

# 2. Run init — verify environment is healthy
./init.sh

# 3. Check recent changes
git log --oneline -10

# 4. Read the feature list — pick ONE task
# Use capability acceptance manifest as the feature tracker
```

## Verification commands

```bash
# Backend
make lint                # ruff check
make test                # pytest -m unit with 50% coverage floor
make test-security       # security probe tests
make test-all            # all tests including integration
make type-check          # mypy

# Frontend
cd frontend && npm run check     # svelte-check + TypeScript
cd frontend && npx vitest run    # unit tests
cd frontend && npx playwright test  # E2E browser tests

# Full acceptance gate (runs everything)
./scripts/verify.sh

# Docker stack
make docker-up           # start PostgreSQL, Redis, Jaeger
make docker-down         # stop services
```

## Hard rules — do not violate

1. **One feature at a time.** Finish and verify before starting the next.
2. **Tests before commit.** `make lint && make test` must pass. No exceptions.
3. **No secrets.** Never read, print, commit, or log `.env`, API keys, or credentials.
4. **Evidence over confidence.** Do not claim done without runnable proof.
5. **TDD workflow.** Write test → red → implement → green → refactor → commit.
6. **Use `uv`, not `pip`.** All Python deps via `uv sync`, `uv run pytest`.
7. **Mermaid only.** No ASCII art diagrams. All diagrams use Mermaid fenced blocks.
8. **Deploy via CI.** GitHub Copilot handles deploy. Do not deploy manually.
9. **Protected `dev` branch.** Short-lived branches → PR with required checks → merge.
10. **No framework lock-in.** Pure Python + Protocols. No LangChain/AutoGen/CrewAI.

## Definition of done

A feature is done when ALL of these are true:
- [ ] Behavior implemented and code compiles
- [ ] Unit tests written and passing
- [ ] Security tests written where applicable
- [ ] `make lint` passes (no new warnings)
- [ ] Documentation updated (concept page, walkthrough, or catalog entry)
- [ ] Capability acceptance manifest updated if new capability
- [ ] Session handoff note updated
- [ ] Clean commit with descriptive message

## End-of-session protocol (clock-out)

1. Run `make lint && make test` — confirm green
2. Update `session-handoff.md` with what you did and what's next
3. Commit with descriptive message
4. Leave the repo in a state where `./init.sh` will pass immediately

## Key directories

```
backend/app/           Python application code
  agents/              Agent loop, provider adapters, fallback chain
  runtime/             Typed runtime engine, events, budgets, effects
  tools/               Tool registry, built-in tools, sandbox
  skills/              Skill lifecycle (parse, install, discover, enrich)
  mcp/                 MCP client, inventory, runtime provider
  security/            Policy engine, approvals, compliance, guardrails
  memory/              Persistent, encrypted, scoped, Redis memory
  delegation/          Bounded delegation, verifier child, envelopes
  reflection/          Bounded reflection service
  eval/                Evaluation harness, A/B testing, drift
  observability/       Logging, tracing, OTel exporter, cost tracker
  services/            Run ledger, effect ledger, grounded RAG
  routes/              FastAPI API routes

frontend/src/          SvelteKit application
  lib/components/      Svelte components including 21 learning viewers
  lib/                 API clients, utilities

docs/                  All documentation
  course/              16 modules, 65 concepts, 12 walkthroughs, tracks
  plans/               Master plan and mechanism checklist
  implementation/      Capability acceptance manifest
  visual-learning/     Media packs, schemas, curation
  evidence/            Evaluation and benchmark evidence

schemas/               JSON schemas for visual learning artifacts
scripts/               Verification, build, and operational scripts
infra/                 Docker, Helm, K8s manifests
benchmarks/            Hybrid orchestration benchmark (100 cases)
```

## Architecture at a glance

```
User → FastAPI → Orchestration → AgentRuntime (ReAct loop)
                                   ├─ PolicyEngine (deterministic rules)
                                   ├─ ApprovalBroker (human-in-the-loop)
                                   ├─ SecureToolRegistry (schema + permissions)
                                   ├─ SkillDiscovery (metadata-first JIT)
                                   ├─ MCPRuntimeProvider (governed MCP tools)
                                   ├─ BoundedReflection (one-pass critique)
                                   ├─ EvidenceVerifier (delegation child)
                                   ├─ RunLedger (append-only audit)
                                   └─ EventSink → SSE → Frontend
```

## External skill vault (Agent God Mode)

To enable the external skill catalog (2,300+ searchable skills), set these env vars:

```bash
SKILL_CATALOG_ENABLED=true
SKILL_CATALOG_ALLOWLISTED_ROOT=/path/to/agent-god-mode
SKILL_CATALOG_JSON_INDEX=/path/to/agent-god-mode/index.json
```

The catalog provider does in-process keyword search over the JSON index.
No LLM API key or network access required.

## Further reading

- [Architecture diagrams](docs/ARCHITECTURE-DIAGRAMS.md)
- [Implementation evidence](docs/EVIDENCE.md)
- [Course overview](docs/course/README.md)
- [Capability acceptance](docs/implementation/CAPABILITY-ACCEPTANCE.yaml)
- [Remaining deferred gaps](docs/REMAINING-DEFERRED-GAPS.md)
- [Harness parity plan](docs/plans/HARNESS-PARITY-MASTER-PLAN.md)

# Harness Parity Master Plan

> **Goal:** Make Cogentrex the best open-source repository on the planet for learning harness engineering from scratch — by building it yourself.
>
> **Method:** Implement every frontier harness mechanism (Claude Code, Codex, Pi, DeepSeek), document it as a learning module, produce visual learning media, publish as a 30+ article series, and prove everything with TDD + CI via GitHub Copilot deploy.
>
> **Current state:** 100/183 mechanisms (54%). Target: 183/183 (100%).
>
> **Evidence posture:** A mechanism counts as done only when code exists, tests pass, docs explain it, and the Visual Learning artifact is review-ready.

---

## Baseline inventory

| Metric | Current |
|--------|---------|
| Harness mechanisms implemented | 100/183 (54%) |
| Backend test files | 175 |
| Frontend unit tests | 80 (22 files) |
| Playwright E2E specs | 6 |
| Course modules | 16 (00–15) |
| Concept deep-dives | 65 |
| Code walkthroughs | 12 |
| Concept catalog entries | 60 implemented, 7 deferred |
| Visual Learning Svelte components | 21 |
| Visual Learning schemas | 9 (audio, video, deck, diagram, flashcard, mind-map, quiz, study-guide, learning-library) |
| Visual Learning data packs | 5 |
| Learning tracks | 4 (zero-to-capstone, interview, workshops, operations) |
| Workshop materials | 5 files |
| CI workflows | 1 (ci.yml with 3 jobs) |
| Deploy | GitHub Copilot (CI → deploy) |

---

## Phase 0 — Quick Wins (2–3 hours)

Immediately unblocks AI-agent usage of the repo and connects the vault.

| # | Task | Evidence | Est |
|---|------|----------|-----|
| 0.1 | Create `AGENTS.md` at repo root (100–150 lines): system description, tech stack, startup commands, hard rules, verification commands, links to docs/ | File exists, any AI agent can orient in <2 min | 1h |
| 0.2 | Create `init.sh`: wraps `make setup` + `make test` + healthcheck | `./init.sh` exits 0 on healthy env | 30m |
| 0.3 | Create `session-handoff.md` template: clock-in/clock-out convention | File exists with structure | 30m |
| 0.4 | Wire `AgentGodModeCatalogProvider` to actual `index.json` via config | `POST /api/skills/search` returns god-mode results | 30m |

**Exit criteria:** `./init.sh` passes. AGENTS.md reviewed. Vault search works via API.

---

## Phase 1 — Hook System (Tier 2, biggest leverage)

This unlocks ~25 of the 80 missing mechanisms. Archon already emits 30+ event kinds — we add user-registrable handlers.

| # | Task | Mechanisms unlocked | Tests | Est |
|---|------|---------------------|-------|-----|
| 1.1 | Design `HookRegistry` protocol: register/unregister handlers by event kind, sync + async, priority ordering | — | Unit: registry CRUD, ordering | 4h |
| 1.2 | `PreToolUse` hooks: user-defined checks before tool execution (can block/modify) | PreToolUse hooks, PostToolUse hooks, Stop hooks, Extension-based dangerous command interception, Protected path enforcement via hooks, Tool output modification via hooks | Unit: block tool, modify args, pass-through | 4h |
| 1.3 | `PostToolUse` hooks: mandatory checks after tool execution, can inject context | PostToolUse hooks for mandatory checks, tools/post-execute result processing | Unit: hook receives result, can modify | 3h |
| 1.4 | `Stop` hooks: prevent premature victory, can force continuation | Stop hooks (prevent premature victory) | Unit: hook vetoes stop, forces revision | 3h |
| 1.5 | `PrePrompt` / `PostPrompt` hooks: modify model input/output | Pre/post prompt submit hooks, agent/request event hookability | Unit: hook modifies prompt, hook reads response | 3h |
| 1.6 | External signal injection: hooks can inject messages from external sources | External signal injection, Webhook injection, File watcher injection | Unit: external message appears in context | 4h |
| 1.7 | Hook trust model: all-or-nothing trust boundary, workspace trust classification | All-or-nothing hook trust, Workspace trust evaluation, Trust boundary as bootstrap gate | Unit: untrusted workspace → hooks disabled | 3h |
| 1.8 | Hook API routes: `POST /api/hooks`, `GET /api/hooks`, `DELETE /api/hooks/{id}` | — | Unit + integration: CRUD lifecycle | 3h |
| 1.9 | New concept page: `docs/course/concepts/hooks-and-extensions.md` | — | CI: doc validation | 2h |
| 1.10 | New code walkthrough: `docs/course/code-walkthroughs/hook-system.md` | — | CI: doc validation | 2h |
| 1.11 | Add to concept-catalog.yaml: `hooks-and-extensions: implemented` | — | CI: catalog validation | 30m |

**Exit criteria:** 25+ mechanisms checked off. All hook types tested. Docs written.

---

## Phase 2 — Advanced State Management (17 missing mechanisms)

Multi-layer compaction, session branching, resume, and context sophistication.

| # | Task | Mechanisms unlocked | Tests | Est |
|---|------|---------------------|-------|-----|
| 2.1 | Lossless compaction layer: strip redundant tool results before any LLM summarization | Lossless before lossy compaction | Unit: tool-result dedup reduces tokens without LLM call | 4h |
| 2.2 | Multi-layer compaction pipeline: lossless → structured distillation → lossy LLM summary, with circuit breakers | Five-layer compaction pipeline, Circuit breakers on compaction, Programmable compaction strategy | Unit: each layer fires in order, circuit breaker trips after N cycles | 6h |
| 2.3 | Incremental chain compaction: summarize older segments incrementally, not all-at-once | Incremental chain compaction | Unit: compaction preserves recent N, incrementally summarizes older | 4h |
| 2.4 | Customizable `compact_prompt`: user-configurable summarization strategy | Customizable compact_prompt | Unit: custom prompt produces different summary | 2h |
| 2.5 | `/compact` and `/resume` commands: manual compaction and session resume from event log | /compact manual compaction, /resume session recovery | Integration: compact reduces context, resume restores state | 4h |
| 2.6 | Session tree with branching: fork from any point in conversation history | Session tree (branching), Branch from any node, Fork branches in session history | Unit: branch creates new lineage, original preserved | 6h |
| 2.7 | Message history filtering: pre-model filter extensions | Message history filtering | Unit: filter removes specified message types | 3h |
| 2.8 | Truncation recovery pointers: after compaction, leave retrieval pointers | Truncation recovery pointers | Unit: pointer resolves to full original content | 3h |
| 2.9 | Memoized context builders: cache expensive assembly, invalidate on mutation | Memoized context builders | Unit: second call returns cached, mutation invalidates | 3h |
| 2.10 | Model-visible-means-logged invariant: automated assertion that model context matches log | Runtime invariant enforcement, 'Model-visible means logged' invariant | Unit: divergence raises, matching passes | 3h |
| 2.11 | PROGRESS.md / LESSONS.md / VISION.md auto-persistence | PROGRESS.md rolling entries, LESSONS.md extraction, VISION.md / STANDARDS.md persistence | Unit: end-of-session writes progress file | 3h |
| 2.12 | Session export as HTML/gist | Session export (full format) | Integration: export produces valid HTML | 3h |
| 2.13 | New concept pages: `context-compaction.md`, `session-branching.md` | — | CI | 4h |
| 2.14 | New code walkthrough: `context-compaction.md` | — | CI | 2h |
| 2.15 | Add to concept-catalog.yaml: 3 new entries | — | CI | 30m |

**Exit criteria:** 17 state mechanisms checked off. Multi-layer compaction tested. Session branching works.

---

## Phase 3 — Graduated Security Model (9 missing mechanisms)

Move from binary allow/deny to a graduated, trust-aware permission system.

| # | Task | Mechanisms unlocked | Tests | Est |
|---|------|---------------------|-------|-----|
| 3.1 | Seven permission modes: `allow-all`, `auto-approve-safe`, `ask-unknown`, `ask-all`, `auto-deny-unsafe`, `deny-all`, `plan-only` | Seven permission modes | Unit: each mode produces correct behavior for same tool call | 6h |
| 3.2 | ML-based risk classifier (lightweight): classify tool calls by risk using heuristic + optional model | ML-based risk classifier | Unit: known-risky calls classified high, safe calls classified low | 4h |
| 3.3 | Stateful permission evaluator: track denial history, downgrade auto→ask after denial | Stateful permission evaluator, Permission mode transformation on denial, Permission denial tracking | Unit: denial counter increments, mode downgrades after N denials | 4h |
| 3.4 | Protected paths/commands lists: hardcoded bypass-immune paths and commands | Protected paths list (hardcoded), Protected commands list (hardcoded) | Unit: protected path always denied even in allow-all mode | 3h |
| 3.5 | Trust-gated bootstrap: read-only tools before trust, write tools after | Read-only tools loaded before trust, Write tools gated on trust, Trust boundary as bootstrap gate, Safe-mode fallback | Unit: untrusted session has no write tools | 4h |
| 3.6 | Consent recording: trust decision durably recorded in session state | Consent recorded in session state (enhanced) | Unit: consent event persisted and auditable | 2h |
| 3.7 | Plan mode: produce execution plan, request approval before executing | Plan mode (approval before execution) | Integration: plan generated, approved, then executed | 4h |
| 3.8 | New concept page: `graduated-security-model.md` | — | CI | 2h |
| 3.9 | New code walkthrough: `security-and-trust.md` | — | CI | 2h |

**Exit criteria:** 9 security mechanisms checked off. Permission modes tested. Trust boundary enforced.

---

## Phase 4 — Environment & Sub-Agent Gaps (11 + 7 = 18 mechanisms)

Worktree isolation, environment deltas, sub-agent patterns.

| # | Task | Mechanisms unlocked | Tests | Est |
|---|------|---------------------|-------|-----|
| 4.1 | Git worktree isolation: create/destroy worktree per agent task | Git worktree isolation per task, Per-worktree observability stack | Integration: worktree created, agent works, worktree cleaned | 6h |
| 4.2 | Environment-context deltas: send only changed fields per turn | Environment-context deltas only | Unit: delta contains only changed fields | 3h |
| 4.3 | SYSTEM.md environment self-description: auto-detect runtime and write | SYSTEM.md for environment self-description | Unit: generated SYSTEM.md contains correct runtime info | 2h |
| 4.4 | Subagent config files: `.cogentrex/agents/*.yaml` with model/instruction overrides | Subagent configuration files, Subagents inherit parent instructions | Unit: config loaded, agent uses specified model | 4h |
| 4.5 | Fork delegation pattern: child inherits full parent context, single-level only | Fork pattern (full inheritance, single-level), Recursive fork guard | Unit: fork inherits, recursive fork blocked | 4h |
| 4.6 | Swarm delegation pattern: peer-to-peer flat roster with shared task list | Swarm pattern (peer-to-peer, flat roster) | Unit: peers share task list, no spawning peers | 5h |
| 4.7 | Fire-and-forget registration: spawn returns ID, results arrive async | Fire-and-forget registration | Unit: spawn returns immediately, result callback fires | 3h |
| 4.8 | Per-worker tool filtering: configurable tool sets per specialist | Per-worker tool filtering (configurable) | Unit: researcher has read-only, implementer has write | 3h |
| 4.9 | Sidechain file storage: sub-agent histories in separate files | Sidechain file storage | Unit: child history not in parent file | 2h |
| 4.10 | New concept pages: `worktree-isolation.md`, `delegation-patterns.md` | — | CI | 4h |
| 4.11 | New code walkthroughs: `worktree-isolation.md`, `delegation-patterns.md` | — | CI | 4h |

**Exit criteria:** 18 mechanisms checked off. All three delegation patterns tested.

---

## Phase 5 — Remaining Tool, Connector, Observability Gaps (~15 mechanisms)

| # | Task | Mechanisms unlocked | Tests | Est |
|---|------|---------------------|-------|-----|
| 5.1 | Tool concurrency classification: `isConcurrentSafe`, `isReadOnly` flags per tool | Per-call concurrency classification, Concurrent-safe tools run in parallel, Tool isConcurrentSafe flag, Tool isReadOnly flag | Unit: safe tools run parallel, unsafe serialize | 4h |
| 5.2 | Tool safety review checklist: formalized process for adding new tools | Tool safety review checklist | Docs: checklist template exists | 2h |
| 5.3 | Skill templates/ and evals/ subdirectories | Skills contain templates/, Skills contain evals/ | Unit: parser recognizes templates/ and evals/ | 3h |
| 5.4 | SDK embedding mode: importable library (not just HTTP server) | SDK embedding | Integration: import and call programmatically | 6h |
| 5.5 | Multiple FS providers: pluggable filesystem abstraction | Multiple FS providers, Sandbox/FS/Shell providers replaceable | Unit: swap local↔remote FS without tool change | 4h |
| 5.6 | `/init`, `/compact`, `/clear` commands in chat | /init command, /compact command, /clear command | Integration: commands produce expected effects | 3h |
| 5.7 | Runtime reconstructability test: automated assertion context == log | Runtime reconstructability invariant | CI: test runs every build | 2h |
| 5.8 | Session export as HTML: shareable formatted export | Session export as HTML/gist | Integration: produces valid HTML | 2h |
| 5.9 | Local-level instruction file (.local.md gitignored) | Local-level instruction file | Unit: local file loaded, not committed | 1h |
| 5.10 | Four-stage bootstrap with memoization | Four-stage bootstrap, Memoized bootstrap stages, Dependency-ordered bootstrap (enhanced) | Unit: re-init skips completed stages | 4h |
| 5.11 | Two-phase eviction + drain-on-shutdown | Two-phase eviction, Drain-on-shutdown | Unit: disk cleaned at terminal, memory cleaned lazily | 3h |
| 5.12 | Code state checkpointing: checkpoint code when switching tasks | Code state checkpointing | Unit: checkpoint saved, restorable | 3h |

**Exit criteria:** All 183 mechanisms at YES. 100% parity achieved.

---

## Phase 6 — Documentation Refresh (all 65+ concept pages + new ones)

With code at 100% parity, refresh all documentation to teach harness engineering from scratch.

| # | Task | Details | Est |
|---|------|---------|-----|
| 6.1 | Concept-catalog.yaml: add new entries for hooks, compaction, branching, graduated security, worktree, delegation patterns, tool concurrency, FS providers | ~10 new entries | 2h |
| 6.2 | Update all 16 module READMEs to reference new mechanisms | Each module gains new concept links where relevant | 8h |
| 6.3 | Write ~10 new concept deep-dives (hooks-and-extensions, context-compaction, session-branching, graduated-security-model, worktree-isolation, delegation-patterns, tool-concurrency, fs-providers, plan-mode, trust-boundary-bootstrap) | ~10 new .md files, 100–200 lines each | 16h |
| 6.4 | Write ~6 new code walkthroughs (hook-system, context-compaction, security-and-trust, worktree-isolation, delegation-patterns, plan-mode) | ~6 new .md files | 12h |
| 6.5 | Update learn-from-zero track: add new modules to learning sequence | Track file updated | 2h |
| 6.6 | Update interview-preparation track: add harness-parity questions | Track file updated | 2h |
| 6.7 | Update workshop exercises: add hook, compaction, security labs | 3 new exercises | 4h |
| 6.8 | Refresh README.md with harness-parity positioning | README updated | 2h |
| 6.9 | Run `validate-course-docs.py` and fix all validation errors | CI green | 2h |

**Exit criteria:** All concept pages written. All tracks updated. CI green.

---

## Phase 7 — Visual Learning Media (per-module artifacts)

For EACH of the ~18 modules (16 existing + ~2 new), produce:

| Artifact type | Schema exists | Component exists | Count needed |
|---------------|--------------|-----------------|-------------|
| Audio lesson (TTS script) | ✅ audio-script.schema.json | ✅ AudioLessonPlayer.svelte | 18 |
| Video storyboard (code-first) | ✅ video-storyboard.schema.json | ✅ VideoLessonPlayer.svelte | 18 |
| Presentation deck | ✅ deck.schema.json | ✅ PresentationPlayer.svelte | 18 |
| Quiz | ✅ quiz.schema.json | ✅ QuizPlayer.svelte | 18 |
| Flashcards | ✅ flashcards.schema.json | ✅ FlashcardPlayer.svelte | 18 |
| Mind map | ✅ mind-map.schema.json | ✅ MindMapViewer.svelte | 18 |
| Diagram (architecture) | ✅ diagram.schema.json | ✅ DiagramViewer.svelte | 18 |
| Study guide | ✅ study-guide.schema.json | ✅ StudyGuideViewer.svelte | 18 |

**Total: 144 artifacts (18 modules × 8 types)**

Production strategy:
- Generate JSON data files conforming to schemas
- Organize in `docs/visual-learning/modules/{module-id}/` directories
- Each artifact reviewed before marking as `review-ready`
- Build scripts assemble artifacts into packs
- `make media-package` bundles for distribution

| # | Task | Est |
|---|------|-----|
| 7.1 | Create directory structure: `docs/visual-learning/modules/{00..17}/` | 1h |
| 7.2 | Generate audio scripts (18 modules) — TTS-ready lesson scripts | 12h |
| 7.3 | Generate video storyboards (18 modules) — code-first walk-through specs | 12h |
| 7.4 | Generate presentation decks (18 modules) — slide data JSON | 8h |
| 7.5 | Generate quizzes (18 modules) — 10 questions each, 180 total | 8h |
| 7.6 | Generate flashcards (18 modules) — 15 cards each, 270 total | 6h |
| 7.7 | Generate mind maps (18 modules) — concept relationship graphs | 6h |
| 7.8 | Generate architecture diagrams (18 modules) — Mermaid + diagram JSON | 8h |
| 7.9 | Generate study guides (18 modules) — structured self-study paths | 6h |
| 7.10 | Update learning-artifacts.yaml with new module packs | 2h |
| 7.11 | Update studio-curation.yaml roadmap | 2h |
| 7.12 | Build and test all packs: `make media-package` | 4h |
| 7.13 | Write Playwright tests for new Visual Learning content | 4h |

**Exit criteria:** 144 artifacts generated. All conform to schemas. Studio displays them. Playwright tests pass.

---

## Phase 8 — Article Series (30+ articles for Medium + LinkedIn)

Following the code-grounded article series workflow. Each article is a narrative entry point into the repository's learning system.

### Series architecture

```
Season 1: FOUNDATIONS (Articles 1–8)
  Why capable agents fail, what a harness actually is, five subsystems,
  Cogentrex architecture, typed runtime, ReAct loop, tool contracts

Season 2: GOVERNANCE & KNOWLEDGE (Articles 9–16)
  Policy engine, durable approvals, context engineering, memory,
  run ledger, RAG, grounding, citations

Season 3: RELIABILITY & DELEGATION (Articles 17–22)
  Evaluation harness, resilience patterns, bounded delegation,
  verifier child, MCP governance, hooks and extensions

Season 4: ADVANCED HARNESS (Articles 23–28)
  Context compaction (multi-layer), session branching, graduated security,
  worktree isolation, delegation patterns (coordinator/fork/swarm),
  loop and graph engineering

Season 5: OPERATIONS & CAPSTONE (Articles 29–32+)
  Observability, local operations, the full harness (capstone walkthrough),
  "What I learned building 183 harness mechanisms"
```

### Per-article workflow

```
1. Plan article (title, thesis, concepts, code symbols, tests)
2. Write draft in articles/NN-slug.md
3. Cross-reference: concept page + module + diagram + code walkthrough + test
4. Generate LinkedIn launch post
5. Luis reviews (one at a time)
6. Publish to Medium
7. Post LinkedIn native
8. Record in MVP-CONTRIBUTION-LOG.md
```

| # | Task | Est |
|---|------|-----|
| 8.1 | Create `docs/articles/SERIES-PLAN.md` with all 30+ articles, seasons, dependencies | 4h |
| 8.2 | Create `docs/articles/ARTICLE-CONTRACT.md` with mandatory structure | 2h |
| 8.3 | Create `docs/articles/CROSS-REFERENCE-MATRIX.md` | 2h |
| 8.4 | Write Season 1 articles (8 drafts) | 32h |
| 8.5 | Write Season 2 articles (8 drafts) | 32h |
| 8.6 | Write Season 3 articles (6 drafts) | 24h |
| 8.7 | Write Season 4 articles (6 drafts) | 24h |
| 8.8 | Write Season 5 articles (4+ drafts) | 16h |
| 8.9 | Generate LinkedIn launch posts (30+) | 12h |
| 8.10 | Create `docs/articles/MVP-CONTRIBUTION-LOG.md` | 1h |

**Exit criteria:** 30+ articles drafted. Cross-reference matrix complete. Luis reviews and publishes one at a time.

---

## Phase 9 — Test Hardening & CI (continuous)

Every phase produces tests. This phase ensures comprehensive coverage.

| # | Task | Est |
|---|------|-----|
| 9.1 | Target: 250+ backend test files (currently 175) | Ongoing |
| 9.2 | Target: 120+ frontend unit tests (currently 80) | Ongoing |
| 9.3 | Target: 15+ Playwright E2E specs (currently 6) | 8h |
| 9.4 | Add CI job for harness-mechanism parity check | 3h |
| 9.5 | Add CI job for article cross-reference validation | 2h |
| 9.6 | Add CI job for Visual Learning schema validation | 2h |
| 9.7 | Ensure GitHub Copilot deploy pipeline stays green throughout | Ongoing |

---

## Execution order and dependencies

```
Phase 0 (Quick Wins)          → Immediate, no dependencies
Phase 1 (Hooks)               → After Phase 0
Phase 2 (State Management)    → After Phase 0, parallel with Phase 1
Phase 3 (Graduated Security)  → After Phase 1 (uses hook infrastructure)
Phase 4 (Environment/Agents)  → After Phase 1
Phase 5 (Remaining Gaps)      → After Phases 1–4
Phase 6 (Documentation)       → After Phase 5 (all mechanisms exist)
Phase 7 (Visual Learning)     → After Phase 6 (docs are source for media)
Phase 8 (Articles)            → After Phase 6, parallel with Phase 7
Phase 9 (Tests/CI)            → Continuous through all phases
```

```
Timeline (estimated, part-time):
  Phase 0:         Week 1 (day 1)
  Phases 1–2:      Weeks 1–3
  Phases 3–4:      Weeks 3–5
  Phase 5:         Week 5–6
  Phase 6:         Weeks 6–8
  Phase 7:         Weeks 8–11
  Phase 8:         Weeks 8–14 (parallel with Phase 7)
  Phase 9:         Continuous

  100% mechanism parity:  ~Week 6
  Full media library:     ~Week 11
  Full article series:    ~Week 14
```

---

## Success metrics

| Metric | Current | Target |
|--------|---------|--------|
| Harness mechanism parity | 54% (100/183) | 100% (183/183) |
| Backend test files | 175 | 250+ |
| Frontend unit tests | 80 | 120+ |
| Playwright E2E specs | 6 | 15+ |
| Course modules | 16 | 18+ |
| Concept deep-dives | 65 | 75+ |
| Code walkthroughs | 12 | 18+ |
| Visual Learning artifacts | ~5 packs | 144 artifacts (18×8) |
| Published articles | 0 | 30+ |
| LinkedIn posts | 0 | 30+ |

---

## What this plan is NOT

- **NOT a refactor.** The 54 existing mechanisms stay. We add 83 more.
- **NOT throwing away 2 months of work.** The skills system (100%), lifecycle (66%), tools (59%), observability (58%) are solid foundations.
- **NOT copying walkinglabs.** Their course teaches how to USE harnesses. Ours teaches how to BUILD them — and we build every mechanism ourselves.

---

## References

- `/docs/plans/HARNESS-PARITY-MASTER-PLAN.md` — this file
- `harness-mechanisms-checklist.md` — the 153 frontier mechanisms checklist (repo root, temporary)
- `/tmp/learn-harness-engineering/` — walkinglabs course clone (read-only reference)
- Agent God Mode vault: `/Users/luisvalencia/repos/agent-god-mode/`
- Skill: `technical-course-repo-learning`
- Skill: `god-mode-search`

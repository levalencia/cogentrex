# Agent Reach & Agent God Mode — Integration Plan

**Status:** Planning / Not yet implemented  
**Date:** 2026-05-04  
**Author:** Session analysis  

---

## Executive Summary

Neither **Agent Reach** nor **Agent God Mode** are currently integrated into Cogentrex. This document proposes a phased integration roadmap that adds value while respecting the constraints of a cloud-deployed web application (Azure Container Apps).

---

## 1. Agent Reach Integration

### 1.1 What Agent Reach Actually Is

Agent Reach is a **Python CLI scaffolding tool** (github.com/Panniantong/Agent-Reach) designed for **local AI coding agents** (Claude Code, OpenClaw, Cursor). It installs upstream open-source tools on a developer's machine and provides a unified SKILL.md that tells the agent how to invoke them.

**Core pattern:**
```
User prompt → Agent reads SKILL.md → Runs shell commands (twitter-cli, yt-dlp, etc.)
```

### 1.2 Server-Side Feasibility Matrix

| Platform | Tool | Works in Container? | Blocker | Value for Cogentrex |
|----------|------|---------------------|---------|---------------------|
| **Web** | Jina Reader | ✅ Yes | None | Low — Firecrawl already covers this |
| **Reddit** | `rdt-cli` | ⚠️ Partial | Auth/cookies required; datacenter IPs may 403 | Medium — enhance existing Reddit channel |
| **YouTube** | `yt-dlp` | ✅ Yes | None | Low — native caption scraper already works |
| **Twitter/X** | `twitter-cli` | ❌ No | Requires browser cookie export | High — but needs proxy infrastructure |
| **XiaoHongShu** | `xhs-cli` | ❌ No | Requires login cookies | Low — niche for current user base |
| **Bilibili** | `yt-dlp` + proxy | ❌ No | Blocks server IPs | Low — niche |
| **GitHub** | `gh CLI` | ✅ Yes | Public repos work without auth | **High** — code/repos/issues search |
| **LinkedIn** | `linkedin-mcp` | ❌ No | Browser automation required | Medium — but LinkedIn API already exists |
| **Exa Search** | `mcporter` | ✅ Yes | Free API key | **High** — semantic web search alternative |
| **WeChat** | Exa + Camoufox | ⚠️ Partial | Optional browser automation | Low |
| **RSS** | `feedparser` | ✅ Yes | None | Low — native RSS client already works |

### 1.3 Recommended Approach: Native Channel Expansion

Instead of installing the Python CLI (which is designed for local dev machines with browsers), **expand Cogentrex's native `ChannelRegistry`** with new TypeScript clients:

#### New Channels to Add

1. **`github`** — GitHub REST API v3
   - Search repos, issues, code
   - Read repo READMEs and file contents
   - Zero auth for public content
   - Endpoint: `https://api.github.com/search/repositories`, `https://api.github.com/search/code`

2. **`exa`** — Semantic Web Search (Exa.ai)
   - AI-native search with embeddings
   - Better than keyword search for technical topics
   - Free tier available
   - Alternative/supplement to Firecrawl web search

3. **`arxiv`** — Academic Paper Search
   - Search and fetch abstracts/full-text
   - Useful for research-heavy queries
   - Endpoint: `http://export.arxiv.org/api/query`

4. **`hackernews`** — Hacker News Algolia API
   - Search stories and comments
   - Zero auth
   - Endpoint: `https://hn.algolia.com/api/v1/search`

#### Files to Modify

```
apps/api/src/tools/channels/
  ├── githubChannelClient.ts      (NEW)
  ├── exaChannelClient.ts         (NEW)
  ├── arxivChannelClient.ts       (NEW)
  ├── hackernewsChannelClient.ts  (NEW)
  └── channelRegistry.ts          (MODIFY — register new clients)

apps/api/src/research/researchPrompts.ts  (MODIFY — add channels to planner prompt)
apps/api/src/app.ts                       (MODIFY — wire new channels)
```

#### Planner Prompt Update

Current prompt says:
```
Available channels: web, reddit, youtube, rss
```

Updated:
```
Available channels: web, reddit, youtube, rss, github, exa, arxiv, hackernews
```

### 1.4 Optional: Agent Reach Proxy (Future Phase)

If Twitter/X or XiaoHongShu content becomes critical:

1. Run a **sidecar container** with Python + `agent-reach` installed
2. Add a **residential proxy** (Webshare, ~$1–5/month)
3. Manage cookies via persistent volume or secret store
4. Expose HTTP endpoints that Cogentrex API calls

**Verdict:** Not needed for MVP. GitHub + Exa + arXiv covers 90% of valuable research surfaces.

---

## 2. Agent God Mode Integration

### 2.1 What Agent God Mode Actually Is

Agent God Mode (github.com/levalencia/agent-god-mode) is a **local RAG skill vault** with:
- **Tier 1:** 20 lifecycle skills (spec-driven-development, test-driven-development, shipping-and-launch, etc.)
- **Tier 2:** 2,300+ domain skills (Azure, Kubernetes, Qiskit, marketing, etc.)

**Core pattern:**
```
User prompt → Local embedding search → Inject top-N SKILL.md files → LLM uses them
```

### 2.2 Integration Concept: "God Mode" Toggle

Add a toggle in the chat UI:

```
[Chat] [Deep Research] [Image] [Video] [Social]  [⭐ God Mode]
```

When **enabled**, the chat flow becomes:
```
User query → Skill Search (API side) → Read top SKILL.md files → 
Inject into system prompt → LLM stream with skill guidance
```

### 2.3 Architecture Options

| Option | Method | Pros | Cons | Recommendation |
|--------|--------|------|------|----------------|
| **A. Keyword/Fuzzy** | Pre-built JSON index, match keywords | Zero deps, fast, tiny | Less accurate | **Fallback only** |
| **B. Pre-computed embeddings** | Build vectors at Docker build time | Accurate, fast inference | Adds build step | **✅ Recommended** |
| **C. Runtime embeddings** | Download `@xenova/transformers` on boot | Same accuracy as local | 22MB model, cold start | Avoid for ACA |
| **D. LLM selector** | Ask LLM to pick skills from catalog | No embedding infra | Extra tokens + latency | Avoid |

### 2.4 Recommended Architecture: Pre-computed Embeddings

**Why:**
- Azure Container Apps has memory/CPU constraints
- Cold start time matters (minReplicas=0)
- Build-time embedding shifts cost to CI, not runtime

#### Data Flow

```
Build Time:
  1. Copy skills into apps/api/data/skills/
  2. Run build-index script using @xenova/transformers
  3. Generate data/skills-index.json (embeddings + metadata)
  4. Docker image includes index.json (no runtime download)

Runtime:
  1. User sends message with useSkills=true
  2. API embeds query using same model (lightweight, CPU-only)
  3. Cosine similarity against index.json vectors
  4. Read top 3–5 SKILL.md files from disk
  5. Prepend to system prompt
  6. Stream LLM response
```

#### Skill Storage Options

| Option | How | Pros | Cons |
|--------|-----|------|------|
| Git submodule | `git submodule add agent-god-mode` | Always in sync | Large repo, slow CI |
| Copy subset | `cp -r agent-god-mode/organized-skills/{azure*,devops*,k8s*} ...` | Small, curated | Manual updates |
| Fetch at build | `RUN git clone ... && node build-index.js` | Always fresh | Increases build time |

**Recommendation:** Start with **curated copy** — select the 100–200 most relevant skills (Azure, cloud, security, web dev, AI/ML). Expand later.

### 2.5 Files to Modify

#### Shared Package

```
packages/shared/src/schemas.ts
  └── Add useSkills?: boolean to sendMessageSchema

packages/shared/src/types.ts
  └── Add useSkills to SendMessageInput type
```

#### API

```
apps/api/src/chat/chatService.ts
  └── Modify streamChat() to accept useSkills flag
  └── Inject skill content into system prompt when enabled

apps/api/src/chat/chatRoutes.ts
  └── Pass useSkills from request body to chatService

apps/api/src/research/researchService.ts
  └── Optionally inject skills into planning + synthesis prompts

apps/api/src/skills/                          (NEW DIRECTORY)
  ├── skillSearch.ts                          (embedding + similarity)
  ├── skillIndex.ts                           (index loader)
  ├── buildIndex.ts                           (build-time script)
  └── data/                                   (SKILL.md files + index.json)

apps/api/package.json
  └── Add build:skills script
```

#### Web

```
apps/web/src/components/ChatView.tsx
  └── Add God Mode toggle button in ChatInput
  └── Send useSkills flag in streamMessage payload

apps/web/src/store/appStore.ts
  └── Add useSkills state + setter

apps/web/src/lib/api.ts
  └── Update streamMessage() to accept useSkills option
```

### 2.6 System Prompt Injection Format

When `useSkills=true`, prepend to the LLM system prompt:

```
You are Cogentrex, a helpful AI assistant.

The user has requested skill-assisted mode. The following skills are
relevant to this request. You MUST follow the instructions in these
skills precisely. Do not skip steps mentioned in the skills.

--- Skill: azure-container-apps ---
[full content of azure-container-apps/SKILL.md]

--- Skill: spec-driven-development ---
[full content of spec-driven-development/SKILL.md]

--- Skill: security-and-hardening ---
[full content of security-and-hardening/SKILL.md]

Now respond to the user's request using the skills above.
```

### 2.7 Token Budget Considerations

| Component | Tokens (typical) |
|-----------|------------------|
| Base system prompt | ~200 |
| 1 SKILL.md | 500–2,000 |
| 3 skills injected | 1,500–6,000 |
| 5 skills injected | 2,500–10,000 |

**Recommendation:**
- Inject **top 3 skills** by default
- Cap at **5 skills** maximum
- Order by relevance score (highest first)
- Include a token budget check — if combined skills exceed 6k tokens, truncate or reduce count

### 2.8 Mode Compatibility

| Mode | Skills Helpful? | How |
|------|----------------|-----|
| **CHAT** | ✅ Yes | Direct injection into system prompt |
| **DEEP_RESEARCH** | ✅ Yes | Both planner and synthesis phases |
| **IMAGE_GENERATION** | ⚠️ Maybe | Prompt engineering skills |
| **VIDEO_GENERATION** | ⚠️ Maybe | Prompt engineering skills |
| **SOCIAL_WRITING** | ✅ Yes | Marketing/brand/content skills |

**Phase 1:** CHAT + DEEP_RESEARCH only.

---

## 3. Phased Implementation Roadmap

### Phase 1: Agent God Mode (Skill Assist) — **Priority: High**

**Goal:** Add a "God Mode" toggle that injects relevant skills into chat prompts.

**Tasks:**
1. [ ] Curate 100–200 most relevant skills from agent-god-mode repo
2. [ ] Copy skills into `apps/api/src/skills/data/`
3. [ ] Create `buildIndex.ts` script (pre-compute embeddings at build time)
4. [ ] Create `skillSearch.ts` (runtime query embedding + cosine similarity)
5. [ ] Modify `sendMessageSchema` to add `useSkills?: boolean`
6. [ ] Modify `chatService.ts` to inject skills when `useSkills=true`
7. [ ] Add toggle to `ChatView.tsx` ChatInput
8. [ ] Update `appStore.ts` with `useSkills` state
9. [ ] Update `streamMessage()` in `api.ts` to pass flag
10. [ ] Add `build:skills` to CI / Dockerfile
11. [ ] Test with Azure-related queries (should inject azure-* skills)

**Estimated effort:** 2–3 days

### Phase 2: Expand Deep Research Channels — **Priority: Medium**

**Goal:** Add GitHub, Exa, arXiv, and HackerNews as research channels.

**Tasks:**
1. [x] Create `githubChannelClient.ts` (public repo/issue/code search)
2. [x] Create `exaChannelClient.ts` (semantic web search)
3. [x] Create `arxivChannelClient.ts` (academic paper search)
4. [x] Create `hackernewsChannelClient.ts` (HN story/comment search)
5. [x] Register new clients in `channelRegistry.ts`
6. [x] Update `researchPrompts.ts` planner prompt with new channels
7. [x] Test channel normalization with mocked providers

**Estimated effort:** 1–2 days

### Phase 3: Skill-Assisted Deep Research — **Priority: Medium**

**Goal:** Combine Phase 1 + Phase 2 — skills can guide both planning and synthesis.

**Tasks:**
1. [ ] Modify `researchService.ts` to accept `useSkills` flag
2. [ ] Inject skills into planning prompt (helps generate better search queries)
3. [ ] Inject skills into synthesis prompt (helps structure final answer)
4. [ ] Test with complex multi-domain queries

**Estimated effort:** 1 day

### Phase 4: Agent Reach Proxy (Optional) — **Priority: Low**

**Goal:** Support Twitter/X and other cookie-auth platforms via sidecar.

**Tasks:**
1. [ ] Evaluate if Twitter/X content is genuinely needed
2. [ ] Design sidecar container architecture
3. [ ] Implement proxy API (Python + agent-reach + proxy)
4. [ ] Add cookie management (persistent volume or Key Vault)
5. [ ] Wire into `channelRegistry` as external HTTP client

**Estimated effort:** 3–5 days (if needed)

---

## 4. Key Decisions Required

### Decision 1: Skill Curation Scope
**Question:** Do we include all 2,300+ skills or a curated subset?
- **Option A:** All skills (comprehensive, but large image, longer build)
- **Option B:** Curated 100–200 (fast build, focused, expand later)
- **Option C:** Tiered (lifecycle skills always + top 50 domain skills)

**Recommendation:** Start with Option B. Include: all 20 lifecycle skills + ~100 domain skills (Azure, AWS, GCP, K8s, security, web dev, AI/ML, DevOps).

### Decision 2: God Mode Default State
**Question:** Should God Mode be ON or OFF by default?
- **OFF:** Users opt-in per message (lower token cost, predictable)
- **ON:** Always active unless disabled (higher token cost, better answers)

**Recommendation:** OFF by default. Token costs can add up quickly (3 skills × 1,500 tokens = ~4,500 extra tokens per message).

### Decision 3: Deep Research + God Mode
**Question:** Should Deep Research also support God Mode?
- **Yes:** Planner generates better queries; synthesizer produces structured output
- **No:** Keep Deep Research lightweight; God Mode is for chat

**Recommendation:** Yes, but implement in Phase 3 after CHAT God Mode is stable.

### Decision 4: Runtime vs Build-Time Embeddings
**Question:** Where does the embedding model run?
- **Build-time only:** Pre-compute all skill vectors. Runtime = pure math. (Recommended)
- **Runtime:** Download model on container start. (Avoid — cold start penalty)

**Recommendation:** Build-time. Add to Dockerfile as a build step.

---

## 5. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token budget overflow from skill injection | High cost, truncated context | Cap at 3 skills / 6k tokens |
| Skill content outdated | Wrong instructions | Monthly refresh from upstream repo |
| Cold start increase (if runtime embeddings) | Poor UX | Use build-time embeddings only |
| Duplicate channels (web vs exa) | Redundant results | Make planner smarter, or deduplicate results |
| GitHub API rate limits | Search failures | Cache results, respect rate limits |

---

## 6. Success Criteria

**Phase 1 Done When:**
- [ ] God Mode toggle appears in chat UI
- [ ] Query "Deploy to Azure Container Apps" injects `azure-container-apps` skill
- [ ] Query "Write a spec for auth feature" injects `spec-driven-development` skill
- [ ] Token count stays within reasonable bounds (< 6k extra tokens)
- [ ] No regression in normal chat mode (toggle OFF)

**Phase 2 Done When:**
- [ ] Deep Research can search GitHub repos for code examples
- [ ] Deep Research can search arXiv for papers
- [ ] Planner correctly assigns queries to new channels (e.g., `github:auth patterns`)

**Phase 3 Done When:**
- [ ] Deep Research with God Mode produces more structured, cited answers
- [ ] Planner uses skills to generate domain-specific search queries

---

## 7. Appendix: Skill Categories for Curation

### Tier 1: Lifecycle Skills (Always Include)
All 20 from `skills/`:
- spec-driven-development
- planning-and-task-breakdown
- incremental-implementation
- test-driven-development
- context-engineering
- source-driven-development
- frontend-ui-engineering
- api-and-interface-design
- browser-testing-with-devtools
- debugging-and-error-recovery
- code-review-and-quality
- code-simplification
- security-and-hardening
- performance-optimization
- git-workflow-and-versioning
- ci-cd-and-automation
- deprecation-and-migration
- documentation-and-adrs
- shipping-and-launch
- using-agent-skills

### Tier 2: Domain Skills (Curated)
From `organized-skills/`, include categories:
- **Azure:** All azure-* skills (compute, storage, networking, security, etc.)
- **Cloud:** AWS, GCP basics
- **Containers:** Docker, Kubernetes, container apps
- **DevOps:** Terraform, CI/CD, monitoring
- **Security:** Auth patterns, OWASP, secrets management
- **Web:** React, Next.js, TypeScript, API design
- **AI/ML:** OpenAI, LangChain, prompt engineering, embeddings
- **Database:** PostgreSQL, SQLite, migrations
- **Methodology:** Agile, documentation, testing strategies

**Exclude** (for now): Quantum computing, crypto/trading, obscure languages, game dev, hardware — unless user explicitly requests.

---

*This plan is ready for review and can be broken into GitHub issues or feature tickets for implementation.*

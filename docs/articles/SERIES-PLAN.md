# Article Series Plan — Harness Engineering from Scratch

> **Goal:** 30 articles teaching developers how to build every frontier harness mechanism
> **Platform:** Medium (long-form) + LinkedIn (native posts)
> **Repo:** github.com/levalencia/cogentrex
> **Voice:** Engineering-first, beginner-accessible, evidence-backed
> **Review:** One article at a time — Luis reviews before publication

## Seasons

### Season 1: Build the Harness (Articles 1–8)

| # | Title | Status |
|---|-------|--------|
| 1 | I Built an AI Agent Harness from Scratch — Here's What Frameworks Abstract Away | published |
| 2 | Building a Typed ReAct Loop Without a Framework | published |
| 3 | Tool Contracts: The Boundary Between Intent and Execution | draft |
| 4 | Why Tool Access Is Not Authorization | draft |
| 5 | State Machines, Stop Reasons, and Bounded Execution | planned |
| 6 | Context Is Not Memory | planned |
| 7 | Durable Runs, Replay, and Auditability | planned |
| 8 | Sandboxing Agent-Generated Code | planned |

### Season 2: Compare and Contrast (Articles 9–12)

| # | Title | Status |
|---|-------|--------|
| 9 | Custom ReAct Loop vs LangGraph | planned |
| 10 | Tools vs Skills vs MCP | planned |
| 11 | AutoGen and CrewAI: When Multi-Agent Abstractions Help | planned |
| 12 | Pydantic Models as Agent Runtime Contracts | planned |

### Season 3: Evaluate and Observe (Articles 13–18)

| # | Title | Status |
|---|-------|--------|
| 13 | Evaluating Agents with Paired Experiments | planned |
| 14 | Observing an Agent with OpenTelemetry and Logfire | planned |
| 15 | Token, Time, and Monetary Budgets | planned |
| 16 | Retries, Circuit Breakers, and Failure Recovery | planned |
| 17 | Why More Agents Can Produce Worse Results | planned |
| 18 | Grounding, Citations, and the Limits of Verifiers | planned |

### Season 4: Deploy to Azure (Articles 19–24)

| # | Title | Status |
|---|-------|--------|
| 19 | Deploying a Custom Agent Harness to Azure (VM + Compose) | planned |
| 20 | Managed Identity and Key Vault for Agent Systems | planned |
| 21 | Agent Tracing with Azure Monitor and Application Insights | planned |
| 22 | PostgreSQL, Redis, and Durable Agent State on Azure | planned |
| 23 | CI/CD and Safe Rollouts for Agent Systems on Azure | planned |
| 24 | Secure Networking for Agent Tools and Data | planned |

### Season 5: Foundry Comparison & Capstone (Articles 25–30)

| # | Title | Status |
|---|-------|--------|
| 25 | Custom Harness vs Microsoft Foundry Agent Service | planned |
| 26 | Running the Same Agent as a Foundry Hosted Agent | planned |
| 27 | Tool and MCP Integration in Microsoft Foundry | planned |
| 28 | Evaluating Custom and Hosted Agents with the Same Dataset | planned |
| 29 | Observability and Cost Comparison | planned |
| 30 | Build vs Buy: Choosing Your Agent Runtime | planned |

## Publication links

| # | Medium | LinkedIn |
|---|--------|----------|
| 1 | [Published](https://medium.com/python-in-plain-english/built-an-ai-agent-harness-from-scratch-heres-what-frameworks-abstract-away-6a1174a98f79) | posted |
| 2 | [Published](https://medium.com/@luisevalencia/building-a-typed-react-loop-without-a-framework-0c7b88c1c981) | posted |
| 3 | — | — |
| 4 | — | — |

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
11. Series navigation table with back-links and forward teaser
12. Source map pinned to a specific commit

## Cross-reference contract

Each article maps to:
- **Understand:** concept page (GitHub link)
- **Follow:** ordered module (GitHub link)
- **Walk through code:** code walkthrough (GitHub link)
- **See:** Visual Learning artifact (GitHub link)
- **Inspect:** exact source symbols with line numbers (GitHub link)
- **Verify:** exact test commands
- **Continue:** next article

## Publication workflow

```
planned → draft → Luis review → revision → published →
LinkedIn post → impact recorded in MVP-CONTRIBUTION-LOG.md
```

## LinkedIn strategy

- Native posts (no external links in body)
- No code in LinkedIn posts
- No Cogentrex mentions in LinkedIn posts
- 3-5 hashtags max: #AgenticAI #HarnessEngineering #AIEngineering #Python
- Medium link in first comment only
- Hook formula: provocative question + evidence + closing question

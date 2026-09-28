# Article Contract

Every article in the Cogentrex harness engineering series must satisfy this contract before publication.

## Required sections

1. **Hook** (2-3 sentences) — A specific, relatable engineering problem that captures attention. Not "AI is amazing" but "Your agent said 'done' and nothing works."

2. **Thesis** (1 sentence) — The article's core claim. "Context compaction is what lets long agent sessions survive finite context windows."

3. **Mental model** — A beginner-accessible explanation using analogy or diagram. The reader should understand the concept without reading the code.

4. **Architecture diagram** — Mermaid fenced block showing how the mechanism fits into the system. Must match prose numbering exactly.

5. **Source excerpts** — 2-3 small code snippets (< 20 lines each) with permanent GitHub links. Not the full implementation — just the key design decisions.

6. **Tests as evidence** — Show specific test names and what they prove. "test_circuit_breaker_trips proves the compaction pipeline stops after 3 cycles."

7. **Failure modes** — What breaks, what's missing, what's deferred. Honest limitations prevent overclaim.

8. **Comparison** (when relevant) — How does this compare to Claude Code / Codex / Pi / DeepSeek / LangGraph? Fair, not dismissive.

9. **Reader exercise** — One bounded task the reader can try. "Clone the repo, run the compaction tests, then modify the circuit breaker threshold."

10. **Go deeper** — Links to the concept page, code walkthrough, and Visual Learning artifacts.

11. **Next article** — Teaser for the next article in the series.

## Evidence labels

Every claim must be classified:
- **Source:** code exists in the repository
- **Tested:** unit/security test proves behavior
- **Observed:** runtime behavior demonstrated
- **Deployed:** running on dev.cogentrex.com
- **Deferred:** not implemented, honestly stated

## What NOT to do

- Don't claim "production-ready" unless deployed and load-tested
- Don't call Docker Compose "production"
- Don't call one verifier child a "swarm"
- Don't copy entire files — show the decision points
- Don't use external links in LinkedIn body (Featured section only)
- Don't publish without Luis reviewing the complete draft

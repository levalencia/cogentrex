# QA Smoke — Skill Runs + Search Readiness

Date: 2026-05-23 20:10 CEST
Branch: `feature/research-library-skill-runs`

## Scope

- Verify `skill_runs` persistence in real workflows.
- Verify Deep Research/Social Writer search readiness and fallback behavior.
- Run local smoke on `localhost:3000` / `localhost:3001` with a normal user.
- Re-check after hardening `skill_runs` persistence so observability failures do not break primary workflows.

## Automated verification

- `pnpm --filter @cogentrex/api typecheck` — PASS.
- `pnpm --filter @cogentrex/api exec vitest run src/__tests__/skillRunsWorkflows.test.ts src/__tests__/research.test.ts src/__tests__/social.test.ts` — PASS, 3 files / 12 tests.
- `pnpm typecheck` — PASS.
- `pnpm test` — PASS, 25 files / 98 tests.
- `pnpm build` — PASS.
- `git diff --check` — PASS.

## Local smoke

- Registered a temporary normal user through the UI: `qa-skillruns-20260523-2001@example.com`.
- Home/workflow readiness loaded successfully.
- Deep Research and Social Writer display `LIMITED` when Brave is missing and Firecrawl is configured as fallback.
- Browser console had no JS errors on the home/readiness screen.
- Generated a Social Writer post via the authenticated browser session and local API.
- Confirmed `/api/skills/runs` returns a completed run:
  - `skillSlug`: `linkedin-writer`
  - `mode`: `SOCIAL_WRITING`
  - `status`: `completed`
  - `conversationId`: `cnv_QL3DwL8_2AfU9AAp`
  - observability merged started + completed details: `phase`, `platforms`, `postCount`, `durationMs`, `researchContextLength`, `useResearch`
- Library / Outputs rendered `Recent activity` with `RUN SOCIAL WRITING · COMPLETED` and the completed Social Writer skill run.
- Browser console had no JS errors on Library / Outputs.

## Screenshot evidence

- Home/readiness screen: `/Users/luisvalencia/.hermes/profiles/cogentrex/cache/screenshots/browser_screenshot_db5286a7c1f2493095f9cd03fb11b01e.png`
- Library / Outputs recent activity: `/Users/luisvalencia/.hermes/profiles/cogentrex/cache/screenshots/browser_screenshot_d45998a80c7747de9fb84c01305ceaf4.png`

## Notes / gaps

- Image Studio `skill_runs` persistence is covered by automated API smoke using a mocked provider response to avoid cost/time from real image generation.
- Deep Research `skill_runs` are now covered on the primary web flow: `/api/chat/plan` -> `/api/chat/research` -> `/api/skills/runs`.
- Deep Research failure handling is now wrapped so failed runs are completed as `failed` where possible.
- `skill_runs` create/complete now have safe wrappers; observability persistence should not block the primary user workflow.

## Addendum — Deep Research Library typing regression

Date: 2026-05-23 21:55 CEST
Branch: `feature/deep-research-library-typing`

### Scope

- Verify Deep Research conversations/runs are classified as `DEEP RESEARCH` in Library / Outputs, not counted or labeled as generic `CHAT` when the persisted conversation/artifact mode is stale.
- Verify standalone skill runs still contribute to the Research briefs bucket.
- Smoke a normal-user Deep Research run locally and save the assistant answer to Library.

### Automated verification

- `pnpm --filter @cogentrex/web test -- src/lib/libraryOutputs.test.ts --runInBand` — PASS, 9 files / 50 tests.
- `pnpm --filter @cogentrex/web test` — PASS, 9 files / 50 tests.
- `pnpm --filter @cogentrex/shared build && pnpm --filter @cogentrex/web typecheck` — PASS.

### Local browser smoke

- Registered temporary normal user: `qa-20260523194738@cogentrex.local`.
- Ran a Deep Research workflow with two plan steps.
- Saved the assistant answer to Library.
- Library / Outputs showed:
  - Run history row: `COMPLETED · DEEP RESEARCH · Deep Research`.
  - Recent activity artifact: `... · DEEP RESEARCH`.
  - Recent activity run: `DEEP RESEARCH · COMPLETED`.
  - Artifact shelf row: `... · DEEP RESEARCH`.
- Browser console after Library smoke: no JavaScript errors; only React DevTools/HMR info logs.

### Screenshot evidence

- Registered user Library baseline: `/Users/luisvalencia/.hermes/profiles/cogentrex/cache/screenshots/browser_screenshot_bd16154b8eb342dca6c2bf27f5c6b090.png`
- Saved Deep Research chat with artifact panel: `/Users/luisvalencia/.hermes/profiles/cogentrex/cache/screenshots/browser_screenshot_090c8a4a8f554120b70ac6a737bfcc4b.png`
- Library / Outputs with Deep Research classification: `/Users/luisvalencia/.hermes/profiles/cogentrex/cache/screenshots/browser_screenshot_fdd4dcc115584636a3c64d5911b2ee4b.png`

### Notes / gaps

- The smoke query found zero usable sources, so the model answer correctly refused source-backed claims. This did not block verifying run/artifact classification.
- Direct navigation to `/library` briefly showed `Loading Cogentrex…`; using the in-app sidebar Library link rendered the page correctly. Worth watching, but no console error was emitted and the verified Library state loaded after in-app navigation.

## Recommendation

Ready for Luis review and then commit + PR after explicit approval.

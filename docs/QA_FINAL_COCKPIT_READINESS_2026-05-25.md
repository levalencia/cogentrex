# QA Final Cockpit Readiness — 2026-05-25

## Scope

Local validation for the final cockpit-readiness slice on branch `feature/final-cockpit-readiness`.

Focus:
- Complete the missing Exa semantic research channel in the Deep Research channel set.
- Verify the cockpit pages remain usable locally for a normal user.
- Capture screenshots for Luis to review tomorrow.

## Code changes validated

- Added `ExaChannelClient` for semantic search via `https://api.exa.ai/search`.
- Registered Exa in the native Deep Research channel registry.
- Added optional `EXA_API_KEY` environment config.
- Updated Deep Research planning prompts to advertise `exa:` alongside `web`, `reddit`, `youtube`, `rss`, `github`, `arxiv`, and `hackernews`.
- Added mocked unit coverage for:
  - Exa search request shape.
  - Exa result normalization.
  - Empty Exa result behavior when no API key is configured.
  - Exa graceful failure on non-OK provider responses.
- Updated `docs/INTEGRATION_PLAN.md` Phase 2 checklist for implemented native research channels.

## Verification

- `pnpm --filter @cogentrex/api exec vitest run src/__tests__/channelClients.test.ts`
  - Passed: 1 file, 6 tests.
- `pnpm test:api`
  - Passed: 19 files, 70 tests.
- `pnpm typecheck`
  - Passed: shared, API, and web.
- `pnpm build`
  - Passed: shared build, API build, Next.js web production build.
- Local web smoke:
  - `http://localhost:3000` returned HTTP 200.
  - Registered/logged in as a normal QA user.
  - Skills cockpit loaded.
  - Runs ledger loaded.
  - Library loaded.
  - Browser console after smoke: no captured console messages or JS errors.

## Screenshots

- Skills cockpit landing: `/Users/luisvalencia/.hermes/profiles/cogentrex/cache/screenshots/browser_screenshot_214ec8c823074864bc4b8871a18dffbd.png`
- Runs ledger: `/Users/luisvalencia/.hermes/profiles/cogentrex/cache/screenshots/browser_screenshot_bc06cfd97f104a30948f514d19c1b8fc.png`
- Library: `/Users/luisvalencia/.hermes/profiles/cogentrex/cache/screenshots/browser_screenshot_d9a8ccc13e7d41789b5bdf7d0bc7da60.png`

## Known limits / not claimed

- Exa live API was not called because this validates safely without requiring or exposing `EXA_API_KEY`.
- Admin UI was not fully smoke-tested with an admin account in this pass. The normal QA user correctly received Access Denied on `/settings/admin/skills`.
- This slice closes the missing native research channel gap; it does not implement the larger optional Skill Import / marketplace phase.

## Review notes for Luis

Tomorrow, review locally on branch `feature/final-cockpit-readiness`:

1. Start local dev: `pnpm dev`.
2. Open `http://localhost:3000`.
3. Check:
   - Skills rail and launcher cards.
   - Runs ledger filters/detail behavior.
   - Library activity/artifact layout.
   - Admin skills page with an admin user if available.
4. If `EXA_API_KEY` is configured, run a Deep Research prompt likely to use semantic discovery and confirm `exa` appears as a channel in reasoning/source events when planned.

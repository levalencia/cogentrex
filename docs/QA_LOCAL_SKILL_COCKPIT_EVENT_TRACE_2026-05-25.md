# QA — Skill Cockpit + Skill Run Event Trace — 2026-05-25

## Scope

Local smoke after implementing:

- real persisted event trace for skill runs
- `/runs/:runId/events` API surface
- Runs drawer event trace UI
- end-user Skill Cockpit shell on `/`

## Environment

- Local web: `http://localhost:3000`
- Local API: `http://localhost:3001`
- Database: temporary SQLite smoke DB at `/tmp/cogentrex-smoke.sqlite`
- Reason: repo `.env` has `DATABASE_URL` set, so smoke was intentionally run with `DATABASE_URL=` and `DATABASE_PATH=/tmp/cogentrex-smoke.sqlite` to avoid writing test users into the shared/remote database.

## Automated verification

Latest verification after reviewer-driven event sequencing fix:

- `pnpm --filter @cogentrex/shared build` ✅
- `pnpm --filter @cogentrex/api test -- skillRunsWorkflows channelClients` ✅
- `pnpm --filter @cogentrex/web test -- skillCockpit libraryOutputs` ✅
- `pnpm typecheck` ✅
- `pnpm test` ✅ — shared 5 tests, API 67 tests, web 65 tests
- `pnpm build` ✅
- Independent pre-PR review via delegated reviewer ✅ — no blocking security concerns or logic errors

Reviewer-driven fixes applied:

- Replaced `COUNT(*) + 1` event sequencing with a transactional per-run `event_sequence` counter.
- Added schema/migration backfill using `MAX(sequence)` for historical event rows.
- Constrained event appends by both `run_id` and `user_id`.
- Added API test coverage for missing/cross-user run event access returning 404.

## Visual smoke evidence

Screenshots captured locally:

1. Skill Cockpit root view:
   - `/Users/luisvalencia/.hermes/profiles/cogentrex/cache/screenshots/browser_screenshot_ecb470a9257b4aaca6452ad040fbd9ed.png`
2. Runs ledger empty state:
   - `/Users/luisvalencia/.hermes/profiles/cogentrex/cache/screenshots/browser_screenshot_c55683744aed4a0484a6a3e03d7acd42.png`
3. Library empty state:
   - `/Users/luisvalencia/.hermes/profiles/cogentrex/cache/screenshots/browser_screenshot_1c40e31ccd004d5a98486e6f5895b6e2.png`

## Smoke observations

- New user registration worked in isolated local SQLite.
- `/` renders the Skill Cockpit shell instead of dropping directly into chat.
- Sidebar shows end-user navigation: Skills, Chat, Runs, Library.
- Skill Cockpit cards render readiness from live backend config.
- Launching Deep Research from Skill Cockpit routes to `/chats` and opens the chat composer.
- With no provider configured in the isolated smoke DB, composer is correctly disabled with `Configure a provider first...`.
- `/runs` renders run health cards, search, status filter, and mode filter without JS console errors.
- Browser console showed no JS errors during the smoke.

## Known limitation of this smoke

- The visual smoke used an empty isolated DB, so the Runs drawer event trace was verified by API/web tests rather than by clicking a real run row in the browser.
- A DEV post-deploy smoke should be run after PR merge/deploy using an existing DEV user/provider configuration.

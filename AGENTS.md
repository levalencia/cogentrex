# Cogentrex — Agent Notes

## Monorepo

- **pnpm workspace** (`pnpm-workspace.yaml`): `apps/*`, `packages/*`
- **Node.js ~24**, **pnpm >=10.33.2 <11** (enforced by `packageManager` field)

### Packages
- `@cogentrex/shared` — Zod schemas + types. Must be built before other packages can import it.
- `@cogentrex/api` — Express API, TypeScript, `src/index.ts` entrypoint.
- `@cogentrex/web` — Next.js 16 (App Router), `src/app/layout.tsx` entrypoint.

## Build & Dev Commands

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Builds `shared`, then runs API and Web in parallel. |
| `pnpm build` | Full production build across all packages. |
| `pnpm typecheck` | Type-checks all packages (no emit). |
| `pnpm test` | Builds `shared`, then runs `vitest` in all packages. |
| `pnpm test:api` | Runs API tests only. |

> **Important:** `pnpm dev` and `pnpm test` both build `@cogentrex/shared` first. If `shared` changes, you must rebuild it (or re-run `pnpm dev` / `pnpm test`) for changes to propagate.

## CI Order

GitHub Actions runs: `install --frozen-lockfile` → `typecheck` → `build` → `test`.

## Local Setup

1. Copy `.env.example` → `.env`
2. Generate secrets: `openssl rand -base64 32`
3. Set `JWT_SECRET`, `APP_ENCRYPTION_KEY`, and provider config.
4. `pnpm install && pnpm dev`
5. Web: `http://localhost:3000`, API: `http://localhost:3001`

### Database
- Local: SQLite file (`data/cogentrex.sqlite`).
- Cloud: PostgreSQL Flexible Server.
- `DATABASE_PATH` (SQLite) vs `DATABASE_URL` (PostgreSQL) depending on environment.
- Shared DB code must stay compatible with both SQLite and PostgreSQL; avoid adding SQLite-only SQL to startup schema without a Postgres equivalent.
- `pnpm db:reset` deletes the SQLite database file.

## TypeScript

- Base `tsconfig.base.json` is strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **API & Shared:** `module: NodeNext`, `moduleResolution: NodeNext`.
- **Web:** `module: ESNext`, `moduleResolution: Bundler` (Next.js requirement).
- All imports must use `.js` extensions in source even for `.ts` files (NodeNext resolution).

## Testing

- **Vitest** everywhere.
- API tests use `supertest` and live in `apps/api/src/__tests__/*.test.ts`.
- Web tests live alongside source (`*.test.ts` / `*.test.tsx`).
- API test app helper: `apps/api/src/__tests__/testApp.ts`.

## Docker

- `docker compose up --build` runs both services.
- Multi-stage `Dockerfile`: `base` → `build` → `api` / `web` targets.
- `next.config.ts` uses `output: 'standalone'`.
- Web containers must run `apps/web/.next/standalone/apps/web/server.js`; `next start` is not valid with standalone output.
- When building locally on Apple Silicon for Azure Container Apps, build/push `linux/amd64` images (`docker buildx build --platform linux/amd64 ... --push`).

## Deployment

- **Azure Container Apps** (DEV/PROD).
- Pushes to the `dev` branch trigger `.github/workflows/deploy-dev.yml`.
- Workflow builds Docker images, pushes to ACR, and updates Container App revisions.
- DEV web URL: `https://cogentrex.com` (Container App fallback: `https://ca-cogentrex-web-dev.blacksmoke-54283d14.centralus.azurecontainerapps.io`); API URL: `https://api.cogentrex.com`.
- Web builds need `NEXT_PUBLIC_API_BASE_URL` at build time; setting it only as a Container App runtime env var is too late for client bundles.
- See `DEPLOYMENT.md` for full Azure provisioning instructions.

## Code Style Conventions

- No ESLint or Prettier config present in the repo. Keep changes consistent with surrounding code.
- Express routes are organized by domain (`auth/`, `chat/`, `providers/`, etc.).
- API services use constructor injection for testability.

---

## Session Log — 2026-05-05

### Achievements (This Session)
1. **Fixed repeated-login issue** caused by Container App scale-to-zero
   - Root cause: `minReplicas: 0` → API scaled to zero after 5 min idle; cold start returned 502/503
   - Frontend `bootstrap()` treated *any* API error as "logged out" (no status discrimination)
   - **Fixes applied:**
     - Set `minReplicas: 1` for both API and Web Container Apps (always-on, no cold start)
     - Added `ApiError` class in `api.ts` with HTTP status code
     - Updated `bootstrap()` to retry on 502/503/network errors (up to 6 retries, 3s delay)
     - Added `user: undefined` loading state + `isWarmingUp` flag
     - `AppShell.tsx` now shows "API is warming up…" spinner instead of instantly flipping to login
   - Both `pnpm typecheck` (web + api) pass cleanly

### Pending Items (Unchanged from Previous Sessions)

#### Critical / Blocking
1. **Rotate exposed secrets** — PostgreSQL password, `JWT_SECRET`, `APP_ENCRYPTION_KEY`, `FIRECRAWL_API_KEY`, `LINKEDIN_CLIENT_SECRET` appeared in logs/chat history

#### Medium Priority
4. **Update documentation**:
   - `README.md` with product workflow and architecture overview
   - `docs/PROVIDERS.md` for admin/global provider setup guide
   - `docs/RUNBOOK.md` for Azure troubleshooting, logs, domains, image issues
   - `DEPLOYMENT.md` refresh with current custom domains and gotchas

#### Fixed / Regression Watch
- **Social settings blank screen** — fixed. Keep only as a regression/debug note in `docs/RUNBOOK.md`; do not treat it as active backlog unless reproduced again.

#### New / Planned (From This Session)
6. **Agent God Mode integration** — Add skill-assisted chat toggle
   - Curate 100–200 skills from agent-god-mode repo
   - Pre-compute embeddings at build time
   - Modify `chatService.ts` to inject skills into system prompt
   - Add toggle to `ChatView.tsx`
   - Phase 1 estimate: 2–3 days

7. **Expand Deep Research channels** — Add native TypeScript clients
   - `githubChannelClient.ts` (public repo/code/issue search)
   - `exaChannelClient.ts` (semantic web search)
   - `arxivChannelClient.ts` (academic papers)
   - `hackernewsChannelClient.ts` (HN stories/comments)
   - Phase 2 estimate: 1–2 days

8. **Skill-assisted Deep Research** — Combine #6 + #7
   - Inject skills into planner + synthesis prompts
   - Phase 3 estimate: 1 day

9. **Agent Reach proxy** (optional, low priority) — Sidecar container for Twitter/XiaoHongShu if needed
   - Phase 4 estimate: 3–5 days (defer until explicitly requested)

### Working Tree Status
- Many modified files in working tree (from previous sessions)
- New untracked files:
  - `AGENTS.md` (this file)
  - `docs/INTEGRATION_PLAN.md`
- **Do NOT commit without explicit user permission**

### Active Environments
- **DEV:**
  - Web: `https://cogentrex.com`
  - API: `https://api.cogentrex.com`
  - Container Apps: `ca-cogentrex-web-dev`, `ca-cogentrex-api-dev`
  - ACR: `acrcogentrexdev.azurecr.io`
  - Postgres: `psql-cogentrex-dev`
- **Branch:** `dev` (triggers deploy via `.github/workflows/deploy-dev.yml`)

### Known Gotchas
- Apple Silicon → Azure image mismatch: must use `docker buildx build --platform linux/amd64`
- Next standalone server: must run `apps/web/.next/standalone/apps/web/server.js`, not `next start`
- Container App ingress port: web must be `3000`, not `80`
- `NEXT_PUBLIC_API_BASE_URL` must be set at **build time**, not runtime
- `API_PUBLIC_BASE_URL` used for OAuth/callback URLs; `API_PORT` is internal only
- `WEB_ORIGIN` supports comma-separated values for CORS
- DB startup schema must be compatible with both SQLite and PostgreSQL
- Postgres queries use `$1, $2...` placeholders (not `?`)
- Shared package (`@cogentrex/shared`) must be rebuilt after any schema/type changes

### Next Actions (Immediate)
1. Review the UI refactor master plan/design artifacts before choosing the next product slice
2. Rotate exposed secrets

---

## Development Workflow (Effective 2026-05-05)

### Branch Strategy
```
feature/<name>  ──►  dev  ──►  (auto deploy to Azure DEV)
```

1. **All work happens in feature branches** — never commit directly to `dev` or `main`
2. **Develop and test locally** before creating a PR
3. **Only create PR + merge after user explicit approval**
4. **Pushing `dev` branch** still triggers `.github/workflows/deploy-dev.yml`

### Current Feature Branches
| Branch | Status | Description |
|--------|--------|-------------|
| `feature/fix-login-retry-and-social-logs` | ✅ Committed | Login retry, warming spinner, social logs button |

### How to Review a Feature
```bash
git fetch origin
git checkout feature/fix-login-retry-and-social-logs
git diff dev
# Review changes, run pnpm typecheck / pnpm test
# If approved: gh pr create --base dev --title "..."
```

### Local Dev Reminder
- `DATABASE_URL` in `.env` points to **remote PostgreSQL** — schema changes affect DEV database
- Test with `pnpm dev` (localhost:3000/3001)
- Run `pnpm typecheck` and `pnpm test:api` before saying "ready for PR"
- Do NOT run `pnpm db:reset` against remote Postgres

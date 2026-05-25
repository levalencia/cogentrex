# Cogentrex Runbook

Operational notes for local development, DEV deployment, and common production-style issues.

## Environments

### Local

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Default database: SQLite via `DATABASE_PATH=./data/cogentrex.sqlite`
- Optional PostgreSQL: set `DATABASE_URL` explicitly. Be careful: if `.env` points at cloud PostgreSQL, local actions can affect DEV data.

### DEV

- Web: `https://cogentrex.com`
- Web fallback: `https://ca-cogentrex-web-dev.blacksmoke-54283d14.centralus.azurecontainerapps.io`
- API: `https://api.cogentrex.com`
- Azure Container Apps:
  - API: `ca-cogentrex-api-dev`
  - Web: `ca-cogentrex-web-dev`
  - Scrapling sidecar: `ca-cogentrex-scrapling-dev`
- Azure Container Registry: `acrcogentrexdev.azurecr.io`
- PostgreSQL Flexible Server: `psql-cogentrex-dev`
- Branch `dev` triggers `.github/workflows/deploy-dev.yml`.

## Local development

```bash
pnpm install
pnpm dev
```

`pnpm dev` builds `@cogentrex/shared`, then starts API and web in parallel.

Useful checks:

```bash
curl -fsS http://localhost:3001/health
pnpm typecheck
pnpm test:api
```

## Deploy flow

1. Work on a feature branch.
2. Run focused checks locally.
3. Open PR against `dev`.
4. Merge only after approval.
5. Merge to `dev` triggers DEV deployment.
6. Verify health and critical routes after deploy.

Smoke checks after DEV deploy:

```bash
curl -fsS https://api.cogentrex.com/health
curl -I -fsS https://cogentrex.com
```

For authenticated pages, verify in browser with a real session.

Admin protected-route smoke checks:

1. Without a session, open `/settings/admin/skills` or `/settings/admin/providers`; the app should redirect/show login, not an empty admin UI.
2. With a signed-in non-admin user, the page should show Access Denied.
3. With an admin user, the page should load data and avoid console/page errors.

## Domains and ingress

Current DEV public domains:

- Web custom domain: `https://cogentrex.com`
- API custom domain: `https://api.cogentrex.com`
- Web Container App fallback: `https://ca-cogentrex-web-dev.blacksmoke-54283d14.centralus.azurecontainerapps.io`

Troubleshooting order:

1. Check the custom domain first, then the Container App fallback URL.
2. Verify API health directly: `curl -fsS https://api.cogentrex.com/health`.
3. If the custom domain fails but fallback works, inspect DNS/custom-domain binding/certificate status.
4. If both custom and fallback fail, inspect Container App revision health and logs.

## Azure Container Apps notes

DEV currently keeps API and web warm with `minReplicas: 1` to avoid cold-start login behavior.

Why this matters:

- With scale-to-zero, the API can return transient `502`/`503` during cold start.
- The frontend bootstrap must not treat transient API failures as logout.
- The web app now retries transient bootstrap failures and shows a warming state.

## Common issues

### Deep Research, Skill Assist, Library, and Runs smoke

Current operable loop:

1. Open `/chats` and switch to **Deep Research**.
2. Optional: enable **Skill Assist** in the composer. In Deep Research this injects relevant native skill guidance into both planning and synthesis prompts.
3. Submit a bounded research question.
4. Verify the planning step returns a plan, then start the research run.
5. Verify streamed evidence:
   - reasoning / diagnostic events appear during the run
   - sources are emitted with titles and URLs
   - final answer includes citations
6. Save the assistant output to Library.
7. Verify `/library` shows the saved artifact.
8. Verify `/runs` shows a Deep Research run with event count, source/artifact observability, status, and conversation/job linkage.

Focused regression commands:

```bash
pnpm --filter @cogentrex/api test -- src/__tests__/research.test.ts --run
pnpm --filter @cogentrex/web test -- src/lib/libraryOutputs.test.ts src/lib/skillCockpit.test.ts --run
```

QA evidence should include screenshots for: Deep Research answer with sources, saved Library artifact, and the `/runs` ledger row/details.

### Skill cockpit and admin governance smoke

Current governance surfaces:

- `/skills` — user-facing skill cockpit: readiness cards, workflow launcher, and recent run health.
- `/runs` — auditable run ledger for skill-backed workflows.
- `/settings/admin/skills` — admin-only skill registry and route configuration.
- `/settings/admin/analytics` — admin-only workflow analytics for run volume, failures, provider usage, and mode breakdowns.
- `/settings/admin/providers` — admin provider management.

Access checks:

1. Unauthenticated users should be redirected before admin APIs are called.
2. Signed-in non-admin users should see **Access Denied** for admin pages and receive `403` from admin APIs.
3. Admin users should be able to load skills, analytics, and providers without console errors.
4. Analytics CTAs that reference run history should route to `/runs`, not the Library artifact shelf.

Focused regression commands:

```bash
pnpm --filter @cogentrex/api test -- src/__tests__/skills.test.ts src/__tests__/adminAnalytics.test.ts --run
pnpm --filter @cogentrex/web test -- src/lib/adminAnalytics.test.ts src/lib/protectedRoute.test.ts src/lib/skillCockpit.test.ts --run
```

For visual QA, prefer an isolated local SQLite DB and seeded fixture data. Do not mutate DEV PostgreSQL or promote users for admin screenshots unless explicitly approved.

### User is sent to login after idle time

Check:

1. API health: `https://api.cogentrex.com/health`
2. Container App replica count / revision health.
3. Browser console for bootstrap errors.
4. Confirm API/web `minReplicas` are not accidentally reset to `0`.

### `/settings/social` blank page

Known fixed root cause:

- `GET /api/scheduled-posts` used to return a serialized `Promise` object because async service calls were not awaited.
- The frontend expected an array and crashed when filtering scheduled posts.

If it recurs:

1. Check browser console.
2. Check `GET /api/scheduled-posts` response shape; it must be `{ "posts": [...] }`.
3. Run API scheduled posts regression tests.

```bash
pnpm --filter @cogentrex/api test -- src/__tests__/scheduledPosts.test.ts
```

### Image generation timeout

Do not assume all image providers are broken. Verify the selected provider/model first.

Check:

1. Which provider/model generated the request.
2. API logs for timeout, provider status, and request duration.
3. Azure Foundry deployment health/quota if using `gpt-image-2`.
4. Whether FLUX or another image provider still works.
5. Whether the API timeout is lower than the provider's expected image generation latency.

Evidence to capture without secrets:

- provider name and model/deployment name
- request duration and HTTP status/error class
- Container App revision SHA (`DEPLOY_SHA`) if available
- whether another configured image provider succeeds

Recommended product behavior:

- Show provider-specific errors.
- Do not silently imply all image generation is down if only one provider times out.
- Prefer a fallback provider only when the user can see which provider produced the image.

### GitHub Actions runtime warnings

If GitHub warns that Node.js 20 actions are deprecated, inspect `.github/workflows/*.yml` and update actions to versions whose `action.yml` declares `node24`.

Current expected action major versions:

- `actions/checkout@v6`
- `pnpm/action-setup@v5`
- `actions/setup-node@v6`
- `azure/login@v3`

Validate with PR CI and the next `Deploy to DEV` run.

### Search/research quality looks weak

Check configured adapters:

- `WEB_SEARCH_ADAPTER`: preferred search path is Brave or Scrapling search sidecar.
- `WEB_FETCH_ADAPTER`: preferred fetch/extract path is Scrapling.
- Firecrawl is optional/fallback, not the primary required path.

If local `.env` has a Brave key and Scrapling sidecar URL, Deep Research should not need Firecrawl credits for normal search/fetch.

Research adapter smoke checklist:

1. Verify API health: `curl -fsS http://localhost:3001/health` or `curl -fsS https://api.cogentrex.com/health`.
2. In the app, open provider settings and check Deep Research readiness.
3. Confirm `web.search` is ready with Brave or Scrapling.
4. Confirm `web.fetch` / `web.extract` are ready with Scrapling when `SCRAPLING_BASE_URL` is configured.
5. Run a small Deep Research query and inspect diagnostics/sources.
6. If sources are mostly snippets, focus on fetch/extract health before changing the model provider.

Do not paste `.env`, Azure app settings, provider keys, cookies, or database URLs into issue comments or chats while debugging this.

## Logs

Container App logs:

```bash
ENV=dev
RG=rg-cogentrex-$ENV
API_APP=ca-cogentrex-api-$ENV
WEB_APP=ca-cogentrex-web-$ENV

az containerapp logs show --name $API_APP --resource-group $RG --follow
az containerapp logs show --name $WEB_APP --resource-group $RG --follow
```

Revision and app state:

```bash
az containerapp show --name $API_APP --resource-group $RG --query '{fqdn:properties.configuration.ingress.fqdn, latestRevision:properties.latestRevisionName, provisioningState:properties.provisioningState}'
az containerapp revision list --name $API_APP --resource-group $RG --query '[].{name:name, active:properties.active, trafficWeight:properties.trafficWeight, healthState:properties.healthState}'
```

Do not paste secrets from logs into chat, issues, docs, or PRs.

## Verification commands

Smallest useful checks before PR:

```bash
pnpm --filter @cogentrex/api typecheck
pnpm --filter @cogentrex/web typecheck
pnpm --filter @cogentrex/api test
git diff --check
```

Broader check:

```bash
pnpm typecheck
pnpm build
pnpm test
```

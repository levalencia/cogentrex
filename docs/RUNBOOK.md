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
- API: `https://api.cogentrex.com`
- Azure Container Apps:
  - API: `ca-cogentrex-api-dev`
  - Web: `ca-cogentrex-web-dev`
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

## Azure Container Apps notes

DEV currently keeps API and web warm with `minReplicas: 1` to avoid cold-start login behavior.

Why this matters:

- With scale-to-zero, the API can return transient `502`/`503` during cold start.
- The frontend bootstrap must not treat transient API failures as logout.
- The web app now retries transient bootstrap failures and shows a warming state.

## Common issues

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

Recommended product behavior:

- Show provider-specific errors.
- Do not silently imply all image generation is down if only one provider times out.

### Search/research quality looks weak

Check configured adapters:

- `WEB_SEARCH_ADAPTER`: preferred search path is Brave or Scrapling search sidecar.
- `WEB_FETCH_ADAPTER`: preferred fetch/extract path is Scrapling.
- Firecrawl is optional/fallback, not the primary required path.

If local `.env` has a Brave key and Scrapling sidecar URL, Deep Research should not need Firecrawl credits for normal search/fetch.

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

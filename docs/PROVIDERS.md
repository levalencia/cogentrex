# Providers and Research Adapters

Cogentrex separates model providers from web research adapters. Keep those concerns separate when debugging or extending the product.

## Model providers

Model providers power chat, deep research synthesis, social writing, and image generation.

Examples:

- Azure Foundry / OpenAI-compatible chat models
- Image providers such as FLUX or `gpt-image-2`
- Per-mode defaults configured through admin/provider settings

Provider secrets must be encrypted at rest and never printed in logs.

## Admin/global provider setup

Admins manage shared provider configuration from `/settings/admin/providers`. User-level provider settings live under `/settings/providers` when a user needs personal routing.

Use the admin route for defaults that should be available to the whole app:

1. Add or update the provider endpoint, model/deployment name, and API key.
2. Assign mode defaults deliberately: Chat, Deep Research, Social Writing, Image Generation, and Video Generation can have different defaults.
3. Save and then verify with a real request in the target mode. A provider can be valid for chat but invalid for image generation.
4. If a provider is disabled or rotated, verify existing mode defaults do not point at the disabled config.

Operational rules:

- Never paste raw provider keys in logs, issues, screenshots, or PR descriptions.
- Report provider names, model names, adapter names, and status codes; redact keys and full connection strings.
- Keep `@cogentrex/shared` schemas synchronized with API/web when provider config contracts change.
- Admin pages are protected routes. Unauthenticated users should be redirected before admin-only APIs are called; signed-in non-admin users should see Access Denied.

## Mode routing checklist

When a mode fails, first confirm which provider was actually selected:

- **Chat**: selected chat provider/model and streaming response health.
- **Deep Research**: selected synthesis model plus search/fetch adapter readiness.
- **Social Writing**: selected writing model, optional research source count, and LinkedIn connection state if publishing.
- **Image Generation**: selected image provider/model, provider-specific timeout, quota, and whether another image provider succeeds.

Do not fix a model-routing bug by changing research adapter settings, and do not fix weak source collection by changing the chat model.

## Research adapter model

Deep Research needs two different capabilities:

1. **Search** — given a query, find candidate URLs/snippets.
2. **Fetch/extract** — given a URL, retrieve usable page content/markdown.

These are intentionally separate. A good search provider is not always a good page extractor.

Treat this as the source-of-truth boundary when debugging Deep Research:

- Model provider selection answers: “which LLM writes/plans/synthesizes?”
- Search adapter selection answers: “which service finds candidate URLs?”
- Fetch adapter selection answers: “which service turns selected URLs into markdown?”

Do not force a model-provider change when the symptom is weak URLs or empty extracted content. Start by checking the search/fetch adapter state.

## Current adapter priority

### Search

Preferred:

1. Brave Search via `BRAVE_SEARCH_API_KEY`
2. Scrapling sidecar search via `SCRAPLING_BASE_URL` when `WEB_SEARCH_ADAPTER=scrapling`
3. Firecrawl search as optional fallback
4. Fake search for local/test fallback

### Fetch / extract

Preferred:

1. Scrapling sidecar fetch via `SCRAPLING_BASE_URL`
2. Firecrawl scrape as optional fallback
3. Simple/fake fetch only for degraded local/test scenarios

## Environment variables

```bash
BRAVE_SEARCH_API_KEY=
SCRAPLING_BASE_URL=http://localhost:8000
WEB_SEARCH_ADAPTER=brave      # brave | scrapling | firecrawl | fake
WEB_FETCH_ADAPTER=scrapling   # scrapling | firecrawl | simple | fake
FIRECRAWL_API_KEY=            # optional fallback, not required for normal Brave+Scrapling flow
```

If `WEB_SEARCH_ADAPTER` is unset, the API chooses in this order:

1. Brave if `BRAVE_SEARCH_API_KEY` exists.
2. Scrapling search if `SCRAPLING_BASE_URL` exists.
3. Firecrawl if `FIRECRAWL_API_KEY` exists.
4. Fake search fallback.

If `WEB_FETCH_ADAPTER` is unset, the API uses Scrapling when `SCRAPLING_BASE_URL` exists.

Forced adapter settings win over automatic detection. For example, `WEB_SEARCH_ADAPTER=firecrawl` will keep using Firecrawl even if `BRAVE_SEARCH_API_KEY` is present. Remove the forced adapter value when returning to automatic priority.

## Local setup patterns

### Recommended local research setup

```bash
BRAVE_SEARCH_API_KEY=<set locally>
WEB_SEARCH_ADAPTER=brave
WEB_FETCH_ADAPTER=scrapling
SCRAPLING_BASE_URL=http://localhost:8000
```

This uses Brave for search and Scrapling for page fetch/extraction.

### Scrapling-only local setup

```bash
WEB_SEARCH_ADAPTER=scrapling
WEB_FETCH_ADAPTER=scrapling
SCRAPLING_BASE_URL=http://localhost:8000
```

Use this only if the Scrapling sidecar exposes both `/search` and `/fetch`.

### Firecrawl fallback

```bash
WEB_SEARCH_ADAPTER=firecrawl
WEB_FETCH_ADAPTER=firecrawl
FIRECRAWL_API_KEY=<set locally or in Key Vault>
```

Use this only when Firecrawl credits and API health are acceptable. Firecrawl is not required for the preferred Brave+Scrapling path.

## DEV defaults and deployment notes

Current DEV deployment expects:

- `WEB_SEARCH_ADAPTER=brave` when `BRAVE_SEARCH_API_KEY` is available.
- `WEB_FETCH_ADAPTER=scrapling` with `SCRAPLING_BASE_URL` pointing at the internal Scrapling Container App URL.
- Firecrawl as optional fallback only.

The deploy workflow sets adapter env vars on the API Container App. Changing GitHub secrets or Container App env vars requires a redeploy or explicit Container App update before the API process sees them.

## Capability readiness

The API exposes tool/capability readiness so the UI can show whether web search/fetch are ready, degraded, or missing.

Relevant code:

- `GET /api/capabilities` — authenticated readiness endpoint
- `apps/api/src/capabilities/toolCapabilities.ts`
- `apps/api/src/tools/searchClient.ts`
- `apps/web/src/components/CapabilityReadinessPanel.tsx`

Expected readiness for the preferred setup:

- `web.search`: ready with `brave.search`
- `web.fetch`: ready with `scrapling.fetch`
- `web.extract`: ready with `scrapling.extract`

Practical verification path:

1. Log in locally or in DEV.
2. Open provider settings and inspect the capability readiness panel.
3. Confirm Deep Research has both model-provider readiness and tool readiness.
4. If readiness disagrees with expected env vars, restart the API/container after changing env configuration.

Do not expose API keys while debugging readiness. Report adapter names and statuses only.

## Scrapling sidecar contract

When `SCRAPLING_BASE_URL` is configured, the API expects the sidecar to expose:

- `POST /search` with JSON `{ "query": string, "limit": number }`, returning `{ "results": [...] }`.
- `POST /fetch` with JSON `{ "url": string }`, returning either a page object or `{ "data": page }`.

Normalized page objects should include at least:

- `url`
- `title`
- `markdown`
- optional `description`

If Scrapling fetch returns no `markdown`, Deep Research may still show search snippets but synthesis quality will be weaker.

## Deep Research flow

1. Planner generates focused queries.
2. Channel registry dispatches queries to enabled channels.
3. Web channel uses the configured search adapter.
4. URL content is fetched/extracted through the configured fetch adapter when needed.
5. Synthesis prompt should cite only collected sources.

Core files:

- `apps/api/src/research/researchService.ts`
- `apps/api/src/research/researchPrompts.ts`
- `apps/api/src/tools/channels/channelRegistry.ts`
- `apps/api/src/tools/channels/webChannelClient.ts`
- `apps/api/src/tools/searchClient.ts`

## Troubleshooting

### Deep Research says it searched but sources are weak

Check:

1. Which adapter is actually active.
2. Whether Brave has a key in the active environment.
3. Whether the Scrapling sidecar is running and reachable from the API container/process.
4. Whether the query planner is producing useful queries.
5. Whether source fetch/extract is returning markdown or only snippets.

Useful evidence to collect:

- active `WEB_SEARCH_ADAPTER` / `WEB_FETCH_ADAPTER` names, without secrets
- capability readiness status for `web.search`, `web.fetch`, and `web.extract`
- number of sources collected
- whether sources contain full markdown excerpts or only snippets

### Local works but DEV does not

Likely causes:

- Local `.env` has `BRAVE_SEARCH_API_KEY`, but DEV env/Key Vault does not.
- Local Scrapling sidecar is reachable at `localhost:8000`, but DEV container cannot reach that local URL.
- `WEB_SEARCH_ADAPTER` or `WEB_FETCH_ADAPTER` differs between local and DEV.

### Firecrawl credits are exhausted

Use Brave+Scrapling instead of Firecrawl. Remove Firecrawl as the forced adapter if configured.

## Adding new research channels

A new channel should implement `ChannelClient` and return normalized `ChannelResult` records.

Good low-friction future channels:

- Hacker News Algolia API: no auth, good startup/engineering signal.
- arXiv API: no auth, good academic/research signal.
- GitHub public APIs: useful for repo/issues/code research, but code search may require auth/rate-limit handling.

Avoid adding new channels until the existing web search/fetch readiness is visible and documented.

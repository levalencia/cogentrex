# Providers and Research Adapters

Cogentrex separates model providers from web research adapters. Keep those concerns separate when debugging or extending the product.

## Model providers

Model providers power chat, deep research synthesis, social writing, and image generation.

Examples:

- Azure Foundry / OpenAI-compatible chat models
- Image providers such as FLUX or `gpt-image-2`
- Per-mode defaults configured through admin/provider settings

Provider secrets must be encrypted at rest and never printed in logs.

## Research adapter model

Deep Research needs two different capabilities:

1. **Search** — given a query, find candidate URLs/snippets.
2. **Fetch/extract** — given a URL, retrieve usable page content/markdown.

These are intentionally separate. A good search provider is not always a good page extractor.

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

## Capability readiness

The API exposes tool/capability readiness so the UI can show whether web search/fetch are ready, degraded, or missing.

Relevant code:

- `apps/api/src/capabilities/toolCapabilities.ts`
- `apps/api/src/tools/searchClient.ts`

Expected readiness for the preferred setup:

- `web.search`: ready with `brave.search`
- `web.fetch`: ready with `scrapling.fetch`
- `web.extract`: ready with `scrapling.extract`

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

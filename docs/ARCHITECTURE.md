# Architecture

## Backend Boundaries

- Routes validate request bodies with Zod at the boundary.
- Services hold business logic and depend on interfaces (`LanguageModelClient`, `WebSearchClient`) for testability.
- Repositories own SQL access and use parameterized queries only.
- API keys are decrypted only when resolving a provider for a model call.

## Deep Research Flow

1. Create or reuse a conversation.
2. Stream `start` event to the UI.
3. Plan up to 10 focused search queries with the selected model.
4. Search enabled channels for each query, deduplicate URLs, stream sources as they arrive.
5. Stream reasoning checkpoints for plan/search/review/synthesis.
6. Ask the selected model to synthesize the final answer using only collected sources.
7. Persist the assistant message with source metadata.

### Search vs Fetch

Web research separates two capabilities:

- `web.search`: turns a natural-language query into candidate URLs/snippets. Preferred adapter is Brave Search when `BRAVE_SEARCH_API_KEY` is configured. Scrapling search and Firecrawl can be used as alternatives/fallbacks.
- `web.fetch` / `web.extract`: turns a URL into usable page markdown. Preferred adapter is Scrapling via `SCRAPLING_BASE_URL`. Firecrawl is optional fallback, not required for the primary Brave+Scrapling path.

This separation avoids coupling research quality to a single paid scraping/search vendor.

## Social Publishing Flow

1. Social writing generates platform-specific drafts.
2. LinkedIn OAuth connects a user account through the API callback route.
3. Scheduled posts are persisted server-side and listed through `/api/scheduled-posts`.
4. Social settings must tolerate empty scheduled-post lists and return `{ posts: [] }` rather than non-array values.

LinkedIn callback configuration belongs in the LinkedIn Developer Portal. Do not change it unless the OAuth flow is reproduced as broken.

## Image Generation Flow

Image generation is provider-specific. A timeout from one provider/model should not be treated as global image failure.

Troubleshooting should capture:

- selected provider/model
- API request duration
- provider response/error
- whether another configured image provider succeeds

## Security Decisions

- Passwords: bcrypt with 12 rounds.
- Sessions: JWT in httpOnly sameSite cookies.
- Provider secrets: AES-256-GCM encrypted at rest.
- HTTP hardening: Helmet, CORS allowlist, request size limit, rate limiting.
- Production refuses test-only JWT/encryption secrets.

## Observability Decisions

- Logs are structured JSON via Pino and emitted to stdout.
- `requestLogger` assigns or preserves `x-request-id`, writes it to the response header, and adds it to every request-scoped log.
- Service logs avoid raw user prompts and raw emails by logging SHA-256 short hashes and content lengths.
- Provider API keys, cookies, authorization headers, tokens, and password fields are redacted.
- Deep Research emits both user-visible SSE trace events and backend logs for the same lifecycle: plan, search, source collection, synthesis, finish.

## Design Principles

- Dependency inversion: model and search clients are interfaces.
- Single responsibility: routes, services, repositories, and clients are separated.
- Open/closed provider routing: new providers can be added by mapping config to a runtime client without changing chat/research logic.
- Testability: API tests use in-memory SQLite, fake LLM, and fake web search.

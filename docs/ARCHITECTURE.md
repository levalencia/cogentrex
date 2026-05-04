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
4. Search Firecrawl for each query, deduplicate URLs, stream sources as they arrive.
5. Stream reasoning checkpoints for plan/search/review/synthesis.
6. Ask the selected model to synthesize the final answer using only collected sources.
7. Persist the assistant message with source metadata.

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

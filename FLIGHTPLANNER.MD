# Flight Planner — Implementation Plan

## Overview

A specialized flight search and vacation planning feature for Cogentrex that helps users find optimal flight combinations based on date constraints, destination preferences, and price optimization. Built as an enhancement to the existing Deep Research system with optional real-time flight API integration.

## Problem Statement

Current Deep Research can answer flight planning questions with static search results, but it cannot:
- Provide real-time prices
- Optimize date windows programmatically (e.g., "max 5 working days + weekends = 9 days total")
- Generate structured, reusable travel plan artifacts
- Compare multiple destinations side-by-side with actual pricing

## Architecture Options

| Approach | Pros | Cons | Phase |
|---|---|---|---|
| **A. Enhanced Deep Research** (better prompts + web search) | Zero new infra, works today | No real-time data, text-only | **Phase 1** |
| **B. Native Flight API Channel** (Amadeus/Skyscanner/Kiwi) | Real prices, structured data | API keys, rate limits, pricing tiers | **Phase 2** |
| **C. MCP Tools** (flight MCP server) | Standard protocol, reusable | Separate process complexity, limited battle-tested flight MCP servers | **Phase 3 (optional)** |
| **D. Agent God Mode Skills** (flight planning skill embeddings) | Domain expertise injection | Still text-only, no real data | Parallel with Phase 1 |

## Recommended Approach: Hybrid Phase 1 + Phase 2

**Skip MCP for now.** MCP adds operational complexity (separate process, stdio/SSE transport) without significant benefit for flight search. Wrap flight APIs directly as a backend channel first. Convert to MCP later if building a general-purpose agent platform.

## Phase 1: Enhanced Deep Research + Date Optimization Engine (1-2 days)

### Features
1. **New `FLIGHT_PLANNER` mode** alongside Chat/Deep Research/Image/Video/Social
2. **Date optimization engine**: Given constraints (origin, date range, max working days), pre-compute candidate windows ranked by "price potential"
3. **Flight-specific prompts**: Instruct LLM to always output structured data with booking URLs,
estimated prices, and reasoning
4. **Web search enhancement**: Add dedicated flight search channels (Ryanair Fare Finder, Google Flights, Skyscanner)

### Date Optimization Logic
```typescript
// European vacation pattern optimizer
function generateDateWindows(params: {
  origin: string;
  dateRange: { start: Date; end: Date };
  maxWorkingDays: number;
  preferredDestinations: string[];
}): DateWindow[] {
  // Patterns:
  // - Sáb → Dom siguiente = 9 days, 5 working days (ideal)
  // - Mar → Dom = 6 days, 4 working days
  // - Mié → Dom = 5 days, 3 working days
  // Returns ranked by weekend coverage and price potential
}
```

### Output Format
```json
{
  "recommendations": [
    {
      "destination": "Bologna",
      "airportCode": "BLQ",
      "dates": { "outbound": "2026-06-27", "return": "2026-07-05" },
      "durationDays": 9,
      "workingDaysUsed": 5,
      "estimatedPrice": { "min": 39, "max": 89, "currency": "EUR" },
      "bookingUrl": "https://www.ryanair.com/...",
      "reasoning": "Direct Ryanair route from CRL, low season pricing",
      "alternatives": [...]
    }
  ]
}
```

## Phase 2: Native Flight Search API Channel (2-3 days)

### API Options

| API | Free Tier | Coverage | Auth Complexity |
|---|---|---|---|
| **Amadeus Self-Service** | 2,000 calls/month | Global | OAuth2, moderate |
| **Skyscanner Partner** | Partner approval required | Global | API key, requires approval |
| **Kiwi/Tequila API** | 200 calls/day (search) | Budget airlines | API key, simple |

**Recommendation**: Start with **Amadeus** (most comprehensive, generous free tier).

### Backend Integration
- New file: `apps/api/src/tools/channels/flightSearchChannelClient.ts`
- Implements `ChannelClient` interface
- Accepts: `{ origin, destinations[], dateRange, maxDurationDays, adults, currency }`
- Returns: structured flight offer with prices, airlines, booking links

### Integration with Deep Research
- Flight channel feeds real prices into research process
- LLM synthesizes results + adds reasoning about trade-offs
- Sources are cited with actual API timestamps

## Phase 3: MCP Integration (Optional, Later)
- Wrap flight API channel as an MCP server
- Reusable across other agent frameworks
- Only worth doing if Cogentrex becomes a general-purpose agent platform

## Agent God Mode Integration (Parallel)

Instead of generic MCP tools:
- Curate **flight planning skills** (Ryanair Fare Finder tips, Google Flights date grid usage, cheapest CRL routes)
- Pre-compute skill embeddings
- Inject into system prompt when `FLIGHT_PLANNER` mode is active

This gives the LLM domain expertise without requiring new API integrations.

## Open Questions

1. **Real-time prices in Phase 1?**
   - Yes → Need API signup (Amadeus/Skyscanner)
   - No → Enhanced prompts + date optimization only

2. **New `FLIGHT_PLANNER` mode or enhance `DEEP_RESEARCH`?**
   - New mode = dedicated UI, simpler user experience
   - Enhance existing = less code duplication

3. **Artifact output?**
   - Downloadable trip plan (PDF/markdown)
   - Shareable link with live price updates?

4. **Budget/price tracking?**
   - Alert user when prices drop?
   - Requires scheduled jobs + price history storage

## Files to Touch

### Phase 1
- `apps/web/src/store/appStore.ts` — Add `FLIGHT_PLANNER` to `AppMode`
- `apps/web/src/components/ProviderPicker.tsx` — Show new mode
- `packages/shared/src/types.ts` — `AppMode` union
- `apps/api/src/chat/chatService.ts` — Route to flight planner
- `apps/api/src/research/researchPrompts.ts` — Flight planning prompts
- `apps/api/src/research/researchPlanner.ts` — Date optimization integration
- New: `apps/api/src/flights/dateOptimizer.ts` — Date window generation

### Phase 2
- New: `apps/api/src/tools/channels/flightSearchChannelClient.ts`
- New: `apps/api/src/flights/amadeusClient.ts` — Amadeus API wrapper
- `apps/api/src/db/schema.sql.ts` — Price history table (optional)

## Acceptance Criteria

### Phase 1
- [ ] User can select "Flight Planner" mode in UI
- [ ] Date optimization engine generates valid windows for "5 working days + weekends" constraint
- [ ] LLM responds with structured recommendations including estimated prices and booking URLs
- [ ] Research trace shows flight search steps explicitly

### Phase 2
- [ ] Real-time prices from Amadeus API appear in recommendations
- [ ] Multiple destinations compared side-by-side
- [ ] Booking links are clickable and valid
- [ ] Response cites API source with timestamp

### Phase 3 (Optional)
- [ ] Flight search exposed as MCP server
- [ ] Other MCP clients can call flight search tools

## Notes

- **Priority**: Phase 1 is high-value with zero new infrastructure
- **Phase 2 blocked on**: API key procurement (Amadeus account setup)
- **User preference**: European low-cost carriers (Ryanair, Wizz Air) from CRL/BRU
- **Constraint**: Maximize weekend usage, minimize working days off

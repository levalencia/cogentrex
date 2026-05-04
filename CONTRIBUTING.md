# Contributing to Cogentrex

Thank you for your interest in contributing!

## Development Setup

1. **Prerequisites**: Node.js ~24, pnpm >=10.33.2
2. **Install**: `pnpm install`
3. **Environment**: Copy `.env.example` to `.env` and fill in secrets (see README.md)
4. **Dev server**: `pnpm dev` (starts API on :3001 and web on :3000)

## Code Style

- TypeScript strict mode is enabled.
- Use `exactOptionalPropertyTypes: true` — optional interface fields must include `| undefined`.
- Prefer explicit return types on public functions.
- Keep components small and focused; use Zustand for global state.
- Backend services should log using the structured Pino logger; never log secrets or API keys.

## Testing

- Write unit tests for shared packages and backend services.
- Integration tests for auth and streaming endpoints live in `apps/api/src/**/*.test.ts`.
- Run `pnpm test` before opening a PR.

## Branching & PRs

- Create feature branches from `dev`: `feature/your-feature-name`.
- Open PRs against `dev` for DEV environment testing.
- `dev` branch auto-deploys to Azure DEV via GitHub Actions.
- `main` branch is for production releases.

## Security

- Never commit `.env` files.
- Never log API keys or passwords.
- Use the existing encryption utilities for sensitive provider data.

## Questions?

Open an issue or reach out via the project discussions.

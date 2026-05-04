# Cogentrex

Self-hosted multi-provider AI research cockpit with deep research, provider routing, channel-aware agents, image generation, social writing, and LinkedIn posting.

## Features

- **Multi-Provider Chat**: Streamed chat with any OpenAI-compatible endpoint. Per-mode default providers for Chat, Deep Research, Social Writing, Image Generation, and Video Generation.
- **Deep Research V2**: Autonomous web research with up to 10 iterations, multi-channel search (Web, Reddit, RSS, YouTube), visible reasoning trace, source cards with citations, and export to Markdown/PDF.
- **Image Generation & Editing**: Generate images with FLUX (Azure BFL) and gpt-image-2. Edit images with natural language descriptions.
- **Social Writing**: Generate platform-specific posts for LinkedIn, X (Twitter), Medium, Reddit, and Substack. Optional mini deep research with configurable source count.
- **LinkedIn Integration**: OAuth posting and scheduling with text + images.
- **Artifacts Panel**: Automatic extraction of code, HTML, SVG, and Markdown artifacts into a side panel with syntax highlighting and preview.
- **Projects**: Organize conversations into projects for better workflow management.
- **Security**: AES-256-GCM encrypted API keys at rest, bcrypt password hashing, JWT httpOnly cookies, structured JSON logging with secret redaction.

## Architecture

- `apps/api`: Node.js 24, Express, TypeScript. Local dev uses SQLite (better-sqlite3). Cloud uses PostgreSQL Flexible Server.
- `apps/web`: Next.js 16, React, Tailwind CSS, Zustand.
- `packages/shared`: Shared TypeScript contracts and Zod schemas.

## Local Setup

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Generate secrets:

```bash
openssl rand -base64 32
```

3. Set these values in `.env`:

```bash
JWT_SECRET=<your-secret>
APP_ENCRYPTION_KEY=<your-encryption-key>
FIRECRAWL_API_KEY=fc-...      # optional for chat, required for real deep research
DEFAULT_PROVIDER_BASE_URL=https://YOUR-FOUNDRY-ENDPOINT.openai.azure.com/openai/v1
DEFAULT_PROVIDER_MODEL=gpt-5.5
LOG_LEVEL=info
```

4. Install and run:

```bash
pnpm install
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000).

## First Use

1. Register an account with email/password.
2. Open **Provider Settings**.
3. Add your Microsoft Foundry endpoint, API key, and model/deployment name.
4. Use **Chat** for regular streaming, **Deep Research** for autonomous research, **Social** for writing posts, or **Image** for generating media.

## Testing

```bash
pnpm test        # run all tests
pnpm typecheck   # type-check all packages
pnpm build       # production build
```

## Docker

```bash
docker compose up --build
```

The web app runs on `http://localhost:3000`; the API on `http://localhost:3001`.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Azure Container Apps DEV/PROD deployment instructions.

## License

MIT

import request from 'supertest';
import { AppDatabase } from '../db/database.js';
import { createApp } from '../app.js';
import { FakeLanguageModelClient } from '../chat/languageModel.js';
import type { LanguageModelClient } from '../chat/languageModel.js';
import { FakeWebSearchClient } from '../tools/searchClient.js';
import type { AppEnv } from '../config/env.js';
import type { GoogleOAuthClient } from '../auth/googleOAuthClient.js';
import { silentLogger } from '../observability/logger.js';

export async function makeTestApp(overrides: Partial<AppEnv> = {}, deps: { search?: import('../tools/searchClient.js').WebSearchClient; llm?: LanguageModelClient; googleOAuth?: GoogleOAuthClient } = {}) {
  const database = new AppDatabase(':memory:');
  await database.init();
  const env: AppEnv = {
    NODE_ENV: 'test',
    API_PORT: 0,
    WEB_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: ':memory:',
    JWT_SECRET: 'test-jwt-secret-with-enough-length',
    APP_ENCRYPTION_KEY: 'test-encryption-secret-with-enough-length',
    FIRECRAWL_API_KEY: undefined,
    BRAVE_SEARCH_API_KEY: undefined,
    SCRAPLING_BASE_URL: undefined,
    WEB_SEARCH_ADAPTER: undefined,
    WEB_FETCH_ADAPTER: undefined,
    DEFAULT_PROVIDER_NAME: 'Microsoft Foundry Kimi',
    DEFAULT_PROVIDER_BASE_URL: 'https://foundry.example.com/openai/v1',
    DEFAULT_PROVIDER_MODEL: 'Kimi 2.6',
    LOG_LEVEL: 'silent',
    QA_FIXTURES_ENABLED: false,
    ...overrides,
  };
  const appDeps = {
    database,
    llm: deps.llm ?? new FakeLanguageModelClient('Research answer with citation [1].'),
    logger: silentLogger,
    search: deps.search ?? new FakeWebSearchClient([
      {
        title: 'Academic source',
        url: 'https://example.com/source',
        markdown: 'Detailed source content for the research question.',
        description: 'Detailed source content',
      },
    ]),
    ...(deps.googleOAuth ? { googleOAuth: deps.googleOAuth } : {}),
  };
  const created = await createApp(env, appDeps);
  return { ...created, agent: request.agent(created.app) };
}

export async function registerAndLogin(agent: request.Agent) {
  const response = await agent
    .post('/api/auth/register')
    .send({ email: 'reader@example.com', password: 'super-secret-password' })
    .expect(201);
  return response.body.user as { id: string; email: string };
}

export async function createProvider(agent: request.Agent) {
  const response = await agent
    .post('/api/providers')
    .send({
      name: 'Microsoft Foundry Kimi',
      baseUrl: 'https://foundry.example.com/openai/v1',
      apiKey: 'test-api-key',
      model: 'Kimi 2.6',
      kind: 'AZURE_FOUNDRY',
      isDefault: true,
    })
    .expect(201);
  return response.body.provider as { id: string };
}

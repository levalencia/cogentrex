import { config as loadDotEnv } from 'dotenv';
import { resolve } from 'path';
import { z } from 'zod';

// Ensure monorepo root .env is loaded (API runs from apps/api, so root is two levels up)
loadDotEnv({ path: resolve(process.cwd(), '../../.env') });
loadDotEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().default('sqlite://./data/cogentrex.sqlite'),
  JWT_SECRET: z.string().min(24).default('test-only-jwt-secret-that-must-be-overridden'),
  APP_ENCRYPTION_KEY: z.string().min(24).default('test-only-encryption-secret-overridden'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  FIRECRAWL_API_KEY: z.string().optional(),
  DEFAULT_PROVIDER_NAME: z.string().default('Microsoft Foundry Kimi'),
  DEFAULT_PROVIDER_BASE_URL: z.string().url().optional(),
  DEFAULT_PROVIDER_MODEL: z.string().default('Kimi 2.6'),
  MEDIA_DIR: z.string().optional(),
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function readEnv(overrides: NodeJS.ProcessEnv = process.env): AppEnv {
  const env = envSchema.parse(overrides);
  if (env.NODE_ENV === 'production') {
    if (env.JWT_SECRET.startsWith('test-only')) {
      throw new Error('JWT_SECRET must be configured in production');
    }
    if (env.APP_ENCRYPTION_KEY.startsWith('test-only')) {
      throw new Error('APP_ENCRYPTION_KEY must be configured in production');
    }
  }
  return env;
}

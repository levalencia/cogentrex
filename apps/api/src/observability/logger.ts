import pino from 'pino';
import { createHash, randomUUID } from 'node:crypto';

export interface LogFields {
  [key: string]: unknown;
}

export interface AppLogger {
  fatal(fields: LogFields, message: string): void;
  error(fields: LogFields, message: string): void;
  warn(fields: LogFields, message: string): void;
  info(fields: LogFields, message: string): void;
  debug(fields: LogFields, message: string): void;
  child(fields: LogFields): AppLogger;
}

const secretLikeKeys = new Set([
  'apiKey',
  'authorization',
  'cookie',
  'encryptedApiKey',
  'password',
  'passwordHash',
  'session',
  'token',
]);

export function hashForLog(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function createRequestId(): string {
  return randomUUID();
}

export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForLog);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      secretLikeKeys.has(key) || key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')
        ? '[REDACTED]'
        : redactForLog(entry),
    ]),
  );
}

export function createLogger(level: string): AppLogger {
  const logger = pino({
    level,
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: [
        'apiKey',
        'authorization',
        'cookie',
        'encryptedApiKey',
        'password',
        'passwordHash',
        'req.headers.authorization',
        'req.headers.cookie',
        'session',
        'token',
      ],
      censor: '[REDACTED]',
    },
  });
  return logger as AppLogger;
}

export const silentLogger = createLogger('silent');

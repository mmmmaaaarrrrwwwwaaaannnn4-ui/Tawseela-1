import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

/** server/ — one level up from src/config.ts and from the dist/server.js bundle alike. */
export const SERVER_ROOT = resolve(import.meta.dirname, '..');

// Local development reads server/.env (git-ignored). In production, set real environment variables.
const envFile = resolve(SERVER_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/** An optional setting; an empty value (a placeholder in .env waiting to be filled) counts as unset. */
const optional = (s: z.ZodString = z.string()) =>
  z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined))
    .pipe(s.optional());

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** comma-separated origins allowed to call the API from a browser; native apps don't send Origin */
  CORS_ORIGINS: z.string().default(''),

  /** Firebase project. Locally the emulators use `demo-fig`. */
  FIREBASE_PROJECT_ID: z.string().min(1).default('demo-fig'),
  /** Firestore database inside the project; empty = `(default)`. Use a named one when the project is shared. */
  FIRESTORE_DATABASE_ID: optional(z.string().regex(/^[a-z][a-z0-9-]{2,62}$|^\(default\)$/, 'should be a Firestore database id like fig-fennel')),
  /** JSON text for a service-account key, stored as a Replit Secret (never commit it). */
  FIREBASE_SERVICE_ACCOUNT_JSON: optional(),
  /** Optional path to a service-account JSON key for local development; not needed with emulators. */
  GOOGLE_APPLICATION_CREDENTIALS: optional(),
  /** host:port of the local emulators (`npm run emulators`) — set both to use them */
  FIRESTORE_EMULATOR_HOST: optional(),
  FIREBASE_AUTH_EMULATOR_HOST: optional(),

  /** Kashier merchant credentials: server-only Replit Secrets. */
  KASHIER_MERCHANT_ID: optional(),
  KASHIER_PAYMENT_API_KEY: optional(),
  KASHIER_SECRET_KEY: optional(),
  KASHIER_MODE: z.enum(['test', 'live']).default('test'),
  /** Public HTTPS URL of this API deployment, used by Kashier webhooks. */
  PUBLIC_API_URL: optional(z.string().url()),
  CURRENCY: z.string().length(3).default('EGP'),

  /** ImageKit private key — uploads only; delivery URLs are public */
  IMAGEKIT_PRIVATE_KEY: optional(),
  IMAGEKIT_FOLDER: z.string().default('/fig-fennel'),

  /** Demo kitchen: move new orders one stage every N seconds, as if staff worked them (0 = off — the team does it). */
  DEMO_KITCHEN_SECONDS: z.coerce.number().int().min(0).default(0),
  /** Swagger UI at /docs */
  API_DOCS: bool.default(true),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    // names the setting and the rule, never the value (it may be a secret)
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid server configuration:\n${issues}`);
  }
  return parsed.data;
}

export const usingEmulators = (c: Config) => !!(c.FIRESTORE_EMULATOR_HOST || c.FIREBASE_AUTH_EMULATOR_HOST);

/** 'test' or 'live' for a configured Kashier key. */
export const kashierMode = (c: Config) => c.KASHIER_MODE;

/** The Firestore database in use, for logs. */
export const databaseLabel = (c: Config) => c.FIRESTORE_DATABASE_ID ?? '(default)';

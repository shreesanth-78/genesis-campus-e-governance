import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '../..');
// backend/.env wins; a .env at the repository root is only a fallback for variables it does not set.
dotenv.config({ path: path.resolve(apiRoot, '.env') });
dotenv.config({ path: path.resolve(apiRoot, '../.env') });

const bool = (def) =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  // Browser origin(s) allowed to call the API, comma separated (the deployed frontend URL).
  WEB_URL: z.string().default('http://localhost:5173'),
  // Public URL of this API, only needed when the website is served from a DIFFERENT domain (poster links become
  // absolute). Leave empty when the backend serves the website itself: links stay relative.
  API_URL: z.string().default(''),
  LOG_LEVEL: z.string().default('info'),
  APP_TIMEZONE: z.string().default('Asia/Kolkata'),
  // PostgreSQL (Neon) is the database. sqlite3 exists only for the automated tests and the end-to-end stack.
  DATABASE_CLIENT: z.enum(['sqlite3', 'pg']).default('pg'),
  SQLITE_FILE: z.string().default('./data/dev.sqlite'),
  DATABASE_URL: z.string().optional(),
  // 'lax' when the site and API share a domain; 'none' (needs HTTPS) when they are on different domains.
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).optional(),
  JWT_SECRET: z.string().default('change-me-to-a-long-random-string'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().default(14),
  ALLOWED_EMAIL_DOMAINS: z.string().default('campus.example'),
  AUTO_VERIFY_EMAIL: bool('false'),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  RATE_LIMIT_MAX: z.coerce.number().default(30),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  // Development and end-to-end tests only: append every outgoing mail to this file as JSON lines.
  MAIL_OUTBOX_FILE: z.string().default(''),
  MAIL_FROM: z.string().default('Campus Clubs Portal <no-reply@campus.example>'),
  // Chat model: set GROQ_API_KEY (Groq) or ANTHROPIC_API_KEY (Claude). Groq wins when both are set.
  GROQ_API_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default(''),
  CHAT_TIMEOUT_MS: z.coerce.number().default(20000),
  CHAT_RATE_PER_MINUTE: z.coerce.number().default(20),
  // Demo sign-ins for the portal screens (STU2026001, CLUB001, OSA001, EVT001). Ignored in production.
  SEED_DEMO_PORTAL: bool('true'),
});

export function loadConfig(env = process.env) {
  // Treat empty strings as unset so ".env.example" blanks fall back to defaults.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === 'production') {
    if (c.JWT_SECRET.length < 32 || c.JWT_SECRET.startsWith('change-me')) {
      throw new Error('JWT_SECRET is missing or too weak for production');
    }
    if (c.AUTO_VERIFY_EMAIL) throw new Error('AUTO_VERIFY_EMAIL must be false in production');
    if (c.MAIL_OUTBOX_FILE) throw new Error('MAIL_OUTBOX_FILE must not be set in production');
  }
  return {
    ...c,
    apiRoot,
    allowedEmailDomains: c.ALLOWED_EMAIL_DOMAINS.split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    isProd: c.NODE_ENV === 'production',
    webOrigins: c.WEB_URL.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    cookieSameSite: c.COOKIE_SAMESITE ?? (c.NODE_ENV === 'production' ? 'none' : 'lax'),
  };
}

export const config = loadConfig();

/** Test helper: shallow-merge overrides into the live config object. */
export function overrideConfig(patch) {
  Object.assign(config, patch);
  return config;
}

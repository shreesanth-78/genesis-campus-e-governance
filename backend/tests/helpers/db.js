import { createKnex } from '../../src/db/knex.js';

/**
 * Fresh migrated database for a test file.
 * SQLite (in-memory) by default. PostgreSQL only when TEST_DATABASE_CLIENT=pg and TEST_DATABASE_URL are set. That
 * database is WIPED (schema `public` is dropped), so it must be a separate throwaway database or Neon branch, never the
 * one the app uses. Run it with a direct (non-pooler) connection; test files run one at a time.
 */
export async function createTestDb() {
  if (process.env.TEST_DATABASE_CLIENT !== 'pg') {
    const knex = createKnex({ client: 'sqlite3', filename: ':memory:' });
    await knex.migrate.latest();
    return knex;
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests');
  const dbName = (u) => new URL(u).pathname + '@' + new URL(u).hostname.replace('-pooler', '');
  const appUrl = process.env.APP_DATABASE_URL_FOR_GUARD;
  if (appUrl && dbName(appUrl) === dbName(url))
    throw new Error('TEST_DATABASE_URL points at the app database. Use a separate one.');
  const knex = createKnex({ client: 'pg', connectionString: url });
  await knex.raw('DROP SCHEMA public CASCADE');
  await knex.raw('CREATE SCHEMA public');
  await knex.migrate.latest();
  return knex;
}

export const TABLES_IN_CLEAN_ORDER = [
  'gov_club_posts',
  'gov_club_settings',
  'gov_club_members',
  'gov_files',
  'gov_user_state',
  'gov_registrations',
  'gov_club_authorities',
  'gov_meta',
  'gov_docs',
  'audit_logs',
  'refresh_tokens',
  'auth_tokens',
  'users',
];

export async function cleanDb(knex) {
  for (const t of TABLES_IN_CLEAN_ORDER) await knex(t).del();
}

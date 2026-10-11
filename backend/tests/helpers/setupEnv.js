// Runs before every test file. Must set env BEFORE config is imported.

process.env.NODE_ENV = 'test';
// Tests must never touch the real database named in .env.
// Remember the app database only so the PostgreSQL test helper can refuse to wipe it.
process.env.APP_DATABASE_URL_FOR_GUARD = process.env.DATABASE_URL ?? '';
process.env.DATABASE_CLIENT = 'sqlite3';
delete process.env.DATABASE_URL;
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.BCRYPT_COST = '4';
process.env.AUTO_VERIFY_EMAIL = 'false';
process.env.ALLOWED_EMAIL_DOMAINS = 'campus.example';
process.env.RATE_LIMIT_MAX = '100000';
process.env.WEB_URL = 'http://localhost:5173';
// Tests never call a real model; the chatbot uses its built-in fallback unless a test injects a client.
process.env.ANTHROPIC_API_KEY = '';
process.env.GROQ_API_KEY = '';
process.env.API_URL = ''; // poster links stay relative unless a test sets it

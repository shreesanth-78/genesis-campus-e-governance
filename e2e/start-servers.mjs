// Starts a seeded test stack for Playwright: a fresh SQLite database, the API on 4100 and the web app on 5273.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'e2e', '.data');
fs.rmSync(data, { recursive: true, force: true });
fs.mkdirSync(data, { recursive: true });

const apiEnv = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: '4100',
  WEB_URL: 'http://localhost:5273',
  API_URL: '',
  LOG_LEVEL: 'warn',
  DATABASE_CLIENT: 'sqlite3',
  DATABASE_URL: '',
  SQLITE_FILE: '../e2e/.data/e2e.sqlite',
  JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret-1234',
  AUTO_VERIFY_EMAIL: 'true',
  BCRYPT_COST: '4',
  RATE_LIMIT_MAX: '10000',
  SEED_DEMO_PORTAL: 'true',
  ANTHROPIC_API_KEY: '',
  GROQ_API_KEY: '', // the journeys must not depend on a live model
};

const reset = spawnSync(process.execPath, ['e2e/setup-db.mjs'], {
  cwd: root,
  env: apiEnv,
  stdio: 'inherit',
});
if (reset.status !== 0) process.exit(reset.status ?? 1);

const api = spawn(process.execPath, ['backend/src/server.js'], { cwd: root, env: apiEnv, stdio: 'inherit' });
const web = spawn(
  process.execPath,
  [path.join(root, 'node_modules/vite/bin/vite.js'), '--port', '5273', '--strictPort'],
  {
    cwd: path.join(root, 'frontend'),
    env: { ...process.env, API_TARGET: 'http://localhost:4100' },
    stdio: 'inherit',
  },
);

const stop = () => {
  api.kill();
  web.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
api.on('exit', (code) => code && stop());
web.on('exit', (code) => code && stop());

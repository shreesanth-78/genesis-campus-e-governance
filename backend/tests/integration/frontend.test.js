import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createTestDb } from '../helpers/db.js';

let knex;
let dir;
beforeAll(async () => {
  knex = await createTestDb();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-dist-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    '<!doctype html><title>GENESIS</title><div id="root"></div>',
  );
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log("app")');
});
afterAll(async () => {
  await knex.destroy();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the backend also serves the built website', () => {
  it('serves index.html at / and for every client-side route', async () => {
    const app = createApp({ db: knex, frontendDir: dir });
    for (const p of ['/', '/login/student', '/student/dashboard', '/admin/osa/requests/REQ-1248']) {
      const res = await request(app).get(p);
      expect(res.status, p).toBe(200);
      expect(res.text).toContain('<div id="root">');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('serves fingerprinted assets with a long cache', async () => {
    const res = await request(createApp({ db: knex, frontendDir: dir })).get('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/immutable/);
  });

  it('keeps the API untouched: real routes work and unknown API paths stay a JSON 404', async () => {
    const app = createApp({ db: knex, frontendDir: dir });
    expect((await request(app).get('/api/v1/health')).body.data.status).toBe('ok');
    const missing = await request(app).get('/api/v1/nothing-here');
    expect(missing.status).toBe(404);
    expect(missing.headers['content-type']).toMatch(/json/);
    expect(missing.text).not.toContain('<div id="root">');
  });

  it('serves no website when the frontend has not been built', async () => {
    const res = await request(createApp({ db: knex, frontendDir: path.join(dir, 'missing') })).get('/');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
  });
});

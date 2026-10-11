import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { DEMO_USERS } from '@gcc/shared/gov';
import { createTestDb, cleanDb } from '../helpers/db.js';
import { buildTestApp } from '../helpers/app.js';
import { overrideConfig } from '../../src/config/index.js';
import { seedGovernance, seedPortalUsers } from '../../src/db/seeding/governance.js';
import { _resetChatLimit } from '../../src/modules/gov/ai.service.js';

const BASE = '/api/v1';
// A 1x1 transparent PNG with the real file signature.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
let knex;
let app;

const demo = (id) => DEMO_USERS.find((u) => u.userId === id);
const portalOf = (u) => (u.role === 'admin' ? u.adminType : u.role);

async function session(userId, theApp = app) {
  const u = demo(userId);
  const res = await request(theApp)
    .post(`${BASE}/auth/login`)
    .send({ identifier: userId, password: u.password, portal: portalOf(u) });
  expect(res.status).toBe(200);
  const headers = { Authorization: `Bearer ${res.body.data.accessToken}`, 'X-Portal': portalOf(u) };
  return {
    get: (p) => request(theApp).get(`${BASE}${p}`).set(headers),
    post: (p, body) =>
      request(theApp)
        .post(`${BASE}${p}`)
        .set(headers)
        .send(body ?? {}),
    act: (name, ...args) => request(theApp).post(`${BASE}/gov/actions/${name}`).set(headers).send({ args }),
  };
}

const goodRequest = (over = {}) => ({
  title: 'Maker Night',
  category: 'Workshop',
  description: 'An evening of building small electronics projects together with mentors from the club.',
  date: '2026-10-30',
  startTime: '17:00',
  endTime: '19:30',
  venue: 'Seminar Room 3',
  capacity: 40,
  regDeadline: '2026-10-28',
  regDeadlineTime: '18:00',
  audience: 'All current students',
  poster: { name: 'poster.png', size: 400000, dataUrl: `data:image/png;base64,${PNG}` },
  documents: {
    permission_letter: { name: 'permission.pdf', size: 1000 },
    proposal: { name: 'proposal.pdf', size: 2000 },
    venue_form: { name: 'venue.pdf', size: 3000 },
  },
  ...over,
});

beforeAll(async () => {
  knex = await createTestDb();
  app = buildTestApp(knex, { llm: null });
});
afterAll(async () => knex.destroy());
beforeEach(async () => {
  await cleanDb(knex);
  overrideConfig({ SEED_DEMO_PORTAL: true });
  _resetChatLimit();
  await seedGovernance(knex);
  await seedPortalUsers(knex);
});

describe('hall recommendation', () => {
  it('ranks the halls for the number of people and recommends one that is big enough', async () => {
    const club = await session('CLUB001');
    const res = await club.post('/ai/halls', { attendance: 50, category: 'Workshop' });
    expect(res.status).toBe(200);
    const { rankings, summary, engine } = res.body.data;
    expect(engine).toBe('rules');
    expect(rankings).toHaveLength(8);
    const best = rankings.find((h) => h.recommended);
    expect(best.name).toBe('Innovation Lab');
    expect(best.capacity).toBeGreaterThanOrEqual(50);
    expect(rankings.find((h) => h.name === 'Seminar Room 3').status).toBe('too_small');
    expect(summary).toMatch(/Innovation Lab/);
  });

  it('marks a hall that another request already holds, without telling a club whose event it is', async () => {
    const club = await session('CLUB001');
    const osa = await session('OSA001');
    // REQ-1244 (Cultural club, submitted) holds University Amphitheatre on 2026-12-05 16:00 to 21:00
    const input = {
      attendance: 500,
      category: 'Cultural',
      date: '2026-12-05',
      startTime: '17:00',
      endTime: '19:00',
    };
    const asClub = (await club.post('/ai/halls', input)).body.data;
    const amph = asClub.rankings.find((h) => h.name === 'University Amphitheatre');
    expect(amph.status).toBe('booked');
    expect(amph.recommended).toBe(false);
    expect(JSON.stringify(asClub)).not.toContain('Winter Cultural Fest');
    expect(JSON.stringify(asClub)).toContain('Another club');
    const asOsa = (await osa.post('/ai/halls', input)).body.data;
    expect(JSON.stringify(asOsa)).toContain('Winter Cultural Fest'); // administrators see everything
  });

  it('is for club authorities and reviewers only, and validates the input', async () => {
    const student = await session('STU2026001');
    expect((await student.post('/ai/halls', { attendance: 50 })).status).toBe(403);
    const club = await session('CLUB001');
    expect((await club.post('/ai/halls', { attendance: 0 })).status).toBe(400);
    expect((await club.post('/ai/halls', {})).status).toBe(400);
    expect((await request(app).post(`${BASE}/ai/halls`).send({ attendance: 50 })).status).toBe(401);
  });

  it('lets the model explain the choice from the ranked data, and falls back when it fails', async () => {
    const calls = [];
    const llmApp = buildTestApp(knex, {
      llm: {
        ask: async (a) => (
          calls.push(a),
          { text: '**Innovation Lab** is the best fit: 83% full and built for workshops.', refused: false }
        ),
      },
    });
    const club = await session('CLUB001', llmApp);
    const res = await club.post('/ai/halls', { attendance: 50, category: 'Workshop' });
    expect(res.body.data.engine).toBe('ai');
    expect(res.body.data.summary).toBe('Innovation Lab is the best fit: 83% full and built for workshops.');
    const prompt = calls[0].messages[0].content;
    expect(prompt).toContain('Expected attendance: 50');
    expect(prompt).toContain('Innovation Lab: holds 60');
    expect(calls[0].system).toMatch(/Never invent halls/);

    const failing = buildTestApp(knex, {
      llm: {
        ask: async () => {
          throw new Error('down');
        },
      },
    });
    const again = await (
      await session('CLUB001', failing)
    ).post('/ai/halls', { attendance: 50, category: 'Workshop' });
    expect(again.body.data.engine).toBe('rules');
    expect(again.body.data.summary).toMatch(/Innovation Lab/);
  });
});

describe('hall permission through the API', () => {
  it('the Events Section approves or reassigns; a club or student cannot', async () => {
    const club = await session('CLUB001');
    const events = await session('EVT001');
    const student = await session('STU2026001');
    const id = (await club.act('saveRequest', goodRequest(), { submit: true })).body.data.extra.id;

    expect((await club.act('reviewHall', id, { decision: 'approve' })).status).toBe(403);
    expect((await student.act('reviewHall', id, { decision: 'approve' })).status).toBe(403);

    const view = (await club.get('/gov/state')).body.data.requests.find((r) => r.id === id);
    expect(view.hall.status).toBe('pending');

    const moved = await events.act('reviewHall', id, {
      decision: 'reassign',
      venue: 'Innovation Lab',
      note: 'Room is being repainted.',
    });
    expect(moved.body.data.ok).toBe(true);
    const after = (await club.get('/gov/state')).body.data.requests.find((r) => r.id === id);
    expect(after.venue).toBe('Innovation Lab');
    expect(after.hall).toMatchObject({
      status: 'approved',
      requestedVenue: 'Seminar Room 3',
      note: 'Room is being repainted.',
    });

    // a hall that holds fewer people than expected is refused
    const crowd = (
      await club.act(
        'saveRequest',
        goodRequest({ title: 'Big Crowd Night', capacity: 100, venue: 'Central Library Hall' }),
        { submit: true },
      )
    ).body.data.extra.id;
    const tooSmall = await events.act('reviewHall', crowd, { decision: 'reassign', venue: 'Innovation Lab' });
    expect(tooSmall.body.data.ok).toBe(false);
    expect(tooSmall.body.data.error).toMatch(/holds 60/);
  });

  it('rejecting the hall sends the request back with the reason for the club to fix', async () => {
    const club = await session('CLUB001');
    const events = await session('EVT001');
    const id = (await club.act('saveRequest', goodRequest({ title: 'Reject Hall Night' }), { submit: true }))
      .body.data.extra.id;
    expect((await events.act('reviewHall', id, { decision: 'reject', note: '' })).body.data.ok).toBe(false);
    const rejected = await events.act('reviewHall', id, {
      decision: 'reject',
      note: 'Closed for exams that week.',
    });
    expect(rejected.body.data.ok).toBe(true);
    const r = (await club.get('/gov/state')).body.data.requests.find((x) => x.id === id);
    expect(r.status).toBe('correction_requested');
    expect(r.hall.status).toBe('rejected');
    expect(r.feedback.at(-1).note).toBe('Closed for exams that week.');
    const resub = await club.act(
      'saveRequest',
      goodRequest({ title: 'Reject Hall Night', venue: 'Innovation Lab' }),
      { submit: true, id },
    );
    expect(resub.body.data.ok).toBe(true);
  });
});

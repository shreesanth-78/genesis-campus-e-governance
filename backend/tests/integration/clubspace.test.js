import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { DEMO_USERS } from '@gcc/shared/gov';
import { createTestDb, cleanDb } from '../helpers/db.js';
import { buildTestApp } from '../helpers/app.js';
import { overrideConfig } from '../../src/config/index.js';
import { seedGovernance, seedPortalUsers } from '../../src/db/seeding/governance.js';
import { _resetPostLimit } from '../../src/modules/gov/clubspace.service.js';

const BASE = '/api/v1';
let knex;
let app;

const demo = (id) => DEMO_USERS.find((u) => u.userId === id);
const portalOf = (u) => (u.role === 'admin' ? u.adminType : u.role);

async function session(userId) {
  const u = demo(userId);
  const res = await request(app)
    .post(`${BASE}/auth/login`)
    .send({ identifier: userId, password: u.password, portal: portalOf(u) });
  expect(res.status).toBe(200);
  const h = { Authorization: `Bearer ${res.body.data.accessToken}`, 'X-Portal': portalOf(u) };
  return {
    get: (p) => request(app).get(`${BASE}${p}`).set(h),
    post: (p, body) =>
      request(app)
        .post(`${BASE}${p}`)
        .set(h)
        .send(body ?? {}),
    put: (p, body) =>
      request(app)
        .put(`${BASE}${p}`)
        .set(h)
        .send(body ?? {}),
    del: (p) => request(app).delete(`${BASE}${p}`).set(h),
  };
}

beforeAll(async () => {
  knex = await createTestDb();
  app = buildTestApp(knex, { llm: null });
});
afterAll(async () => knex.destroy());
beforeEach(async () => {
  await cleanDb(knex);
  overrideConfig({ SEED_DEMO_PORTAL: true });
  _resetPostLimit();
  await seedGovernance(knex);
  await seedPortalUsers(knex);
});

describe('joining a club', () => {
  it('the demo student starts in the Innovation club and can join and leave others', async () => {
    const s = await session('STU2026001');
    expect((await s.get('/gov/student')).body.data.memberships).toEqual(['innovation']);
    const joined = await s.post('/gov/student/memberships', { clubId: 'robotics' });
    expect(joined.status).toBe(201);
    expect(joined.body.data.memberships).toEqual(['innovation', 'robotics']);
    expect(
      (await s.post('/gov/student/memberships', { clubId: 'robotics' })).body.data.memberships,
    ).toHaveLength(2); // once
    expect((await s.del('/gov/student/memberships/robotics')).body.data.memberships).toEqual(['innovation']);
    expect((await s.post('/gov/student/memberships', { clubId: 'no-such-club' })).status).toBe(404);
  });

  it('is for students only', async () => {
    expect(
      (await (await session('OSA001')).post('/gov/student/memberships', { clubId: 'robotics' })).status,
    ).toBe(403);
    expect(
      (await (await session('CLUB001')).post('/gov/student/memberships', { clubId: 'robotics' })).status,
    ).toBe(403);
  });
});

describe('the club space', () => {
  it('is private: only members of the club and its own authority can open it', async () => {
    const student = await session('STU2026001');
    const robotics = await session('CLUB002');
    const innovation = await session('CLUB001');
    expect((await student.get('/gov/clubs/robotics/space')).status).toBe(403); // not joined
    await student.post('/gov/student/memberships', { clubId: 'robotics' });
    expect((await student.get('/gov/clubs/robotics/space')).status).toBe(200);
    expect((await robotics.get('/gov/clubs/robotics/space')).status).toBe(200);
    expect((await innovation.get('/gov/clubs/robotics/space')).status).toBe(403); // another club's authority
    expect((await (await session('OSA001')).get('/gov/clubs/robotics/space')).status).toBe(403);
    expect((await student.get('/gov/clubs/no-such-club/space')).status).toBe(404);
    expect((await request(app).get(`${BASE}/gov/clubs/robotics/space`)).status).toBe(401);
    // leaving closes it again
    await student.del('/gov/student/memberships/robotics');
    expect((await student.get('/gov/clubs/robotics/space')).status).toBe(403);
  });

  it('shows the welcome announcement, lets members discuss and only the authority announce', async () => {
    const student = await session('STU2026001');
    const club = await session('CLUB001');
    const first = (await student.get('/gov/clubs/innovation/space')).body.data;
    expect(first.canAnnounce).toBe(false);
    expect(first.posts[0]).toMatchObject({ kind: 'announcement', authorRole: 'authority' });

    const said = await student.post('/gov/clubs/innovation/posts', {
      kind: 'discussion',
      body: 'Who is bringing laptops on Friday?',
    });
    expect(said.status).toBe(201);
    expect(said.body.data).toMatchObject({ authorName: 'Arjun Kumar', authorRole: 'member', mine: true });
    expect(
      (await student.post('/gov/clubs/innovation/posts', { kind: 'announcement', body: 'Hi' })).status,
    ).toBe(403);

    const note = await club.post('/gov/clubs/innovation/posts', {
      kind: 'announcement',
      body: 'Sprint moved to 5 PM.',
      eventId: 'REQ-1251',
    });
    expect(note.status).toBe(201);
    expect(note.body.data).toMatchObject({
      authorRole: 'authority',
      kind: 'announcement',
      eventId: 'REQ-1251',
    });

    const board = (await student.get('/gov/clubs/innovation/space')).body.data;
    expect(board.posts.map((p) => p.body)).toEqual([
      expect.stringContaining('Welcome'),
      'Who is bringing laptops on Friday?',
      'Sprint moved to 5 PM.',
    ]);
    expect(board.memberCount).toBe(1);
    // a student only sees the club's circulated events as tags; the authority sees all of its events
    expect(board.events.every((e) => e.id !== 'REQ-1251')).toBe(true);
    const asClub = (await club.get('/gov/clubs/innovation/space')).body.data;
    expect(asClub.events.some((e) => e.id === 'REQ-1251')).toBe(true);
  });

  it('keeps posts short and plain, and tags only the club’s own events', async () => {
    const student = await session('STU2026001');
    const post = (body, extra = {}) =>
      student.post('/gov/clubs/innovation/posts', { kind: 'discussion', body, ...extra });
    expect((await post('   ')).status).toBe(400);
    expect((await post('x'.repeat(1001))).status).toBe(400);
    expect((await post('x'.repeat(1000))).status).toBe(201);
    const odd = await post('a\u0000b\u0007c <script>alert(1)</script>');
    expect(odd.body.data.body).toBe('abc <script>alert(1)</script>'); // control characters go; markup stays as text
    expect((await post('hello', { eventId: 'REQ-1244' })).status).toBe(400); // another club's event
    expect((await post('hello', { eventId: 'REQ-0000' })).status).toBe(400);
    expect((await student.post('/gov/clubs/innovation/posts', { kind: 'chat', body: 'x' })).status).toBe(400);
  });

  it('limits how fast one person can post', async () => {
    const student = await session('STU2026001');
    for (let i = 0; i < 12; i += 1)
      expect(
        (await student.post('/gov/clubs/innovation/posts', { kind: 'discussion', body: `msg ${i}` })).status,
      ).toBe(201);
    expect(
      (await student.post('/gov/clubs/innovation/posts', { kind: 'discussion', body: 'one too many' }))
        .status,
    ).toBe(429);
  });

  it('lets people delete their own posts, and the authority delete any', async () => {
    const student = await session('STU2026001');
    const club = await session('CLUB001');
    const mine = (await student.post('/gov/clubs/innovation/posts', { kind: 'discussion', body: 'mine' }))
      .body.data;
    const theirs = (
      await club.post('/gov/clubs/innovation/posts', { kind: 'announcement', body: 'official' })
    ).body.data;
    expect((await student.del(`/gov/clubs/innovation/posts/${theirs.id}`)).status).toBe(403);
    expect((await student.del(`/gov/clubs/innovation/posts/${mine.id}`)).status).toBe(200);
    const again = await student.post('/gov/clubs/innovation/posts', { kind: 'discussion', body: 'second' });
    expect((await club.del(`/gov/clubs/innovation/posts/${again.body.data.id}`)).status).toBe(200);
    expect((await club.del('/gov/clubs/innovation/posts/nope')).status).toBe(404);
  });

  it('shows the member list to the club authority only, who can remove a member', async () => {
    const student = await session('STU2026001');
    const club = await session('CLUB001');
    expect((await student.get('/gov/clubs/innovation/members')).status).toBe(403);
    const list = (await club.get('/gov/clubs/innovation/members')).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Arjun Kumar', userId: 'STU2026001' });
    expect((await club.del(`/gov/clubs/innovation/members/${list[0].id}`)).status).toBe(200);
    expect((await student.get('/gov/clubs/innovation/space')).status).toBe(403); // no longer a member
  });
});

describe('club space settings', () => {
  it('lets the authority make the space announcement-only; members can still read', async () => {
    const student = await session('STU2026001');
    const club = await session('CLUB001');
    expect((await student.get('/gov/clubs/innovation/space')).body.data.settings).toEqual({
      membersCanPost: true,
      joinOpen: true,
    });
    expect((await student.put('/gov/clubs/innovation/settings', { membersCanPost: false })).status).toBe(403);

    const set = await club.put('/gov/clubs/innovation/settings', { membersCanPost: false });
    expect(set.status).toBe(200);
    expect(set.body.data).toEqual({ membersCanPost: false, joinOpen: true });

    const refused = await student.post('/gov/clubs/innovation/posts', { kind: 'discussion', body: 'hello' });
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toMatch(/Only the club authority can post/);
    expect((await student.get('/gov/clubs/innovation/space')).status).toBe(200); // still readable
    expect(
      (await club.post('/gov/clubs/innovation/posts', { kind: 'announcement', body: 'Only I can talk.' }))
        .status,
    ).toBe(201);
    expect(
      (await club.post('/gov/clubs/innovation/posts', { kind: 'discussion', body: 'And I can chat.' }))
        .status,
    ).toBe(201);

    await club.put('/gov/clubs/innovation/settings', { membersCanPost: true });
    expect(
      (await student.post('/gov/clubs/innovation/posts', { kind: 'discussion', body: 'back on' })).status,
    ).toBe(201);
  });

  it('lets the authority close a club to new members without removing the ones it has', async () => {
    const student = await session('STU2026001');
    const robotics = await session('CLUB002');
    const other = await session('CLUB001');
    expect((await other.put('/gov/clubs/robotics/settings', { joinOpen: false })).status).toBe(403); // not their club
    await student.post('/gov/student/memberships', { clubId: 'robotics' });
    expect((await robotics.put('/gov/clubs/robotics/settings', { joinOpen: false })).body.data.joinOpen).toBe(
      false,
    );

    const me = (await student.get('/gov/student')).body.data;
    expect(me.closedClubs).toEqual(['robotics']);
    expect(me.memberships).toContain('robotics'); // the existing member stays
    expect((await student.get('/gov/clubs/robotics/space')).status).toBe(200);

    await student.del('/gov/student/memberships/robotics');
    const closed = await student.post('/gov/student/memberships', { clubId: 'robotics' });
    expect(closed.status).toBe(403);
    expect(closed.body.error.message).toMatch(/not taking new members/);
    await robotics.put('/gov/clubs/robotics/settings', { joinOpen: true });
    expect((await student.post('/gov/student/memberships', { clubId: 'robotics' })).status).toBe(201);
  });

  it('only accepts true or false', async () => {
    const club = await session('CLUB001');
    expect((await club.put('/gov/clubs/innovation/settings', { membersCanPost: 'no' })).status).toBe(400);
  });
});

import { describe, expect, it } from 'vitest';
import { createSeedState } from '../src/gov/seed.js';
import * as wf from '../src/gov/workflow.js';
import { hallStatus } from '../src/gov/selectors.js';
import { DEMO_USERS } from '../src/gov/demoUsers.js';
import { VENUES } from '../src/gov/govData.js';
import { hallSummary, rankHalls } from '../src/gov/halls.js';

const U = (id) => DEMO_USERS.find((u) => u.userId === id);
const club = U('CLUB001');
const club2 = U('CLUB002');
const osa = U('OSA001');
const events = U('EVT001');
const must = (res) => {
  expect(res.error).toBeUndefined();
  expect(res.ok).toBe(true);
  return res;
};
const REQ = {
  title: 'Maker Night Event',
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
  poster: { name: 'p.png', size: 200000, dataUrl: null },
  documents: {
    permission_letter: { name: 'a.pdf', size: 1 },
    proposal: { name: 'b.pdf', size: 1 },
    venue_form: { name: 'c.pdf', size: 1 },
  },
};
const submit = (s, over = {}) => must(wf.saveRequest(s, club, { ...REQ, ...over }, { submit: true }));

describe('ranking halls for an expected attendance', () => {
  it('never recommends a hall that is too small, and prefers the best fit', () => {
    const r = rankHalls({ attendance: 50, category: 'Workshop' });
    const small = r.find((h) => h.name === 'Seminar Room 3'); // holds 45
    expect(small.status).toBe('too_small');
    expect(small.recommended).toBe(false);
    expect(r.filter((h) => h.recommended)).toHaveLength(1);
    expect(r[0].recommended).toBe(true);
    expect(r[0].capacity).toBeGreaterThanOrEqual(50);
    expect(r[0].name).toBe('Innovation Lab'); // 83% full and a lab suits a workshop
  });

  it('suits the kind of event: a big cultural evening goes to a stage, a sports event to a sports hall', () => {
    expect(rankHalls({ attendance: 500, category: 'Cultural' })[0].name).toMatch(/Auditorium|Amphitheatre/);
    expect(rankHalls({ attendance: 100, category: 'Sports' })[0].name).toBe('West Sports Hall');
  });

  it('marks oversized halls and halls that are already requested at that time', () => {
    const big = rankHalls({ attendance: 20, category: 'Workshop' }).find(
      (h) => h.name === 'University Amphitheatre',
    );
    expect(big.status).toBe('oversized');
    const requests = createSeedState().requests;
    const taken = requests.find((r) => r.status === 'published' && r.venue === 'Main Auditorium');
    const r = rankHalls({
      attendance: 300,
      date: taken.date,
      startTime: taken.startTime,
      endTime: taken.endTime,
      category: 'Technical',
      requests,
    });
    const aud = r.find((h) => h.name === 'Main Auditorium');
    expect(aud.status).toBe('booked');
    expect(aud.available).toBe(false);
    expect(aud.recommended).toBe(false);
    expect(r.find((h) => h.recommended).name).not.toBe('Main Auditorium');
  });

  it('says so when nothing fits, and asks for attendance first', () => {
    expect(hallSummary(rankHalls({ attendance: 5000 }), { attendance: 5000 })).toMatch(
      /No hall is free and big enough/,
    );
    expect(hallSummary(rankHalls({ attendance: 0 }), { attendance: 0 })).toMatch(/Enter the number/);
    expect(
      hallSummary(rankHalls({ attendance: 60, category: 'Technical' }), {
        attendance: 60,
        category: 'Technical',
      }),
    ).toMatch(/best fit/);
  });
});

// An event that has been circulated to students, ready for its club to ask for a hall.
function circulated(state = createSeedState(), over = {}) {
  const r = submit(state, over);
  let s = must(wf.reviewRequest(r.state, osa, r.id, { decision: 'clear' })).state;
  s = must(
    wf.recordPhysical(s, osa, r.id, { status: 'verified', receivedOn: '2026-10-10', refNo: 'OSA/HC/9' }),
  ).state;
  s = must(wf.finalApprove(s, osa, r.id)).state;
  s = must(wf.publishRequest(s, club, r.id)).state;
  return { id: r.id, state: s };
}

describe('requesting and allocating a hall', () => {
  it('a new request has no hall; it can only be requested after the event is circulated', () => {
    const r = submit(createSeedState());
    const req = r.state.requests.find((x) => x.id === r.id);
    expect(hallStatus(req)).toBe('none');
    expect(req.venue).toBe('');
    expect(wf.requestHall(r.state, club, r.id, { venue: 'Innovation Lab', registered: 30 }).error).toMatch(
      /Circulate the event/,
    );
  });

  it('the club asks with the registered count and a priority; the Events Section approves and the hall appears', () => {
    let { id, state } = circulated();
    state = must(
      wf.requestHall(state, club, id, {
        venue: 'Innovation Lab',
        priority: 'high',
        note: 'Needs power sockets',
        registered: 52,
      }),
    ).state;
    let r = state.requests.find((x) => x.id === id);
    expect(r.hall).toMatchObject({
      status: 'requested',
      requestedVenue: 'Innovation Lab',
      priority: 'high',
      registered: 52,
    });
    expect(r.venue).toBe('');
    state = must(wf.reviewHall(state, events, id, { decision: 'approve', note: 'Free that evening.' })).state;
    r = state.requests.find((x) => x.id === id);
    expect(r.hall).toMatchObject({ status: 'approved', by: events.name });
    expect(r.venue).toBe('Innovation Lab');
  });

  it('a hall that cannot hold the registered crowd is refused, and so is one already allocated at that time', () => {
    const { id, state } = circulated();
    expect(wf.requestHall(state, club, id, { venue: 'Seminar Room 3', registered: 50 }).error).toMatch(
      /holds 45, fewer than the 50 registered/,
    );
    expect(wf.requestHall(state, club, id, { venue: 'Nowhere', registered: 5 }).ok).toBe(false);
    expect(
      wf.requestHall(state, club, id, { venue: 'Innovation Lab', priority: 'urgent', registered: 5 }).ok,
    ).toBe(false);
    const taken = state.requests.find((x) => x.status === 'published' && x.venue === 'Main Auditorium');
    const clash = circulated(state, {
      title: 'Clashing Night Event',
      date: taken.date,
      startTime: taken.startTime,
      endTime: taken.endTime,
      regDeadline: '2026-10-11',
    });
    expect(
      wf.requestHall(clash.state, club, clash.id, { venue: 'Main Auditorium', registered: 100 }).error,
    ).toMatch(/already allocated/);
  });

  it('the Events Section can allocate a different hall that holds the crowd and is free', () => {
    let { id, state } = circulated();
    state = must(wf.requestHall(state, club, id, { venue: 'Seminar Room 3', registered: 30 })).state;
    expect(wf.reviewHall(state, events, id, { decision: 'reassign', venue: 'Nowhere Hall' }).ok).toBe(false);
    expect(wf.reviewHall(state, events, id, { decision: 'reassign', venue: 'Seminar Room 3' }).error).toMatch(
      /Use Approve/,
    );
    const moved = must(
      wf.reviewHall(state, events, id, {
        decision: 'reassign',
        venue: 'Innovation Lab',
        note: 'Room is being repainted.',
      }),
    );
    const r = moved.state.requests.find((x) => x.id === id);
    expect(r.venue).toBe('Innovation Lab');
    expect(r.hall).toMatchObject({
      status: 'approved',
      requestedVenue: 'Seminar Room 3',
      note: 'Room is being repainted.',
    });
    expect(r.history.at(-1).action).toBe('Different hall allocated');
  });

  it('rejecting needs a reason, leaves the event circulating, and lets the club ask again', () => {
    let { id, state } = circulated();
    state = must(wf.requestHall(state, club, id, { venue: 'Seminar Room 3', registered: 30 })).state;
    expect(wf.reviewHall(state, events, id, { decision: 'reject', note: '' }).ok).toBe(false);
    state = must(
      wf.reviewHall(state, events, id, { decision: 'reject', note: 'Closed for exams that week.' }),
    ).state;
    let r = state.requests.find((x) => x.id === id);
    expect(r.status).toBe('published');
    expect(r.hall).toMatchObject({ status: 'rejected', note: 'Closed for exams that week.' });
    state = must(wf.requestHall(state, club, id, { venue: 'Innovation Lab', registered: 30 })).state;
    r = state.requests.find((x) => x.id === id);
    expect(r.hall).toMatchObject({ status: 'requested', requestedVenue: 'Innovation Lab' });
  });

  it('only the Events Section decides, only the owning club asks, and nothing can be decided before a request', () => {
    let { id, state } = circulated();
    expect(wf.reviewHall(state, events, id, { decision: 'approve' }).error).toMatch(/has not asked/);
    expect(wf.requestHall(state, club2, id, { venue: 'Innovation Lab', registered: 5 }).ok).toBe(false);
    expect(wf.requestHall(state, events, id, { venue: 'Innovation Lab', registered: 5 }).ok).toBe(false);
    state = must(wf.requestHall(state, club, id, { venue: 'Innovation Lab', registered: 5 })).state;
    expect(wf.reviewHall(state, club, id, { decision: 'approve' }).ok).toBe(false);
    expect(wf.reviewHall(state, osa, id, { decision: 'approve' }).ok).toBe(false);
    expect(wf.reviewHall(state, events, id, { decision: 'approve' }).ok).toBe(true);
  });

  it('the sample data: live events have a hall, one hall request waits for the Events Section, the rest have none', () => {
    const s = createSeedState();
    expect(hallStatus(s.requests.find((r) => r.id === 'REQ-1048'))).toBe('approved');
    expect(hallStatus(s.requests.find((r) => r.id === 'REQ-1210'))).toBe('requested');
    expect(hallStatus(s.requests.find((r) => r.id === 'REQ-1251'))).toBe('none');
    expect(s.requests.find((r) => r.id === 'REQ-1251').venue).toBe('');
    expect(VENUES.every((v) => v.kind && v.facilities.length)).toBe(true);
  });
});

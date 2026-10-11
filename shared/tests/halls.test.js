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

describe('giving permission for the hall', () => {
  it('a new request starts with the hall pending; approving it unlocks the online review and final approval', () => {
    let s = submit(createSeedState());
    const id = s.id;
    s = s.state;
    expect(hallStatus(s.requests.find((r) => r.id === id))).toBe('pending');
    expect(wf.reviewRequest(s, events, id, { decision: 'clear' }).ok).toBe(false);
    s = must(wf.reviewHall(s, events, id, { decision: 'approve', note: 'Free that evening.' })).state;
    const r = s.requests.find((x) => x.id === id);
    expect(r.hall).toMatchObject({ status: 'approved', by: events.name, requestedVenue: 'Seminar Room 3' });
    expect(r.venue).toBe('Seminar Room 3');
    s = must(wf.reviewRequest(s, events, id, { decision: 'clear' })).state;
    s = must(
      wf.recordPhysical(s, events, id, { status: 'verified', receivedOn: '2026-10-10', refNo: 'EVT/HC/9' }),
    ).state;
    expect(wf.finalApprove(s, osa, id).ok).toBe(true);
  });

  it('final approval is refused while the hall is not approved, even if the other checks are done', () => {
    let s = submit(createSeedState());
    const id = s.id;
    s = s.state;
    s = {
      ...s,
      requests: s.requests.map((r) =>
        r.id === id
          ? {
              ...r,
              onlineReview: { status: 'cleared', by: 'x', at: 'x', note: '' },
              physical: {
                status: 'verified',
                by: 'x',
                at: 'x',
                receivedOn: '2026-10-10',
                refNo: 'r',
                note: '',
              },
            }
          : r,
      ),
    };
    expect(wf.finalApprove(s, osa, id).error).toMatch(/hall must be approved/);
  });

  it('the Events Section can assign a different hall, but only one that holds the crowd and is free', () => {
    let s = submit(createSeedState(), { capacity: 40 });
    const id = s.id;
    s = s.state;
    expect(wf.reviewHall(s, events, id, { decision: 'reassign', venue: 'Nowhere Hall' }).ok).toBe(false);
    expect(wf.reviewHall(s, events, id, { decision: 'reassign', venue: 'Seminar Room 3' }).error).toMatch(
      /already the requested hall/,
    );
    const taken = s.requests.find((r) => r.status === 'published' && r.venue === 'Main Auditorium');
    const clash = submit(s, {
      venue: 'Innovation Lab',
      date: taken.date,
      startTime: taken.startTime,
      endTime: taken.endTime,
      regDeadline: '2026-10-11',
      capacity: 30,
    });
    expect(
      wf.reviewHall(clash.state, events, clash.id, { decision: 'reassign', venue: 'Main Auditorium' }).error,
    ).toMatch(/already requested/);
    const moved = must(
      wf.reviewHall(s, events, id, {
        decision: 'reassign',
        venue: 'Innovation Lab',
        note: 'The seminar room is being repainted.',
      }),
    );
    const r = moved.state.requests.find((x) => x.id === id);
    expect(r.venue).toBe('Innovation Lab');
    expect(r.hall).toMatchObject({ status: 'approved', requestedVenue: 'Seminar Room 3' });
    expect(r.history.at(-1).action).toBe('Hall changed');
    // a hall that is too small is refused
    const crowd = submit(createSeedState(), { capacity: 100, venue: 'Central Library Hall' });
    expect(
      wf.reviewHall(crowd.state, events, crowd.id, { decision: 'reassign', venue: 'Innovation Lab' }).error,
    ).toMatch(/holds 60/);
  });

  it('rejecting the hall sends the request back to the club with the reason; a new hall asks permission again', () => {
    let s = submit(createSeedState());
    const id = s.id;
    s = s.state;
    expect(wf.reviewHall(s, events, id, { decision: 'reject', note: '' }).ok).toBe(false);
    s = must(
      wf.reviewHall(s, events, id, { decision: 'reject', note: 'The seminar room is closed for exams.' }),
    ).state;
    let r = s.requests.find((x) => x.id === id);
    expect(r.status).toBe('correction_requested');
    expect(r.hall.status).toBe('rejected');
    expect(r.feedback.at(-1)).toMatchObject({ type: 'correction', reasons: ['Hall not approved'] });
    s = must(
      wf.saveRequest(s, club, { ...REQ, venue: 'Innovation Lab', capacity: 40 }, { submit: true, id }),
    ).state;
    r = s.requests.find((x) => x.id === id);
    expect(r.status).toBe('submitted');
    expect(r.hall).toMatchObject({ status: 'pending', requestedVenue: 'Innovation Lab' });
  });

  it('changing the hall of an approved request asks for permission again; keeping it does not', () => {
    let s = submit(createSeedState());
    const id = s.id;
    s = must(wf.reviewHall(s.state, events, id, { decision: 'approve' })).state;
    s = { ...s, requests: s.requests.map((r) => (r.id === id ? { ...r, status: 'draft' } : r)) };
    const same = must(wf.saveRequest(s, club, { ...REQ }, { submit: false, id })).state.requests.find(
      (x) => x.id === id,
    );
    expect(same.hall.status).toBe('approved');
    const moved = must(
      wf.saveRequest(s, club, { ...REQ, venue: 'Innovation Lab' }, { submit: false, id }),
    ).state.requests.find((x) => x.id === id);
    expect(moved.hall.status).toBe('pending');
  });

  it('only the Events Section and OSA may decide; a club cannot', () => {
    const s = submit(createSeedState());
    expect(wf.reviewHall(s.state, club, s.id, { decision: 'approve' }).ok).toBe(false);
    expect(wf.reviewHall(s.state, club2, s.id, { decision: 'approve' }).ok).toBe(false);
    expect(wf.reviewHall(s.state, osa, s.id, { decision: 'approve' }).ok).toBe(true);
  });

  it('the sample data keeps its reviewed and published requests approved and the rest pending', () => {
    const s = createSeedState();
    expect(hallStatus(s.requests.find((r) => r.id === 'REQ-1048'))).toBe('approved'); // published
    expect(hallStatus(s.requests.find((r) => r.id === 'REQ-1244'))).toBe('approved'); // online review cleared
    expect(hallStatus(s.requests.find((r) => r.id === 'REQ-1251'))).toBe('pending'); // waiting for review
    expect(VENUES.every((v) => v.kind && v.facilities.length)).toBe(true);
  });
});

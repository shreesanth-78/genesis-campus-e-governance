import { describe, expect, it } from 'vitest';
import { createSeedState } from '../src/gov/seed.js';
import * as wf from '../src/gov/workflow.js';
import { publishedEvents, getRequest, allClubs } from '../src/gov/selectors.js';
import { DEMO_USERS } from '../src/gov/demoUsers.js';
import { localDuplicateCheck } from '../src/gov/ai.js';

const U = (id) => DEMO_USERS.find((u) => u.userId === id);
const club = U('CLUB001'); // Innovation
const club2 = U('CLUB002'); // Robotics
const osa = U('OSA001');
const events = U('EVT001');

const FUTURE = {
  title: 'Prototype Showcase Night',
  category: 'Technical',
  description: 'Teams demo their prototypes to judges and the wider campus audience in an evening showcase.',
  date: '2026-10-28',
  startTime: '17:00',
  endTime: '20:00',
  venue: 'Seminar Room 3',
  capacity: 40,
  regDeadline: '2026-10-25',
  regDeadlineTime: '18:00',
  audience: 'All current students',
  poster: { name: 'p.png', size: 200000, dataUrl: 'data:image/png;base64,AAAA' },
  documents: {
    permission_letter: { name: 'a.pdf', size: 1 },
    proposal: { name: 'b.pdf', size: 1 },
    venue_form: { name: 'c.pdf', size: 1 },
  },
};
const must = (res) => {
  expect(res.error).toBeUndefined();
  expect(res.ok).toBe(true);
  return res;
};

describe('seed data', () => {
  it('has demo accounts for every role', () => {
    [club, club2, osa, events].forEach((u) => expect(u).toBeTruthy());
  });
  it('never exposes non-published requests as student events', () => {
    const s = createSeedState();
    const ev = publishedEvents(s);
    s.requests
      .filter((r) => r.status !== 'published' && !r.legacyEventId)
      .forEach((r) => {
        expect(ev.find((e) => e.requestId === r.id)).toBeUndefined();
      });
  });
});

describe('end-to-end workflow', () => {
  it('club submits → OSA reviews and gives permission → club circulates → students register → hall requested → Events Section allocates it', () => {
    let s = createSeedState();
    const before = publishedEvents(s).length;
    const id = must(wf.saveRequest(s, club, FUTURE, { submit: true }));
    s = id.state;
    const rid = id.id;
    expect(getRequest(s, rid).venue).toBe(''); // no hall is chosen at this stage
    expect(publishedEvents(s).length).toBe(before); // pending: not visible to students

    // the Events Section has no part in the review
    expect(wf.reviewRequest(s, events, rid, { decision: 'clear' }).ok).toBe(false);
    s = must(wf.reviewRequest(s, osa, rid, { decision: 'clear' })).state;

    // OSA cannot give permission before the hard copy is verified
    expect(wf.finalApprove(s, osa, rid).ok).toBe(false);
    expect(
      wf.recordPhysical(s, events, rid, { status: 'verified', receivedOn: '2026-10-11', refNo: 'x' }).ok,
    ).toBe(false);
    s = must(
      wf.recordPhysical(s, osa, rid, { status: 'verified', receivedOn: '2026-10-11', refNo: 'OSA/HC/1' }),
    ).state;

    // permission is OSA's alone
    const denied = wf.finalApprove(s, events, rid);
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatch(/OSA/);
    s = must(wf.finalApprove(s, osa, rid)).state;
    expect(getRequest(s, rid).status).toBe('approved');
    expect(publishedEvents(s).length).toBe(before); // permission alone does not show it to students

    // only the owning club (or OSA) circulates it; the Events Section and other clubs cannot
    expect(wf.publishRequest(s, events, rid).ok).toBe(false);
    expect(wf.publishRequest(s, club2, rid).ok).toBe(false);
    // the hall cannot be requested before the event is circulated
    expect(wf.requestHall(s, club, rid, { venue: 'Innovation Lab' }).error).toMatch(/Circulate the event/);
    const pub = must(wf.publishRequest(s, club, rid));
    s = pub.state;
    expect(publishedEvents(s).length).toBe(before + 1);
    expect(s.broadcasts[0].title).toMatch(/Prototype Showcase Night/);

    // the club sees 34 registrations and asks for a hall; a hall that cannot hold them is refused
    expect(
      wf.requestHall(s, club, rid, { venue: 'Seminar Room 3', priority: 'high', registered: 60 }).error,
    ).toMatch(/holds 45/);
    expect(wf.requestHall(s, club2, rid, { venue: 'Innovation Lab', registered: 34 }).ok).toBe(false);
    s = must(
      wf.requestHall(s, club, rid, {
        venue: 'Seminar Room 3',
        priority: 'high',
        note: 'Hands-on',
        registered: 34,
      }),
    ).state;
    expect(getRequest(s, rid).hall).toMatchObject({ status: 'requested', priority: 'high', registered: 34 });
    expect(getRequest(s, rid).venue).toBe('');
    expect(wf.requestHall(s, club, rid, { venue: 'Innovation Lab', registered: 34 }).error).toMatch(
      /already with the Events Section/,
    );

    // only the Events Section decides; the hall then appears on the event
    expect(wf.reviewHall(s, osa, rid, { decision: 'approve' }).ok).toBe(false);
    expect(wf.reviewHall(s, club, rid, { decision: 'approve' }).ok).toBe(false);
    s = must(wf.reviewHall(s, events, rid, { decision: 'approve' })).state;
    expect(getRequest(s, rid)).toMatchObject({ venue: 'Seminar Room 3', hall: { status: 'approved' } });
    expect(publishedEvents(s).at(-1).venue).toBe('Seminar Room 3');
  });

  it('OSA may circulate an approved event too, and circulating requires permission', () => {
    let s = createSeedState();
    expect(wf.publishRequest(s, osa, 'REQ-1248').ok).toBe(false); // ready for approval, not approved
    s = must(wf.finalApprove(s, osa, 'REQ-1248')).state;
    s = must(wf.publishRequest(s, osa, 'REQ-1248')).state;
    expect(getRequest(s, 'REQ-1248').status).toBe('published');
  });

  it('a seeded approved request can be circulated by its club', () => {
    const s = must(wf.publishRequest(createSeedState(), club2, 'REQ-1255')).state;
    expect(publishedEvents(s).some((e) => e.requestId === 'REQ-1255')).toBe(true);
  });
});

describe('corrections, rejection and resubmission', () => {
  it('correction → club edits and resubmits → review resets', () => {
    let s = createSeedState();
    const r0 = getRequest(s, 'REQ-1262');
    expect(r0.status).toBe('correction_requested');
    const data = { ...r0, capacity: String(r0.capacity) };
    // The seeded correction is for a missing document, so resubmitting as-is is rejected...
    expect(wf.saveRequest(s, club, data, { submit: true, id: 'REQ-1262' }).ok).toBe(false);
    data.documents = { ...r0.documents, venue_form: { name: 'venue.pdf', size: 10 } };
    s = must(wf.saveRequest(s, club, data, { submit: true, id: 'REQ-1262' })).state;
    const r = getRequest(s, 'REQ-1262');
    expect(r.status).toBe('submitted');
    expect(r.version).toBe(r0.version + 1);
    expect(r.onlineReview.status).toBe('pending');
    expect(r.feedback.every((f) => f.resolved)).toBe(true);
  });

  it('requires a reason to reject and shows feedback to the club', () => {
    let s = createSeedState();
    expect(wf.reviewRequest(s, osa, 'REQ-1251', { decision: 'reject' }).ok).toBe(false);
    s = must(
      wf.reviewRequest(s, osa, 'REQ-1251', {
        decision: 'reject',
        reasons: ['Venue unavailable'],
        note: 'Lab closed that evening.',
      }),
    ).state;
    const r = getRequest(s, 'REQ-1251');
    expect(r.status).toBe('rejected');
    expect(r.feedback.at(-1)).toMatchObject({ type: 'rejection', note: 'Lab closed that evening.' });
    expect(wf.saveRequest(s, club, { ...r, capacity: '40' }, { submit: true, id: 'REQ-1251' }).ok).toBe(
      false,
    );
  });

  it('students and clubs cannot review', () => {
    const s = createSeedState();
    expect(wf.reviewRequest(s, club, 'REQ-1251', { decision: 'clear' }).ok).toBe(false);
    expect(
      wf.recordPhysical(s, club, 'REQ-1251', { status: 'verified', receivedOn: '2026-10-11', refNo: 'x' }).ok,
    ).toBe(false);
  });

  it('validates required fields, notice period and documents', () => {
    const { errors } = wf.validateRequest({ ...FUTURE, date: '2026-10-11', poster: null, documents: {} });
    expect(errors.date).toBeTruthy();
    expect(errors.poster).toBeTruthy();
    expect(errors.documents).toBeTruthy();
  });
});

describe('club scoping', () => {
  it('a club cannot edit another club or its requests', () => {
    const s = createSeedState();
    const patch = {
      description: 'A long enough description for the club.',
      objectives: ['One'],
      contactEmail: 'a@b.co',
    };
    expect(wf.updateClubProfile(s, club, 'robotics', patch).ok).toBe(false);
    expect(wf.updateClubProfile(s, club2, 'robotics', patch).ok).toBe(true);
    // Robotics cannot touch an Innovation request
    expect(
      wf.saveRequest(
        s,
        club2,
        { ...getRequest(s, 'REQ-1262'), capacity: '30' },
        { submit: true, id: 'REQ-1262' },
      ).ok,
    ).toBe(false);
    expect(wf.createPromotion(s, club2, { requestId: 'REQ-1251', channels: ['dashboard'] }).ok).toBe(false);
  });

  it('club profile edits flow into the student-facing directory', () => {
    const s = wf.updateClubProfile(createSeedState(), club, 'innovation', {
      description: 'Brand new description for the club page.',
      objectives: ['Ship things'],
      contactEmail: 'x@y.co',
    }).state;
    expect(allClubs(s).find((c) => c.id === 'innovation').blurb).toBe(
      'Brand new description for the club page.',
    );
  });
});

describe('promotions', () => {
  it('club requests promotion, admin requests changes, club resubmits, admin approves', () => {
    let s = createSeedState();
    const p = must(
      wf.createPromotion(s, club, { requestId: 'REQ-1262', channels: ['dashboard'], note: 'pls' }),
    );
    s = p.state;
    expect(wf.createPromotion(s, club, { requestId: 'REQ-1262', channels: ['dashboard'] }).ok).toBe(false); // already open
    expect(wf.reviewPromotion(s, osa, p.id, { decision: 'changes' }).ok).toBe(false); // needs note
    s = must(wf.reviewPromotion(s, osa, p.id, { decision: 'changes', note: 'Fewer channels' })).state;
    s = must(
      wf.resubmitPromotion(s, club, p.id, { channels: ['dashboard'], note: 'ok', posterSupport: false }),
    ).state;
    s = must(wf.reviewPromotion(s, osa, p.id, { decision: 'approve' })).state;
    expect(s.promotions.find((x) => x.id === p.id).status).toBe('approved');
    expect(wf.reviewPromotion(s, club, p.id, { decision: 'approve' }).ok).toBe(false);
  });
});

describe('club applications & duplicate detection', () => {
  it('flags a similar club and gates approval', () => {
    let s = createSeedState();
    const clubs = allClubs(s);
    const matches = localDuplicateCheck(
      {
        name: 'Hut Labs',
        category: 'Robotics',
        objectives: 'Build robots and compete in robotics competitions with embedded systems.',
      },
      clubs,
      () => '',
    );
    expect(matches.length).toBeGreaterThan(0);

    // approve requires an AI check
    expect(wf.decideClubApplication(s, osa, 'CA-502', { decision: 'approve' }).error).toMatch(/duplicate/i);
    s = must(
      wf.saveAiCheck(s, osa, 'CA-502', { source: 'local-mock', ranAt: 'x', matches: [], summary: 's' }),
    ).state;
    // Events Section can't decide
    expect(wf.decideClubApplication(s, events, 'CA-502', { decision: 'approve' }).ok).toBe(false);
    const n = allClubs(s).length;
    s = must(wf.decideClubApplication(s, osa, 'CA-502', { decision: 'approve' })).state;
    expect(allClubs(s).length).toBe(n + 1);
    expect(allClubs(s).some((c) => c.name === 'Chess Society')).toBe(true);
  });

  it('high-overlap match needs acknowledgement; <10 members and missing docs block approval', () => {
    let s = createSeedState();
    s = must(
      wf.saveAiCheck(s, osa, 'CA-501', {
        source: 'local-mock',
        ranAt: 'x',
        matches: [{ clubId: 'robotics', name: 'Hut Labs', score: 0.8, reasons: [] }],
        summary: '',
      }),
    ).state;
    expect(wf.decideClubApplication(s, osa, 'CA-501', { decision: 'approve' }).error).toMatch(/similar/);
    must(wf.decideClubApplication(s, osa, 'CA-501', { decision: 'approve', acknowledgeDuplicate: true }));
    // Photography circle: corrections requested -> cannot be approved directly
    expect(wf.decideClubApplication(s, osa, 'CA-504', { decision: 'approve' }).ok).toBe(false);
  });

  it('reject needs a reason', () => {
    const s = createSeedState();
    expect(wf.decideClubApplication(s, osa, 'CA-503', { decision: 'reject' }).ok).toBe(false);
    expect(wf.decideClubApplication(s, osa, 'CA-503', { decision: 'reject', note: 'Duplicate' }).ok).toBe(
      true,
    );
  });
});

describe('a student applying to start a club', () => {
  const student = U('STU2026001');
  const IDEA = {
    name: 'Bee Keepers Society',
    category: 'Media, Lit & Social Responsibility',
    objectives:
      'Students look after beehives on campus, learn about pollination and sell the honey they harvest.',
    advisor: 'Dr. Lakshmi Pillai',
    memberCount: 14,
    documents: {},
  };

  it('a genuinely new idea goes to OSA with the student as the proposer, and only they can see it', () => {
    const r = must(wf.applyForClub(createSeedState(), student, IDEA));
    const app = r.state.clubApplications.find((a) => a.id === r.id);
    expect(app).toMatchObject({ status: 'submitted', name: 'Bee Keepers Society' });
    expect(app.proposer).toMatchObject({ name: student.name, rollNo: student.userId });
    expect(app.aiCheck.checkedAtApply).toBe(true);
  });

  it('is refused when an existing club already covers the same focus area, whatever the words', () => {
    const s = createSeedState();
    const coding = wf.applyForClub(s, student, {
      ...IDEA,
      name: 'Programmers Guild',
      category: 'Technical & Engineering',
      objectives:
        'A group where students learn programming, build software and take part in coding contests.',
    });
    expect(coding.ok).toBe(false);
    expect(coding.error).toMatch(/already covers this focus area/);
    const music = wf.applyForClub(s, student, {
      ...IDEA,
      name: 'Rhythm Collective',
      category: 'Cultural & Fine Arts',
      objectives: 'We sing, play instruments and perform music together every week as a band.',
    });
    expect(music.error).toMatch(/Raagasudha/);
    expect(s.clubApplications.length).toBe(createSeedState().clubApplications.length);
  });

  it('is refused when another pending application already covers the idea', () => {
    const first = must(wf.applyForClub(createSeedState(), student, IDEA));
    const second = wf.applyForClub(first.state, student, {
      ...IDEA,
      name: 'Honey Makers',
      advisor: 'Dr. A. Rao',
    });
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/Another application/);
  });

  it('honours the model\u2019s verdict when it finds an overlap the rules could not see', () => {
    const r = wf.applyForClub(createSeedState(), student, IDEA, {
      semantic: {
        similar: true,
        club: 'Student Energy',
        reason: 'it already runs campus sustainability projects',
      },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Student Energy.*sustainability/);
  });

  it('needs 10 founding members, a complete form, and a student account', () => {
    const s = createSeedState();
    expect(wf.applyForClub(s, student, { ...IDEA, memberCount: 4 }).error).toMatch(/at least 10/);
    expect(wf.applyForClub(s, student, { ...IDEA, objectives: 'too short' }).ok).toBe(false);
    expect(wf.applyForClub(s, club, IDEA).ok).toBe(false);
    expect(wf.applyForClub(s, osa, IDEA).ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { eventHook, newEventNotice, registrationNotice } from '../src/gov/copy.js';
import { createSeedState } from '../src/gov/seed.js';
import * as wf from '../src/gov/workflow.js';
import { DEMO_USERS } from '../src/gov/demoUsers.js';

describe('notification copy', () => {
  it('gives every category a hook and is stable for one event', () => {
    for (const c of [
      'Hackathon',
      'Workshop',
      'Technical',
      'Cultural',
      'Sports',
      'Social Impact',
      'Something else',
    ]) {
      const a = eventHook(c, 'REQ-1');
      expect(a.emoji).toBeTruthy();
      expect(a.quote.length).toBeGreaterThan(10);
      expect(eventHook(c, 'REQ-1')).toEqual(a);
    }
  });

  it('writes a new-event notice with a quote, the facts and a nudge, and only claims scarcity for small venues', () => {
    const base = {
      title: 'Maker Night',
      category: 'Workshop',
      clubName: 'Kalakriti',
      when: '28 Oct 2026, 5:00 PM',
      venue: 'Innovation Lab',
      deadline: '25 Oct 2026',
      seed: 'REQ-9',
    };
    const small = newEventNotice({ ...base, capacity: 40 });
    expect(small.title).toBe('💡 Maker Night just dropped');
    expect(small.body).toContain('Kalakriti opens registration for 28 Oct 2026, 5:00 PM at Innovation Lab');
    expect(small.body).toContain('Only 40 seats');
    expect(small.body).toContain('Registration closes 25 Oct 2026');
    expect(small.body).toMatch(/Tap to claim your spot/);
    expect(newEventNotice({ ...base, capacity: 700 }).body).not.toMatch(/Only \d+ seats/);
  });

  it('celebrates a registration', () => {
    const n = registrationNotice({
      title: 'Maker Night',
      category: 'Workshop',
      when: '28 Oct, 5 PM',
      venue: 'Lab',
      seed: 'x',
    });
    expect(n.title).toMatch(/^You're in!/);
    expect(n.body).toContain('Maker Night is yours');
  });

  it('publishing an event broadcasts the catchy notice', () => {
    const state = createSeedState();
    const osa = DEMO_USERS.find((u) => u.userId === 'OSA001');
    const res = wf.publishRequest(state, osa, 'REQ-1255');
    expect(res.ok).toBe(true);
    expect(res.notice.title).toBe('⚙️ Robotics Arena Showdown just dropped');
    expect(res.notice.body).toMatch(
      /Hut Labs opens registration for 06 Nov 2026, 10:00 AM at a hall announced soon/,
    );
    expect(res.notice.eventId).toBe('evt-req-1255');
  });
});

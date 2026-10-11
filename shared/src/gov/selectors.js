// Read-only helpers that derive views from governance state.
// Student-facing code must only ever see events from `publishedEvents`.

import { TODAY } from './demoClock.js';
import { CATEGORY_TONE, CLUB_PROFILES, DEFAULT_PROFILE, buildRoster } from './govData.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const pad2 = (n) => String(n).padStart(2, '0');

export function parseDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const fmtDate = (iso) => {
  const d = parseDate(iso);
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
export const fmtDay = (iso) => {
  const d = parseDate(iso);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
export const fmtDayLong = (iso) =>
  parseDate(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
export function fmt12(hhmm = '00:00') {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad2(m)} ${ap}`;
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const h = d.getHours();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${h % 12 || 12}:${pad2(d.getMinutes())} ${h >= 12 ? 'PM' : 'AM'}`;
}
export const initialsOf = (name = '') =>
  name
    .replace(/[^A-Za-z& ]/g, '')
    .split(/\s+/)
    .filter((w) => w && w !== '&')
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'GC';
export function fmtSize(bytes = 0) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
export function demoToday() {
  return new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}
export const TODAY_ISO = `${TODAY.getFullYear()}-${pad2(TODAY.getMonth() + 1)}-${pad2(TODAY.getDate())}`;

/* ------------------------------------------------------------------ */
/* Clubs                                                               */
/* ------------------------------------------------------------------ */
const TONE_CYCLE = ['peach', 'mint', 'sky', 'lilac', 'sage', 'sand'];

export function allClubs(state) {
  const overrides = state.clubOverrides || {};
  const base = (state.catalog?.clubs || []).map((c) => {
    const o = overrides[c.id];
    return o?.description ? { ...c, blurb: o.description } : c;
  });
  const extra = (state.newClubs || []).map((c, i) => {
    const o = overrides[c.id];
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      blurb: o?.description || c.blurb,
      members: c.members,
      upcoming: 0,
      tag: c.category,
      icon: 'Sparkles',
      letter: c.name[0]?.toUpperCase() || 'C',
      tone: TONE_CYCLE[(i + 2) % TONE_CYCLE.length],
      isNew: true,
    };
  });
  // Student-facing "upcoming" = seed figure + newly published events for the club.
  const fresh = (state.requests || []).filter(
    (r) => r.status === 'published' && !r.legacyEventId && r.date >= TODAY_ISO,
  );
  return [...base, ...extra].map((c) => ({
    ...c,
    upcoming: c.upcoming + fresh.filter((r) => r.clubId === c.id).length,
  }));
}

export function getClubFrom(state, id) {
  return allClubs(state).find((c) => c.id === id) || null;
}

export function clubProfile(state, clubId) {
  const fresh = (state.newClubs || []).find((c) => c.id === clubId);
  const base = fresh?.profile || CLUB_PROFILES[clubId] || DEFAULT_PROFILE;
  const o = state.clubOverrides?.[clubId] || {};
  const { description, ...rest } = o;
  return {
    ...DEFAULT_PROFILE,
    ...base,
    ...rest,
    description: description || getClubFrom(state, clubId)?.blurb || '',
  };
}

export function clubMembers(state, clubId) {
  const club = getClubFrom(state, clubId);
  if (!club) return [];
  return buildRoster(clubId, club.members, clubProfile(state, clubId).authorities);
}

/* ------------------------------------------------------------------ */
/* Event requests                                                      */
/* ------------------------------------------------------------------ */
export const getRequest = (state, id) => state.requests.find((r) => r.id === id) || null;
export const requestsForClub = (state, clubId) => state.requests.filter((r) => r.clubId === clubId);

/** The hall permission of a request. Older records without one count as approved once published. */
export const hallOf = (r) =>
  r.hall ?? {
    status: ['published', 'completed'].includes(r.status) ? 'approved' : 'none',
    by: null,
    at: null,
    note: '',
    requestedVenue: r.venue || '',
    priority: null,
    registered: 0,
  };
export const hallStatus = (r) => hallOf(r).status;

export const needsOnlineReview = (r) => r.status === 'submitted' && r.onlineReview.status === 'pending';
export const needsPhysical = (r) => r.status === 'submitted' && r.physical.status !== 'verified';
export const readyForApproval = (r) =>
  r.status === 'submitted' && r.onlineReview.status === 'cleared' && r.physical.status === 'verified';
/** A circulated event whose club has asked the Events Section for a hall. */
export const awaitingHall = (r) => r.status === 'published' && hallOf(r).status === 'requested';
export const readyToPublish = (r) => r.status === 'approved';

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Other live requests using the same venue at an overlapping time. */
export function findConflicts(state, req) {
  if (!req.venue || !req.date || !req.startTime || !req.endTime) return [];
  return state.requests.filter(
    (o) =>
      o.id !== req.id &&
      ['submitted', 'approved', 'published'].includes(o.status) &&
      o.venue === req.venue &&
      o.date === req.date &&
      toMin(o.startTime) < toMin(req.endTime) &&
      toMin(req.startTime) < toMin(o.endTime),
  );
}

/** Steps for the request progress tracker. state: done | current | todo | failed | warn */
export function trackerSteps(r) {
  const steps = [
    { key: 'submitted', label: 'Submitted', state: 'todo', detail: '' },
    { key: 'online', label: 'Online review', state: 'todo', detail: '' },
    { key: 'physical', label: 'Hard-copy check', state: 'todo', detail: '' },
    { key: 'approval', label: 'OSA permission', state: 'todo', detail: '' },
    { key: 'published', label: 'Circulated', state: 'todo', detail: '' },
    { key: 'hall', label: 'Hall', state: 'todo', detail: '' },
  ];
  if (r.status === 'draft') return steps;
  steps[0].state = 'done';
  steps[0].detail = 'v' + r.version;

  const on = r.onlineReview.status;
  steps[1].state =
    on === 'cleared' ? 'done' : on === 'rejected' ? 'failed' : on === 'correction' ? 'warn' : 'current';
  steps[1].detail = {
    cleared: 'Cleared',
    rejected: 'Rejected',
    correction: 'Corrections needed',
    pending: 'Awaiting review',
  }[on];

  const ph = r.physical.status;
  steps[2].state =
    ph === 'verified' ? 'done' : ph === 'issue' ? 'warn' : r.status === 'rejected' ? 'todo' : 'current';
  steps[2].detail = {
    verified: 'Verified',
    issue: 'Issue found',
    pending: r.status === 'rejected' ? '—' : 'Awaiting letter',
  }[ph];

  if (r.approval) {
    steps[3].state = 'done';
    steps[3].detail = 'Approved';
  } else if (r.status === 'submitted' && on === 'cleared' && ph === 'verified') {
    steps[3].state = 'current';
    steps[3].detail = 'Ready for OSA';
  } else {
    steps[3].detail = r.status === 'rejected' ? '—' : 'Waiting';
  }

  if (['published', 'completed'].includes(r.status)) {
    steps[4].state = 'done';
    steps[4].detail = 'Open for registration';
  } else if (r.status === 'approved') {
    steps[4].state = 'current';
    steps[4].detail = 'Club can circulate';
  } else {
    steps[4].detail = r.status === 'rejected' ? '—' : 'After OSA permission';
  }

  const hs = hallOf(r).status;
  if (hs === 'approved') {
    steps[5].state = 'done';
    steps[5].detail = r.venue || 'Allocated';
  } else if (hs === 'requested') {
    steps[5].state = 'current';
    steps[5].detail = 'With Events Section';
  } else if (hs === 'rejected') {
    steps[5].state = 'warn';
    steps[5].detail = 'Request another hall';
  } else if (r.status === 'published') {
    steps[5].state = 'current';
    steps[5].detail = 'Club to request';
  } else {
    steps[5].detail = r.status === 'rejected' ? '—' : 'After registrations';
  }

  if (r.status === 'rejected') steps[3].state = steps[4].state = steps[5].state = 'todo';
  return steps;
}

/* ------------------------------------------------------------------ */
/* Student-facing projection                                           */
/* ------------------------------------------------------------------ */
function computeStatus(r, registered) {
  const deadline = new Date(`${r.regDeadline}T${r.regDeadlineTime || '23:59'}:00`);
  if (deadline < TODAY) return 'closed';
  if (registered >= r.capacity) return 'full';
  if (deadline - TODAY <= 3 * 86400000) return 'closing';
  return 'open';
}

export function toStudentEvent(r, state) {
  const club = getClubFrom(state, r.clubId);
  const registered = state.registrationCounts?.[`evt-${r.id.toLowerCase()}`] || 0;
  const num = r.id.replace(/\D/g, '');
  const closesLabel = `${parseDate(r.regDeadline).getDate()} ${MONTHS[parseDate(r.regDeadline).getMonth()]}, ${fmt12(r.regDeadlineTime)}`;
  return {
    id: `evt-${r.id.toLowerCase()}`,
    requestId: r.id,
    title: r.title,
    category: r.category,
    clubId: r.clubId,
    organizer: club?.name || 'Campus club',
    initials: initialsOf(club?.name),
    date: r.date,
    dateLabel: fmtDate(r.date),
    shortDate: fmtDay(r.date),
    time: fmt12(r.startTime),
    endTime: fmt12(r.endTime),
    venue: r.venue || 'Hall to be announced',
    venueNote: 'GENESIS University campus',
    blurb: r.description.length > 120 ? `${r.description.slice(0, 117)}…` : r.description,
    long: r.description,
    about: r.description,
    summary: r.description,
    registered,
    capacity: r.capacity,
    closes: closesLabel,
    closesLong: `Deadline: ${fmtDate(r.regDeadline)} at ${fmt12(r.regDeadlineTime)}`,
    status: computeStatus(r, registered),
    audience: r.audience,
    audienceNote: 'Approved by Student Affairs',
    tone: CATEGORY_TONE[r.category] || 'emerald',
    ref: `GEN-26-${num}`,
    poster: r.poster?.dataUrl || null,
  };
}

/** The ONLY source of events students may see: seed events + published requests. */
export function publishedEvents(state) {
  const extra = (state.requests || [])
    .filter((r) => r.status === 'published' && !r.legacyEventId)
    .map((r) => toStudentEvent(r, state));
  const base = (state.catalog?.events || []).map((e) => withRegistrations(e, state));
  return [...base, ...extra];
}

/** Adds seats taken through this portal on top of the sample figure and recomputes the open/full status. */
function withRegistrations(e, state) {
  const n = state.registrationCounts?.[e.id] || 0;
  if (!n) return e;
  const registered = e.registered + n;
  return {
    ...e,
    registered,
    status: e.status === 'closed' ? 'closed' : registered >= e.capacity ? 'full' : e.status,
  };
}

export function calendarEvents(state) {
  const base = (state.catalog?.calendar || []).map((e) => ({
    id: e.id,
    date: `2026-10-${pad2(e.day)}`,
    title: e.title,
    category: e.category,
    eventId: e.eventId,
  }));
  const extra = publishedEvents(state)
    .filter((e) => e.requestId)
    .map((e) => ({ id: e.id, date: e.date, title: e.title, category: e.category, eventId: e.id }));
  return [...base, ...extra];
}

/* ------------------------------------------------------------------ */
/* Aggregates                                                          */
/* ------------------------------------------------------------------ */
export function adminStats(state) {
  const r = state.requests;
  const live = r.filter((x) => !['completed'].includes(x.status));
  return {
    pendingOnline: r.filter(needsOnlineReview).length,
    awaitingHall: r.filter(awaitingHall).length,
    hallRequests: r.filter(awaitingHall).length,
    awaitingPhysical: r.filter(needsPhysical).length,
    readyForApproval: r.filter(readyForApproval).length,
    readyToPublish: r.filter(readyToPublish).length,
    corrections: r.filter((x) => x.status === 'correction_requested').length,
    published: r.filter((x) => x.status === 'published').length,
    rejected: r.filter((x) => x.status === 'rejected').length,
    pendingPromotions: state.promotions.filter((p) => p.status === 'submitted').length,
    clubApps: state.clubApplications.filter((a) => a.status === 'submitted').length,
    clubs: allClubs(state).length,
    totalRequests: live.length,
    conflicts: r.filter(
      (x) => ['submitted', 'approved'].includes(x.status) && findConflicts(state, x).length > 0,
    ).length,
  };
}

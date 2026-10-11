// Pure workflow engine for the governance prototype.
//
// Every function takes (state, actor, ...args) and returns
//   { ok: true, state, ...extra }  or  { ok: false, state, error }
// State is never mutated. Permission checks live here (not only in the UI),
// so the rules are enforced no matter which component calls them.

import { CLUB_APP_DOCS, REQUEST_DOCS, VENUES } from './govData.js';
import {
  TODAY_ISO,
  allClubs,
  clubProfile,
  findConflicts,
  fmtDate,
  fmtDateTime,
  fmt12,
  hallOf,
  initialsOf,
} from './selectors.js';
import { newEventNotice } from './copy.js';
import { CLUB_BLOCK_SCORE, duplicateSummary, localDuplicateCheck } from './ai.js';
import { actorKey, can, deniedReason, ownsClub } from './permissions.js';

const ROLE_SHORT = { osa: 'OSA', events: 'Events Section', club: 'Club Authority', student: 'Student' };
const NO_HALL = {
  status: 'none',
  by: null,
  at: null,
  note: '',
  requestedVenue: '',
  priority: null,
  registered: 0,
};
const fail = (state, error) => ({ ok: false, state, error });
const ok = (state, extra = {}) => ({ ok: true, state, ...extra });

/* ----------------------------- utilities ---------------------------- */
function isoLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
/** Advance the demo clock by a few minutes per action so timestamps stay ordered. */
function tick(state) {
  const d = new Date(state.clock);
  d.setMinutes(d.getMinutes() + 4);
  return isoLocal(d);
}
const who = (actor) => ({ by: actor.name, role: ROLE_SHORT[actorKey(actor)] || 'User' });
const entry = (at, actor, action, note = '') => ({ at, ...who(actor), action, note });

function nextId(state, kind, prefix) {
  const n = (state.counters[kind] || 0) + 1;
  return { id: `${prefix}${n}`, counters: { ...state.counters, [kind]: n } };
}

function withActivity(state, at, actor, text, extra) {
  const { id, counters } = nextId(state, 'activity', 'act-');
  return {
    ...state,
    counters,
    activity: [{ id, at, ...who(actor), text, ...extra }, ...state.activity].slice(0, 80),
  };
}

const mapRequest = (state, id, fn) => ({
  ...state,
  requests: state.requests.map((r) => (r.id === id ? fn(r) : r)),
});

/* ----------------------------- validation --------------------------- */
const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Returns { errors, warnings } for an event request form. */
export function validateRequest(data, { draft = false } = {}) {
  const errors = {};
  const warnings = [];
  if (!data.title || data.title.trim().length < 5)
    errors.title = 'Enter an event title (at least 5 characters).';
  if (draft) return { errors, warnings };

  if (!data.category) errors.category = 'Choose a category.';
  if (!data.description || data.description.trim().length < 30)
    errors.description = 'Describe the event in at least 30 characters.';
  if (!data.date) errors.date = 'Choose the event date.';
  else {
    const days = Math.round(
      (new Date(`${data.date}T00:00:00`) - new Date(`${TODAY_ISO}T00:00:00`)) / 86400000,
    );
    if (days < 2) errors.date = 'Requests must be made at least 2 days before the event.';
  }
  if (!data.startTime) errors.startTime = 'Choose a start time.';
  if (!data.endTime) errors.endTime = 'Choose an end time.';
  if (data.startTime && data.endTime && toMin(data.endTime) <= toMin(data.startTime))
    errors.endTime = 'End time must be after the start time.';
  const cap = Number(data.capacity);
  if (!Number.isInteger(cap) || cap < 5 || cap > 2000)
    errors.capacity = 'Enter expected attendance between 5 and 2000.';
  if (!data.regDeadline) errors.regDeadline = 'Choose a registration deadline.';
  else if (data.date && data.regDeadline > data.date)
    errors.regDeadline = 'Deadline cannot be after the event date.';
  else if (data.regDeadline < TODAY_ISO) errors.regDeadline = 'Deadline cannot be in the past.';
  if (!data.audience) errors.audience = 'Choose who can attend.';
  if (!data.poster) errors.poster = 'Upload an event poster.';
  const missing = REQUEST_DOCS.filter((d) => d.required && !data.documents?.[d.key]);
  if (missing.length) errors.documents = `Attach: ${missing.map((d) => d.label).join(', ')}.`;

  if (data.endTime && toMin(data.endTime) > 21 * 60)
    warnings.push('Campus policy: student events should end by 9:00 PM. OSA may reject later schedules.');
  return { errors, warnings };
}

export function validateClubApplication(data) {
  const errors = {};
  if (!data.name || data.name.trim().length < 3) errors.name = 'Enter the proposed club name.';
  if (!data.category) errors.category = 'Choose a category.';
  if (!data.objectives || data.objectives.trim().length < 30)
    errors.objectives = 'Describe objectives in at least 30 characters.';
  if (!data.proposerName?.trim()) errors.proposerName = 'Enter the proposer name.';
  if (!/^\S+@\S+\.\S+$/.test(data.proposerEmail || '')) errors.proposerEmail = 'Enter a valid email address.';
  if (!data.advisor?.trim()) errors.advisor = 'Enter the faculty advisor.';
  const n = Number(data.memberCount);
  if (!Number.isInteger(n) || n < 1) errors.memberCount = 'Enter the number of founding members.';
  return errors;
}

function cleanRequestFields(data) {
  return {
    title: (data.title || '').trim(),
    category: data.category || '',
    description: (data.description || '').trim(),
    date: data.date || '',
    startTime: data.startTime || '',
    endTime: data.endTime || '',
    venue: '', // the hall is requested later, once the registrations are known
    capacity: Number(data.capacity) || 0,
    regDeadline: data.regDeadline || '',
    regDeadlineTime: data.regDeadlineTime || '18:00',
    audience: data.audience || '',
    poster: data.poster || null,
    documents: data.documents || {},
  };
}

/* ======================= Club authority: requests ====================== */

export function saveRequest(state, actor, data, { submit = false, id = null } = {}) {
  if (actorKey(actor) !== 'club' || !actor.clubId)
    return fail(state, 'Only club authorities can submit event requests.');
  const { errors } = validateRequest(data, { draft: !submit });
  if (Object.keys(errors).length) return fail(state, Object.values(errors)[0]);

  const at = tick(state);
  const fields = cleanRequestFields(data);

  // Existing request -> edit / resubmit
  if (id) {
    const cur = state.requests.find((r) => r.id === id);
    if (!cur) return fail(state, 'Request not found.');
    if (!ownsClub(actor, cur.clubId)) return fail(state, 'You can only edit your own club’s requests.');
    if (!['draft', 'correction_requested'].includes(cur.status))
      return fail(state, 'This request can no longer be edited.');
    const resubmitting = submit && cur.status === 'correction_requested';
    let next = mapRequest({ ...state, clock: at }, id, (r) => ({
      ...r,
      ...fields,
      status: submit ? 'submitted' : r.status,
      version: resubmitting ? r.version + 1 : r.version,
      submittedAt: submit ? at : r.submittedAt,
      onlineReview: resubmitting ? { status: 'pending', by: null, at: null, note: '' } : r.onlineReview,
      physical:
        resubmitting && r.physical.status === 'issue'
          ? { status: 'pending', by: null, at: null, receivedOn: null, refNo: '', note: '' }
          : r.physical,
      feedback: resubmitting ? r.feedback.map((f) => ({ ...f, resolved: true })) : r.feedback,
      history: [
        ...r.history,
        entry(
          at,
          actor,
          submit
            ? resubmitting
              ? `Corrected and resubmitted (v${r.version + 1})`
              : 'Submitted request'
            : 'Saved draft',
        ),
      ],
    }));
    if (submit)
      next = withActivity(
        next,
        at,
        actor,
        `${resubmitting ? 're' : ''}submitted event request “${fields.title}”`,
        { kind: 'request', refType: 'request', refId: id, clubId: cur.clubId },
      );
    return ok(next, { id });
  }

  // New request
  const { id: newId, counters } = nextId(state, 'request', 'REQ-');
  const req = {
    id: newId,
    clubId: actor.clubId,
    ...fields,
    status: submit ? 'submitted' : 'draft',
    hall: { ...NO_HALL },
    onlineReview: { status: 'pending', by: null, at: null, note: '' },
    physical: { status: 'pending', by: null, at: null, receivedOn: null, refNo: '', note: '' },
    approval: null,
    publication: null,
    feedback: [],
    version: 1,
    createdAt: at,
    submittedAt: submit ? at : null,
    history: [entry(at, actor, submit ? 'Submitted request' : 'Saved draft', 'Version 1')],
  };
  let next = { ...state, clock: at, counters, requests: [req, ...state.requests] };
  if (submit)
    next = withActivity(next, at, actor, `submitted event request “${req.title}”`, {
      kind: 'request',
      refType: 'request',
      refId: newId,
      clubId: actor.clubId,
    });
  return ok(next, { id: newId });
}

export function deleteDraft(state, actor, id) {
  const cur = state.requests.find((r) => r.id === id);
  if (!cur) return fail(state, 'Request not found.');
  if (!ownsClub(actor, cur.clubId)) return fail(state, 'You can only delete your own club’s drafts.');
  if (cur.status !== 'draft') return fail(state, 'Only drafts can be deleted.');
  return ok({ ...state, requests: state.requests.filter((r) => r.id !== id) });
}

/* ====================== Admin: review & approval ====================== */

/** decision: 'clear' | 'correction' | 'reject' */
export function reviewRequest(state, actor, id, { decision, reasons = [], note = '' }) {
  if (!can(actor, 'request.review')) return fail(state, deniedReason('request.review'));
  const cur = state.requests.find((r) => r.id === id);
  if (!cur) return fail(state, 'Request not found.');
  if (cur.status !== 'submitted') return fail(state, 'Only submitted requests can be reviewed.');
  const at = tick(state);
  const feedbackBase = nextId(state, 'feedback', 'fb-');
  let next = { ...state, clock: at };

  if (decision === 'clear') {
    if (cur.onlineReview.status === 'cleared') return fail(state, 'Online review is already cleared.');
    next = mapRequest(next, id, (r) => ({
      ...r,
      onlineReview: { status: 'cleared', by: actor.name, at, note },
      history: [...r.history, entry(at, actor, 'Online review cleared', note)],
    }));
    next = withActivity(next, at, actor, `cleared online review for “${cur.title}”`, {
      kind: 'request',
      refType: 'request',
      refId: id,
      clubId: cur.clubId,
    });
    return ok(next);
  }

  if (decision === 'correction' || decision === 'reject') {
    if (decision === 'reject' && !note.trim())
      return fail(state, 'Give a reason before rejecting this request.');
    if (decision === 'correction' && !note.trim() && reasons.length === 0)
      return fail(state, 'Describe the corrections the club must make.');
    const type = decision === 'reject' ? 'rejection' : 'correction';
    next = { ...next, counters: feedbackBase.counters };
    next = mapRequest(next, id, (r) => ({
      ...r,
      status: decision === 'reject' ? 'rejected' : 'correction_requested',
      onlineReview: { status: decision === 'reject' ? 'rejected' : 'correction', by: actor.name, at, note },
      feedback: [
        ...r.feedback,
        { id: feedbackBase.id, type, at, by: actor.name, reasons, note, resolved: false },
      ],
      history: [
        ...r.history,
        entry(
          at,
          actor,
          decision === 'reject' ? 'Request rejected' : 'Corrections requested',
          reasons.join('; ') || note,
        ),
      ],
    }));
    next = withActivity(
      next,
      at,
      actor,
      `${decision === 'reject' ? 'rejected' : 'requested corrections on'} “${cur.title}”`,
      { kind: 'request', refType: 'request', refId: id, clubId: cur.clubId },
    );
    return ok(next);
  }
  return fail(state, 'Unknown decision.');
}

export const HALL_PRIORITIES = ['high', 'medium', 'low'];

/**
 * After OSA has given permission and the event has been circulated, the club authority knows how many students
 * registered. It then asks the Events Section for a hall, saying how important this event is to the club (priority).
 * `registered` is the live count the API supplies; the browser's value is ignored there.
 */
export function requestHall(
  state,
  actor,
  id,
  { venue, priority = 'medium', note = '', registered = 0 } = {},
) {
  const cur = state.requests.find((r) => r.id === id);
  if (!cur) return fail(state, 'Request not found.');
  if (!ownsClub(actor, cur.clubId))
    return fail(state, 'You can only request a hall for your own club’s events.');
  if (cur.status !== 'published')
    return fail(
      state,
      'Circulate the event to students first: the hall is requested once registrations are coming in.',
    );
  const current = hallOf(cur).status;
  if (current === 'approved') return fail(state, 'A hall is already allocated.');
  if (current === 'requested') return fail(state, 'A hall request is already with the Events Section.');
  const v = VENUES.find((x) => x.name === venue);
  if (!v) return fail(state, 'Choose one of the listed halls.');
  if (!HALL_PRIORITIES.includes(priority)) return fail(state, 'Choose a priority.');
  const people = Math.max(Number(registered) || 0, 0);
  const attendance = people || cur.capacity;
  if (v.capacity < attendance)
    return fail(
      state,
      `${v.name} holds ${v.capacity}, fewer than the ${attendance} ${people ? 'registered' : 'expected'}.`,
    );
  if (findConflicts(state, { ...cur, venue: v.name }).length)
    return fail(state, `${v.name} is already allocated at an overlapping time.`);
  const at = tick(state);
  let next = mapRequest({ ...state, clock: at }, id, (r) => ({
    ...r,
    hall: {
      status: 'requested',
      by: actor.name,
      requestedBy: actor.name,
      at,
      note: note.trim(),
      requestedVenue: v.name,
      priority,
      registered: people,
    },
    history: [
      ...r.history,
      entry(at, actor, 'Hall requested', `${v.name} · ${priority} priority · ${people} registered`),
    ],
  }));
  next = withActivity(next, at, actor, `requested ${v.name} for “${cur.title}”`, {
    kind: 'request',
    refType: 'request',
    refId: id,
    clubId: cur.clubId,
  });
  return ok(next);
}

/**
 * The Events Section's decision on a hall request. decision:
 *  - 'approve'  allocate the hall the club asked for;
 *  - 'reassign' allocate a different hall (it must hold the registered crowd and be free);
 *  - 'reject'   the hall cannot be given (a reason is required); the club can request again.
 */
export function reviewHall(state, actor, id, { decision, venue = '', note = '' }) {
  if (!can(actor, 'request.hall')) return fail(state, deniedReason('request.hall'));
  const cur = state.requests.find((r) => r.id === id);
  if (!cur) return fail(state, 'Request not found.');
  const hall = hallOf(cur);
  if (hall.status !== 'requested') return fail(state, 'The club has not asked for a hall for this event.');
  if (!['approve', 'reassign', 'reject'].includes(decision)) return fail(state, 'Unknown decision.');
  const at = tick(state);
  const requested = hall.requestedVenue;
  const keep = {
    requestedVenue: requested,
    priority: hall.priority,
    registered: hall.registered,
    requestedBy: hall.requestedBy,
  };

  if (decision === 'reject') {
    if (!note.trim()) return fail(state, 'Tell the club why the hall cannot be given.');
    let next = mapRequest({ ...state, clock: at }, id, (r) => ({
      ...r,
      venue: '',
      hall: { status: 'rejected', by: actor.name, at, note, ...keep },
      history: [...r.history, entry(at, actor, 'Hall not given', `${requested}: ${note}`)],
    }));
    next = withActivity(next, at, actor, `could not give the hall for “${cur.title}”`, {
      kind: 'request',
      refType: 'request',
      refId: id,
      clubId: cur.clubId,
    });
    return ok(next);
  }

  let assigned = requested;
  if (decision === 'reassign') {
    if (venue === requested) return fail(state, 'That is the hall the club asked for. Use Approve.');
    assigned = venue;
  }
  const v = VENUES.find((x) => x.name === assigned);
  if (!v) return fail(state, 'Choose one of the listed halls.');
  const attendance = hall.registered || cur.capacity;
  if (v.capacity < attendance)
    return fail(state, `${v.name} holds ${v.capacity}, fewer than the ${attendance} expected.`);
  if (findConflicts(state, { ...cur, venue: v.name }).length)
    return fail(state, `${v.name} is already allocated at an overlapping time.`);
  const label = decision === 'approve' ? 'Hall allocated' : 'Different hall allocated';
  const detail = decision === 'approve' ? v.name : `${requested} -> ${v.name}${note ? `: ${note}` : ''}`;
  let next = mapRequest({ ...state, clock: at }, id, (r) => ({
    ...r,
    venue: v.name,
    hall: { status: 'approved', by: actor.name, at, note, ...keep },
    history: [...r.history, entry(at, actor, label, detail)],
  }));
  next = withActivity(next, at, actor, `allocated ${v.name} to “${cur.title}”`, {
    kind: 'request',
    refType: 'request',
    refId: id,
    clubId: cur.clubId,
  });
  return ok(next);
}

/** Hard-copy letter verification — recorded separately from the online review. */
export function recordPhysical(state, actor, id, { status, receivedOn = '', refNo = '', note = '' }) {
  if (!can(actor, 'request.physical')) return fail(state, deniedReason('request.physical'));
  const cur = state.requests.find((r) => r.id === id);
  if (!cur) return fail(state, 'Request not found.');
  if (cur.status !== 'submitted') return fail(state, 'Hard-copy verification applies to submitted requests.');
  if (!['verified', 'issue'].includes(status)) return fail(state, 'Unknown verification status.');
  if (status === 'verified' && (!receivedOn || !refNo.trim()))
    return fail(state, 'Enter the date received and the hard-copy reference number.');
  if (status === 'issue' && !note.trim())
    return fail(state, 'Describe the issue found with the hard-copy letter.');
  const at = tick(state);
  let next = mapRequest({ ...state, clock: at }, id, (r) => ({
    ...r,
    physical: { status, by: actor.name, at, receivedOn, refNo: refNo.trim(), note },
    history: [
      ...r.history,
      entry(
        at,
        actor,
        status === 'verified' ? 'Hard-copy letter verified' : 'Hard-copy letter issue recorded',
        status === 'verified' ? `Ref ${refNo.trim()}` : note,
      ),
    ],
  }));
  next = withActivity(
    next,
    at,
    actor,
    `${status === 'verified' ? 'verified the hard-copy letter for' : 'flagged an issue with the hard-copy letter for'} “${cur.title}”`,
    { kind: 'physical', refType: 'request', refId: id, clubId: cur.clubId },
  );
  return ok(next);
}

/** FINAL approval — OSA only, after online review and physical verification. */
export function finalApprove(state, actor, id, { note = '' } = {}) {
  if (!can(actor, 'request.approve')) return fail(state, deniedReason('request.approve'));
  const cur = state.requests.find((r) => r.id === id);
  if (!cur) return fail(state, 'Request not found.');
  if (cur.status !== 'submitted') return fail(state, 'Only submitted requests can be approved.');
  if (cur.onlineReview.status !== 'cleared')
    return fail(state, 'Online review must be cleared before final approval.');
  if (cur.physical.status !== 'verified')
    return fail(state, 'The hard-copy letter must be verified before final approval.');
  const at = tick(state);
  let next = mapRequest({ ...state, clock: at }, id, (r) => ({
    ...r,
    status: 'approved',
    approval: { by: actor.name, at, note },
    history: [...r.history, entry(at, actor, 'Final approval granted', note)],
  }));
  next = withActivity(next, at, actor, `granted final approval to “${cur.title}”`, {
    kind: 'approval',
    refType: 'request',
    refId: id,
    clubId: cur.clubId,
  });
  return ok(next);
}

/** Circulate an event OSA has given permission for: it appears on the Student Dashboard, students are notified and can register. */
export function publishRequest(state, actor, id, { quote } = {}) {
  const cur = state.requests.find((r) => r.id === id);
  if (!cur) return fail(state, 'Request not found.');
  // Once OSA has given permission, the club itself circulates the event on the portal (OSA may do it too).
  if (!ownsClub(actor, cur.clubId) && !can(actor, 'request.publish'))
    return fail(state, deniedReason('request.publish'));
  if (cur.status !== 'approved')
    return fail(state, 'Only events OSA has given permission for can be circulated.');
  const at = tick(state);
  const club = allClubs(state).find((c) => c.id === cur.clubId);
  const bc = nextId(state, 'notice', 'bc-');
  const notice = {
    id: bc.id,
    type: 'club',
    label: 'New event',
    time: fmtDateTime(at),
    ...newEventNotice({
      title: cur.title,
      category: cur.category,
      clubName: club?.name || 'A club',
      when: `${fmtDate(cur.date)}, ${fmt12(cur.startTime)}`,
      venue: cur.venue || 'a hall announced soon',
      capacity: cur.capacity,
      deadline: fmtDate(cur.regDeadline),
      seed: cur.id,
      quote,
    }),
    eventId: `evt-${cur.id.toLowerCase()}`,
    unread: true,
    kind: 'club',
  };
  let next = mapRequest(
    { ...state, clock: at, counters: bc.counters, broadcasts: [notice, ...state.broadcasts] },
    id,
    (r) => ({
      ...r,
      status: 'published',
      publication: { by: actor.name, at },
      history: [...r.history, entry(at, actor, 'Published to students', 'In-app notification sent')],
    }),
  );
  next = withActivity(next, at, actor, `published “${cur.title}” to the Student Dashboard`, {
    kind: 'publish',
    refType: 'request',
    refId: id,
    clubId: cur.clubId,
  });
  return ok(next, { notice });
}

/* ============================ Promotions ============================== */

export function createPromotion(
  state,
  actor,
  { requestId, channels = [], note = '', posterSupport = false },
) {
  const req = state.requests.find((r) => r.id === requestId);
  if (!req) return fail(state, 'Choose an event request.');
  if (!ownsClub(actor, req.clubId))
    return fail(state, 'You can only request promotion for your own club’s events.');
  if (['draft', 'rejected', 'completed'].includes(req.status))
    return fail(
      state,
      'Promotion can be requested once an event request has been submitted and is still active.',
    );
  if (channels.length === 0) return fail(state, 'Select at least one promotion channel.');
  if (state.promotions.some((p) => p.requestId === requestId && ['submitted', 'changes'].includes(p.status)))
    return fail(state, 'A promotion request for this event is already open.');
  const at = tick(state);
  const { id, counters } = nextId(state, 'promotion', 'PRM-');
  const promo = {
    id,
    requestId,
    clubId: req.clubId,
    channels,
    posterSupport,
    note: note.trim(),
    status: 'submitted',
    reviewNote: '',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: at,
    history: [entry(at, actor, 'Promotion requested')],
  };
  let next = { ...state, clock: at, counters, promotions: [promo, ...state.promotions] };
  next = withActivity(next, at, actor, `requested promotion for “${req.title}”`, {
    kind: 'promotion',
    refType: 'promotion',
    refId: id,
    clubId: req.clubId,
  });
  return ok(next, { id });
}

export function reviewPromotion(state, actor, id, { decision, note = '' }) {
  if (!can(actor, 'promotion.review')) return fail(state, deniedReason('promotion.review'));
  const cur = state.promotions.find((p) => p.id === id);
  if (!cur) return fail(state, 'Promotion request not found.');
  if (cur.status !== 'submitted') return fail(state, 'This promotion request has already been reviewed.');
  if (!['approve', 'changes', 'reject'].includes(decision)) return fail(state, 'Unknown decision.');
  if (decision !== 'approve' && !note.trim())
    return fail(state, 'Add a note explaining what the club should change or why it was rejected.');
  const at = tick(state);
  const status = { approve: 'approved', changes: 'changes', reject: 'rejected' }[decision];
  const label = { approve: 'Promotion approved', changes: 'Changes requested', reject: 'Promotion rejected' }[
    decision
  ];
  const req = state.requests.find((r) => r.id === cur.requestId);
  let next = {
    ...state,
    clock: at,
    promotions: state.promotions.map((p) =>
      p.id === id
        ? {
            ...p,
            status,
            reviewNote: note,
            reviewedBy: actor.name,
            reviewedAt: at,
            history: [...p.history, entry(at, actor, label, note)],
          }
        : p,
    ),
  };
  next = withActivity(next, at, actor, `${label.toLowerCase()} for “${req?.title || cur.requestId}”`, {
    kind: 'promotion',
    refType: 'promotion',
    refId: id,
    clubId: cur.clubId,
  });
  return ok(next);
}

export function resubmitPromotion(state, actor, id, { channels, note, posterSupport }) {
  const cur = state.promotions.find((p) => p.id === id);
  if (!cur) return fail(state, 'Promotion request not found.');
  if (!ownsClub(actor, cur.clubId))
    return fail(state, 'You can only change your own club’s promotion requests.');
  if (cur.status !== 'changes')
    return fail(state, 'Only requests with requested changes can be resubmitted.');
  if (!channels?.length) return fail(state, 'Select at least one promotion channel.');
  const at = tick(state);
  let next = {
    ...state,
    clock: at,
    promotions: state.promotions.map((p) =>
      p.id === id
        ? {
            ...p,
            channels,
            note: (note ?? p.note).trim(),
            posterSupport: !!posterSupport,
            status: 'submitted',
            history: [...p.history, entry(at, actor, 'Resubmitted with changes')],
          }
        : p,
    ),
  };
  next = withActivity(next, at, actor, `resubmitted promotion ${id}`, {
    kind: 'promotion',
    refType: 'promotion',
    refId: id,
    clubId: cur.clubId,
  });
  return ok(next);
}

/* ========================== Club applications ========================= */

export function createClubApplication(state, actor, data) {
  if (!can(actor, 'clubApp.create')) return fail(state, deniedReason('clubApp.create'));
  const errors = validateClubApplication(data);
  if (Object.keys(errors).length) return fail(state, Object.values(errors)[0]);
  const at = tick(state);
  const { id, counters } = nextId(state, 'clubApp', 'CA-');
  const app = {
    id,
    name: data.name.trim(),
    category: data.category,
    objectives: data.objectives.trim(),
    description: (data.description || '').trim(),
    proposer: {
      name: data.proposerName.trim(),
      rollNo: (data.proposerRoll || '').trim(),
      dept: (data.proposerDept || '').trim(),
      email: data.proposerEmail.trim(),
    },
    advisor: data.advisor.trim(),
    memberCount: Number(data.memberCount),
    documents: data.documents || {},
    status: 'submitted',
    decisionNote: '',
    submittedAt: at,
    aiCheck: null,
    history: [entry(at, actor, 'Application logged', `Received from ${data.proposerName.trim()}`)],
  };
  let next = { ...state, clock: at, counters, clubApplications: [app, ...state.clubApplications] };
  next = withActivity(next, at, actor, `logged club application “${app.name}”`, {
    kind: 'club',
    refType: 'clubApp',
    refId: id,
    clubId: null,
  });
  return ok(next, { id });
}

/**
 * Compares a proposed club with every existing club and with applications still waiting for a decision.
 * `blocked` is the message to show when the same focus area is already covered (empty when the idea is new).
 */
export function checkClubIdea(state, form) {
  const waiting = state.clubApplications
    .filter((a) => ['submitted', 'correction_requested'].includes(a.status))
    .map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      tag: '',
      blurb: a.objectives,
      application: true,
    }));
  const objectivesOf = (c) => (c.application ? '' : (clubProfile(state, c.id).objectives ?? []).join(' '));
  const matches = localDuplicateCheck(form, [...allClubs(state), ...waiting], objectivesOf);
  const top = matches[0];
  let blocked = '';
  if (top && top.score >= CLUB_BLOCK_SCORE) {
    blocked = waiting.some((w) => w.id === top.clubId)
      ? `Another application (“${top.name}”) already covers this idea. Join forces with them instead.`
      : `“${top.name}” already covers this focus area (${Math.round(top.score * 100)}% similar). Join that club instead, or propose something different.`;
  }
  return { matches, blocked, summary: duplicateSummary(matches) };
}

/**
 * A student proposes a new club. Before anything is recorded the idea is compared with every existing club and with
 * applications still waiting for a decision: if the same focus area is already covered the application is refused and
 * the student is pointed to that club. A new idea goes to OSA, who decides.
 * `semantic` is the model's judgement from the API ({ similar, club, reason }); the browser's own value is ignored there.
 */
export function applyForClub(state, actor, data, { semantic = null } = {}) {
  if (!can(actor, 'clubApp.apply')) return fail(state, 'Only students can apply to start a club.');
  const form = {
    ...data,
    proposerName: actor.name,
    proposerEmail: actor.email,
    proposerRoll: actor.userId,
    proposerDept: actor.department || actor.shortDept || '',
  };
  const errors = validateClubApplication(form);
  if (Object.keys(errors).length) return fail(state, Object.values(errors)[0]);
  if (Number(form.memberCount) < 10) return fail(state, 'A new club needs at least 10 founding members.');
  if (
    state.clubApplications.some(
      (a) =>
        a.proposer.rollNo === actor.userId &&
        a.status === 'submitted' &&
        a.name.toLowerCase() === form.name.trim().toLowerCase(),
    )
  )
    return fail(state, 'You have already applied for this club. It is waiting for OSA.');

  const { matches, blocked } = checkClubIdea(state, form);
  if (blocked) return fail(state, blocked);
  if (semantic?.similar && semantic.club)
    return fail(
      state,
      `“${semantic.club}” already covers this idea${semantic.reason ? `: ${semantic.reason}` : '.'} Join that club instead, or propose something different.`,
    );

  const at = tick(state);
  const { id, counters } = nextId(state, 'clubApp', 'CA-');
  const app = {
    id,
    name: form.name.trim(),
    category: form.category,
    objectives: form.objectives.trim(),
    description: (form.description || '').trim(),
    proposer: {
      name: actor.name,
      rollNo: actor.userId,
      dept: form.proposerDept,
      email: actor.email,
      userId: actor.id,
    },
    advisor: form.advisor.trim(),
    memberCount: Number(form.memberCount),
    documents: form.documents || {},
    status: 'submitted',
    decisionNote: '',
    submittedAt: at,
    aiCheck: {
      source: semantic ? 'ai-service' : 'local-mock',
      ranAt: at,
      matches,
      summary: duplicateSummary(matches),
      acknowledged: false,
      checkedAtApply: true,
    },
    history: [
      entry(
        at,
        actor,
        'Student applied to start a club',
        `${matches.length} similar club(s) found, none close enough to block`,
      ),
    ],
  };
  let next = { ...state, clock: at, counters, clubApplications: [app, ...state.clubApplications] };
  next = withActivity(next, at, actor, `applied to start the club “${app.name}”`, {
    kind: 'club',
    refType: 'clubApp',
    refId: id,
    clubId: null,
  });
  return ok(next, { id });
}

export function saveAiCheck(state, actor, id, result) {
  if (!can(actor, 'clubApp.aiCheck')) return fail(state, deniedReason('clubApp.aiCheck'));
  if (!state.clubApplications.some((a) => a.id === id)) return fail(state, 'Application not found.');
  const at = tick(state);
  const next = {
    ...state,
    clock: at,
    clubApplications: state.clubApplications.map((a) =>
      a.id === id
        ? {
            ...a,
            aiCheck: { ...result, acknowledged: false },
            history: [
              ...a.history,
              entry(
                at,
                actor,
                'Duplicate check run',
                `${result.matches.length} similar club(s) · ${result.source}`,
              ),
            ],
          }
        : a,
    ),
  };
  return ok(next);
}

/** decision: 'approve' | 'correction' | 'reject' | 'reopen' */
export function decideClubApplication(
  state,
  actor,
  id,
  { decision, note = '', acknowledgeDuplicate = false },
) {
  if (!can(actor, 'clubApp.decide')) return fail(state, deniedReason('clubApp.decide'));
  const cur = state.clubApplications.find((a) => a.id === id);
  if (!cur) return fail(state, 'Application not found.');
  const at = tick(state);

  if (decision === 'reopen') {
    if (cur.status !== 'correction_requested')
      return fail(state, 'Only applications awaiting corrections can be reopened.');
    const next = {
      ...state,
      clock: at,
      clubApplications: state.clubApplications.map((a) =>
        a.id === id
          ? {
              ...a,
              status: 'submitted',
              history: [...a.history, entry(at, actor, 'Corrections received — back in review')],
            }
          : a,
      ),
    };
    return ok(next);
  }
  if (cur.status !== 'submitted') return fail(state, 'This application is not awaiting a decision.');

  if (decision === 'correction' || decision === 'reject') {
    if (!note.trim()) return fail(state, 'Add a reason so the applicant knows what to do next.');
    const status = decision === 'reject' ? 'rejected' : 'correction_requested';
    let next = {
      ...state,
      clock: at,
      clubApplications: state.clubApplications.map((a) =>
        a.id === id
          ? {
              ...a,
              status,
              decisionNote: note,
              history: [
                ...a.history,
                entry(
                  at,
                  actor,
                  decision === 'reject' ? 'Application rejected' : 'Corrections requested',
                  note,
                ),
              ],
            }
          : a,
      ),
    };
    next = withActivity(
      next,
      at,
      actor,
      `${decision === 'reject' ? 'rejected' : 'requested corrections on'} club application “${cur.name}”`,
      { kind: 'club', refType: 'clubApp', refId: id, clubId: null },
    );
    return ok(next);
  }

  if (decision === 'approve') {
    const missing = CLUB_APP_DOCS.filter((d) => d.required && !cur.documents?.[d.key]);
    if (missing.length)
      return fail(state, `Required documents missing: ${missing.map((d) => d.label).join(', ')}.`);
    if (cur.memberCount < 10) return fail(state, 'A new club needs at least 10 founding members.');
    if (!cur.aiCheck) return fail(state, 'Run the duplicate-club check before approving.');
    const top = cur.aiCheck.matches[0];
    if (top && top.score >= 0.5 && !acknowledgeDuplicate)
      return fail(
        state,
        `“${top.name}” looks very similar (${Math.round(top.score * 100)}%). Confirm you have reviewed the overlap to continue.`,
      );
    if (allClubs(state).some((c) => c.name.toLowerCase() === cur.name.toLowerCase()))
      return fail(state, 'A club with this name already exists.');

    const clubId = `club-${cur.id.toLowerCase()}`;
    const club = {
      id: clubId,
      name: cur.name,
      category: cur.category,
      blurb: cur.description || cur.objectives.slice(0, 140),
      members: cur.memberCount,
      profile: {
        founded: 2026,
        tagline: '',
        objectives: [cur.objectives],
        authorities: [
          { role: 'President', name: cur.proposer.name, email: cur.proposer.email },
          { role: 'Faculty Advisor', name: cur.advisor, email: '' },
        ],
        contactEmail: cur.proposer.email,
        meeting: 'To be announced',
        location: 'To be announced',
        social: '',
      },
    };
    let next = {
      ...state,
      clock: at,
      newClubs: [...state.newClubs, club],
      clubApplications: state.clubApplications.map((a) =>
        a.id === id
          ? {
              ...a,
              status: 'approved',
              decisionNote: note,
              createdClubId: clubId,
              aiCheck: a.aiCheck ? { ...a.aiCheck, acknowledged: acknowledgeDuplicate } : a.aiCheck,
              history: [...a.history, entry(at, actor, 'Application approved — club created', note)],
            }
          : a,
      ),
    };
    next = withActivity(next, at, actor, `approved the new club “${cur.name}”`, {
      kind: 'club',
      refType: 'clubApp',
      refId: id,
      clubId,
    });
    return ok(next, { clubId });
  }
  return fail(state, 'Unknown decision.');
}

/* ============================ Club profile ============================ */

export function updateClubProfile(state, actor, clubId, patch) {
  if (!ownsClub(actor, clubId)) return fail(state, 'You can only edit your own club’s details.');
  const description = (patch.description || '').trim();
  if (description.length < 20) return fail(state, 'Write a description of at least 20 characters.');
  if (patch.contactEmail && !/^\S+@\S+\.\S+$/.test(patch.contactEmail))
    return fail(state, 'Enter a valid contact email.');
  const objectives = (patch.objectives || []).map((o) => o.trim()).filter(Boolean);
  if (objectives.length === 0) return fail(state, 'Add at least one objective.');
  const at = tick(state);
  const clean = {
    description,
    objectives,
    tagline: (patch.tagline || '').trim(),
    contactEmail: (patch.contactEmail || '').trim(),
    meeting: (patch.meeting || '').trim(),
    location: (patch.location || '').trim(),
    social: (patch.social || '').trim(),
  };
  let next = { ...state, clock: at, clubOverrides: { ...state.clubOverrides, [clubId]: clean } };
  next = withActivity(next, at, actor, 'updated the club profile', {
    kind: 'club',
    refType: 'club',
    refId: clubId,
    clubId,
  });
  return ok(next);
}

export { initialsOf };

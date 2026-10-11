// Hall (venue) logic shared by the club form, the Events Section review and the API: how well a hall fits the expected
// number of people, whether it is free at that time, and which kinds of hall suit which kind of event. Pure functions.

import { VENUES } from './govData.js';

/** Which hall kinds suit which event category (first is the best match). */
export const KIND_FOR_CATEGORY = {
  Hackathon: ['lab', 'auditorium', 'hall'],
  Workshop: ['lab', 'seminar'],
  Technical: ['lab', 'seminar', 'hall', 'auditorium'],
  Cultural: ['amphitheatre', 'auditorium', 'open'],
  Sports: ['sports', 'open'],
  'Social Impact': ['open', 'hall'],
};

const LIVE = ['submitted', 'approved', 'published'];
const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Requests that already hold this hall at an overlapping time on that day. */
export function hallBookings(requests, { venue, date, startTime, endTime, ignoreId }) {
  if (!venue || !date || !startTime || !endTime) return [];
  return requests.filter(
    (o) =>
      o.id !== ignoreId &&
      LIVE.includes(o.status) &&
      o.venue === venue &&
      o.date === date &&
      o.startTime &&
      o.endTime &&
      toMin(o.startTime) < toMin(endTime) &&
      toMin(startTime) < toMin(o.endTime),
  );
}

/**
 * Ranks every hall for an event: capacity fit first (a hall that is too small is never recommended), then whether it
 * is free, then how well its kind suits the category. `recommended` marks the single best usable hall.
 */
export function rankHalls(
  { attendance, date, startTime, endTime, category, requests = [], ignoreId },
  venues = VENUES,
) {
  const n = Number(attendance) || 0;
  const ranked = venues.map((v) => {
    const clashes = hallBookings(requests, { venue: v.name, date, startTime, endTime, ignoreId });
    const available = clashes.length === 0;
    const fits = n > 0 ? n <= v.capacity : true;
    const util = n > 0 ? n / v.capacity : 0;
    const reasons = [];
    let score = 0;
    let status = 'unknown';
    if (n <= 0) {
      status = 'unknown';
      reasons.push(`Holds ${v.capacity} people`);
    } else if (!fits) {
      status = 'too_small';
      score = -100;
      reasons.push(`Holds ${v.capacity}, fewer than the ${n} you expect`);
    } else if (util > 0.95) {
      status = 'tight';
      score = 55;
      reasons.push(`Almost full (${Math.round(util * 100)}%): little room for walk-ins`);
    } else if (util >= 0.6) {
      status = 'good';
      score = 60 + util * 20;
      reasons.push(`Good fit: about ${Math.round(util * 100)}% full with ${n} people`);
    } else if (util >= 0.3) {
      status = 'comfortable';
      score = 40 + util * 40;
      reasons.push(`Comfortable: about ${Math.round(util * 100)}% full`);
    } else {
      status = 'oversized';
      score = 15 + util * 40;
      reasons.push(`Much larger than needed (about ${Math.round(util * 100)}% full)`);
    }
    const kinds = KIND_FOR_CATEGORY[category] ?? [];
    const kindRank = kinds.indexOf(v.kind);
    if (kindRank >= 0 && fits) {
      score += 18 - kindRank * 4;
      reasons.push(`Suits ${String(category).toLowerCase()} events (${v.kind})`);
    }
    if (!available) {
      score -= 200;
      status = 'booked';
      reasons.push(
        `Already requested at an overlapping time (${clashes
          .map((c) => c.title)
          .slice(0, 2)
          .join(', ')})`,
      );
    }
    return {
      name: v.name,
      capacity: v.capacity,
      kind: v.kind,
      facilities: v.facilities,
      location: v.location,
      score: Math.round(score),
      status,
      available,
      fits,
      utilisation: Math.round(util * 100),
      reasons,
      recommended: false,
    };
  });
  ranked.sort((a, b) => b.score - a.score || a.capacity - b.capacity);
  const best = ranked.find((h) => h.fits && h.available && n > 0);
  if (best) best.recommended = true;
  return ranked;
}

/** One or two plain sentences about the top choices, used when no language model is available. */
export function hallSummary(ranked, { attendance, category }) {
  const n = Number(attendance) || 0;
  if (!n) return 'Enter the number of people you expect and I will recommend a hall.';
  const best = ranked.find((h) => h.recommended);
  if (!best)
    return `No hall is free and big enough for ${n} people at that time. Try another time or split the event.`;
  const alt = ranked.find((h) => h.fits && h.available && h.name !== best.name);
  return `For ${n} people${category ? ` at a ${String(category).toLowerCase()} event` : ''}, ${best.name} is the best fit (${best.reasons.join('; ')}).${alt ? ` ${alt.name} is the next option (holds ${alt.capacity}).` : ''}`;
}

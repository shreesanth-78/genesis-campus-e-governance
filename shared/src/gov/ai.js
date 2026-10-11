// Pure, deterministic helpers behind the AI features. The API uses them as the answer when no model is configured
// and the browser uses them for the instant, offline pre-check. They never approve or reject anything.

const STOP = new Set([
  'the',
  'and',
  'for',
  'club',
  'society',
  'circle',
  'collective',
  'hub',
  'of',
  'a',
  'to',
  'in',
  'on',
  'with',
  'our',
  'we',
  'students',
  'student',
  'campus',
  'university',
  'community',
  'that',
  'is',
  'are',
  'by',
  'at',
  'as',
  'it',
  'be',
  'this',
  'from',
  'weekly',
  'run',
  'new',
]);
// Words that mean the same thing share one concept, so "programming", "coding" and "software development" overlap even
// though no word is common. This is the offline, rule-based half of the similarity check; the API adds a model.
const CONCEPT_GROUPS = {
  _code:
    'code coding coder program programming programmer software developer development dev hacking hackathon algorithm competitive codechef web app apps',
  _robot: 'robot robots robotic robotics automation drone drones arduino embedded mechatronics',
  _ai: 'ai artificial intelligence ml machine learning deep neural data analytics science tensor',
  _iot: 'iot internet things sensors hardware electronics',
  _music: 'music musical band singing sing vocal vocals choir instrument instruments beatboxing song songs',
  _dance: 'dance dancing choreography dancer dancers classical folk',
  _drama: 'drama theatre theater acting actor stage play plays performing mime skit',
  _film: 'film films movie movies cinema cinematography video videography',
  _photo: 'photography photo photos photographer camera visual',
  _art: 'art arts fine craft crafts painting drawing sketching design designing graphic ui ux',
  _business:
    'entrepreneur entrepreneurs entrepreneurship startup startups venture ventures business founder founders management',
  _social:
    'social volunteering volunteer volunteers service community charity ngo outreach responsibility sustainability environment conservation',
  _writing:
    'literary literature writing writer writers poetry poem poems stories story books reading creative journalism',
  _speak: 'debate debating speaking speaker public oratory elocution mun',
  _sport: 'sport sports cricket football athletics fitness game games chess badminton',
  _space: 'astronomy space astro astrophysics telescope stars',
  _vehicle: 'automobile vehicle vehicles racing mechanical baja supra automotive',
  _culture: 'culture cultural heritage tradition traditional indian language tamil',
};
const CONCEPT = new Map();
Object.entries(CONCEPT_GROUPS).forEach(([key, words]) =>
  words.split(' ').forEach((w) => CONCEPT.set(w, key)),
);

const tokens = (s = '') =>
  new Set(
    s
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w))
      .map((w) => CONCEPT.get(w) ?? CONCEPT.get(w.replace(/(ing|s)$/, '')) ?? w.replace(/(ing|s)$/, '')),
  );
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((t) => b.has(t) && inter++);
  return inter / (a.size + b.size - inter);
};
/** How much of the smaller description is covered by the other one (a short club blurb inside a long proposal). */
const containment = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((t) => b.has(t) && inter++);
  return inter / Math.min(a.size, b.size);
};

/** The focus areas a text is about (the shared concepts above), as a set. */
const topics = (set) => new Set([...set].filter((t) => t.startsWith('_')));
const dice = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((t) => b.has(t) && inter++);
  return (2 * inter) / (a.size + b.size);
};

/** A proposal this similar to an existing club (0 to 1) is not accepted: the students are pointed to that club. */
export const CLUB_BLOCK_SCORE = 0.45;

export function localDuplicateCheck(application, existingClubs, objectivesOf = () => '') {
  const nameT = tokens(application.name);
  const objT = tokens(`${application.name} ${application.objectives} ${application.description || ''}`);
  const matches = existingClubs
    .map((c) => {
      const nameScore = jaccard(nameT, tokens(c.name));
      const clubT = tokens(`${c.name} ${c.tag || ''} ${c.blurb} ${objectivesOf(c)}`);
      const wordScore = Math.max(jaccard(objT, clubT) * 2.2, containment(objT, clubT) * 0.9);
      // Same focus area (music, robotics, coding...) counts even when the two texts share no words.
      const topicScore = dice(topics(objT), topics(clubT));
      const objScore = Math.max(wordScore, topicScore);
      const sameCategory = c.category === application.category || c.tag === application.category ? 1 : 0;
      const score = Math.min(1, 0.3 * nameScore + 0.55 * Math.min(1, objScore) + 0.15 * sameCategory);
      const reasons = [];
      if (nameScore > 0.25) reasons.push('Similar club name');
      if (topicScore > 0 || wordScore > 0.2) reasons.push('Same focus area and activities');
      if (sameCategory) reasons.push(`Same category (${c.category})`);
      return { clubId: c.id, name: c.name, score: Number(score.toFixed(2)), reasons };
    })
    .filter((m) => m.score >= 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return matches;
}

/** One-line verdict shown above the matches. */
export function duplicateSummary(matches) {
  const top = matches[0];
  return !top
    ? 'No similar clubs found. This looks like a distinct community.'
    : top.score >= 0.5
      ? `High overlap with “${top.name}”. Consider asking the applicants to join or differentiate from it.`
      : `Some overlap with “${top.name}”. Review before approving.`;
}

export function precheckRequest(req, { conflicts = [], venueCapacity } = {}) {
  const findings = [];
  const add = (level, text) => findings.push({ level, text });
  if (req.description.length < 80)
    add('warn', 'Description is quite short — students may not understand what the event involves.');
  if (req.endTime > '21:00')
    add('warn', 'Event ends after 9:00 PM, which conflicts with the campus timing policy.');
  if (venueCapacity && req.capacity > venueCapacity)
    add('warn', `Expected attendance (${req.capacity}) exceeds the venue capacity (${venueCapacity}).`);
  if (venueCapacity && req.capacity < venueCapacity * 0.2)
    add('info', 'Venue is much larger than expected attendance — a smaller venue may suit better.');
  if (conflicts.length) add('warn', `Venue clash with ${conflicts.map((c) => c.title).join(', ')}.`);
  if (!req.poster) add('warn', 'No poster attached.');
  else if (req.poster.size && req.poster.size < 100 * 1024)
    add('warn', 'Poster file is very small and may be low resolution.');
  if (req.category === 'Sports' && !req.documents?.risk_note)
    add('warn', 'Sports events normally need a safety & risk note.');
  if (req.capacity > 300 && !req.documents?.risk_note)
    add('info', 'Large crowd expected — consider requesting a safety & risk note.');
  if (findings.length === 0) add('ok', 'No issues detected. Details look complete and consistent.');
  return { findings };
}

import {
  REFUSAL,
  clubsForInterest,
  describeClub,
  faqMatches,
  findClubByName,
  isInScope,
  smallTalk,
} from './knowledge.js';

export const ASSISTANT_FALLBACK =
  'I could not find that in the portal. Try the Clubs Directory or Explore Events, or ask the Office of Student Affairs.';

const eventsAnswer = (t, { events = [], todayISO }) => {
  const upcoming = events
    .filter((e) => e.date >= todayISO && e.status !== 'closed')
    .sort((a, b) => a.date.localeCompare(b.date));
  const list = (arr) => arr.map((e) => `${e.title} (${e.dateLabel}, ${e.venue})`).join('; ');
  const named = events.find((e) => t.includes(e.title.toLowerCase()));
  if (named)
    return `${named.title}: ${named.dateLabel}, ${named.time} to ${named.endTime} at ${named.venue}, by ${named.organizer}. ${named.closesLong}. ${named.registered} of ${named.capacity} seats taken (${named.status}). Open to: ${named.audience}.`;
  if (/hackathon|beginner/.test(t)) {
    const h = upcoming.filter((e) => e.category === 'Hackathon');
    if (h.length)
      return `Approved hackathons coming up: ${list(h)}. Open to all current students, no prior experience needed. Check the event page for the registration deadline.`;
  }
  if (/week|happening|this month|today|soon/.test(t)) {
    const horizon = /month/.test(t) ? 31 : 8;
    const base = new Date(`${todayISO}T00:00:00`);
    const near = upcoming.filter((e) => (new Date(`${e.date}T00:00:00`) - base) / 86400000 <= horizon);
    if (near.length) return `${/month/.test(t) ? 'This month' : 'In the next few days'}: ${list(near)}.`;
  }
  if (/deadline|closes|closing/.test(t) && upcoming.length)
    return `Registration deadlines: ${upcoming
      .slice(0, 5)
      .map((e) => `${e.title} closes ${e.closes}`)
      .join('; ')}.`;
  if (
    /\b(events?|workshops?|fests?|happening|going on|ongoing|current|latest|available|what's on|whats on|open for registration|things to do)\b/.test(
      t,
    ) &&
    upcoming.length
  )
    return `Here are the events open right now: ${upcoming
      .slice(0, 6)
      .map(
        (e) =>
          `${e.title} (${e.dateLabel}, ${e.time}, ${e.venue}${e.status === 'full' ? ', full' : e.status === 'closing' ? ', closing soon' : ''})`,
      )
      .join('; ')}. Open Explore Events to register.`;
  return null;
};

const INTEREST_CUE =
  /\b(like|love|enjoy|interested|interest|into|passion|passionate|fan of|good at|learn|learning|want to|domain|suggest|recommend|clubs? (for|about|in|on|related)|which clubs?|any clubs?|suits?)\b/;

/**
 * Rule-based answers, used when no model key is set (or the model fails). Only clubs, events and portal questions
 * are answered; anything else gets the refusal.
 */
export function localAssistant(question, ctx = {}) {
  const { clubs = [], role, hasHistory } = ctx;
  const t = question.toLowerCase();
  const talk = smallTalk(question);
  if (talk) return talk;
  if (!isInScope(question, { clubs, hasHistory })) return REFUSAL;

  const asksAboutEvents = /\b(events?|upcoming|hackathons?|workshops?|deadline|closes)\b/.test(t);
  const named = findClubByName(question, clubs);
  if (named && !asksAboutEvents) return describeClub(named);

  if (
    /\b(domains?|categories|category|types|kinds|groups?)\b/.test(t) &&
    /\bclubs?\b/.test(t) &&
    !INTEREST_CUE.test(t.replace(/domains?/g, ''))
  ) {
    const groups = [...new Set(clubs.map((c) => c.category))];
    return `There are ${clubs.length} clubs in ${groups.length} groups: ${groups
      .map((g) => `${g} (${clubs.filter((c) => c.category === g).length})`)
      .join(
        '; ',
      )}. Tell me an interest, for example music, AI, debate or startups, and I will suggest clubs.`;
  }

  const faq = faqMatches(question, role);
  if (faq.length && !INTEREST_CUE.test(t)) return faq.map((f) => f.text).join(' ');

  const ev = eventsAnswer(t, ctx);
  if (ev) return ev;

  const matches = clubsForInterest(question, clubs);
  if (matches.length && (INTEREST_CUE.test(t) || !faq.length)) {
    const lines = matches.map((m) => `${m.club.name} (${m.club.category}): ${m.club.blurb}`);
    return `These clubs fit that interest: ${lines.join(' | ')}`;
  }
  if (faq.length) return faq.map((f) => f.text).join(' ');
  if (/\b(all|list|how many)\b.*\bclubs?\b|\bwhich clubs? (are|do)\b/.test(t))
    return `The directory has ${clubs.length} clubs: ${clubs.map((c) => c.name).join('; ')}.`;
  return ASSISTANT_FALLBACK;
}

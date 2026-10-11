// What the chat assistant knows besides live events: what each club is for, which interests lead to which clubs,
// how the portal works, and which questions are in scope at all. Pure functions, used by the server (to build the
// model's context and to refuse off-topic questions before any model is called) and by the rule-based answers.

export const REFUSAL =
  'I can only help with GENESIS Campus Connect: its clubs, events and how the portal works. Ask me about a club, an event, a deadline or a request.';

/** Per club: what it is for, interest keywords and who it suits. Built from the club directory descriptions. */
export const CLUB_KNOWLEDGE = {
  innovation: {
    topics: [
      'software',
      'coding',
      'developer',
      'web',
      'apps',
      'google',
      'cloud',
      'hackathon',
      'programming',
      'engineering',
    ],
    goodFor: 'students who want to build software and join developer communities and hackathons',
  },
  robotics: {
    topics: [
      'robotics',
      'robots',
      'robot',
      'automation',
      'electronics',
      'hardware',
      'building',
      'competition',
      'competitive',
    ],
    goodFor: 'students who like building and competing with robots',
  },
  coding: {
    topics: [
      'competitive programming',
      'coding',
      'algorithms',
      'problem solving',
      'contests',
      'dsa',
      'programming',
      'codechef',
    ],
    goodFor: 'students who enjoy solving programming problems and taking part in coding contests',
  },
  design: {
    topics: ['art', 'arts', 'fine arts', 'craft', 'drawing', 'painting', 'creative', 'design', 'sketching'],
    goodFor: 'students who enjoy drawing, painting and making creative crafts',
  },
  green: {
    topics: [
      'sustainability',
      'environment',
      'climate',
      'energy',
      'conservation',
      'planet',
      'green',
      'nature',
    ],
    goodFor: 'students who care about the environment and sustainability',
  },
  cultural: {
    topics: ['culture', 'heritage', 'indian culture', 'self development', 'traditions', 'tradition'],
    goodFor: 'students interested in Indian culture, heritage and personal growth',
  },
  'intel-iot': {
    topics: [
      'iot',
      'internet of things',
      'ai',
      'ml',
      'machine learning',
      'intel',
      'embedded',
      'industry',
      'sensors',
    ],
    goodFor: 'students who want hands-on exposure to AI, ML and IoT with official Intel developer tools',
  },
  'the-init': {
    topics: ['tech', 'technology', 'media', 'information', 'first year', 'freshers', 'beginners', 'web'],
    goodFor: 'tech-curious students, especially first-years',
  },
  techknowlogy: {
    topics: ['microsoft', 'azure', 'software', 'projects', 'teamwork', 'tech stack', 'tech', 'technology'],
    goodFor: 'students who like team projects on Microsoft technologies',
  },
  'tensor-ai': {
    topics: [
      'ai',
      'artificial intelligence',
      'deep learning',
      'neural networks',
      'machine learning',
      'ml',
      'data',
      'data science',
    ],
    goodFor: 'students who want to learn deep learning and artificial intelligence',
  },
  'iete-sf': {
    topics: [
      'telecommunications',
      'telecom',
      'communication',
      'electronics',
      'engineering',
      'ece',
      'networks',
      'signals',
      'iete',
    ],
    goodFor: 'electronics and communication students and anyone curious about telecom engineering',
  },
  'supra-baja': {
    topics: [
      'mechanical',
      'racing',
      'vehicles',
      'automobile',
      'cars',
      'off-road',
      'engineering',
      'supra',
      'baja',
      'sae',
      'motorsport',
    ],
    goodFor: 'mechanical-minded students who want to build racing and off-road vehicles',
  },
  astha: {
    topics: ['science', 'physics', 'core sciences', 'research', 'awareness', 'astha', 'technology'],
    goodFor: 'students who love core science and want to share it with others',
  },
  astra: {
    topics: ['astronomy', 'space', 'stars', 'telescope', 'night sky', 'astrophysics', 'planets', 'cosmos'],
    goodFor: 'students fascinated by space, stars and the night sky',
  },
  raagasudha: {
    topics: [
      'music',
      'western music',
      'singing',
      'vocals',
      'instruments',
      'beatboxing',
      'band',
      'guitar',
      'songs',
    ],
    goodFor: 'students who sing, play an instrument or enjoy beatboxing',
  },
  natyasudha: {
    topics: ['dance', 'dancing', 'classical dance', 'contemporary', 'performing', 'choreography'],
    goodFor: 'students who love traditional or contemporary dance',
  },
  anathem: {
    topics: ['performing arts', 'theatre', 'drama', 'acting', 'stage', 'performance', 'skits'],
    goodFor: 'students who enjoy the stage and performing',
  },
  'srishti-tamil-siragu': {
    topics: ['language', 'tamil', 'culture', 'awareness', 'traditions', 'kashi tamil sangamam', 'srishti'],
    goodFor: 'students interested in Tamil language, culture and traditional programs',
  },
  elite: {
    topics: ['entrepreneurship', 'startups', 'startup', 'business', 'ventures', 'simulation', 'founder'],
    goodFor: 'students who want to try real entrepreneurial scenarios and run ventures',
  },
  ace: {
    topics: [
      'startup',
      'startups',
      'business ideas',
      'entrepreneurship',
      'incubation',
      'business',
      'development',
    ],
    goodFor: 'students with a business or startup idea who want support developing it',
  },
  innovac: {
    topics: ['management', 'business school', 'workflows', 'academics', 'business', 'mba', 'goals'],
    goodFor: 'management-minded students who want mentoring from business school faculty',
  },
  yi: {
    topics: [
      'leadership',
      'young professionals',
      'skills',
      'networking',
      'yi',
      'young indians',
      'professional',
    ],
    goodFor: 'students who want to build leadership and professional skills',
  },
  asds: {
    topics: ['debate', 'debating', 'public speaking', 'speaking', 'argument', 'oratory', 'speech'],
    goodFor: 'students who want to debate and speak confidently in public',
  },
  mindscape: {
    topics: [
      'literature',
      'writing',
      'creative thinking',
      'books',
      'poetry',
      'reading',
      'stories',
      'literary',
    ],
    goodFor: 'students who love books, writing and creative thinking',
  },
  'amrita-talkies': {
    topics: ['film', 'films', 'movies', 'media', 'cinema', 'appreciation', 'filmmaking'],
    goodFor: 'students who enjoy films and media',
  },
  photography: {
    topics: ['photography', 'photos', 'camera', 'visual', 'media', 'shutter', 'photographer'],
    goodFor: 'students who like taking photos and covering campus events',
  },
};

/** How the portal works. `roles` limits an entry to the roles it concerns (omitted = everyone). */
export const PORTAL_FAQ = [
  {
    id: 'register',
    title: 'Registering for an event',
    keywords: ['register', 'registration', 'sign up for event', 'book', 'seat', 'seats', 'join event'],
    text: 'Open Explore Events, pick an event and press "Register for this event". Your seat is saved on your account at once. If the event says Fully booked or Closed you cannot register. Cancel on the event page frees your seat.',
  },
  {
    id: 'cancel',
    title: 'Cancelling a registration',
    keywords: ['cancel', 'unregister', 'withdraw'],
    text: 'Open the event page and press Cancel next to "Registration confirmed", or use My Registrations. Your seat becomes available to others.',
  },
  {
    id: 'join-club',
    title: 'Joining a club',
    keywords: ['join', 'membership', 'member', 'enrol', 'enroll', 'become'],
    text: 'Open the Clubs Directory, choose a club and press View club for its profile and contact details. Saving a club with the heart is only a bookmark and does not make you a member. Membership steps come from each club.',
  },
  {
    id: 'favourites',
    title: 'Favourite clubs',
    keywords: ['favourite', 'favorite', 'favourites', 'favorites', 'bookmark', 'save', 'heart'],
    text: 'Press the heart on a club card to save it to My Favorite Clubs. Use the bookmark on an event to save an event. Both are just shortcuts.',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    keywords: ['notification', 'notifications', 'alert', 'alerts', 'bell', 'updates', 'reminder'],
    text: 'Notifications show registration confirmations, deadlines and new events published by clubs. Open Notifications to read them and mark them as read.',
  },
  {
    id: 'calendar',
    title: 'Calendar',
    keywords: ['calendar', 'schedule', 'dates'],
    text: 'Event Calendar shows every published event by day, with the ones you registered for marked.',
  },
  {
    id: 'propose-club',
    title: 'Proposing a new club',
    keywords: ['propose', 'new club', 'start a club', 'create a club', 'club application'],
    text: 'A new club needs a draft constitution, a faculty advisor consent letter and a founding members list of at least 10 students. OSA checks the idea against existing clubs and decides.',
  },
  {
    id: 'event-request',
    title: 'Submitting an event request',
    roles: ['club'],
    keywords: [
      'submit',
      'request',
      'new request',
      'propose event',
      'event request',
      'organise',
      'organize',
      'host',
    ],
    text: 'Club authorities open Event Requests, New request, fill the details, attach the poster and the three required documents (permission letter, proposal and budget, venue form) and press Submit for review. The event must be at least 2 days away and end by 9 PM.',
  },
  {
    id: 'approval',
    title: 'How approval works',
    keywords: [
      'approve',
      'approval',
      'approved',
      'review',
      'process',
      'steps',
      'workflow',
      'publish',
      'published',
      'tracker',
    ],
    text: 'An event goes through these steps: the club submits the request to OSA; OSA does the online review and hard-copy letter check and gives permission; the club then circulates the event on the portal so students can register; once registrations are coming in the club asks the Events Section for a hall, saying how many registered and how important the event is; the Events Section allocates the hall. Students see an event only after it is circulated.',
  },
  {
    id: 'corrections',
    title: 'Corrections and rejection',
    roles: ['club'],
    keywords: ['correction', 'corrections', 'resubmit', 'rejected', 'rejection', 'reject', 'fix', 'feedback'],
    text: 'If corrections are requested, open the request, read the feedback and press Correct & resubmit: the version goes up and the review restarts. A rejection shows the reasons; submit a new request if the plan changes.',
  },
  {
    id: 'documents',
    title: 'Documents for an event request',
    roles: ['club'],
    keywords: ['document', 'documents', 'letter', 'proposal', 'venue form', 'poster', 'upload'],
    text: 'Required: faculty coordinator permission letter, event proposal and budget, signed venue booking form, plus an event poster. Optional: guest or speaker approval and a safety and risk note (recommended for sports and large crowds). The signed permission letter must also be delivered on paper.',
  },
  {
    id: 'hardcopy',
    title: 'Hard-copy letter check',
    roles: ['osa', 'club'],
    keywords: ['hard copy', 'hard-copy', 'paper', 'physical', 'letter', 'reference'],
    text: 'OSA records when the signed permission letter arrived on paper and its reference number. This is separate from the online review and must be verified before permission is given.',
  },
  {
    id: 'osa',
    title: 'Who can approve',
    keywords: ['who approves', 'osa', 'final approval', 'events section', 'authority'],
    text: 'Only OSA (Office of Student Affairs) reviews event requests, gives permission to circulate an event and decides new-club applications. The Events Section only allocates halls: it handles the hall requests clubs send after their event has registrations.',
  },
  {
    id: 'hall-request',
    title: 'Requesting a hall',
    roles: ['club', 'events'],
    keywords: [
      'hall',
      'halls',
      'venue',
      'room',
      'auditorium',
      'priority',
      'allocate',
      'allocation',
      'registrations',
    ],
    text: 'After OSA gives permission and the club circulates the event, students register. The club then opens the event, sees how many registered, and requests a hall: the portal ranks the halls for that number and an AI recommendation can explain the best one. The club also sets a priority (high, medium or low) so the Events Section knows which events matter most. The Events Section allocates the hall, assigns a different one, or sends a reason back so the club can ask again.',
  },
  {
    id: 'start-club',
    title: 'Starting a new club',
    roles: ['student', 'osa'],
    keywords: [
      'start a club',
      'new club',
      'create a club',
      'form a club',
      'club application',
      'propose',
      'apply',
    ],
    text: 'A student can apply to start a new club from Start a club. The portal first checks whether a club or a pending application already covers the same focus area (for example another coding or music club). If one does, the application is not accepted and the student is pointed to that club. A genuinely new idea goes to OSA, who checks the documents and decides.',
  },
  {
    id: 'promotions',
    title: 'Promotion requests',
    roles: ['club', 'events', 'osa'],
    keywords: ['promotion', 'promotions', 'promote', 'publicity', 'signage', 'newsletter', 'poster boards'],
    text: 'Clubs can ask for dashboard features, poster boards, digital signage or newsletter coverage for an event. OSA approves, asks for changes or rejects.',
  },
  {
    id: 'signin',
    title: 'Signing in and out',
    keywords: [
      'sign in',
      'login',
      'log in',
      'sign out',
      'logout',
      'log out',
      'password',
      'account',
      'session',
    ],
    text: 'Choose Student, Club Authority or Administrator on the first screen and sign in with your User ID and password for that role. Use Sign out at the bottom of the sidebar. A sign-in lasts about two hours.',
  },
  {
    id: 'portals',
    title: 'Roles in the portal',
    keywords: [
      'role',
      'roles',
      'portal',
      'portals',
      'student',
      'club authority',
      'administrator',
      'what can i do',
    ],
    text: 'Students explore and register for events and follow clubs. Club authorities submit event requests, circulate approved events, request halls and manage their club profile. OSA reviews and gives permission and decides new clubs; the Events Section allocates halls.',
  },
];

// ---------- tokens and matching ----------
const STOP = new Set(
  'a an and are as at be by can could do does for from get give has have how i if in is it its like me my of on or please should so tell that the their them there these this to us want we what when where which who why will with would you your about any all some more need needs love loves enjoy interested interest interests into also club clubs there good best one learn learning'.split(
    ' ',
  ),
);
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
export const tokens = (s = '') =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);

const aliasesOf = (club) => {
  const name = club.name.toLowerCase();
  const out = new Set([name]);
  const paren = /\(([^)]+)\)/.exec(club.name);
  if (paren) {
    out.add(paren[1].toLowerCase());
    out.add(name.replace(/\s*\([^)]*\)/, '').trim());
  }
  if (club.name.includes('/')) club.name.split('/').forEach((p) => out.add(p.trim().toLowerCase()));
  if (club.name.includes('&')) club.name.split('&').forEach((p) => out.add(p.trim().toLowerCase()));
  if (name.startsWith('the ')) out.add(name.slice(4));
  out.add(name.replace(/ club$/, ''));
  return [...out].filter((a) => a.length >= 2);
};

const hasPhrase = (text, phrase) =>
  new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(text);

/** The club the question names (full name, acronym or short name), if any. */
export function findClubByName(question, clubs) {
  const t = question.toLowerCase();
  let best = null;
  for (const c of clubs) {
    for (const a of aliasesOf(c)) {
      if (hasPhrase(t, a) && (!best || a.length > best.len)) best = { club: c, len: a.length };
    }
  }
  return best?.club ?? null;
}

const knowledgeOf = (club) =>
  CLUB_KNOWLEDGE[club.id] ?? { topics: [club.tag, club.category].filter(Boolean), goodFor: '' };

export function describeClub(club) {
  const k = knowledgeOf(club);
  const events = club.upcoming
    ? ` It has ${club.upcoming} upcoming event${club.upcoming === 1 ? '' : 's'} on the portal.`
    : '';
  return `${club.name} (${club.category}): ${club.blurb}${k.goodFor ? ` It suits ${k.goodFor}.` : ''}${events}`;
}

/** Clubs whose topics match the interests in the question, best first. */
export function clubsForInterest(question, clubs, limit = 5) {
  const q = new Set(tokens(question));
  const phrase = question.toLowerCase();
  if (!q.size) return [];
  return clubs
    .map((c) => {
      const k = knowledgeOf(c);
      let score = 0;
      const hits = new Set();
      for (const topic of k.topics) {
        const tt = tokens(topic);
        if (tt.length > 1 && hasPhrase(phrase, topic)) {
          score += 4;
          hits.add(topic);
        }
        for (const w of tt)
          if (q.has(w)) {
            score += 2;
            hits.add(topic);
          }
      }
      for (const w of tokens(`${c.tag} ${c.category}`)) if (q.has(w)) score += 1;
      for (const w of tokens(`${c.name} ${c.blurb}`)) if (q.has(w)) score += 1;
      return { club: c, score, hits: [...hits].slice(0, 3) };
    })
    .filter((m) => m.score >= 2)
    .sort((a, b) => b.score - a.score || b.club.members - a.club.members)
    .filter((m, _i, all) => m.score >= all[0].score * 0.5) // drop weak matches next to a strong one
    .slice(0, limit);
}

export function faqMatches(question, role, limit = 3) {
  const t = question.toLowerCase();
  const q = new Set(tokens(question));
  return PORTAL_FAQ.filter((f) => !f.roles || !role || f.roles.includes(role))
    .map((f) => {
      let score = 0;
      for (const k of f.keywords) {
        if (hasPhrase(t, k)) score += 3;
        else if (tokens(k).length === 1 && q.has(tokens(k)[0])) score += 1;
      }
      return { faq: f, score };
    })
    .filter((m) => m.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((m) => m.faq);
}

// ---------- scope ----------
const SCOPE_WORDS = new Set(
  'club clubs event events register registration registering portal genesis campus connect approve approval approved request requests publish published deadline deadlines seat seats calendar notification notifications favourite favorite student students osa admin administrator domain domains interest join member members poster venue promotion promotions application applications sign login logout workshop hackathon fest festival talk talks sports cultural technical department society societies amrita upcoming schedule ticket tickets assistant help happening week weekend tomorrow month'.split(
    ' ',
  ),
);
const SCOPE_STEMS = new Set([...SCOPE_WORDS].map(stem));
const GREETING =
  /^(hi|hello|hey|hii|hola|good (morning|afternoon|evening)|thanks|thank you|thx|ok|okay|bye|goodbye)\b/;
// Task requests that are not about the portal, even when a club word sneaks in ("solve this coding question").
const OFF_TASK =
  /\b(solve|calculate|compute|simplify|integrate|differentiate|derivative|equation|theorem|translate|essay|homework|assignment|write (me )?(a|an|the|some)|write code|code (for|to)|program (to|for)|debug|fix (my|this) code|poem|story|joke|recipe|weather|stock price|bitcoin|capital of|who (is|was) the (president|prime)|what is \d|\d+\s*[-+*/x^=]\s*\d+|leetcode|sql query|python|javascript|java |c\+\+|algorithm for|explain (quantum|relativity|photosynthesis)|meaning of life)\b/;

/** True when the message is about clubs, events or the portal (or a greeting). Off-topic tasks are refused. */
export function isInScope(question, { clubs = [], hasHistory = false } = {}) {
  const t = question.toLowerCase().trim();
  if (!t) return false;
  const named = findClubByName(t, clubs);
  const portalWord =
    tokens(t).some((w) => SCOPE_STEMS.has(w)) || /\b(clubs?|events?|portal|genesis)\b/.test(t);
  if (OFF_TASK.test(t) && !named && !portalWord) return false;
  if (
    OFF_TASK.test(t) &&
    /\b(solve|calculate|compute|translate|essay|homework|assignment|debug|poem|story|joke|recipe|leetcode)\b/.test(
      t,
    )
  )
    return false;
  if (GREETING.test(t)) return true;
  if (named || portalWord) return true;
  if (clubsForInterest(t, clubs, 1).length) return true;
  if (faqMatches(t).length) return true;
  return hasHistory && t.split(/\s+/).length <= 6; // short follow-up such as "tell me more"
}

export function smallTalk(question) {
  const t = question.toLowerCase().trim();
  if (/^(hi|hello|hey|hii|hola|good (morning|afternoon|evening))\b/.test(t))
    return 'Hello! I am the GENESIS assistant. Ask me what a club is about, which clubs match your interests, upcoming events, or how the portal works.';
  if (/\b(thanks|thank you|thx)\b/.test(t)) return 'You are welcome! Anything else about clubs or events?';
  if (/^(bye|goodbye)\b/.test(t)) return 'Goodbye! Come back any time you need help with clubs or events.';
  if (/who are you|what can you do|^help\b|what do you do/.test(t))
    return 'I am the GENESIS Campus Connect assistant. I can explain what each club is for, suggest clubs for your interests, tell you about upcoming events and deadlines, and explain how registration and approvals work.';
  return null;
}

/** The context pieces handed to a model (or searched by rules): clubs, interest groups, process notes. */
export function knowledgeChunks(clubs, role) {
  const out = clubs.map((c) => {
    const k = knowledgeOf(c);
    return {
      title: `Club: ${c.name}`,
      text: `${c.name} is in the group "${c.category}". ${c.blurb} Interests: ${k.topics.join(', ')}. ${k.goodFor ? `Suits ${k.goodFor}.` : ''} ${c.members} members, ${c.upcoming} upcoming events.`,
    };
  });
  const groups = [...new Set(clubs.map((c) => c.category))];
  for (const g of groups) {
    out.push({
      title: `Club group: ${g}`,
      text: `Clubs in ${g}: ${clubs
        .filter((c) => c.category === g)
        .map((c) => c.name)
        .join('; ')}.`,
    });
  }
  const topics = new Map();
  for (const c of clubs)
    for (const t of knowledgeOf(c).topics) topics.set(t, [...(topics.get(t) ?? []), c.name]);
  for (const [t, names] of topics)
    out.push({
      title: `Interest: ${t}`,
      text: `If you like ${t}, look at: ${[...new Set(names)].join('; ')}.`,
    });
  for (const f of PORTAL_FAQ)
    if (!f.roles || !role || f.roles.includes(role)) out.push({ title: f.title, text: f.text });
  return out;
}

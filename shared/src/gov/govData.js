// Static reference data for the governance side of the portal
// (venues, document checklists, club profiles, generated member rosters).

export const REQUEST_CATEGORIES = [
  'Hackathon',
  'Workshop',
  'Technical',
  'Cultural',
  'Sports',
  'Social Impact',
];

export const VENUES = [
  {
    name: 'Main Auditorium',
    capacity: 600,
    kind: 'auditorium',
    location: 'Admin Block',
    facilities: ['Stage', 'PA system', 'Projector', 'Air conditioning'],
  },
  {
    name: 'Innovation Lab',
    capacity: 60,
    kind: 'lab',
    location: 'Tech Park, 3rd floor',
    facilities: ['Workstations', 'Wi-Fi', 'Whiteboards', 'Projector'],
  },
  {
    name: 'North Lab · Room 204',
    capacity: 70,
    kind: 'lab',
    location: 'North Block',
    facilities: ['Workstations', 'Wi-Fi', 'Projector'],
  },
  {
    name: 'West Sports Hall',
    capacity: 120,
    kind: 'sports',
    location: 'West Block',
    facilities: ['Indoor court', 'Spectator seating', 'Scoreboard'],
  },
  {
    name: 'The Courtyard',
    capacity: 300,
    kind: 'open',
    location: 'Central Campus',
    facilities: ['Open air', 'Stage area', 'Power points'],
  },
  {
    name: 'Seminar Room 3',
    capacity: 45,
    kind: 'seminar',
    location: 'Academic Block 1',
    facilities: ['Projector', 'Air conditioning', 'Whiteboard'],
  },
  {
    name: 'Central Library Hall',
    capacity: 150,
    kind: 'hall',
    location: 'Central Library',
    facilities: ['Projector', 'Air conditioning', 'Quiet space'],
  },
  {
    name: 'University Amphitheatre',
    capacity: 800,
    kind: 'amphitheatre',
    location: 'Main Lawn',
    facilities: ['Stage', 'Tiered seating', 'PA system'],
  },
];

export const AUDIENCES = [
  'All current students',
  'First-year students',
  'Final-year students',
  'Club members only',
  'Faculty teams',
  'Open to guests',
];

/** Documents a club must attach to an event request. */
export const REQUEST_DOCS = [
  {
    key: 'permission_letter',
    label: 'Faculty coordinator permission letter',
    required: true,
    hardCopy: true,
    hint: 'The signed original must also be delivered to OSA as a hard copy.',
  },
  { key: 'proposal', label: 'Event proposal & budget', required: true, hint: 'PDF, one to three pages.' },
  { key: 'venue_form', label: 'Venue booking form', required: true, hint: 'Signed by the venue custodian.' },
  {
    key: 'speaker_approval',
    label: 'Guest / speaker approval',
    required: false,
    hint: 'Only if external guests are invited.',
  },
  {
    key: 'risk_note',
    label: 'Safety & risk note',
    required: false,
    hint: 'Recommended for sports and large-crowd events.',
  },
];

export const CLUB_APP_DOCS = [
  { key: 'constitution', label: 'Draft club constitution', required: true },
  { key: 'advisor_letter', label: 'Faculty advisor consent letter', required: true },
  { key: 'members_list', label: 'Founding members list (minimum 10)', required: true },
];

export const PROMO_CHANNELS = [
  { key: 'dashboard', label: 'Student dashboard feature', hint: 'Highlighted placement for students.' },
  { key: 'poster_boards', label: 'Campus poster boards', hint: 'Printed A2 posters at notice boards.' },
  { key: 'signage', label: 'Digital signage', hint: 'Screens in the library and canteen.' },
  { key: 'newsletter', label: 'Newsletter & social media', hint: 'Weekly digest and official handles.' },
];

export const CATEGORY_TONE = {
  Hackathon: 'emerald',
  Workshop: 'olive',
  'Social Impact': 'green',
  Technical: 'teal',
  Sports: 'rust',
  Cultural: 'plum',
};

/* ------------------------------------------------------------------ */
/* Club profiles (admin-visible detail)                                */
/* ------------------------------------------------------------------ */
export const CLUB_PROFILES = {
  innovation: {
    founded: 2019,
    tagline: 'Ideas that ship.',
    objectives: [
      'Run flagship hackathons and idea sprints for all departments.',
      'Connect student teams with industry and faculty mentors.',
      'Help prototypes grow into real campus services.',
    ],
    authorities: [
      { role: 'President', name: 'Ananya Rao', email: 'ananya.rao@genesis.edu' },
      { role: 'Vice President', name: 'Vikram Shah', email: 'vikram.shah@genesis.edu' },
      { role: 'Secretary', name: 'Neha Pillai', email: 'neha.pillai@genesis.edu' },
      { role: 'Faculty Advisor', name: 'Dr. Suresh Iyer', email: 'suresh.iyer@genesis.edu' },
    ],
    contactEmail: 'innovation@genesis.edu',
    meeting: 'Thursdays · 5:30 PM',
    location: 'Innovation Lab',
    social: '@genesis.innovation',
  },
  robotics: {
    founded: 2017,
    tagline: 'Build. Break. Rebuild.',
    objectives: [
      'Teach embedded systems, control and robotics fundamentals.',
      'Prepare teams for national robotics competitions.',
      'Maintain the shared robotics workshop and tooling.',
    ],
    authorities: [
      { role: 'President', name: 'Karthik Menon', email: 'karthik.menon@genesis.edu' },
      { role: 'Vice President', name: 'Aditi Verma', email: 'aditi.verma@genesis.edu' },
      { role: 'Technical Lead', name: 'Sahil Khanna', email: 'sahil.khanna@genesis.edu' },
      { role: 'Faculty Advisor', name: 'Dr. Lakshmi Narayan', email: 'lakshmi.narayan@genesis.edu' },
    ],
    contactEmail: 'robotics@genesis.edu',
    meeting: 'Tuesdays · 6:00 PM',
    location: 'North Lab · Room 204',
    social: '@genesis.robotics',
  },
  coding: {
    founded: 2018,
    tagline: 'Learn in public, ship together.',
    objectives: [
      'Host weekly open-source and peer-learning sessions.',
      'Maintain open campus tools built by students.',
      'Run beginner-friendly coding programmes every semester.',
    ],
    authorities: [
      { role: 'President', name: 'Ishaan Gupta', email: 'ishaan.gupta@genesis.edu' },
      { role: 'Secretary', name: 'Meera Joshi', email: 'meera.joshi@genesis.edu' },
      { role: 'Faculty Advisor', name: 'Prof. Anil Kapoor', email: 'anil.kapoor@genesis.edu' },
    ],
    contactEmail: 'code@genesis.edu',
    meeting: 'Saturdays · 11:00 AM',
    location: 'North Lab · Room 204',
    social: '@campuscode',
  },
  design: {
    founded: 2020,
    tagline: 'Make it feel right.',
    objectives: [
      'Teach design thinking, prototyping and visual craft.',
      'Design posters and identity for campus events on request.',
      'Host portfolio reviews with industry designers.',
    ],
    authorities: [
      { role: 'President', name: 'Tara Bhat', email: 'tara.bhat@genesis.edu' },
      { role: 'Creative Director', name: 'Dev Malhotra', email: 'dev.malhotra@genesis.edu' },
      { role: 'Faculty Advisor', name: 'Prof. Sunita Rao', email: 'sunita.rao@genesis.edu' },
    ],
    contactEmail: 'design@genesis.edu',
    meeting: 'Wednesdays · 4:00 PM',
    location: 'Innovation Lab',
    social: '@designcircle.genesis',
  },
  green: {
    founded: 2016,
    tagline: 'Small habits, big campus.',
    objectives: [
      'Reduce waste and energy use across campus.',
      'Organise volunteer drives and awareness weeks.',
      'Partner with the administration on sustainability audits.',
    ],
    authorities: [
      { role: 'President', name: 'Farhan Ali', email: 'farhan.ali@genesis.edu' },
      { role: 'Treasurer', name: 'Pooja Nambiar', email: 'pooja.nambiar@genesis.edu' },
      { role: 'Faculty Advisor', name: 'Dr. Rekha Menon', email: 'rekha.menon@genesis.edu' },
    ],
    contactEmail: 'green@genesis.edu',
    meeting: 'Fridays · 3:30 PM',
    location: 'East Gate Pavilion',
    social: '@greencampus.genesis',
  },
  cultural: {
    founded: 2015,
    tagline: 'Many voices, one stage.',
    objectives: [
      'Celebrate regional and international cultures on campus.',
      'Stage festivals, performances and language evenings.',
      'Give every student a platform to perform.',
    ],
    authorities: [
      { role: 'President', name: 'Simran Kaur', email: 'simran.kaur@genesis.edu' },
      { role: 'Cultural Secretary', name: 'Arjun Nair', email: 'arjun.nair@genesis.edu' },
      { role: 'Faculty Advisor', name: 'Prof. Geeta Sharma', email: 'geeta.sharma@genesis.edu' },
    ],
    contactEmail: 'culture@genesis.edu',
    meeting: 'Mondays · 5:00 PM',
    location: 'The Courtyard',
    social: '@cultural.exchange',
  },
};

export const DEFAULT_PROFILE = {
  founded: 2026,
  tagline: '',
  objectives: [],
  authorities: [],
  contactEmail: '',
  meeting: 'To be announced',
  location: 'To be announced',
  social: '',
};

/* ------------------------------------------------------------------ */
/* Deterministic member roster generator                               */
/* ------------------------------------------------------------------ */
const FIRST = [
  'Aarav',
  'Diya',
  'Rohan',
  'Isha',
  'Kabir',
  'Anika',
  'Vivaan',
  'Saanvi',
  'Aditya',
  'Myra',
  'Arnav',
  'Kiara',
  'Reyansh',
  'Navya',
  'Dhruv',
  'Riya',
  'Yash',
  'Tanvi',
  'Siddharth',
  'Pari',
  'Harsh',
  'Ira',
  'Manav',
  'Zoya',
  'Nikhil',
  'Sneha',
  'Varun',
  'Mahika',
  'Pranav',
  'Lavanya',
  'Om',
  'Charvi',
  'Rudra',
  'Avni',
  'Tanmay',
  'Bhavya',
];
const LAST = [
  'Sharma',
  'Patel',
  'Reddy',
  'Iyer',
  'Nair',
  'Singh',
  'Das',
  'Mehta',
  'Kulkarni',
  'Banerjee',
  'Chopra',
  'Desai',
  'Joshi',
  'Menon',
  'Pillai',
  'Rao',
  'Saxena',
  'Thakur',
  'Verma',
  'Bose',
  'Gill',
  'Hegde',
  'Jain',
  'Khan',
  'Malik',
];
const DEPTS = ['CSE', 'ECE', 'ME', 'CE', 'EEE', 'IT', 'Design', 'MBA'];

const rosterCache = new Map();

/** Build a stable roster for a club: authorities first, then a generated list. */
export function buildRoster(clubId, total, authorities = []) {
  const key = `${clubId}:${total}:${authorities.length}`;
  if (rosterCache.has(key)) return rosterCache.get(key);
  const seed = [...clubId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const list = [];
  authorities
    .filter((a) => !/advisor/i.test(a.role))
    .forEach((a, i) => {
      list.push({
        id: `${clubId}-auth-${i}`,
        name: a.name,
        rollNo: `STU25${String(100 + i + (seed % 50)).padStart(3, '0')}`,
        dept: DEPTS[(seed + i) % DEPTS.length],
        year: 3 + (i % 2),
        role: a.role,
        joined: '2025-08-01',
        email: a.email,
      });
    });
  for (let i = list.length; i < total; i++) {
    const f = FIRST[(seed * 7 + i * 5) % FIRST.length];
    const l = LAST[(seed * 3 + i * 11) % LAST.length];
    const year = 1 + ((seed + i) % 4);
    const month = 8 + ((seed + i) % 5);
    list.push({
      id: `${clubId}-m-${i}`,
      name: `${f} ${l}`,
      rollNo: `STU${25 - year + 1}${String(200 + ((i * 37 + seed) % 700)).padStart(3, '0')}`,
      dept: DEPTS[(seed + i * 3) % DEPTS.length],
      year,
      role: i < 8 ? 'Core team' : 'Member',
      joined: `2025-${String(month > 12 ? month - 12 : month).padStart(2, '0')}-${String(1 + ((i * 3) % 27)).padStart(2, '0')}`,
      email: `${f}.${l}@genesis.edu`.toLowerCase(),
    });
  }
  rosterCache.set(key, list);
  return list;
}

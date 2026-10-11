import { DEMO_STUDENT_STATE, EMPTY_PREFS, registrationNotice, selectors } from '@gcc/shared/gov';
import { toDb } from '../../db/helpers.js';
import { clock } from '../../lib/clock.js';
import { errors } from '../../lib/errors.js';
import { loadState, lockState } from './state.js';
import { registrationCounts } from './gov.service.js';
import { closedClubs, membershipsOf } from './clubspace.service.js';

const DEMO_TODAY = '2026-10-10';
const blank = () => ({ favorites: [], bookmarks: [], notifications: [], prefs: EMPTY_PREFS, history: [] });

async function readDoc(db, userId) {
  const row = await db('gov_user_state').where({ user_id: userId }).first();
  return row ? { ...blank(), ...JSON.parse(row.data) } : null;
}

async function writeDoc(db, userId, doc) {
  const now = toDb(clock.now());
  await db('gov_user_state')
    .insert({ user_id: userId, data: JSON.stringify(doc), updated_at: now })
    .onConflict('user_id')
    .merge();
}

/** Seeded demo student keeps the sample data the original UI showed; everyone else starts empty. */
export async function seedDemoStudent(db, userId) {
  const { registrations, ...doc } = DEMO_STUDENT_STATE;
  await writeDoc(db, userId, doc);
  // the demo student has already joined the Innovation club, whose space starts with a welcome announcement
  const at = toDb(clock.now());
  await db('gov_club_members')
    .insert({ club_id: 'innovation', user_id: userId, joined_at: at })
    .onConflict(['club_id', 'user_id'])
    .ignore();
  await db('gov_club_posts')
    .insert({
      id: 'seed-welcome-innovation',
      club_id: 'innovation',
      user_id: null,
      author_name: 'Innovation club authority',
      author_role: 'authority',
      kind: 'announcement',
      event_id: null,
      body: 'Welcome to the club space. Announcements about our events appear here, and you can discuss plans with other members instead of in WhatsApp.',
      created_at: at,
    })
    .onConflict('id')
    .ignore();
  for (const r of registrations) {
    await db('gov_registrations')
      .insert({
        event_id: r.eventId,
        user_id: userId,
        ref: r.ref,
        status: 'confirmed',
        registered_on: r.registeredOn,
        created_at: toDb(clock.now()),
      })
      .onConflict(['event_id', 'user_id'])
      .ignore();
  }
}

async function registrationsOf(db, userId) {
  const rows = await db('gov_registrations')
    .where({ user_id: userId, status: 'confirmed' })
    .orderBy('created_at', 'desc');
  return rows.map((r) => ({
    eventId: r.event_id,
    ref: r.ref,
    status: 'confirmed',
    registeredOn: r.registered_on,
  }));
}

/** Everything the student screens need, with portal-wide notices (published events) merged into notifications. */
export async function getStudent(db, user) {
  let doc = (await readDoc(db, user.id)) ?? blank();
  const notices = await db('gov_docs').where({ collection: 'broadcasts' }).orderBy('ord').select('data');
  const known = new Set(doc.notifications.map((n) => n.id));
  const fresh = notices.map((r) => JSON.parse(r.data)).filter((b) => !known.has(b.id));
  if (fresh.length) {
    doc = { ...doc, notifications: [...fresh, ...doc.notifications] };
    await writeDoc(db, user.id, doc);
  }
  return {
    ...doc,
    registrations: await registrationsOf(db, user.id),
    memberships: await membershipsOf(db, user),
    closedClubs: await closedClubs(db),
  };
}

async function mutateDoc(db, user, fn) {
  const doc = (await readDoc(db, user.id)) ?? blank();
  const next = fn(doc);
  await writeDoc(db, user.id, next);
  return next;
}

// ---------- Registration ----------

export async function register(db, user, eventId) {
  return db.transaction(async (trx) => {
    await lockState(trx);
    const state = { ...(await loadState(trx)), registrationCounts: await registrationCounts(trx) };
    const ev = selectors.publishedEvents(state).find((e) => e.id === eventId);
    if (!ev) throw errors.notFound('That event is not open to students.');
    const mine = await trx('gov_registrations').where({ event_id: eventId, user_id: user.id }).first();
    if (mine?.status === 'confirmed') return { ...(await getStudent(trx, user)), event: ev };
    if (ev.status === 'closed') throw errors.invalidState('Registration for this event is closed.');
    if (ev.status === 'full') throw errors.invalidState('This event is fully booked.');
    const now = clock.now();
    if (mine) {
      await trx('gov_registrations')
        .where({ event_id: eventId, user_id: user.id })
        .update({ status: 'confirmed', registered_on: DEMO_TODAY });
    } else {
      await trx('gov_registrations').insert({
        event_id: eventId,
        user_id: user.id,
        ref: ev.ref,
        status: 'confirmed',
        registered_on: DEMO_TODAY,
        created_at: toDb(now),
      });
    }
    await mutateDoc(trx, user, (doc) => ({
      ...doc,
      notifications: [
        {
          id: `n-reg-${eventId}-${now.getTime()}`,
          type: 'registration',
          label: 'Registration',
          time: 'Just now',
          ...registrationNotice({
            title: ev.title,
            category: ev.category,
            when: `${ev.dateLabel}, ${ev.time}`,
            venue: ev.venue,
            seed: eventId,
          }),
          eventId,
          unread: true,
          kind: 'event',
        },
        ...doc.notifications,
      ],
    }));
    return { ...(await getStudent(trx, user)), event: ev };
  });
}

export async function cancelRegistration(db, user, eventId) {
  await db('gov_registrations')
    .where({ event_id: eventId, user_id: user.id })
    .update({ status: 'cancelled' });
  return getStudent(db, user);
}

// ---------- Favourites, bookmarks, notifications, preferences ----------

const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
const idOk = (v) => typeof v === 'string' && /^[\w.:-]{1,64}$/.test(v);

export async function toggleFavorite(db, user, clubId) {
  if (!idOk(clubId)) throw errors.validation('Choose a club.');
  await mutateDoc(db, user, (d) => ({ ...d, favorites: toggle(d.favorites, clubId) }));
  return getStudent(db, user);
}

export async function toggleBookmark(db, user, eventId) {
  if (!idOk(eventId)) throw errors.validation('Choose an event.');
  await mutateDoc(db, user, (d) => ({ ...d, bookmarks: toggle(d.bookmarks, eventId) }));
  return getStudent(db, user);
}

export async function markRead(db, user, { id, all }) {
  await mutateDoc(db, user, (d) => ({
    ...d,
    notifications: d.notifications.map((n) => (all || n.id === id ? { ...n, unread: false } : n)),
  }));
  return getStudent(db, user);
}

export async function savePrefs(db, user, prefs) {
  const clean = {
    inApp: !!prefs.inApp,
    email: !!prefs.email,
    deadlines: !!prefs.deadlines,
    news: !!prefs.news,
    interests: (Array.isArray(prefs.interests) ? prefs.interests : [])
      .filter((i) => typeof i === 'string')
      .map((i) => i.slice(0, 40))
      .slice(0, 20),
  };
  await mutateDoc(db, user, (d) => ({ ...d, prefs: clean }));
  return getStudent(db, user);
}

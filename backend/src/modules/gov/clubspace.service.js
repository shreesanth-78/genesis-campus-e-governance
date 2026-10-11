import { randomUUID } from 'node:crypto';
import { selectors } from '@gcc/shared/gov';
import { toDb } from '../../db/helpers.js';
import { clock } from '../../lib/clock.js';
import { errors } from '../../lib/errors.js';
import { loadState } from './state.js';

// Club Space: a private board per club. Students who joined the club read and write in it; the club's authority also
// posts announcements. It replaces the WhatsApp group: everything about the club's events stays in one place.

const MAX_BODY = 1000;
const LIMIT_PER_MINUTE = 12;
const recent = new Map();

/** Posting too fast is refused (a simple per-account limit; the whole board is small). */
function checkRate(userId) {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((t) => t > now - 60_000);
  if (list.length >= LIMIT_PER_MINUTE)
    throw errors.rateLimited('You are posting too quickly. Please wait a moment.');
  list.push(now);
  recent.set(userId, list);
}
export const _resetPostLimit = () => recent.clear();

const clubOf = async (db, clubId) => {
  const club = selectors.allClubs(await loadState(db)).find((c) => c.id === clubId);
  if (!club) throw errors.notFound('That club does not exist.');
  return club;
};

/** Control characters out, line breaks kept, length bounded. The screen shows it as plain text, never as markup. */
const cleanBody = (text) =>
  String(text ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n/g, '\n')
    .trim();

// ---------- Joining ----------

export async function membershipsOf(db, user) {
  const rows = await db('gov_club_members').where({ user_id: user.id }).orderBy('joined_at');
  return rows.map((r) => r.club_id);
}

export async function join(db, user, clubId) {
  await clubOf(db, clubId);
  await db('gov_club_members')
    .insert({ club_id: clubId, user_id: user.id, joined_at: toDb(clock.now()) })
    .onConflict(['club_id', 'user_id'])
    .ignore();
  return membershipsOf(db, user);
}

export async function leave(db, user, clubId) {
  await db('gov_club_members').where({ club_id: clubId, user_id: user.id }).del();
  return membershipsOf(db, user);
}

/** The club a person may open the board of: students need to have joined it, the authority only their own club. */
async function access(db, { portal, actor, user }, clubId) {
  const club = await clubOf(db, clubId);
  if (portal === 'club') {
    if (actor.clubId !== clubId) throw errors.forbidden('This is another club’s space.');
    return { club, authority: true };
  }
  if (portal === 'student') {
    const member = await db('gov_club_members').where({ club_id: clubId, user_id: user.id }).first();
    if (!member) throw errors.forbidden('Join this club to see its space.');
    return { club, authority: false };
  }
  throw errors.forbidden('Your role does not use club spaces.');
}

const shape = (r, viewerId, authority) => ({
  id: r.id,
  kind: r.kind,
  body: r.body,
  eventId: r.event_id,
  authorName: r.author_name,
  authorRole: r.author_role,
  createdAt: r.created_at,
  mine: Boolean(r.user_id) && r.user_id === viewerId,
  canDelete: authority || (Boolean(r.user_id) && r.user_id === viewerId),
});

// ---------- The board ----------

export async function space(db, ctx, clubId) {
  const { club, authority } = await access(db, ctx, clubId);
  const rows = await db('gov_club_posts').where({ club_id: clubId }).orderBy('created_at', 'desc').limit(150);
  const [{ n }] = await db('gov_club_members').where({ club_id: clubId }).count({ n: '*' });
  const state = await loadState(db);
  // The events a post can be about: the club's own events, as far as this person is allowed to know them.
  const events = state.requests
    .filter(
      (r) =>
        r.clubId === clubId &&
        (authority ? r.status !== 'draft' : ['published', 'completed'].includes(r.status)),
    )
    .map((r) => ({ id: r.id, title: r.title, date: r.date }));
  return {
    club: { id: club.id, name: club.name },
    canAnnounce: authority,
    memberCount: Number(n),
    events,
    posts: rows.reverse().map((r) => shape(r, ctx.user.id, authority)),
  };
}

export async function post(db, ctx, clubId, { kind, body, eventId }) {
  const { club, authority } = await access(db, ctx, clubId);
  const text = cleanBody(body);
  if (!text) throw errors.validation('Write something first.');
  if (text.length > MAX_BODY) throw errors.validation(`Keep a post under ${MAX_BODY} characters.`);
  if (kind === 'announcement' && !authority)
    throw errors.forbidden('Only the club authority posts announcements.');
  if (eventId) {
    const state = await loadState(db);
    const known = state.requests.some((r) => r.id === eventId && r.clubId === clubId && r.status !== 'draft');
    if (!known) throw errors.validation('Choose one of this club’s events.');
  }
  checkRate(ctx.user.id);
  const row = {
    id: randomUUID(),
    club_id: club.id,
    user_id: ctx.user.id,
    author_name: authority ? `${club.name} authority` : ctx.user.full_name,
    author_role: authority ? 'authority' : 'member',
    kind,
    event_id: eventId || null,
    body: text,
    created_at: toDb(clock.now()),
  };
  await db('gov_club_posts').insert(row);
  return shape(row, ctx.user.id, authority);
}

export async function removePost(db, ctx, clubId, postId) {
  const { authority } = await access(db, ctx, clubId);
  const row = await db('gov_club_posts').where({ id: postId, club_id: clubId }).first();
  if (!row) throw errors.notFound('That post does not exist.');
  if (!authority && row.user_id !== ctx.user.id)
    throw errors.forbidden('You can only delete your own posts.');
  await db('gov_club_posts').where({ id: postId }).del();
}

// ---------- Members (club authority) ----------

export async function members(db, ctx, clubId) {
  const { authority } = await access(db, ctx, clubId);
  if (!authority) throw errors.forbidden('Only the club authority sees the member list.');
  const rows = await db('gov_club_members')
    .join('users', 'users.id', 'gov_club_members.user_id')
    .where('gov_club_members.club_id', clubId)
    .orderBy('gov_club_members.joined_at')
    .select(
      'users.id as id',
      'users.full_name as name',
      'users.username as username',
      'gov_club_members.joined_at as joinedAt',
    );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    userId: String(r.username).toUpperCase(),
    joinedAt: r.joinedAt,
  }));
}

export async function removeMember(db, ctx, clubId, userId) {
  const { authority } = await access(db, ctx, clubId);
  if (!authority) throw errors.forbidden('Only the club authority removes members.');
  await db('gov_club_members').where({ club_id: clubId, user_id: userId }).del();
}

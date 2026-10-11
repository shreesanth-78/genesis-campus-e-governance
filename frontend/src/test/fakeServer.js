// An in-memory stand-in for the portal API, used by the screen tests so they run offline. It runs the real shared
// workflow engine and the real per-portal views, so a screen test exercises the same rules the server enforces.
import {
  DEMO_STUDENT_STATE,
  DEMO_USERS,
  createSeedState,
  selectors,
  viewFor,
  workflow,
} from '@gcc/shared/gov';

const json = (data, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => (status < 400 ? { data } : { error: data }),
});
const fail = (status, code, message) => json({ code, message }, status);

export function createFakeServer() {
  let state = createSeedState();
  let current = null;
  const students = {};
  const regs = {};
  const sessions = new Map(); // token -> { user, portal }
  const joined = {}; // student user id -> club ids
  let posts = []; // club space posts
  let seq = 0;
  const clubsOf = (id) => (joined[id] ??= ['innovation']);
  const cfg = {}; // club id -> { membersCanPost, joinOpen }
  const settingsOf = (id) => (cfg[id] ??= { membersCanPost: true, joinOpen: true });

  const portalOf = (u) => (u.role === 'admin' ? u.adminType : u.role);
  const actorOf = ({ password: _p, ...u }) => ({ ...u, id: u.userId });
  const studentOf = (id) => (students[id] ??= structuredClone(DEMO_STUDENT_STATE));
  const counts = () => {
    const c = {};
    Object.values(regs).forEach((list) =>
      list.forEach((e) => {
        c[e] = (c[e] || 0) + 1;
      }),
    );
    return c;
  };
  const view = (portal, actor) =>
    viewFor({ ...state, registrationCounts: counts() }, portal, { clubId: actor.clubId, userId: actor.id });

  async function handle(url, init = {}) {
    const method = init.method ?? 'GET';
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0];
    const headers = init.headers ?? {};
    const body = init.body ? JSON.parse(init.body) : {};
    if (path === '/auth/login') {
      const u = DEMO_USERS.find(
        (d) =>
          d.userId.toLowerCase() === body.identifier.toLowerCase() &&
          d.password === body.password &&
          portalOf(d) === body.portal,
      );
      if (!u) return fail(401, 'UNAUTHENTICATED', 'Invalid User ID or password for the selected role.');
      const token = `tok-${u.userId}`;
      sessions.set(token, { user: u, portal: portalOf(u) });
      current = token;
      return json({ accessToken: token, user: { id: u.userId } });
    }
    if (path === '/auth/refresh')
      return current
        ? json({ accessToken: current })
        : fail(401, 'UNAUTHENTICATED', 'Please log in to continue.');
    if (path === '/auth/logout') {
      current = null;
      return json({ loggedOut: true });
    }
    const token = (headers.Authorization ?? '').replace('Bearer ', '');
    const session = sessions.get(token);
    if (!session) return fail(401, 'UNAUTHENTICATED', 'Please log in to continue.');
    const actor = actorOf(session.user);
    if (path === '/gov/me') return json({ user: { ...actor, id: actor.userId } });
    if (path === '/gov/state') return json(view(session.portal, actor));
    if (path.startsWith('/gov/actions/')) {
      const name = path.split('/').pop();
      const args = [...body.args];
      // like the server, the registered count comes from the registrations, not from the browser
      if (name === 'requestHall')
        args[1] = { ...args[1], registered: counts()[`evt-${String(args[0]).toLowerCase()}`] ?? 0 };
      const res = workflow[name](state, actor, ...args);
      if (res.ok) state = res.state;
      const { ok, error, state: _s, ...extra } = res;
      return json({ ok, error: ok ? undefined : error, extra, state: view(session.portal, actor) });
    }
    // ---- club space ----
    const settingsMatch = path.match(/^\/gov\/clubs\/([^/]+)\/settings$/);
    if (settingsMatch && method === 'PUT') {
      if (!(session.portal === 'club' && actor.clubId === settingsMatch[1]))
        return fail(403, 'FORBIDDEN', 'Only the club authority changes these settings.');
      Object.assign(settingsOf(settingsMatch[1]), body);
      return json(settingsOf(settingsMatch[1]));
    }
    const spaceMatch = path.match(/^\/gov\/clubs\/([^/]+)\/(space|posts)(?:\/([^/]+))?$/);
    if (spaceMatch) {
      const [, clubId, part, postId] = spaceMatch;
      const isAuthority = session.portal === 'club' && actor.clubId === clubId;
      const isMember = session.portal === 'student' && clubsOf(actor.userId).includes(clubId);
      if (!isAuthority && !isMember) return fail(403, 'FORBIDDEN', 'Join this club to see its space.');
      const club = selectors.allClubs(state).find((c) => c.id === clubId);
      if (part === 'space') {
        const events = state.requests
          .filter(
            (r) =>
              r.clubId === clubId &&
              (isAuthority ? r.status !== 'draft' : ['published', 'completed'].includes(r.status)),
          )
          .map((r) => ({ id: r.id, title: r.title, date: r.date }));
        return json({
          club: { id: clubId, name: club.name },
          canAnnounce: isAuthority,
          settings: settingsOf(clubId),
          memberCount: Object.values(joined).filter((l) => l.includes(clubId)).length,
          events,
          posts: posts
            .filter((p) => p.clubId === clubId)
            .map((p) => ({
              ...p,
              mine: p.userId === actor.userId,
              canDelete: isAuthority || p.userId === actor.userId,
            })),
        });
      }
      if (method === 'POST') {
        if (body.kind === 'announcement' && !isAuthority)
          return fail(403, 'FORBIDDEN', 'Only the club authority posts announcements.');
        if (!isAuthority && !settingsOf(clubId).membersCanPost)
          return fail(403, 'FORBIDDEN', 'Only the club authority can post in this space right now.');
        if (!String(body.body ?? '').trim()) return fail(400, 'VALIDATION', 'Write something first.');
        const p = {
          id: `p${++seq}`,
          clubId,
          userId: actor.userId,
          kind: body.kind,
          body: body.body.trim(),
          eventId: body.eventId || null,
          authorName: isAuthority ? `${club.name} authority` : actor.name,
          authorRole: isAuthority ? 'authority' : 'member',
          createdAt: new Date().toISOString(),
        };
        posts = [...posts, p];
        return json({ ...p, mine: true, canDelete: true }, 201);
      }
      if (method === 'DELETE') {
        posts = posts.filter((p) => p.id !== postId);
        return json({ removed: true });
      }
    }
    if (path === '/gov/reset') {
      posts = [];
      state = createSeedState();
      return json({ reset: true });
    }
    if (path.startsWith('/gov/student')) {
      const mine = studentOf(actor.userId);
      const list = (regs[actor.userId] ??= DEMO_STUDENT_STATE.registrations.map((r) => r.eventId));
      const reply = () => {
        const known = new Set(mine.notifications.map((n) => n.id));
        mine.notifications = [...state.broadcasts.filter((b) => !known.has(b.id)), ...mine.notifications]; // the server merges portal-wide notices
        return shape();
      };
      const shape = () => ({
        ...mine,
        memberships: clubsOf(actor.userId),
        closedClubs: Object.keys(cfg).filter((id) => !cfg[id].joinOpen),
        registrations: list.map((eventId) => ({
          eventId,
          ref: '',
          status: 'confirmed',
          registeredOn: '2026-10-10',
        })),
      });
      if (path === '/gov/student' && method === 'GET') return json(reply());
      if (path === '/gov/student/registrations' && method === 'POST') {
        const ev = selectors
          .publishedEvents({ ...state, registrationCounts: counts() })
          .find((e) => e.id === body.eventId);
        if (!ev) return fail(404, 'NOT_FOUND', 'That event is not open to students.');
        if (ev.status === 'full' || ev.status === 'closed')
          return fail(409, 'INVALID_STATE', 'This event is fully booked.');
        if (!list.includes(body.eventId)) list.push(body.eventId);
        return json(reply(), 201);
      }
      if (path.startsWith('/gov/student/registrations/')) {
        const id = decodeURIComponent(path.split('/').pop());
        regs[actor.userId] = list.filter((e) => e !== id);
        return json(reply());
      }
      if (path === '/gov/student/memberships' && method === 'POST') {
        const l = clubsOf(actor.userId);
        if (!l.includes(body.clubId) && !settingsOf(body.clubId).joinOpen)
          return fail(403, 'FORBIDDEN', 'This club is not taking new members right now.');
        if (!l.includes(body.clubId)) l.push(body.clubId);
        return json(reply(), 201);
      }
      if (path.startsWith('/gov/student/memberships/')) {
        const id = decodeURIComponent(path.split('/').pop());
        joined[actor.userId] = clubsOf(actor.userId).filter((c) => c !== id);
        return json(reply());
      }
      if (path === '/gov/student/favorites') {
        mine.favorites = mine.favorites.includes(body.clubId)
          ? mine.favorites.filter((c) => c !== body.clubId)
          : [...mine.favorites, body.clubId];
        return json(reply());
      }
      if (path === '/gov/student/bookmarks') {
        mine.bookmarks = mine.bookmarks.includes(body.eventId)
          ? mine.bookmarks.filter((c) => c !== body.eventId)
          : [...mine.bookmarks, body.eventId];
        return json(reply());
      }
      if (path === '/gov/student/notifications/read') {
        mine.notifications = mine.notifications.map((n) =>
          body.all || n.id === body.id ? { ...n, unread: false } : n,
        );
        return json(reply());
      }
      if (path === '/gov/student/prefs') {
        mine.prefs = body.prefs;
        return json(reply());
      }
    }
    return fail(404, 'NOT_FOUND', 'Not found');
  }

  /** Test shortcut: the person is already signed in (the app then restores the session like after a reload). */
  const signIn = (userId) => {
    const u = DEMO_USERS.find((d) => d.userId === userId);
    const token = `tok-${u.userId}`;
    sessions.set(token, { user: u, portal: portalOf(u) });
    current = token;
    return portalOf(u);
  };

  return {
    handle,
    signIn,
    reset: () => {
      state = createSeedState();
      current = null;
      sessions.clear();
      Object.keys(students).forEach((k) => delete students[k]);
      Object.keys(regs).forEach((k) => delete regs[k]);
      Object.keys(joined).forEach((k) => delete joined[k]);
      Object.keys(cfg).forEach((k) => delete cfg[k]);
      posts = [];
    },
    get state() {
      return state;
    },
  };
}

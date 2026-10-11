// Backend integration seam: every call the screens make to the portal API lives here.
import { api, publicApi, refreshSession, setAccessToken, setPortal } from './http';

/** Maps the chosen entry path to the portal the API knows. */
export const portalOf = ({ role, adminType }) => (role === 'admin' ? adminType : role);

/** Signs in with a User ID and password for the portal chosen on the first screens. */
export async function login({ userId, password, role, adminType }) {
  const portal = portalOf({ role, adminType });
  const res = await publicApi('/auth/login', {
    method: 'POST',
    body: { identifier: userId.trim(), password, portal },
  });
  setAccessToken(res.accessToken);
  setPortal(portal);
  return { portal, user: await fetchMe(portal) };
}

/** The person in the shape the screens use (name, initials, club, admin type...). */
export const fetchMe = (portal) => api(`/gov/me?portal=${portal}`).then((d) => d.user);

/** Restores a session after a page reload from the refresh cookie. Resolves null when there is none. */
export async function restoreSession(portal) {
  if (!portal) return null;
  try {
    await refreshSession();
    setPortal(portal);
    return { portal, user: await fetchMe(portal) };
  } catch {
    setAccessToken(null);
    return null;
  }
}

export const logoutRequest = () => publicApi('/auth/logout', { method: 'POST' }).catch(() => {});

// ---- governance ----
export const fetchGovState = () => api('/gov/state');
export const runGovAction = (name, args) => api(`/gov/actions/${name}`, { method: 'POST', body: { args } });

// ---- student ----
export const fetchStudent = () => api('/gov/student');
export const registerForEvent = (eventId) =>
  api('/gov/student/registrations', { method: 'POST', body: { eventId } });
export const cancelEventRegistration = (eventId) =>
  api(`/gov/student/registrations/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
export const toggleFavoriteClub = (clubId) =>
  api('/gov/student/favorites', { method: 'POST', body: { clubId } });
export const toggleBookmarkEvent = (eventId) =>
  api('/gov/student/bookmarks', { method: 'POST', body: { eventId } });
export const markNotificationsRead = (body) =>
  api('/gov/student/notifications/read', { method: 'POST', body });
export const saveStudentPrefs = (prefs) => api('/gov/student/prefs', { method: 'PUT', body: { prefs } });

// ---- club space (the private board of a club: its joined students and its authority) ----
export const joinClubRequest = (clubId) =>
  api('/gov/student/memberships', { method: 'POST', body: { clubId } });
export const leaveClubRequest = (clubId) =>
  api(`/gov/student/memberships/${encodeURIComponent(clubId)}`, { method: 'DELETE' });
export const fetchClubSpace = (clubId) => api(`/gov/clubs/${encodeURIComponent(clubId)}/space`);
export const postToClub = (clubId, body) =>
  api(`/gov/clubs/${encodeURIComponent(clubId)}/posts`, { method: 'POST', body });
export const deleteClubPost = (clubId, postId) =>
  api(`/gov/clubs/${encodeURIComponent(clubId)}/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
export const fetchClubMembers = (clubId) => api(`/gov/clubs/${encodeURIComponent(clubId)}/members`);
export const removeClubMember = (clubId, userId) =>
  api(`/gov/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });

// ---- demo data (the server refuses these unless the demo accounts are enabled) ----
export const resetDemoData = () => api('/gov/reset', { method: 'POST' });
export const resetStudentData = () => api('/gov/student/reset', { method: 'POST' });

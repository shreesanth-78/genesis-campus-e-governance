// What each portal may see of the governance state. The server decides; the UI only renders what it receives.

/** The public part of an event request: what students see once it is published. */
const publicRequest = (r) => ({
  id: r.id,
  clubId: r.clubId,
  title: r.title,
  category: r.category,
  description: r.description,
  date: r.date,
  startTime: r.startTime,
  endTime: r.endTime,
  venue: r.venue,
  capacity: r.capacity,
  regDeadline: r.regDeadline,
  regDeadlineTime: r.regDeadlineTime,
  audience: r.audience,
  poster: r.poster ? { name: r.poster.name, size: r.poster.size, dataUrl: r.poster.dataUrl ?? null } : null,
  status: r.status,
  legacyEventId: r.legacyEventId,
});

const isPublic = (r) => r.status === 'published' || r.status === 'completed';

export function viewFor(state, portal, { clubId, userId } = {}) {
  const shared = {
    version: state.version,
    clock: state.clock,
    counters: state.counters,
    newClubs: state.newClubs,
    clubOverrides: state.clubOverrides,
    broadcasts: state.broadcasts,
    catalog: state.catalog,
    registrationCounts: state.registrationCounts ?? {},
  };
  if (portal === 'osa')
    return { ...shared, ...pick(state, ['requests', 'promotions', 'clubApplications', 'activity']) };
  // The Events Section handles halls and publishing; new-club applications are OSA's alone.
  if (portal === 'events')
    return {
      ...shared,
      // only circulated events can have a hall request, so those are the only ones this portal sees
      requests: state.requests.filter(isPublic),
      promotions: [],
      clubApplications: [],
      activity: state.activity.filter(
        (a) => a.refType === 'request' && state.requests.some((r) => r.id === a.refId && isPublic(r)),
      ),
    };
  if (portal === 'club') {
    return {
      ...shared,
      requests: state.requests
        .map((r) => {
          if (r.clubId === clubId) return r;
          // another club's event is visible only once it has been circulated to students; before that it is private
          return isPublic(r) ? publicRequest(r) : null;
        })
        .filter(Boolean),
      promotions: state.promotions.filter((p) => p.clubId === clubId),
      clubApplications: [],
      activity: state.activity.filter((a) => a.clubId === clubId),
    };
  }
  // student
  return {
    ...shared,
    requests: state.requests.filter(isPublic).map(publicRequest),
    promotions: [],
    // a student sees only the club applications they made
    clubApplications: state.clubApplications.filter((a) => Boolean(userId) && a.proposer?.userId === userId),
    activity: [],
  };
}

function pick(obj, keys) {
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

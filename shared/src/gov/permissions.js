// Role-based permissions for the prototype.
//
// IMPORTANT: this runs in the browser, so it only demonstrates the rules.
// A real deployment must enforce the same checks on the server.

/** 'osa' | 'events' | 'club' | 'student' | null */
export function actorKey(user) {
  if (!user) return null;
  if (user.role === 'admin') return user.adminType;
  return user.role;
}

export const ROLE_LABELS = {
  osa: 'Office of Student Affairs',
  events: 'Events Section',
  club: 'Club Authority',
  student: 'Student',
};

const RULES = {
  'request.review': ['events', 'osa'], // online review of documents/details
  'request.physical': ['events', 'osa'], // record hard-copy letter verification
  'request.hall': ['events', 'osa'], // give permission for the hall the club asked for (or assign another)
  'request.approve': ['osa'], // FINAL approval: OSA only
  'request.publish': ['events', 'osa'],
  'promotion.review': ['events', 'osa'],
  'clubApp.view': ['events', 'osa'],
  'clubApp.aiCheck': ['events', 'osa'],
  'clubApp.create': ['events', 'osa'],
  'clubApp.decide': ['osa'],
  'reports.view': ['events', 'osa'],
};

/** Generic role check. */
export function can(user, action) {
  const key = actorKey(user);
  return !!key && (RULES[action] || []).includes(key);
}

/** Club-scoped checks: a club authority only acts on their own club. */
export function ownsClub(user, clubId) {
  return actorKey(user) === 'club' && !!clubId && user.clubId === clubId;
}

export const DENIED = {
  'request.approve': 'Final approval can only be granted by authorized OSA staff.',
  'clubApp.decide': 'Only OSA can approve or reject club applications.',
  default: 'Your role is not permitted to do this.',
};

export function deniedReason(action) {
  return DENIED[action] || DENIED.default;
}

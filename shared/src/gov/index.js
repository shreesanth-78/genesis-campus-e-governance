export * as workflow from './workflow.js';
export * as selectors from './selectors.js';
export * from './permissions.js';
export * from './govData.js';
export { TODAY } from './demoClock.js';
export { createSeedState, STATE_VERSION, CLOCK_START, SEED_REQUESTS } from './seed.js';
export { CLUBS, EVENTS, CALENDAR_EVENTS } from './catalog.js';

/** Workflow functions the API exposes as POST /gov/actions/:name, with the portals allowed to call each one. */
export const ACTIONS = Object.freeze({
  saveRequest: ['club'],
  deleteDraft: ['club'],
  reviewRequest: ['osa'],
  recordPhysical: ['osa'],
  requestHall: ['club'],
  reviewHall: ['events'],
  finalApprove: ['osa'],
  publishRequest: ['club', 'osa'],
  createPromotion: ['club'],
  reviewPromotion: ['osa'],
  resubmitPromotion: ['club'],
  applyForClub: ['student'],
  createClubApplication: ['osa'],
  saveAiCheck: ['osa'],
  decideClubApplication: ['osa'],
  updateClubProfile: ['club'],
});
export * from './studentDefaults.js';
export * from './demoUsers.js';
export * from './ai.js';
export * from './views.js';
export * from './views.js';
export * from './knowledge.js';
export * from './copy.js';
export * from './halls.js';

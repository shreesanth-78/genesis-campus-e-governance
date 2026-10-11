import { DEMO_USERS, createSeedState } from '@gcc/shared/gov';
import { config } from '../../config/index.js';
import { errors } from '../../lib/errors.js';
import { seedState } from './state.js';
import { seedDemoStudent } from './student.service.js';

const demoOnly = () => {
  if (config.isProd || !config.SEED_DEMO_PORTAL) {
    throw errors.forbidden('Demo data can only be reset when the demo accounts are enabled.');
  }
};

const demoStudentName = () => DEMO_USERS.find((u) => u.role === 'student')?.userId.toLowerCase();

/** Puts every request, club change, registration and notification back to the sample data. Demo mode only. */
export async function resetDemoData(db) {
  demoOnly();
  await db.transaction(async (trx) => {
    await trx('gov_registrations').del();
    await trx('gov_club_posts').del();
    await trx('gov_club_members').del();
    await trx('gov_user_state').del();
    await trx('gov_docs').del();
    await trx('gov_meta').del();
    await seedState(trx, createSeedState());
    const demo = await trx('users').where({ username: demoStudentName() }).first();
    if (demo) await seedDemoStudent(trx, demo.id);
  });
}

/** A student's own registrations, favourites and notifications go back to how a new account looks (or the demo sample). */
export async function resetStudent(db, user) {
  await db.transaction(async (trx) => {
    await trx('gov_registrations').where({ user_id: user.id }).del();
    await trx('gov_club_members').where({ user_id: user.id }).del();
    await trx('gov_user_state').where({ user_id: user.id }).del();
    if (user.username === demoStudentName()) await seedDemoStudent(trx, user.id);
  });
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, Splash } from './AuthContext';
import * as wf from '../store/workflow';
import * as sel from '../store/selectors';
import { fetchGovState, resetDemoData, resetStudentData, runGovAction } from '../utils/api';

// Governance state: event requests, promotions, club applications, club edits and student-facing notices.
//
// The server owns the data and the rules. Each action runs the same workflow function here first, so the screen
// answers at once (optimistic), and is then sent to the API, which runs it again on the stored state with the
// person's real role. The server's answer replaces the local copy; if the server disagrees the local copy is
// dropped and the person is told. The state is also re-read every few seconds and when the window regains focus,
// so an approval made by someone else shows up without a reload.

const GovContext = createContext(null);
const POLL_MS = 8000;

const EMPTY = {
  version: 0,
  clock: '',
  counters: {},
  requests: [],
  promotions: [],
  clubApplications: [],
  clubOverrides: {},
  newClubs: [],
  broadcasts: [],
  activity: [],
  catalog: { clubs: [], events: [], calendar: [] },
  registrationCounts: {},
};

/** Tells the rest of the app (toasts) that a change did not stick. */
const syncError = (message) =>
  window.dispatchEvent(new CustomEvent('gov:sync-error', { detail: { message } }));

export function GovProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(null);
  const ref = useRef(null);
  const userRef = useRef(user);
  userRef.current = user;
  const pending = useRef(0);
  const queue = useRef(Promise.resolve());
  const [loadError, setLoadError] = useState('');

  const apply = useCallback((next) => {
    ref.current = next;
    setState(next);
  }, []);

  const refresh = useCallback(async () => {
    if (pending.current > 0 || !userRef.current) return;
    try {
      const next = await fetchGovState();
      if (pending.current === 0) apply(next);
      setLoadError('');
    } catch (e) {
      if (!ref.current) setLoadError(e.message);
    }
  }, [apply]);

  // load when someone signs in; clear when they sign out
  useEffect(() => {
    if (!user) {
      ref.current = null;
      setState(null);
      return undefined;
    }
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, refresh]);

  /** Run a workflow function as the signed-in user. Answers immediately; the server confirms in the background. */
  const run = useCallback(
    (name, ...args) => {
      const actor = userRef.current;
      if (!actor || !ref.current) return { ok: false, error: 'Please sign in again.' };
      const res = wf[name](ref.current, actor, ...args);
      if (!res.ok) return res;
      apply(res.state);
      pending.current += 1;
      queue.current = queue.current.then(async () => {
        try {
          const remote = await runGovAction(name, args);
          pending.current -= 1;
          if (!remote.ok) {
            syncError(remote.error || 'The server did not accept that change.');
            apply(remote.state);
          } else if (pending.current === 0) apply(remote.state);
        } catch (e) {
          pending.current -= 1;
          syncError(e.message || 'Could not save that change.');
          if (pending.current === 0) await refresh();
        }
      });
      return res;
    },
    [apply, refresh],
  );

  const actions = useMemo(
    () => ({
      saveRequest: (data, opts) => run('saveRequest', data, opts),
      deleteDraft: (id) => run('deleteDraft', id),
      reviewRequest: (id, p) => run('reviewRequest', id, p),
      recordPhysical: (id, p) => run('recordPhysical', id, p),
      reviewHall: (id, p) => run('reviewHall', id, p),
      finalApprove: (id, p) => run('finalApprove', id, p),
      publishRequest: (id) => run('publishRequest', id),
      createPromotion: (p) => run('createPromotion', p),
      reviewPromotion: (id, p) => run('reviewPromotion', id, p),
      resubmitPromotion: (id, p) => run('resubmitPromotion', id, p),
      createClubApplication: (p) => run('createClubApplication', p),
      saveAiCheck: (id, r) => run('saveAiCheck', id, r),
      decideClubApplication: (id, p) => run('decideClubApplication', id, p),
      updateClubProfile: (clubId, p) => run('updateClubProfile', clubId, p),
      /** Students reset their own data; OSA resets the shared demo data (the server refuses anyone else). */
      resetAll: async () => {
        try {
          if (userRef.current?.role === 'student') await resetStudentData();
          else await resetDemoData();
          await refresh();
        } catch (e) {
          syncError(e.message);
        }
      },
    }),
    [run, refresh],
  );

  const current = state ?? EMPTY;
  const value = useMemo(
    () => ({
      state: current,
      storageWarning: false,
      refreshCounts: refresh,
      ...actions,
      // student-facing projections (published events only)
      events: sel.publishedEvents(current),
      clubs: sel.allClubs(current),
      calendar: sel.calendarEvents(current),
      getEvent: (id) => sel.publishedEvents(current).find((e) => e.id === id),
      getClub: (id) => sel.getClubFrom(current, id),
    }),
    [current, actions, refresh],
  );

  if (user && !state) {
    return loadError ? (
      <div className="grid min-h-screen place-items-center bg-canvas p-6 text-center" role="alert">
        <div>
          <div className="text-sm font-bold text-brand-900">Could not load the portal data.</div>
          <p className="mt-1 text-xs text-ink-soft">{loadError}</p>
          <button className="btn-primary mt-4" onClick={refresh}>
            Try again
          </button>
        </div>
      </div>
    ) : (
      <Splash label="Loading your portal…" />
    );
  }
  return <GovContext.Provider value={value}>{children}</GovContext.Provider>;
}

export const useGov = () => {
  const ctx = useContext(GovContext);
  if (!ctx) throw new Error('useGov must be used inside <GovProvider>');
  return ctx;
};

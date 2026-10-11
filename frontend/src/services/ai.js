// AI integration layer — deliberately separate from UI and workflow code.
//
// Every function tries the portal API (POST {VITE_AI_API_URL or /api/v1/ai}/...) and falls back to a deterministic
// local helper when the request fails. The API answers with Claude when ANTHROPIC_API_KEY is set on the server,
// and with the same rule-based helpers otherwise; the result always says which `source` produced it, so the UI can
// show "AI service" vs "Local mock fallback" honestly.
//
//   POST {API}/duplicate-clubs   { application }  -> { matches, summary, engine }
//   POST {API}/assistant         { question }     -> { answer, engine }
//   GET  {API}/status                              -> { engine }

import {
  ASSISTANT_FALLBACK,
  duplicateSummary,
  localAssistant,
  localDuplicateCheck,
  precheckRequest as precheck,
} from '@gcc/shared/gov/ai';
import { hallSummary, rankHalls } from '@gcc/shared/gov/halls';
import { checkClubIdea as localClubIdeaCheck } from '../store/workflow';
import { getAccessToken } from '../utils/http';

const API = `${(import.meta.env?.VITE_API_URL ?? '').replace(/\/$/, '')}/api/v1/ai`;
const TIMEOUT_MS = 12000;

/** 'ai' | 'rules' once the server has said, null until then. */
let provider = null;
let engine = null;

async function callApi(path, body) {
  if (!API) return null; // not configured -> caller uses the local helpers
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const headers = { 'Content-Type': 'application/json' };
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal, credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = json?.data ?? json;
    if (data?.engine) engine = data.engine;
    if (data?.provider) provider = data.provider;
    return data;
  } catch {
    return null; // network/timeout/server error -> local fallback
  } finally {
    clearTimeout(timer);
  }
}

/** Asks the server which engine answers (call once after sign-in). */
export const refreshAiStatus = () => callApi('/status');

export const aiMode = () => {
  if (!API) return 'Local mock (no AI API configured)';
  if (engine === 'ai') return `AI service (${provider ?? 'model'}, via the portal API)`;
  if (engine === 'rules') return 'Portal rules (no AI key set on the server)';
  return 'AI service (with local fallback)';
};

/* ------------------------------------------------------------------ */
/* Duplicate club detection                                            */
/* ------------------------------------------------------------------ */
export { localDuplicateCheck };

export async function detectDuplicateClubs(application, existingClubs, objectivesOf) {
  const remote = await callApi('/duplicate-clubs', { application });
  if (remote?.matches) {
    return { source: remote.engine === 'ai' ? 'ai-service' : 'local-mock', ranAt: new Date().toISOString(), matches: remote.matches, summary: remote.summary || '' };
  }
  const matches = localDuplicateCheck(application, existingClubs, objectivesOf);
  await new Promise((r) => setTimeout(r, 450)); // feel like a service call
  return { source: 'local-mock', ranAt: new Date().toISOString(), matches, summary: duplicateSummary(matches) };
}

/* ------------------------------------------------------------------ */
/* Event request pre-check (advisory only, runs instantly in the browser) */
/* ------------------------------------------------------------------ */
export function precheckRequest(req, opts) {
  return { source: 'local-mock', ...precheck(req, opts) };
}

/* ------------------------------------------------------------------ */
/* Campus assistant (student side)                                     */
/* ------------------------------------------------------------------ */
export async function askCampusAssistant(question, context) {
  const remote = await callApi('/assistant', { question });
  if (remote?.answer) return { source: remote.engine === 'ai' ? 'ai-service' : 'local-mock', answer: remote.answer, grounded: remote.answer !== ASSISTANT_FALLBACK };
  await new Promise((r) => setTimeout(r, 600));
  const answer = localAssistant(question, context);
  return { source: 'local-mock', answer, grounded: answer !== ASSISTANT_FALLBACK };
}

export { ASSISTANT_FALLBACK };

/* ------------------------------------------------------------------ */
/* Hall recommendation                                                 */
/* ------------------------------------------------------------------ */
/** Best hall for the expected attendance: the API (model-written explanation when a key is set), else local ranking. */
export async function recommendHalls(input, { requests = [] } = {}) {
  const remote = await callApi('/halls', { ...input, attendance: Number(input.attendance) || 1 });
  if (remote?.rankings) return { rankings: remote.rankings, summary: remote.summary, source: remote.engine === 'ai' ? 'ai-service' : 'rules' };
  const rankings = rankHalls({ ...input, requests, ignoreId: input.requestId });
  return { rankings, summary: hallSummary(rankings, input), source: 'local' };
}

/* ------------------------------------------------------------------ */
/* Check an idea for a new club                                        */
/* ------------------------------------------------------------------ */
/**
 * Before a student fills in the whole application: does a club (or a pending application) already cover this idea?
 * The API also asks the model for a meaning-level opinion; offline, the built-in focus-area comparison answers.
 */
export async function checkClubIdea(application, state) {
  const remote = await callApi('/check-club', { application });
  if (remote && typeof remote.blocked === 'boolean') {
    return { blocked: remote.blocked, message: remote.message || '', matches: remote.matches || [], summary: remote.summary || '', source: remote.engine === 'ai' ? 'ai-service' : 'rules' };
  }
  const local = localClubIdeaCheck(state, application);
  return { blocked: Boolean(local.blocked), message: local.blocked, matches: local.matches, summary: local.summary, source: 'local' };
}

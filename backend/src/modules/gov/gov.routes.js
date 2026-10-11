import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db/knex.js';
import { errors } from '../../lib/errors.js';
import { getLlm } from '../../lib/llm.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as ai from './ai.service.js';
import * as space from './clubspace.service.js';
import { readImage } from './files.service.js';
import * as gov from './gov.service.js';
import { PORTALS, portalUser } from './portal.js';
import { resetDemoData, resetStudent } from './reset.service.js';
import * as student from './student.service.js';

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const db = (req) => req.app.locals.db ?? getDb();
const auth = requireAuth();
const llmFor = (req) => (req.app.locals.llm !== undefined ? req.app.locals.llm : getLlm());

/** The portal this call is for: the X-Portal header (or ?portal=). The account must really belong to it. */
async function portalFor(req) {
  const portal = req.get('x-portal') ?? req.query.portal;
  if (!PORTALS.includes(portal)) throw errors.validation('Choose a portal.');
  req.portal = portal;
  req.actor = await portalUser(db(req), req.user, portal);
  return portal;
}

/** Route guard: the signed-in account must be using one of the named portals. */
const onlyPortals =
  (...allowed) =>
  (req, _res, next) =>
    portalFor(req)
      .then((portal) => {
        if (!allowed.includes(portal)) throw errors.forbidden();
      })
      .then(() => next(), next);

export const govRouter = Router();

govRouter.get(
  '/me',
  auth,
  wrap(async (req, res) => {
    await portalFor(req);
    res.json({ data: { user: req.actor } });
  }),
);

govRouter.get(
  '/state',
  auth,
  wrap(async (req, res) => {
    const portal = await portalFor(req);
    res.json({ data: await gov.getView(db(req), req.user, portal) });
  }),
);

const actionSchema = z.object({ args: z.array(z.any()).max(4).default([]) });
govRouter.post(
  '/actions/:name',
  auth,
  validate({ body: actionSchema }),
  wrap(async (req, res) => {
    const portal = await portalFor(req);
    res.json({
      data: await gov.runAction(db(req), req.user, portal, req.params.name, req.body.args, {
        llm: llmFor(req),
      }),
    });
  }),
);

// Demo only (refused unless the demo accounts are enabled): back to the sample data.
govRouter.post(
  '/reset',
  auth,
  onlyPortals('osa'),
  wrap(async (req, res) => {
    await resetDemoData(db(req));
    res.json({ data: { reset: true } });
  }),
);

// ---------- Student portal ----------
const onlyStudents = onlyPortals('student');
const idSchema = (key) => z.object({ [key]: z.string().trim().min(1).max(64) });

govRouter.get(
  '/student',
  auth,
  onlyStudents,
  wrap(async (req, res) => res.json({ data: await student.getStudent(db(req), req.user) })),
);
govRouter.post(
  '/student/reset',
  auth,
  onlyStudents,
  wrap(async (req, res) => {
    await resetStudent(db(req), req.user);
    res.json({ data: await student.getStudent(db(req), req.user) });
  }),
);
govRouter.post(
  '/student/memberships',
  auth,
  onlyStudents,
  validate({ body: idSchema('clubId') }),
  wrap(async (req, res) => {
    await space.join(db(req), req.user, req.body.clubId);
    res.status(201).json({ data: await student.getStudent(db(req), req.user) });
  }),
);
govRouter.delete(
  '/student/memberships/:clubId',
  auth,
  onlyStudents,
  wrap(async (req, res) => {
    await space.leave(db(req), req.user, req.params.clubId);
    res.json({ data: await student.getStudent(db(req), req.user) });
  }),
);

// ---------- Club Space: the private board of a club (its joined students and its authority) ----------
const spaceCtx = async (req) => {
  const portal = await portalFor(req);
  if (!['student', 'club'].includes(portal)) throw errors.forbidden('Your role does not use club spaces.');
  return { portal, actor: req.actor, user: req.user };
};
const postSchema = z.object({
  kind: z.enum(['announcement', 'discussion']),
  body: z.string().max(5000),
  eventId: z.string().trim().max(64).optional().nullable(),
});
govRouter.get(
  '/clubs/:clubId/space',
  auth,
  wrap(async (req, res) =>
    res.json({ data: await space.space(db(req), await spaceCtx(req), req.params.clubId) }),
  ),
);
govRouter.post(
  '/clubs/:clubId/posts',
  auth,
  validate({ body: postSchema }),
  wrap(async (req, res) =>
    res
      .status(201)
      .json({ data: await space.post(db(req), await spaceCtx(req), req.params.clubId, req.body) }),
  ),
);
govRouter.delete(
  '/clubs/:clubId/posts/:postId',
  auth,
  wrap(async (req, res) => {
    await space.removePost(db(req), await spaceCtx(req), req.params.clubId, req.params.postId);
    res.json({ data: { removed: true } });
  }),
);
govRouter.put(
  '/clubs/:clubId/settings',
  auth,
  validate({ body: z.object({ membersCanPost: z.boolean().optional(), joinOpen: z.boolean().optional() }) }),
  wrap(async (req, res) =>
    res.json({ data: await space.updateSettings(db(req), await spaceCtx(req), req.params.clubId, req.body) }),
  ),
);
govRouter.get(
  '/clubs/:clubId/members',
  auth,
  wrap(async (req, res) =>
    res.json({ data: await space.members(db(req), await spaceCtx(req), req.params.clubId) }),
  ),
);
govRouter.delete(
  '/clubs/:clubId/members/:userId',
  auth,
  wrap(async (req, res) => {
    await space.removeMember(db(req), await spaceCtx(req), req.params.clubId, req.params.userId);
    res.json({ data: { removed: true } });
  }),
);

govRouter.post(
  '/student/registrations',
  auth,
  onlyStudents,
  validate({ body: idSchema('eventId') }),
  wrap(async (req, res) =>
    res.status(201).json({ data: await student.register(db(req), req.user, req.body.eventId) }),
  ),
);
govRouter.delete(
  '/student/registrations/:eventId',
  auth,
  onlyStudents,
  wrap(async (req, res) =>
    res.json({ data: await student.cancelRegistration(db(req), req.user, req.params.eventId) }),
  ),
);
govRouter.post(
  '/student/favorites',
  auth,
  onlyStudents,
  validate({ body: idSchema('clubId') }),
  wrap(async (req, res) =>
    res.json({ data: await student.toggleFavorite(db(req), req.user, req.body.clubId) }),
  ),
);
govRouter.post(
  '/student/bookmarks',
  auth,
  onlyStudents,
  validate({ body: idSchema('eventId') }),
  wrap(async (req, res) =>
    res.json({ data: await student.toggleBookmark(db(req), req.user, req.body.eventId) }),
  ),
);
govRouter.post(
  '/student/notifications/read',
  auth,
  onlyStudents,
  validate({ body: z.object({ id: z.string().max(100).optional(), all: z.boolean().optional() }) }),
  wrap(async (req, res) => res.json({ data: await student.markRead(db(req), req.user, req.body) })),
);
govRouter.put(
  '/student/prefs',
  auth,
  onlyStudents,
  validate({ body: z.object({ prefs: z.record(z.any()) }) }),
  wrap(async (req, res) => res.json({ data: await student.savePrefs(db(req), req.user, req.body.prefs) })),
);

// ---------- AI helpers (advisory only; they never approve or reject anything) ----------
export const aiRouter = Router();
aiRouter.get('/status', auth, (req, res) => res.json({ data: ai.status(llmFor(req)) }));
aiRouter.post(
  '/duplicate-clubs',
  auth,
  onlyPortals('osa'),
  validate({ body: z.object({ application: z.record(z.any()) }) }),
  wrap(async (req, res) => res.json({ data: await ai.duplicateClubs(db(req), req.body.application) })),
);
aiRouter.post(
  '/check-club',
  auth,
  onlyPortals('student'),
  validate({ body: z.object({ application: z.record(z.any()) }) }),
  wrap(async (req, res) => {
    const a = req.body.application;
    const text = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
    const application = {
      name: text(a.name, 100),
      category: text(a.category, 80),
      objectives: text(a.objectives, 1200),
      description: text(a.description, 1200),
    };
    res.json({ data: await ai.clubIdeaCheck(db(req), application, { llm: llmFor(req) }) });
  }),
);
aiRouter.post(
  '/assistant',
  auth,
  onlyStudents,
  validate({ body: z.object({ question: z.string().trim().min(1).max(600) }) }),
  wrap(async (req, res) =>
    res.json({ data: await ai.assistant(db(req), req.user, req.body.question, { llm: llmFor(req) }) }),
  ),
);

aiRouter.post(
  '/chat',
  auth,
  validate({
    body: z.object({
      message: z.string().trim().min(1).max(800),
      history: z
        .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(800) }))
        .max(12)
        .default([]),
    }),
  }),
  wrap(async (req, res) => {
    const portal = await portalFor(req);
    res.json({
      data: await ai.chat(
        db(req),
        req.user,
        { portal, actor: req.actor, message: req.body.message, history: req.body.history },
        { llm: llmFor(req) },
      ),
    });
  }),
);

// ---------- Uploaded posters (public, like the published events they belong to) ----------
export const filesRouter = Router();
filesRouter.get(
  '/:id',
  wrap(async (req, res) => {
    const { mime, buffer } = await readImage(db(req), req.params.id);
    res.set({
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin', // the frontend is on another origin
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.send(buffer);
  }),
);

// Hall recommendation for a club (and for the reviewers who can reassign a hall).
aiRouter.post(
  '/halls',
  auth,
  onlyPortals('club', 'events'),
  validate({
    body: z.object({
      attendance: z.coerce.number().int().min(1).max(5000),
      date: z.string().max(10).optional(),
      startTime: z.string().max(5).optional(),
      endTime: z.string().max(5).optional(),
      category: z.string().max(40).optional(),
      requestId: z.string().max(30).optional(),
    }),
  }),
  wrap(async (req, res) => {
    const portal = await portalFor(req);
    res.json({
      data: await ai.hallAdvice(
        db(req),
        req.user,
        { portal, actor: req.actor, input: req.body },
        { llm: llmFor(req) },
      ),
    });
  }),
);

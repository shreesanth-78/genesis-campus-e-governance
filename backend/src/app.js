import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/index.js';
import { getDb } from './db/knex.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { aiRouter, filesRouter, govRouter } from './modules/gov/gov.routes.js';

/** The built website (`npm run build` writes frontend/dist). FRONTEND_DIST overrides the location. */
function defaultFrontendDir() {
  return process.env.FRONTEND_DIST || path.resolve(config.apiRoot, '../frontend/dist');
}

/**
 * One service for everything: when the built frontend exists, this API also serves the website, so the site and the API
 * share one URL (no CORS, no cross-site cookies). Unknown non-API paths get index.html (single-page app routing).
 */
function serveFrontend(app, dir) {
  if (!dir || !fs.existsSync(path.join(dir, 'index.html'))) return;
  app.use(
    express.static(dir, {
      index: false,
      setHeaders: (res, file) => {
        // Vite fingerprints everything under /assets, so it can be cached for a year; index.html must always be fresh.
        res.set(
          'Cache-Control',
          file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(dir, 'index.html'));
  });
}

/**
 * Builds the Express app (used by server.js and by tests).
 * `extraRoutes(router)` lets tests mount probe routes under /api/v1.
 */
export function createApp({ db = getDb(), extraRoutes, llm, frontendDir = defaultFrontendDir() } = {}) {
  const app = express();
  app.locals.db = db;
  if (llm !== undefined) app.locals.llm = llm; // tests inject a mocked model client
  app.disable('x-powered-by');
  app.set('trust proxy', config.isProd ? 1 : false);
  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.webOrigins.includes(origin)),
      credentials: true,
    }),
  );
  // Event requests carry a poster image as a data URL, so the governance routes accept a larger body.
  app.use('/api/v1/gov', express.json({ limit: '2mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.get('/health', async (_req, res) => {
    try {
      await db.raw('select 1');
      res.json({ data: { status: 'ok', database: 'up' } });
    } catch {
      res.status(503).json({ data: { status: 'degraded', database: 'down' } });
    }
  });
  api.use('/auth', authRouter);
  api.use('/', usersRouter);
  api.use('/gov', govRouter);
  api.use('/ai', aiRouter);
  api.use('/files', filesRouter);
  if (extraRoutes) extraRoutes(api);
  app.use('/api/v1', api);

  serveFrontend(app, frontendDir);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

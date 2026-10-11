# Deployment

**One service, one URL.** The backend serves the API under `/api/*` and also serves the built website for every other
path. The database is Neon (PostgreSQL). There is nothing else to host.

```
Browser ──► Render web service (Express)
              ├─ /api/*        API (auth, governance, AI)         ──► Neon PostgreSQL
              └─ everything else  the built website (frontend/dist, single-page app)
```

Because the website and the API share one origin there is no CORS to configure, no cross-site cookie, and no `VITE_API_URL`.
Redeploying updates both together.

## 1. Database: Neon

1. Create a Neon project and copy the connection string (`postgresql://...?sslmode=require`).
2. It goes only into the service's environment variables, never into git.
3. Tables and sample data: the server creates or updates the tables itself on every start. To load the sample clubs,
   events and demo accounts once, run from your machine:
   ```bash
   cd backend
   DATABASE_CLIENT=pg DATABASE_URL="<your string>" npm run db:seed
   ```
4. Rotate the database password if the string was ever pasted somewhere public.

## 2. Render (manual deploy)

Create a **Web Service** from the GitHub repository (branch `main`), or use the included Blueprint (`render.yaml`, "New → Blueprint").

| Setting           | Value                                        |
| ----------------- | -------------------------------------------- |
| Root Directory    | (empty: repository root)                     |
| Runtime           | Node (version 20 or newer)                   |
| **Build Command** | `npm install --include=dev && npm run build` |
| **Start Command** | `npm start -w backend`                       |
| Health Check Path | `/api/v1/health`                             |

`--include=dev` matters: Render sets `NODE_ENV=production`, which would otherwise skip the website's build tools (Vite, Tailwind).

Environment variables:

| Variable            | Value                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `NODE_ENV`          | `production`                                                                                  |
| `DATABASE_CLIENT`   | `pg`                                                                                          |
| `DATABASE_URL`      | the Neon connection string                                                                    |
| `JWT_SECRET`        | a random string of 32+ characters (the server refuses to start in production without one)     |
| `JWT_ACCESS_TTL`    | `2h`                                                                                          |
| `REFRESH_TTL_DAYS`  | `0.0833333` (two hours)                                                                       |
| `AUTO_VERIFY_EMAIL` | `false` (the server refuses `true` in production)                                             |
| `SEED_DEMO_PORTAL`  | `false`                                                                                       |
| `GROQ_API_KEY`      | optional: model-written chat answers and notification quotes (`ANTHROPIC_API_KEY` also works) |

Leave `API_URL` and `WEB_URL` unset: the website and the API are the same origin. (`API_URL` is only for the two-domain
setup in section 4.)

### Updating the live site

Push to `main` and press **Manual Deploy → Deploy latest commit** in Render (or let auto-deploy do it). The build step
rebuilds the website, so a frontend change goes live together with the backend. After it finishes, hard-refresh the
browser (Ctrl+F5) because the old page may be cached.

Quick checks after a deploy:

- `https://<your-service>.onrender.com/api/v1/health` answers `{"data":{"status":"ok","database":"up"}}`
- `https://<your-service>.onrender.com/` shows the sign-in chooser, and a deep link such as `/student/dashboard` also loads
- the sign-in works with a demo account and Sign out returns to the first screen

## 3. Real accounts

The demo accounts exist only for demos. For a launch, create users with `POST /api/v1/auth/signup` (students) or insert
admin users directly, and keep `SEED_DEMO_PORTAL=false`.

## 4. Optional: website on a different domain

If you prefer to host the website separately (Vercel, Netlify), build `frontend/` there (`npm run build`, output `dist`),
and either:

- keep `frontend/vercel.json`, which forwards `/api/*` to the backend so the browser still sees one origin, or
- set `VITE_API_URL` to the backend URL at build time, and on the backend set `WEB_URL` to the website origin, `API_URL`
  to the backend's public URL (poster links become absolute) and `COOKIE_SAMESITE=none`. Both must use HTTPS.

## Checklist

- [ ] `JWT_SECRET` set, long and random
- [ ] `DATABASE_URL` set on the service only
- [ ] Build Command includes `--include=dev` and `npm run build`
- [ ] HTTPS (Render provides it)
- [ ] `/api/v1/health` answers `ok`, `/` shows the website

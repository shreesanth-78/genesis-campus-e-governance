# Architecture

```
Browser (frontend)  <->  Express API (backend)  <->  PostgreSQL (Neon)
        \                       /
         shared/src/gov  (rules, workflow, views, sample data)
                         |
                  Claude (chat), called only from the backend
```

## Backend (`backend/src`)

| Folder          | Contents                                                                    |
| --------------- | --------------------------------------------------------------------------- |
| `config/`       | Environment variables, validated at start                                   |
| `db/`           | Knex setup (TLS PostgreSQL; SQLite for tests only), 5 migrations, seeds     |
| `middleware/`   | Sign-in check, validation, rate limit, error handler, request id            |
| `lib/`          | Tokens, clock, errors, logger, mailer, audit log, Claude client             |
| `modules/auth`  | Login, refresh rotation with reuse detection, logout, signup, verify, reset |
| `modules/users` | `/me`, profile, change password                                             |
| `modules/gov`   | The portal: state, actions, student data, files, assistant (see below)      |

### API summary (`/api/v1`)

- `POST /auth/login` (with `portal`), `/auth/refresh`, `/auth/logout`
- `GET /gov/me`, `GET /gov/state`, `POST /gov/actions/:name` (header `X-Portal`)
- `GET /gov/student`, `POST /gov/student/registrations`, `DELETE /gov/student/registrations/:eventId`, favourites, bookmarks, notifications, preferences
- `POST /ai/chat`, `/ai/assistant`, `/ai/duplicate-clubs`, `GET /files/:id`, `GET /health`

### How an action runs

1. The frontend runs the workflow function locally (instant answer) and sends `POST /gov/actions/<name>`.
2. The backend checks the access token, that the account belongs to the portal in `X-Portal`, and that the portal may call that action.
3. In one transaction it locks the state, loads it, runs the **same** workflow function with the real person as the actor, and writes only what changed.
4. It answers with the state that portal may see (students: published events only; a club: its own requests in full). The frontend replaces its local copy with it.

### Tables

`users`, `auth_tokens`, `refresh_tokens`, `audit_logs`, `gov_docs` (requests, promotions, club applications, clubs, notices...), `gov_meta` (counters, demo clock, lock row), `gov_club_authorities`, `gov_registrations`, `gov_user_state`, `gov_files`. All JSON is stored as text so the same migrations run on SQLite and PostgreSQL.

## Shared (`shared/src`)

`gov/workflow.js` (the approval steps), `gov/permissions.js`, `gov/selectors.js`, `gov/views.js` (what each portal sees), `gov/seed.js` and `gov/catalog.js` (sample data, 26 Amrita clubs), `gov/ai.js` (rule-based assistant and duplicate check), plus constants, error codes and the auth schemas.

## Frontend (`frontend/src`)

`pages/` (student, club, admin screens), `components/`, `context/` (auth, governance state, student state), `utils/http.js` (API client; base URL from `VITE_API_URL`), `utils/api.js` (every call the screens make), Tailwind theme in `tailwind.config.js` (AM Maroon `#A4123F`, Open Sans).

## Chat assistant

1. **Gate:** `shared/src/gov/knowledge.js` decides if a message is about clubs, events or the portal. Greetings are answered at once; maths, code, homework, jokes, general knowledge and "ignore your rules" messages are refused with a fixed sentence and never reach a model.
2. **Context:** the backend builds the pieces a model may use: one entry per club (what it is for, interest keywords), interest and group lists, process notes for the caller's role, upcoming events with live seat counts, and (club or admin) their own requests or the review queue. Keyword overlap ranks them (a light RAG, no vector database).
3. **Model:** with a key (`backend/src/lib/llm.js`: Groq or Claude) the model gets the ranked pieces as untrusted data and a strict system prompt; if it still judges the message off-topic it answers OFF_TOPIC, which becomes the refusal.
4. **Fallback:** with no key, or if the model fails, the rule-based answers in `shared/src/gov/ai.js` use the same knowledge.

## Serving the website

`backend/src/app.js` serves `frontend/dist` (override with `FRONTEND_DIST`) after the API routes: files under `/assets` are cached for a year (Vite fingerprints them), `index.html` is never cached, and any other non-`/api` path gets `index.html` so client-side routing and deep links work. Unknown `/api/*` paths still return a JSON 404. If `frontend/dist` does not exist (local development) the backend serves only the API and Vite serves the website.

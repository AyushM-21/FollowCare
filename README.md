# FollowCare

FollowCare is a hospital follow-up workflow prototype. It helps a hospital track patients who have been told to come back, see who is overdue or unresolved, and give staff a clear next action.

It borrows its mental model from Google Classroom: departments are workspaces, follow-up plans are assignments, reminders are announcements, contact outcomes are submissions, and the dashboard is class progress.

> **Project boundary:** administrative continuity-of-care support only. FollowCare must not diagnose, triage clinically, change treatment, or give emergency medical advice. Clinicians keep authority over clinical instructions and urgency.
>
> **Prototype status:** a hackathon prototype run on synthetic demo data. It is **not** production-ready, has not had a security audit, and defaults to the mock notification provider; an optional Twilio SMS/WhatsApp adapter is available but has not been verified with live credentials.

Design reference: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

## What you can do with it

| Portal | Who | What works (see [status](#status-what-is-verified-and-what-is-not) for evidence) |
|---|---|---|
| Staff workspace | Admin, doctor, nurse, coordinator, health worker | Command Center dashboard, follow-up plan creation with version history, Kanban task board, task details with transparent priority reasons, contact-attempt logging |
| Patient portal | Patients | OTP sign-in, view follow-ups, acknowledge instructions, request help / report a barrier (creates a staff task) |
| Background worker | System | Generic reminders with quiet-hours deferral, retry then escalation to a staff task, overdue-window sweep, no-show detection |

Core idea: when a patient cannot come back (travel, cost, schedule), they are given a way to say so, and staff see an actionable reason instead of a "missed" mark. Reminders never contain medical details, and a failed delivery becomes a staff task.

## Quick start

### 1. Prerequisites

- **Node.js 20+** and npm (developed on Node 22; the 15 Oct 2026 walkthrough also ran on Node 24.18 / npm 11.16)
- **PostgreSQL 15+** (walkthrough used 16.15)
- **Redis 7+** (used for the job queue and rate limiting)
- Git

Docker is optional (it only provides Postgres and Redis). If you already have them installed, skip Docker.

### 2. Get the code

```bash
git clone https://github.com/AyushM-21/FollowCare.git
cd FollowCare
npm install
```

All `npm` commands below run from this **repository root** (the folder containing the root `package.json`).

### 3. Start Postgres and Redis

**Option A: Docker**

```bash
docker compose up -d
```

This starts Postgres (database/user/password all `followcare`) and Redis on the default ports.

**Option B: already installed locally (macOS/Homebrew example)**

```bash
brew services start postgresql@16     # use the exact name shown by `brew services list`
brew services start redis
pg_isready && redis-cli ping          # expect "accepting connections" and "PONG"
```

Then create the database. Run this once, on a **fresh** setup only:

```bash
createdb followcare
```

If the database or role already exists, do not drop it. Check its ownership and permissions instead, because migrations fail if the existing schema belongs to a different database role. Use a separate database name (for example `followcare_demo`) if you want to keep old data.

### 4. Configure environment

```bash
cp server/.env.example server/.env
```

Generate two **different** 64-character hex secrets (run twice):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the first in `SESSION_SECRET` and the second in `PHI_ENC_KEY` in `server/.env`. Both are required. `PHI_ENC_KEY` must be exactly 64 hex characters (it is an AES-256 key).

Check `DATABASE_URL`. The template uses `postgresql://followcare:followcare@localhost:5432/followcare`, which matches Docker. With Homebrew Postgres and no `followcare` role, use `postgresql://localhost:5432/followcare` (your OS user, no password).

Keep `server/.env` private. It is git-ignored; never commit it.

### 5. Create tables and demo data

```bash
npm run migrate
npm run seed
```

### 6. Run it

Use two terminal tabs, both at the repository root:

```bash
npm run dev       # tab 1: API on :3001 and web on :5173
npm run worker    # tab 2: background jobs
```

The API process does not hot-reload. After changing server code, stop and rerun `npm run dev`. Frontend changes reload automatically. The worker is optional for exploring the UI; it is only needed for reminders, overdue sweeps and no-show detection.

Open <http://localhost:5173>. The dev server proxies `/api` to the API.

## Demo logins (synthetic, local only)

Seeded staff accounts all use the password `Password123!`.

| Role | Email | Department scope (seed data) |
|---|---|---|
| Admin | `admin@followcare.org` | All |
| Doctor | `doctor.sharma@followcare.org` | Cardiology |
| Doctor | `doctor.patel@followcare.org` | Oncology |
| Nurse | `nurse.anita@followcare.org` | Cardiology, Oncology |
| Coordinator | `coord.rahul@followcare.org` | Cardiology, Oncology, Orthopedics |
| Health worker | `hw.priya@followcare.org` | General Medicine |

- **Staff sign-in:** <http://localhost:5173/login>
- **Patient portal:** <http://localhost:5173/portal/login>. Seeded patient phones run from `+919876543210` to `+919876543215`. Outside production the OTP request response includes a `debugCode`, and the patient login page shows it in a yellow "test mode" box.

> **Never** use the demo password, seed data, or the debug-OTP behavior in production. Use only synthetic data in screenshots, demos and issue reports.

### Using staff and patient at the same time

Staff and patient logins share one browser cookie on `localhost`, so signing in as one role signs the other out. To keep both open side by side, use two different browsers, or a normal window plus an incognito window.

## Try the main workflow (5 minutes)

1. Sign in as `doctor.sharma@followcare.org`. Open **Follow-up Plans → New Plan**, pick a patient, set a window, urgency and instructions, and save. A task is created for staff and a generic reminder is queued.
2. In a second browser, sign in to the patient portal with `+919876543210`. Open your follow-ups, acknowledge one, then use **Request Help** to report a travel barrier.
3. Back in staff, sign in as `coord.rahul@followcare.org`. Open **Task Board**: the "Patient reported barrier" task is there. Open it to see the priority score and the reasons behind it, log a contact attempt (a confirmation message appears), and move it between columns.
4. Open **Priority Queue** (coordinator/admin) to see the same work ranked by score.
5. Sign in as `admin@followcare.org` and open **Privacy & Audit** to see recorded access events.

To see failure handling with the default mock provider, a delivery fails for any phone number ending in `999` or containing `0000`. After three attempts the worker opens a "Reminder could not be delivered" task for staff.

### Optional Twilio demo provider (sends real messages)

The default remains `NOTIFY_PROVIDER=mock`. To opt into real delivery:

1. Use a Twilio trial/sandbox account and **only your own verified test number(s)**. Do not use patient contact data for a demo.
2. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and an SMS-capable `TWILIO_FROM_NUMBER` to the private `server/.env`; set `NOTIFY_PROVIDER=twilio`. For WhatsApp, configure `TWILIO_WHATSAPP_FROM` with the sender format Twilio assigned.
3. To receive delivery-status callbacks, expose the API through a public HTTPS URL and set `PUBLIC_API_URL` to that origin. Twilio will call `POST /api/webhooks/twilio/status`; callbacks are validated using `X-Twilio-Signature`. Without a public URL, the message can be accepted by Twilio but final delivery state will not be confirmed in FollowCare.
4. Restart both API and worker. Send a single synthetic reminder and verify the delivery record and callback before trying any broader demo.

The adapter sends a generic reminder message and does not include diagnoses, clinician names, departments, or patient names. Twilio acceptance is recorded as `sent`, not `delivered`; signed callbacks update the final status. The integration code is covered by mocked provider/signature tests, but this repository has **not** verified live Twilio credentials, sender approval, account/trial restrictions, callback reachability, billing, or carrier delivery. Keep mock mode for ordinary local development and CI.


## Why some pages are missing from your sidebar

The sidebar only shows pages your role is allowed to use:

| Page | Path | Shown to |
|---|---|---|
| Command Center | `/staff/overview` | Admin, doctor, nurse, coordinator, health worker |
| Patients | `/staff/patients` | Roles with patient-demographics permission |
| Follow-up Plans | `/staff/plans` | Roles that can create plans (clinicians, admin) |
| Task Board | `/staff/tasks` | Roles that work tasks |
| Appointments | `/staff/appointments` | Roles that can book appointments |
| Priority Queue | `/staff/priority` | **Admin and coordinator only** |
| Privacy & Audit | `/staff/privacy` | **Users with audit permission (admin in the seed data)** |

If you do not see Priority Queue or Privacy & Audit, sign in as a coordinator or admin respectively.

**Not built yet:** Reminders, Messages, Reports, Team and Settings pages, caregiver UI, document upload, offline queue, AI assists. The Appointments page lists appointments but has no create or reschedule control.

## Status: what is verified and what is not

Evidence standard: "verified" means observed in the running prototype, confirmed in database/terminal output, or reported by a completed test or build command. "Not verified" does not mean broken; it means no successful test has been recorded. This is not a security audit.

### Verified

- Staff login and Command Center; follow-up plan creation; Kanban board with persisted status changes; task details with priority score and reasons (observed example: score 40 = invalid contact +25, priority urgency +15). *(Manual walkthrough, 15 Oct 2026)*
- Patient portal login and follow-up display; a patient help request creating a staff "Patient reported barrier" task. *(Manual)*
- Contact attempts are saved, and after submission the UI shows a "Contact attempt logged…" message and closes the form. *(Database evidence earlier; success message observed manually in the latest build)*
- Audit rows recorded for login, patient views, plan creation/updates, task updates and contact attempts. *(Database query)*
- Worker connects to Redis; one quiet-hours deferral and one simulated SMS delivery (`delivered`) were observed through the mock provider. *(Worker logs and database)*
- Patient sessions get HTTP 401 on `/api/tasks/board` and `/api/patients`. *(Manual, two endpoints only)*
- Automated tests for single-identity sessions and patient-to-patient isolation (viewing another patient's follow-ups, acknowledging their plan, reporting a barrier against it) passed in a focused run: 5 passed, 23 skipped by the filter. *(Latest build)*
- Frontend production build completes. *(Latest build)*
- Last recorded full server-suite result: 37 passing tests across 4 files, on the prior baseline. The suite has since gained tests, and a full-suite run on the latest build has not yet been recorded. Run `npm test` to check your own checkout.

### Not verified or incomplete

- **Priority Queue and Privacy & Audit pages:** implemented and role-gated (above), but not located in the manual walkthrough, which most likely used a role that does not see them. Manual verification with a coordinator and an admin is pending.
- **Appointments:** the page opens but has no create/schedule control. Booking, rescheduling, cancellation and attendance are not implemented in the UI.
- **Failed-delivery retries and escalation, overdue sweep, no-show detection:** covered by automated job tests, but not yet exercised live through the worker.
- **Contact history and error states** in the contact-attempt UI.
- **Security:** only selected scenarios are tested. The full role/department permission matrix, other endpoints, audit-log immutability and hardening are untested.
- **Real notification providers** (not implemented), **reports/exports**, **caregiver UI**, **offline support**, **document upload**, **in-product AI assistance** (the tested prioritization uses explicit rule reasons, not a model).
- **Performance:** no load test against the case's roughly 900 outpatient visits per day.
- One transient "Authentication required" screen appeared once after returning to the staff dashboard; re-login fixed it. Treat it as an intermittent observation, not a reproduced defect.

## How it works

```
Browser (React + Vite)  ──/api──▶  Express API ──▶ PostgreSQL
 staff workspace / patient PWA          │            (sessions, data, audit)
                                        ▼
                                      Redis ◀── BullMQ worker ──▶ mock or optional Twilio SMS/WhatsApp provider
```

- **Auth:** server-side cookie sessions stored in Postgres. Each login (staff or patient) starts a fresh session holding exactly one identity. Patients sign in with a one-time code. Codes are random, expire after 5 minutes, allow 5 guesses, and the response is identical for registered and unregistered numbers. Login and OTP endpoints are rate-limited (Redis-backed).
- **Access control:** role permission AND department scope for staff; patients can only see their own records.
- **Privacy:** reminder text is generic (no diagnosis, doctor or department); phone numbers and names are encrypted at rest with `PHI_ENC_KEY`.
- **Priority:** administrative scoring from explicit weighted rules; every task stores the reasons so the UI can show why it ranks where it does. No clinical inference.
- **Plan vs appointment:** a follow-up recommendation is a separate state from a confirmed appointment.

Repository layout:

```
server/            Express API, migrations, seed, jobs, tests
  migrations/        001_enums.sql, 002_core.sql, 003_indexes_and_views.sql
  src/modules/       auth, plans, tasks, patients, appointments, dashboard, priority, patient-portal, ...
  src/jobs/          background job processors
  test/              Vitest suites + e2e-flow.mjs smoke script
web/               React app (staff workspace + patient portal)
packages/shared/   shared roles, permissions and schemas
ARCHITECTURE.md    full design (data model, workflows, security)
```

## Background jobs

Run with `npm run worker` (BullMQ + Redis).

| Job | Interval | What it does |
|---|---|---|
| `reminder.dispatch` | 1 min | Sends due generic reminders; honors opt-out, consent and quiet hours (defers rather than drops); retries a failed delivery up to 3 times with backoff, then opens a `resolve_failed_delivery` staff task and marks the contact suspect |
| `window.sweep` | 15 min | Plans past their window with no visit get a barrier-resolution task (never a "non-compliant" label) |
| `appointment.noshow` | 15 min | Marks stale scheduled appointments `missed` and opens a barrier task |

All jobs are idempotent: reruns do not create duplicate tasks.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | API and web together |
| `npm run worker` | Background jobs |
| `npm run migrate` | Apply SQL migrations |
| `npm run seed` | Add synthetic demo records |
| `npm test` | Server test suite (needs Postgres and Redis running and `server/.env` configured) |
| `npm run build` | Production build of the web app |
| `npm test -w web` | Browser-less UI smoke test across every route and role (needs the API running on :3001 with seeded data; present in checkouts that include `web/test/`) |
| `node server/test/e2e-flow.mjs` | Cross-role API smoke flow (API must be running) |

Server test files: `api.test.js` (auth, plans, tasks, dashboard, patient portal, session identity, patient isolation), `jobs.test.js` (reminder dispatch, retries and escalation, opt-out, quiet hours, overdue sweep, no-shows), `health.test.js`, `worker.test.js`. Rate limits are inactive when `NODE_ENV=test` so repeated runs do not trip them; set `RATE_LIMIT_IN_TEST=1` to exercise them.

## Environment variables

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://followcare:followcare@localhost:5432/followcare` | Postgres connection |
| `REDIS_URL` | `redis://localhost:6379` | Job queue and rate limiting |
| `SESSION_SECRET` | generate | Required; 64 hex chars recommended |
| `PHI_ENC_KEY` | generate | Required; exactly 64 hex characters; keep secret |
| `PORT` | `3001` | API port |
| `CLIENT_URL` | `http://localhost:5173` | CORS origin |
| `NOTIFY_PROVIDER` | `mock` | `mock` (default) or `twilio`; Twilio sends real messages if configured |
| `FAIL_RATE` | `0.0` | Random simulated failure rate for the mock provider |
| `CLINIC_TZ` | `Asia/Kolkata` | Time zone for quiet hours |
| `NODE_ENV` | `development` | Development mode exposes the OTP `debugCode`. Do not deploy like this |
| `TWILIO_ACCOUNT_SID` | provider console | Twilio account SID; secret/configuration, never commit credentials |
| `TWILIO_AUTH_TOKEN` | provider console | Twilio auth token; keep private |
| `TWILIO_FROM_NUMBER` | `+1...` | SMS-capable Twilio sender number |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+1...` | Approved WhatsApp sender/sandbox address, when using WhatsApp |
| `PUBLIC_API_URL` | `https://demo.example.com` | Public HTTPS API origin; required for signed delivery status callbacks, no trailing slash |

## API overview

JSON over cookie sessions under `/api`. Health probes: `GET /healthz`, `GET /readyz`.

| Area | Endpoints |
|---|---|
| Staff auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Patient auth | `POST /patient-auth/otp/request`, `POST /patient-auth/otp/verify` |
| Patients | `GET /patients`, `GET /patients/:id` |
| Plans | `POST /plans`, `GET /plans`, `GET /plans/:id`, `PATCH /plans/:id`, `POST /plans/:id/approve`, `POST /plans/:id/acknowledge` |
| Tasks | `GET /tasks`, `GET /tasks/board`, `PATCH /tasks/:id/status`, `POST /tasks/:id/assign`, `POST /tasks/:id/comments`, `POST /tasks/:id/contact-attempts` |
| Appointments | `GET /appointments`, `POST /appointments`, `PATCH /appointments/:id` |
| Dashboard | `GET /dashboard/metrics`, `/dashboard/workload`, `/dashboard/overdue` |
| Priority | `GET /priority-queue`, `GET /priority/rules` |
| Privacy | `GET /audit-logs` (staff), `GET /me/access-log` |
| Patient portal | `GET /me/follow-ups`, `GET /me/appointments`, `POST /me/follow-ups/:id/acknowledge`, `POST /me/barriers` |

Listing an endpoint here does not mean every permission branch has been tested.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm ERR! enoent … package.json` | You are not in the repository root. `cd` into the folder that contains the root `package.json`. |
| `createdb: database "followcare" already exists` | Fine. Skip `createdb`. If it holds tables from an earlier attempt and you do not need them, `dropdb followcare && createdb followcare`. |
| Migration or seed fails with a permission error | The existing schema belongs to a different role. Fix ownership/permissions, or use a fresh database name. Do not delete data as a shortcut. |
| `SESSION_SECRET` / `PHI_ENC_KEY` error at startup | `server/.env` is missing, or the keys are not set (`PHI_ENC_KEY` must be 64 hex characters). |
| Port 5432, 6379, 3001 or 5173 already in use | Stop the other process, or change the port in `server/.env` / `docker-compose.yml`. |
| Login returns 429 "Too many attempts" | Rate limit (10 logins per 15 min per IP and email; 5 OTP requests per 10 min per phone). Wait, or in development clear counters with `redis-cli --scan --pattern 'rl:*' \| xargs redis-cli del`. |
| Patient pages say "Forbidden: endpoint is restricted to patient portal sessions" | The browser still holds a staff session from before. Sign in again as the patient (this signs staff out), or use a separate browser/incognito window. |
| Server code changes do not take effect | Restart `npm run dev`; the API does not hot-reload. |
| Reminders never send | Check that `npm run worker` is running and Redis is up. |
| Nothing listed under Reminders, Reports, Team, Settings | These pages are not built (see above). |

If something fails and you cannot tell why, run `npm test` and `curl localhost:3001/healthz` and include the output when asking for help.

## Imported synthetic dataset explorer

The repository includes three synthetic CSV files under `server/data/`:
- `patients_followcare.csv`
- `followups.csv`
- `patient_risk.csv`

The dataset explorer imports a minimized copy into separate `imported_dataset_*` tables. It does not modify the live `patients`, `follow_up_plans`, or `tasks` tables. The importer excludes direct contact details, names, addresses, caregiver contact data, encounter IDs, and diagnosis-like free text from the imported copy.

From the repository root, with PostgreSQL configured and running:

```bash
npm run migrate
npm run import:dataset
npm run dev
```

Sign in as the seeded admin or coordinator account and open **Dataset Explorer** in the staff sidebar, or go to `http://localhost:5173/staff/dataset`.

The API exposes:
- `GET /api/dataset/summary`
- `GET /api/dataset/followups?limit=25`
- `GET /api/dataset/risk?limit=10`

The page displays follow-up statuses, overdue days, outreach attempts, priority labels, and the risk scores supplied by the dataset. The supplied risk score is exploratory only. It does not modify FollowCare's rule-based priority queue and is not a validated prediction or clinical decision. The imported dataset endpoints are available to admin and coordinator staff only.

Re-running `npm run import:dataset` refreshes only the imported dataset tables. It does not delete or replace application patients, plans, or tasks. Use only synthetic data.

## Safety and development notes

- Use only synthetic data in development and demos.
- The mock provider records simulated delivery and never contacts a patient. The optional Twilio provider can contact real numbers when explicitly configured; only use consented test recipients and never real patient data for demos.
- Do not describe the prototype as production-ready, clinically validated, or legally certified.
- FollowCare supports administrative workflow only. Ambiguous clinical information must go to a human reviewer.
- Before any real deployment: change all secrets and demo credentials, remove debug OTP behavior, set `NODE_ENV=production`, configure real consented messaging, complete a security and compliance review (including India's DPDP Act), and load-test against expected clinic volume.

# FollowCare

Hospital follow-up management (Google Classroom–style mechanics for healthcare). Design: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Run locally

```bash
docker compose up -d                  # Postgres 16 + Redis 7
cp server/.env.example server/.env    # then set SESSION_SECRET and PHI_ENC_KEY (64 hex chars each)
npm install
npm run migrate && npm run seed
npm run dev                           # API :3001 + web :5173
npm run worker                        # background jobs (reminders, overdue sweep, no-shows) in a 2nd terminal
npm test                              # server tests (needs Postgres + Redis)
```

## Demo logins (seeded, password `Password123!`)

| Role | Email |
|---|---|
| Admin | admin@followcare.org |
| Doctor | doctor.sharma@followcare.org |
| Nurse | nurse.anita@followcare.org |
| Coordinator | coord.rahul@followcare.org |
| Health worker | hw.priya@followcare.org |

Patient portal (`/portal/login`): phone `+919876543210`. Outside production the OTP request response includes `debugCode`, and the login page can use it. The mock SMS provider fails any number ending in `999` or containing `0000`, which exercises retry and escalation.

## Background jobs

| Job | Every | What it does |
|---|---|---|
| `reminder.dispatch` | 1 min | Sends due generic reminders; honors opt-out, consent and quiet hours; retries 3x, then opens a `resolve_failed_delivery` task |
| `window.sweep` | 15 min | Plans past their window with no visit get a `resolve_barrier` task |
| `appointment.noshow` | 15 min | Marks stale appointments `missed` and opens a barrier task |

Smoke-test the API across roles: `node server/test/e2e-flow.mjs` (API running).

## MVP scope

Done: schema, auth/RBAC, plans + versioning, tasks/Kanban, priority queue, Command Center, patient portal (home, follow-ups, appointments, help), reminders pipeline, audit log.
Not yet built (nav items in ARCHITECTURE.md §5/§10): Reminders, Messages, Reports, Team, Settings pages; caregiver UI; offline queue; document upload; AI assists.

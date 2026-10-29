# FollowCare Production Readiness Checklist

This checklist is a release gate, not a claim that the items are already complete. Mark each item only after it has been verified in the target environment.

## 1. Secrets and configuration

- [ ] Generate unique, high-entropy production values for `SESSION_SECRET` and `PHI_ENC_KEY`; never reuse CI or development values.
- [ ] Store secrets in the hosting platform's secret manager. Do not commit `.env` files, credentials, encryption keys, or real patient data.
- [ ] Verify `PHI_ENC_KEY` backup and rotation/recovery procedures before storing real patient information. Losing this key can make encrypted fields unrecoverable.
- [ ] Set `NODE_ENV=production`, a production `CLIENT_URL`, and an explicit `LOG_LEVEL`. Confirm `NOTIFY_PROVIDER` is intentional.
- [ ] Keep `FAIL_RATE` at its intended production value; the mock provider is not a real SMS, WhatsApp, or email integration.

## 2. Network and sessions

- [ ] Serve the application only over HTTPS and verify the `fc.sid` cookie is `HttpOnly`, `Secure`, and `SameSite=Lax` in production.
- [ ] If TLS terminates at a reverse proxy, configure Express to trust only the known proxy hop(s). Do not blindly trust arbitrary forwarded headers; client IP integrity affects rate limiting.
- [ ] Restrict CORS to the exact production frontend origin.
- [ ] Ensure PostgreSQL and Redis are private-network services, not publicly exposed. Require authentication/TLS where supported and apply least-privilege credentials.
- [ ] Confirm session invalidation works after logout and that session records expire/are cleaned up according to policy.

## 3. Database, migrations, and recovery

- [ ] Take a verified backup before production migrations and test restoring it into an isolated environment.
- [ ] Run migrations as a controlled release step; review migration locks, rollback/recovery steps, and compatibility with the deployed application version.
- [ ] Verify the database role used by the API has only the required privileges, including the intended append-only audit-log restrictions.
- [ ] Test recovery for database loss, Redis loss, and encryption-key loss. Redis failure should not disable auth rate limiting: auth endpoints now fail closed.
- [ ] Define and test backup retention, recovery-point objective, and recovery-time objective.

## 4. Patient privacy and auditability

- [ ] Use only synthetic records in CI and staging; do not copy production patient records into development environments.
- [ ] Verify department-level authorization and patient-to-patient isolation for every patient-facing endpoint.
- [ ] Confirm API error responses and application logs do not include patient details, credentials, OTPs, session cookies, or query-string values.
- [ ] Restrict audit-log access, monitor access to audit logs, and set a documented retention policy consistent with applicable law and hospital policy.
- [ ] Review data retention, correction/deletion workflows, consent records, patient access requests, and breach-response procedures with the hospital's privacy/legal lead.

## 5. Notifications and consent

- [ ] Confirm every outbound communication is routed through a single audited delivery service and requires current, affirmative consent for the relevant channel and purpose.
- [ ] Verify opt-outs, revoked consent, missing consent, quiet hours, cancelled plans, and invalid contact details suppress delivery.
- [ ] Keep message templates generic and free of diagnosis, department, clinician, or other unnecessary sensitive details.
- [ ] Before enabling a real provider, implement and test provider authentication, webhook signature verification, retry/idempotency behavior, delivery-status reconciliation, and provider-side opt-out handling.
- [ ] Verify that logs and delivery records store provider identifiers/status only, not message bodies or raw recipient contact details.

## 6. Operations and monitoring

- [ ] Confirm `/healthz` and `/readyz` are monitored without exposing internal diagnostics to the public internet.
- [ ] Alert on repeated authentication failures, rate-limit responses, audit-write failures, reminder suppression/failure spikes, queue delays, and database/Redis unavailability.
- [ ] Define an incident owner, escalation route, and runbooks for suspected account compromise, patient-data exposure, provider outage, and failed backups.
- [ ] Pin and review dependency updates, scan dependencies and container images, and run CI on every proposed change.
- [ ] Perform a security review and authorized penetration test before handling real patient data.

## Current implementation notes

- Staff sessions use a 15-minute idle timeout; patient sessions use a 10-minute idle timeout.
- Patient OTPs expire after five minutes, have a five-attempt verification cap, and are invalidated after successful use.
- Authentication rate limiting depends on Redis and fails closed if Redis is unavailable; other rate-limited routes retain their configured policy.
- Scheduled reminders are suppressed when reminder consent is absent, denied, revoked, or a notification suppression exists.
- The current notification provider is a mock implementation. Production delivery must not be enabled until a real provider integration and its security controls have been reviewed.
- CI passing proves the automated migration, backend-test, and frontend-build workflow passed; it does not prove production infrastructure, legal compliance, or disaster recovery readiness.

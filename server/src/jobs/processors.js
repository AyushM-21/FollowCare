/**
 * Background job processors (ARCHITECTURE.md §9.6).
 * All processors are idempotent: they select work with FOR UPDATE SKIP LOCKED and
 * de-duplicate generated tasks, so a retried or overlapping run is safe.
 */
import { pool } from '../config/db.js';
import { logger } from '../config/logger.js';
import { decrypt } from '../lib/crypto.js';
import { MockNotificationProvider } from '../modules/integrations/sms-provider/index.js';

export const MAX_DELIVERY_ATTEMPTS = 3;
const RETRY_BASE_MINUTES = 15;
const CLINIC_TZ = process.env.CLINIC_TZ || 'Asia/Kolkata';

const provider = new MockNotificationProvider();

// ── helpers ──────────────────────────────────────────────────────────────────

/** Minutes since local midnight in the clinic time zone. */
function localMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TZ, hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour').value) % 24;
  const m = Number(parts.find((p) => p.type === 'minute').value);
  return h * 60 + m;
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Returns minutes until quiet hours end, or 0 if not currently in quiet hours. */
export function minutesUntilQuietEnd(quiet, now = new Date()) {
  if (!quiet?.start || !quiet?.end) return 0;
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  const cur = localMinutes(now);
  const inQuiet = start > end ? cur >= start || cur < end : cur >= start && cur < end;
  if (!inQuiet) return 0;
  return cur < end ? end - cur : 24 * 60 - cur + end;
}

async function createTaskOnce(client, { planId, patientId, departmentId, type, title, score, reasons, dueAt }) {
  const dup = await client.query(
    `SELECT id FROM tasks WHERE plan_id IS NOT DISTINCT FROM $1 AND patient_id = $2
       AND type = $3 AND status <> 'completed' LIMIT 1`,
    [planId, patientId, type]
  );
  if (dup.rowCount > 0) return null;
  const res = await client.query(
    `INSERT INTO tasks (plan_id, patient_id, department_id, type, title, status,
                        priority_score, priority_reasons, due_at, source)
     VALUES ($1, $2, $3, $4, $5, 'todo', $6, $7, $8, 'system') RETURNING id`,
    [planId, patientId, departmentId, type, title, score, JSON.stringify(reasons), dueAt || null]
  );
  return res.rows[0].id;
}

// ── scheduling (called from plan creation / approval) ────────────────────────

/**
 * Queue generic, PHI-free reminders for an active plan: one at window start,
 * one two days before the window closes (if still in the future).
 */
export async function scheduleRemindersForPlan(client, { planId, patientId, windowStart, windowEnd }) {
  const tpl = await client.query(
    `SELECT id FROM message_templates WHERE key = 'window_reminder' AND approved LIMIT 1`
  );
  const templateId = tpl.rows[0]?.id || null;
  const start = new Date(windowStart);
  start.setUTCHours(4, 0, 0, 0); // ≈ 09:30 IST; quiet hours still enforced at dispatch
  const end = new Date(windowEnd);
  end.setUTCDate(end.getUTCDate() - 2);
  end.setUTCHours(4, 0, 0, 0);

  const times = [start];
  if (end > start) times.push(end);
  const now = Date.now();
  for (const t of times) {
    await client.query(
      `INSERT INTO reminders (plan_id, patient_id, recipient_type, recipient_id, template_id, scheduled_for, status)
       VALUES ($1, $2, 'patient', $2, $3, $4, 'queued')`,
      [planId, patientId, templateId, new Date(Math.max(t.getTime(), now))]
    );
  }
  return times.length;
}

// ── reminder.dispatch ────────────────────────────────────────────────────────

export async function dispatchDueReminders({ limit = 50 } = {}) {
  const stats = { sent: 0, suppressed: 0, deferred: 0, retried: 0, escalated: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const due = await client.query(
      `SELECT r.id, r.plan_id, r.patient_id, r.template_id,
              p.primary_phone_enc, p.preferred_channel, p.preferred_language, p.quiet_hours, p.assigned_department_id,
              fup.department_id, fup.status AS plan_status
         FROM reminders r
         JOIN patients p ON p.id = r.patient_id
         JOIN follow_up_plans fup ON fup.id = r.plan_id
        WHERE r.status = 'queued' AND r.scheduled_for <= NOW()
        ORDER BY r.scheduled_for
        LIMIT $1
        FOR NO KEY UPDATE OF r SKIP LOCKED`,
      [limit]
    );

    for (const r of due.rows) {
      // Opt-out / consent: suppress rather than send (ARCHITECTURE.md §9.8)
      const blocked = await client.query(
        `SELECT 1 FROM notification_suppressions WHERE patient_id = $1
         UNION ALL
         SELECT 1 FROM patient_consents WHERE patient_id = $1 AND consent_type = 'reminders' AND granted = FALSE`,
        [r.patient_id]
      );
      if (blocked.rowCount > 0 || ['cancelled', 'completed', 'superseded'].includes(r.plan_status)) {
        await client.query(`UPDATE reminders SET status = 'suppressed' WHERE id = $1`, [r.id]);
        stats.suppressed++;
        continue;
      }

      // Quiet hours: defer, never drop
      const wait = minutesUntilQuietEnd(r.quiet_hours);
      if (wait > 0) {
        await client.query(
          `UPDATE reminders SET scheduled_for = NOW() + ($2 || ' minutes')::interval WHERE id = $1`,
          [r.id, String(wait)]
        );
        stats.deferred++;
        continue;
      }

      const channel = ['sms', 'whatsapp', 'email', 'in_app'].includes(r.preferred_channel) ? r.preferred_channel : 'sms';
      const result = await provider.send({
        reminderId: r.id,
        to: decrypt(r.primary_phone_enc),
        channel,
        templateKey: 'window_reminder', // generic text only: no diagnosis, doctor or department
        language: r.preferred_language || 'en'
      });

      if (result.status === 'delivered') {
        await client.query(`UPDATE reminders SET status = 'delivered' WHERE id = $1`, [r.id]);
        stats.sent++;
        continue;
      }

      // Failure: bounded retries with backoff, then escalate to a staff task
      const attempts = (await client.query(
        `SELECT COUNT(*)::int AS n FROM reminder_deliveries WHERE reminder_id = $1`, [r.id]
      )).rows[0].n;

      if (attempts < MAX_DELIVERY_ATTEMPTS) {
        await client.query(
          `UPDATE reminders SET scheduled_for = NOW() + ($2 || ' minutes')::interval WHERE id = $1`,
          [r.id, String(RETRY_BASE_MINUTES * attempts)]
        );
        stats.retried++;
        continue;
      }

      await client.query(`UPDATE reminders SET status = 'failed' WHERE id = $1`, [r.id]);
      await client.query(
        `UPDATE patient_contacts SET valid = FALSE, last_failure_at = NOW()
          WHERE patient_id = $1 AND type = $2`,
        [r.patient_id, channel]
      );
      await createTaskOnce(client, {
        planId: r.plan_id,
        patientId: r.patient_id,
        departmentId: r.department_id,
        type: 'resolve_failed_delivery',
        title: 'Reminder could not be delivered: verify contact details',
        score: 25,
        reasons: [{ rule: 'failed_delivery', points: 25 }]
      });
      stats.escalated++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err: err.message }, 'reminder.dispatch failed');
    throw err;
  } finally {
    client.release();
  }
  if (Object.values(stats).some(Boolean)) logger.info(stats, 'reminder.dispatch complete');
  return stats;
}

// ── window.sweep ─────────────────────────────────────────────────────────────

/** Active plans past their window with no attended visit get a barrier task (never a "non-compliant" flag). */
export async function sweepOverdueWindows() {
  const client = await pool.connect();
  let created = 0;
  try {
    await client.query('BEGIN');
    const overdue = await client.query(
      `SELECT fup.id, fup.patient_id, fup.department_id, fup.window_end, fup.urgency,
              (CURRENT_DATE - fup.window_end::date) AS days_overdue
         FROM follow_up_plans fup
        WHERE fup.status = 'active' AND fup.window_end::date < CURRENT_DATE
          AND NOT EXISTS (SELECT 1 FROM appointments a
                           WHERE a.plan_id = fup.id AND a.status IN ('attended', 'checked_in'))
        FOR NO KEY UPDATE OF fup SKIP LOCKED`
    );
    for (const p of overdue.rows) {
      const days = Number(p.days_overdue);
      const reasons = [{ rule: 'overdue_window', points: 40 + Math.min(days, 30) * 2 }];
      if (p.urgency === 'urgent') reasons.push({ rule: 'urgency_urgent', points: 30 });
      else if (p.urgency === 'priority') reasons.push({ rule: 'urgency_priority', points: 15 });
      const id = await createTaskOnce(client, {
        planId: p.id, patientId: p.patient_id, departmentId: p.department_id,
        type: 'resolve_barrier',
        title: 'Follow-up window passed: find out what got in the way',
        score: reasons.reduce((s, r) => s + r.points, 0),
        reasons
      });
      if (id) created++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err: err.message }, 'window.sweep failed');
    throw err;
  } finally {
    client.release();
  }
  if (created) logger.info({ created }, 'window.sweep created barrier tasks');
  return { created };
}

// ── appointment.noshow ───────────────────────────────────────────────────────

export async function markNoShows() {
  const client = await pool.connect();
  let marked = 0;
  try {
    await client.query('BEGIN');
    const rows = await client.query(
      `UPDATE appointments SET status = 'missed', updated_at = NOW()
        WHERE status IN ('scheduled', 'confirmed') AND scheduled_at < NOW() - INTERVAL '2 hours'
        RETURNING id, plan_id, patient_id, department_id`
    );
    for (const a of rows.rows) {
      marked++;
      await createTaskOnce(client, {
        planId: a.plan_id, patientId: a.patient_id, departmentId: a.department_id,
        type: 'resolve_barrier',
        title: 'Missed appointment: offer rebooking and ask about barriers',
        score: 40,
        reasons: [{ rule: 'missed_appointment', points: 40 }]
      });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err: err.message }, 'appointment.noshow failed');
    throw err;
  } finally {
    client.release();
  }
  if (marked) logger.info({ marked }, 'appointment.noshow marked missed');
  return { marked };
}

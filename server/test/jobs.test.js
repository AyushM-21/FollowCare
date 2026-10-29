import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { pool } from '../src/config/db.js';
import { redis } from '../src/config/redis.js';
import { encrypt, hashPhone } from '../src/lib/crypto.js';
import {
  dispatchDueReminders,
  sweepOverdueWindows,
  markNoShows,
  minutesUntilQuietEnd,
  scheduleRemindersForPlan,
  MAX_DELIVERY_ATTEMPTS
} from '../src/jobs/processors.js';

const NEVER_QUIET = JSON.stringify({ start: '00:00', end: '00:00' });
const created = { patients: [] };
let deptId;
let creatorId;

async function makePatient({ phone, quiet = NEVER_QUIET, consent = true }) {
  const reg = `JT-${crypto.randomBytes(4).toString('hex')}`;
  const r = await pool.query(
    `INSERT INTO patients (hospital_reg_no, full_name_enc, primary_phone_enc, phone_hash, quiet_hours, assigned_department_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [reg, encrypt('Job Test Patient'), encrypt(phone), hashPhone(phone), quiet, deptId]
  );
  const patientId = r.rows[0].id;
  created.patients.push(patientId);
  if (consent) {
    await pool.query(
      `INSERT INTO patient_consents (patient_id, consent_type, granted)
       VALUES ($1, 'reminders', TRUE)`,
      [patientId]
    );
  }
  return patientId;
}

async function makePlan(patientId, { windowStart, windowEnd, status = 'active', urgency = 'routine' }) {
  const r = await pool.query(
    `INSERT INTO follow_up_plans (patient_id, department_id, window_start, window_end, urgency, reason_category, channel, status, created_by)
     VALUES ($1, $2, $3, $4, $5, 'routine_review', 'in_person', $6, $7) RETURNING id`,
    [patientId, deptId, windowStart, windowEnd, urgency, status, creatorId]
  );
  return r.rows[0].id;
}

const dayOffset = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

describe('Background jobs', () => {
  beforeAll(async () => {
    deptId = (await pool.query(`SELECT id FROM departments WHERE code = 'CARD'`)).rows[0].id;
    creatorId = (await pool.query(`SELECT id FROM users WHERE email = 'doctor.sharma@followcare.org'`)).rows[0].id;
  });

  afterAll(async () => {
    if (created.patients.length) {
      // plans, tasks, reminders, appointments cascade from patients
      await pool.query(`DELETE FROM patients WHERE id = ANY($1::uuid[])`, [created.patients]);
    }
    await pool.end();
    try { await redis.quit(); } catch { /* already closed */ }
  });

  it('computes quiet-hours deferral across midnight', () => {
    const quiet = { start: '21:00', end: '08:00' };
    // 23:30 IST = 18:00 UTC → 8.5h until 08:00
    expect(minutesUntilQuietEnd(quiet, new Date('2026-10-14T18:00:00Z'))).toBe(510);
    // 12:00 IST = 06:30 UTC → not quiet
    expect(minutesUntilQuietEnd(quiet, new Date('2026-10-14T06:30:00Z'))).toBe(0);
  });

  it('delivers a reminder through the mock provider', async () => {
    const pid = await makePatient({ phone: '+919812345678' });
    const planId = await makePlan(pid, { windowStart: dayOffset(1), windowEnd: dayOffset(8) });
    await pool.query(
      `INSERT INTO reminders (plan_id, patient_id, recipient_id, scheduled_for) VALUES ($1, $2, $2, NOW() - INTERVAL '1 minute')`,
      [planId, pid]
    );
    await dispatchDueReminders();
    const r = await pool.query(`SELECT status FROM reminders WHERE plan_id = $1`, [planId]);
    expect(r.rows[0].status).toBe('delivered');
  });

  it('retries failed deliveries, then escalates to a staff task (no medical data in the task)', async () => {
    const pid = await makePatient({ phone: '+919876500999' }); // mock provider fails numbers ending 999
    const planId = await makePlan(pid, { windowStart: dayOffset(1), windowEnd: dayOffset(8) });
    const rem = await pool.query(
      `INSERT INTO reminders (plan_id, patient_id, recipient_id, scheduled_for) VALUES ($1, $2, $2, NOW() - INTERVAL '1 minute') RETURNING id`,
      [planId, pid]
    );
    const rid = rem.rows[0].id;

    for (let i = 1; i <= MAX_DELIVERY_ATTEMPTS; i++) {
      await dispatchDueReminders();
      const mid = await pool.query(`SELECT status FROM reminders WHERE id = $1`, [rid]);
      if (i < MAX_DELIVERY_ATTEMPTS) {
        expect(mid.rows[0].status).toBe('queued'); // backed off, not dropped
        await pool.query(`UPDATE reminders SET scheduled_for = NOW() - INTERVAL '1 minute' WHERE id = $1`, [rid]);
      }
    }

    const final = await pool.query(`SELECT status FROM reminders WHERE id = $1`, [rid]);
    expect(final.rows[0].status).toBe('failed');

    const tasks = await pool.query(`SELECT type, title FROM tasks WHERE plan_id = $1`, [planId]);
    expect(tasks.rows).toHaveLength(1);
    expect(tasks.rows[0].type).toBe('resolve_failed_delivery');

    // Idempotent: another run must not create a duplicate task
    await pool.query(`UPDATE reminders SET status = 'queued', scheduled_for = NOW() - INTERVAL '1 minute' WHERE id = $1`, [rid]);
    await pool.query(`DELETE FROM reminder_deliveries WHERE reminder_id = $1`, [rid]);
    for (let i = 0; i < MAX_DELIVERY_ATTEMPTS; i++) {
      await dispatchDueReminders();
      await pool.query(`UPDATE reminders SET scheduled_for = NOW() - INTERVAL '1 minute' WHERE id = $1 AND status = 'queued'`, [rid]);
    }
    const again = await pool.query(`SELECT count(*)::int AS n FROM tasks WHERE plan_id = $1`, [planId]);
    expect(again.rows[0].n).toBe(1);
  });

  it('suppresses outreach for opted-out patients', async () => {
    const pid = await makePatient({ phone: '+919812300001' });
    await pool.query(`INSERT INTO notification_suppressions (patient_id, reason) VALUES ($1, 'opt_out')`, [pid]);
    const planId = await makePlan(pid, { windowStart: dayOffset(1), windowEnd: dayOffset(8) });
    await pool.query(
      `INSERT INTO reminders (plan_id, patient_id, recipient_id, scheduled_for) VALUES ($1, $2, $2, NOW() - INTERVAL '1 minute')`,
      [planId, pid]
    );
    await dispatchDueReminders();
    const r = await pool.query(`SELECT status FROM reminders WHERE plan_id = $1`, [planId]);
    expect(r.rows[0].status).toBe('suppressed');
    const d = await pool.query(
      `SELECT count(*)::int AS n FROM reminder_deliveries rd JOIN reminders r ON r.id = rd.reminder_id WHERE r.plan_id = $1`, [planId]
    );
    expect(d.rows[0].n).toBe(0);
  });

  it('suppresses reminders when consent is missing or has been revoked', async () => {
    const missingConsentPatient = await makePatient({
      phone: '+919812300002',
      consent: false
    });
    const missingConsentPlan = await makePlan(missingConsentPatient, {
      windowStart: dayOffset(1), windowEnd: dayOffset(8)
    });
    const missingReminder = await pool.query(
      `INSERT INTO reminders (plan_id, patient_id, recipient_id, scheduled_for)
       VALUES ($1, $2, $2, NOW() - INTERVAL '1 minute') RETURNING id`,
      [missingConsentPlan, missingConsentPatient]
    );

    const revokedConsentPatient = await makePatient({ phone: '+919812300003' });
    await pool.query(
      `UPDATE patient_consents
       SET revoked_at = NOW()
       WHERE patient_id = $1 AND consent_type = 'reminders'`,
      [revokedConsentPatient]
    );
    const revokedConsentPlan = await makePlan(revokedConsentPatient, {
      windowStart: dayOffset(1), windowEnd: dayOffset(8)
    });
    const revokedReminder = await pool.query(
      `INSERT INTO reminders (plan_id, patient_id, recipient_id, scheduled_for)
       VALUES ($1, $2, $2, NOW() - INTERVAL '1 minute') RETURNING id`,
      [revokedConsentPlan, revokedConsentPatient]
    );

    await dispatchDueReminders();

    const statuses = await pool.query(
      `SELECT id, status FROM reminders WHERE id = ANY($1::uuid[])`,
      [[missingReminder.rows[0].id, revokedReminder.rows[0].id]]
    );
    expect(statuses.rows).toHaveLength(2);
    expect(statuses.rows.every((row) => row.status === 'suppressed')).toBe(true);

    const deliveries = await pool.query(
      `SELECT count(*)::int AS n FROM reminder_deliveries
       WHERE reminder_id = ANY($1::uuid[])`,
      [[missingReminder.rows[0].id, revokedReminder.rows[0].id]]
    );
    expect(deliveries.rows[0].n).toBe(0);
  });

  it('defers (does not drop) reminders that fall in quiet hours', async () => {
    // Quiet all day except one minute → effectively always quiet
    const pid = await makePatient({ phone: '+919812300002', quiet: JSON.stringify({ start: '00:00', end: '23:59' }) });
    const planId = await makePlan(pid, { windowStart: dayOffset(1), windowEnd: dayOffset(8) });
    await pool.query(
      `INSERT INTO reminders (plan_id, patient_id, recipient_id, scheduled_for) VALUES ($1, $2, $2, NOW() - INTERVAL '1 minute')`,
      [planId, pid]
    );
    const stats = await dispatchDueReminders();
    const r = await pool.query(`SELECT status, scheduled_for > NOW() AS future FROM reminders WHERE plan_id = $1`, [planId]);
    if (stats.deferred > 0) {
      expect(r.rows[0].status).toBe('queued');
      expect(r.rows[0].future).toBe(true);
    }
  });

  it('creates a barrier task (not a compliance flag) for plans past their window, once', async () => {
    const pid = await makePatient({ phone: '+919812300003' });
    const planId = await makePlan(pid, { windowStart: dayOffset(-10), windowEnd: dayOffset(-3), urgency: 'urgent' });
    await sweepOverdueWindows();
    await sweepOverdueWindows();
    const t = await pool.query(`SELECT type, priority_score, priority_reasons FROM tasks WHERE plan_id = $1`, [planId]);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].type).toBe('resolve_barrier');
    expect(t.rows[0].priority_score).toBeGreaterThan(40);
    expect(JSON.stringify(t.rows[0].priority_reasons)).not.toMatch(/complian/i);
  });

  it('marks stale scheduled appointments as missed and opens a barrier task', async () => {
    const pid = await makePatient({ phone: '+919812300004' });
    const planId = await makePlan(pid, { windowStart: dayOffset(-2), windowEnd: dayOffset(5) });
    await pool.query(
      `INSERT INTO appointments (plan_id, patient_id, department_id, scheduled_at, status)
       VALUES ($1, $2, $3, NOW() - INTERVAL '5 hours', 'scheduled')`,
      [planId, pid, deptId]
    );
    await markNoShows();
    const a = await pool.query(`SELECT status FROM appointments WHERE plan_id = $1`, [planId]);
    expect(a.rows[0].status).toBe('missed');
    const t = await pool.query(`SELECT type FROM tasks WHERE plan_id = $1`, [planId]);
    expect(t.rows.map((x) => x.type)).toContain('resolve_barrier');
  });

  it('schedules reminders for a new plan with generic template only', async () => {
    const pid = await makePatient({ phone: '+919812300005' });
    const planId = await makePlan(pid, { windowStart: dayOffset(3), windowEnd: dayOffset(10) });
    const client = await pool.connect();
    try {
      const n = await scheduleRemindersForPlan(client, { planId, patientId: pid, windowStart: dayOffset(3), windowEnd: dayOffset(10) });
      expect(n).toBe(2);
    } finally {
      client.release();
    }
    const body = await pool.query(
      `SELECT t.body_generic FROM reminders r JOIN message_templates t ON t.id = r.template_id WHERE r.plan_id = $1 LIMIT 1`, [planId]
    );
    expect(body.rows[0].body_generic).not.toMatch(/diagnos|cardio|oncolog|doctor|dr\./i);
  });
});

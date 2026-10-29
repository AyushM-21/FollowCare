import { Router } from 'express';
import { pool } from '../../config/db.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

export const datasetRouter = Router();

// Dataset explorer is available only to staff roles. The imported dataset is synthetic
// and intentionally kept separate from live follow-up plans, patients, and task scoring.
datasetRouter.use(authenticate, requireRole('admin', 'coordinator'));

datasetRouter.get('/dataset/summary', async (_req, res, next) => {
  try {
    const [patients, followups, risks, statuses, levels] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM imported_dataset_patients'),
      pool.query('SELECT COUNT(*)::int AS count FROM imported_dataset_followups'),
      pool.query('SELECT COUNT(*)::int AS count FROM imported_dataset_risk'),
      pool.query(`
        SELECT data->>'followup_status' AS status, COUNT(*)::int AS count
        FROM imported_dataset_followups
        GROUP BY data->>'followup_status'
        ORDER BY count DESC
      `),
      pool.query(`
        SELECT data->>'risk_level' AS level, COUNT(*)::int AS count
        FROM imported_dataset_risk
        GROUP BY data->>'risk_level'
        ORDER BY count DESC
      `)
    ]);

    res.json({
      summary: {
        patients: patients.rows[0].count,
        followups: followups.rows[0].count,
        riskSamples: risks.rows[0].count,
        followupStatuses: statuses.rows,
        riskLevels: levels.rows
      },
      source: 'synthetic_dataset',
      note: 'Dataset risk scores are source values for exploration only. They do not affect the live FollowCare priority queue.'
    });
  } catch (error) {
    next(error);
  }
});

datasetRouter.get('/dataset/followups', async (req, res, next) => {
  try {
    const rawLimit = Number.parseInt(String(req.query.limit || '20'), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;
    const params = [];
    let where = '';

    if (typeof req.query.status === 'string' && req.query.status.trim()) {
      params.push(req.query.status.trim());
      where = `WHERE data->>'followup_status' = $1`;
    }

    params.push(limit);
    const result = await pool.query(
      `SELECT followup_id, data
       FROM imported_dataset_followups
       ${where}
       ORDER BY
         CASE data->>'priority' WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
         COALESCE(NULLIF(data->>'days_overdue', '')::int, 0) DESC,
         data->>'followup_due_date' ASC
       LIMIT $${params.length}`,
      params
    );

    res.json({
      followups: result.rows.map(row => ({
        reference: `FC-DATA-${row.followup_id.slice(0, 8).toUpperCase()}`,
        type: row.data.followup_type,
        dueDate: row.data.followup_due_date,
        completedDate: row.data.followup_completed_date,
        status: row.data.followup_status,
        daysOverdue: row.data.days_overdue,
        outreachAttempts: row.data.outreach_attempts,
        lastChannel: row.data.last_outreach_channel,
        priority: row.data.priority
      }))
    });
  } catch (error) {
    next(error);
  }
});

datasetRouter.get('/dataset/risk', async (req, res, next) => {
  try {
    const rawLimit = Number.parseInt(String(req.query.limit || '10'), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 10;
    const result = await pool.query(
      `SELECT patient_id, data
       FROM imported_dataset_risk
       ORDER BY COALESCE(NULLIF(data->>'risk_score', '')::numeric, 0) DESC,
                COALESCE(NULLIF(data->>'missed_followups_last_12m', '')::int, 0) DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      risks: result.rows.map(row => ({
        reference: `FC-RISK-${row.patient_id.slice(0, 8).toUpperCase()}`,
        ageYears: row.data.age_years,
        missedFollowupsLast12Months: row.data.missed_followups_last_12m,
        sourceRiskScore: row.data.risk_score,
        sourceRiskLevel: row.data.risk_level
      })),
      note: 'These are scores supplied by the synthetic dataset, not a validated FollowCare prediction.'
    });
  } catch (error) {
    next(error);
  }
});

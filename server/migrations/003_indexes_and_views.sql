-- 003_indexes_and_views.sql: Indexes, computed status view, and Row-Level Security

-- ============================================================================
-- 1. Performance Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_plans_dept_status_window 
  ON follow_up_plans (department_id, status, window_end);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status 
  ON tasks (assignee_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_dept_priority 
  ON tasks (department_id, priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_reminders_sched_status 
  ON reminders (scheduled_for, status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_patient_created 
  ON audit_logs (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patients_phone_hash 
  ON patients (phone_hash);

CREATE INDEX IF NOT EXISTS idx_patients_hospital_reg_no 
  ON patients (hospital_reg_no);

-- ============================================================================
-- 2. Computed Follow-up Status View (v_follow_up_status)
-- ============================================================================

CREATE OR REPLACE VIEW v_follow_up_status AS
WITH latest_appointment AS (
  SELECT DISTINCT ON (plan_id)
    plan_id,
    id AS appointment_id,
    status AS appointment_status,
    scheduled_at
  FROM appointments
  WHERE plan_id IS NOT NULL
  ORDER BY plan_id, scheduled_at DESC
),
latest_task AS (
  SELECT DISTINCT ON (plan_id)
    plan_id,
    id AS task_id,
    status AS task_status,
    type AS task_type,
    priority_score,
    assignee_id
  FROM tasks
  WHERE plan_id IS NOT NULL
  ORDER BY plan_id, priority_score DESC, created_at DESC
),
latest_contact AS (
  SELECT DISTINCT ON (t.plan_id)
    t.plan_id,
    ca.outcome AS contact_outcome,
    ca.attempted_at
  FROM contact_attempts ca
  JOIN tasks t ON ca.task_id = t.id
  WHERE t.plan_id IS NOT NULL
  ORDER BY t.plan_id, ca.attempted_at DESC
)
SELECT
  p.id AS plan_id,
  p.patient_id,
  p.department_id,
  p.urgency,
  p.channel,
  p.window_start,
  p.window_end,
  p.status AS plan_status,
  p.ack_status,
  p.owner_task_assignee,
  p.created_at AS plan_created_at,
  o.id AS outcome_id,
  o.final_status AS outcome_status,
  o.barrier_type,
  la.appointment_id,
  la.appointment_status,
  la.scheduled_at AS appointment_time,
  lt.task_id,
  lt.task_status,
  lt.priority_score,
  lt.assignee_id AS task_assignee_id,
  lc.contact_outcome,
  -- Computed follow-up status (Single source of truth)
  CASE
    WHEN o.final_status IN ('attended', 'visited_elsewhere') 
         OR la.appointment_status = 'attended' THEN 'returned'
    WHEN o.final_status = 'unreachable_unresolved' 
         OR lc.contact_outcome = 'invalid_contact' THEN 'unreachable'
    WHEN la.appointment_status IN ('scheduled', 'confirmed', 'checked_in') 
         AND o.id IS NULL THEN 'confirmed'
    WHEN CURRENT_DATE > p.window_end 
         AND o.id IS NULL THEN 'overdue'
    WHEN CURRENT_DATE = p.window_end 
         AND o.id IS NULL THEN 'due_today'
    WHEN CURRENT_DATE >= (p.window_end - INTERVAL '7 days') 
         AND CURRENT_DATE < p.window_end 
         AND o.id IS NULL THEN 'due_soon'
    WHEN CURRENT_DATE < p.window_start THEN 'upcoming'
    ELSE 'awaiting_action'
  END AS computed_status,
  -- Days until window end (negative if overdue)
  (p.window_end - CURRENT_DATE) AS days_remaining
FROM follow_up_plans p
LEFT JOIN follow_up_outcomes o ON p.id = o.plan_id
LEFT JOIN latest_appointment la ON p.id = la.plan_id
LEFT JOIN latest_task lt ON p.id = lt.plan_id
LEFT JOIN latest_contact lc ON p.id = lc.plan_id
WHERE p.deleted_at IS NULL;

-- ============================================================================
-- 3. Row-Level Security (RLS)
-- ============================================================================

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Patients RLS Policy
DROP POLICY IF EXISTS patients_access_policy ON patients;
CREATE POLICY patients_access_policy ON patients
  FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR current_setting('app.role', true) = 'admin'
    OR assigned_department_id IS NULL
    OR current_setting('app.department_ids', true) IS NULL
    OR assigned_department_id::text = ANY(string_to_array(nullif(current_setting('app.department_ids', true), ''), ','))
  );

-- Follow-up Plans RLS Policy
DROP POLICY IF EXISTS plans_access_policy ON follow_up_plans;
CREATE POLICY plans_access_policy ON follow_up_plans
  FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR current_setting('app.role', true) = 'admin'
    OR current_setting('app.department_ids', true) IS NULL
    OR department_id::text = ANY(string_to_array(nullif(current_setting('app.department_ids', true), ''), ','))
  );

-- Tasks RLS Policy
DROP POLICY IF EXISTS tasks_access_policy ON tasks;
CREATE POLICY tasks_access_policy ON tasks
  FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR current_setting('app.role', true) = 'admin'
    OR current_setting('app.department_ids', true) IS NULL
    OR department_id::text = ANY(string_to_array(nullif(current_setting('app.department_ids', true), ''), ','))
  );

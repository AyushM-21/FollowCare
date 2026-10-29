-- Audit records are immutable. Hard-deleting referenced actors, patients, or departments
-- must not silently rewrite historical audit entries via ON DELETE SET NULL.
ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey,
  DROP CONSTRAINT IF EXISTS audit_logs_patient_id_fkey,
  DROP CONSTRAINT IF EXISTS audit_logs_department_id_fkey;

ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT audit_logs_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
  ADD CONSTRAINT audit_logs_department_id_fkey
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: UPDATE and DELETE are prohibited'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_prevent_mutation ON audit_logs;

CREATE TRIGGER audit_logs_prevent_mutation
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();

-- Also prevent accidental grants to PUBLIC. The trigger remains the primary
-- guard because the application connection may own the table.
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;

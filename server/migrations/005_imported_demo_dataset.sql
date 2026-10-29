-- Imported synthetic dataset is kept separate from live application records.
CREATE TABLE IF NOT EXISTS imported_dataset_patients (
  patient_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS imported_dataset_risk (
  patient_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS imported_dataset_followups (
  followup_id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  data JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_imported_followups_patient ON imported_dataset_followups(patient_id);
CREATE INDEX IF NOT EXISTS idx_imported_followups_status ON imported_dataset_followups ((data->>'followup_status'));
CREATE INDEX IF NOT EXISTS idx_imported_followups_due ON imported_dataset_followups ((data->>'followup_due_date'));
CREATE INDEX IF NOT EXISTS idx_imported_risk_level ON imported_dataset_risk ((data->>'risk_level'));

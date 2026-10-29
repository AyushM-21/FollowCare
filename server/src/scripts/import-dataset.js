import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../../data');

function parseCsv(source) {
  const input = source.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error('CSV has an unterminated quoted field.');
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    if (row.some(value => value.trim() !== '')) rows.push(row);
  }
  if (rows.length < 2) throw new Error('CSV must contain a header and at least one data row.');

  const headers = rows[0].map((value, index) => index === 0 ? value.trim() : value.trim());
  return rows.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(`CSV row ${rowIndex + 2} has ${values.length} fields, expected ${headers.length}.`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, coerce(values[index])]));
  });
}

function coerce(value) {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.toLowerCase() === 'true') return true;
  if (trimmed.toLowerCase() === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function readRows(filename) {
  const fullPath = path.join(dataDir, filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing ${fullPath}. Add the CSV to server/data/ and run this command again.`);
  }
  return parseCsv(fs.readFileSync(fullPath, 'utf8'));
}

function pickPatient(row) {
  // Deliberately omit names, birth dates, phone numbers, email, addresses,
  // and caregiver contact details. The demo explorer only needs aggregate context.
  return {
    age_years: row.age_years,
    preferred_language: row.preferred_language,
    preferred_contact_method: row.preferred_contact_method,
    city_tier: row.city_tier,
    is_deceased: row.is_deceased,
    qa_flag: row.qa_flag
  };
}

function pickFollowup(row) {
  // Keep this administrative demo subset. Diagnosis-like free text and encounter IDs
  // are not needed for the dataset explorer and are not imported.
  return {
    followup_type: row.followup_type,
    followup_due_date: row.followup_due_date,
    followup_completed_date: row.followup_completed_date,
    followup_status: row.followup_status,
    days_overdue: row.days_overdue,
    outreach_attempts: row.outreach_attempts,
    last_outreach_channel: row.last_outreach_channel,
    priority: row.priority
  };
}

function pickRisk(row) {
  // Keep only the supplied follow-up indicators. These scores are displayed as
  // source dataset values and are not used to rank live application tasks.
  return {
    age_years: row.age_years,
    missed_followups_last_12m: row.missed_followups_last_12m,
    risk_score: row.risk_score,
    risk_level: row.risk_level
  };
}

async function upsertRows(client, table, keyColumn, rows) {
  const batchSize = 200;
  let count = 0;

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values = [];
    const tuples = batch.map((item, index) => {
      const offset = index * 2;
      values.push(item.id, JSON.stringify(item.data));
      return `($${offset + 1}, $${offset + 2}::jsonb)`;
    });

    await client.query(
      `INSERT INTO ${table} (${keyColumn}, data) VALUES ${tuples.join(', ')}
       ON CONFLICT (${keyColumn}) DO UPDATE
       SET data = EXCLUDED.data, imported_at = CURRENT_TIMESTAMP`,
      values
    );
    count += batch.length;
  }

  return count;
}

async function main() {
  const patients = readRows('patients_followcare.csv');
  const followups = readRows('followups.csv');
  const risks = readRows('patient_risk.csv');

  const patientRows = patients.filter(row => row.Id).map(row => ({
    id: String(row.Id),
    data: pickPatient(row)
  }));
  const followupRows = followups.filter(row => row.followup_id && row.patient_id).map(row => ({
    id: String(row.followup_id),
    data: pickFollowup(row),
    patientId: String(row.patient_id)
  }));
  const riskRows = risks.filter(row => row.patient_id).map(row => ({
    id: String(row.patient_id),
    data: pickRisk(row)
  }));

  if (!patientRows.length || !followupRows.length || !riskRows.length) {
    throw new Error('One or more CSV files did not contain the expected ID columns.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE imported_dataset_followups, imported_dataset_risk, imported_dataset_patients');

    const importedPatients = await upsertRows(client, 'imported_dataset_patients', 'patient_id', patientRows);
    const importedRisks = await upsertRows(client, 'imported_dataset_risk', 'patient_id', riskRows);

    const batchSize = 200;
    let importedFollowups = 0;
    for (let start = 0; start < followupRows.length; start += batchSize) {
      const batch = followupRows.slice(start, start + batchSize);
      const values = [];
      const tuples = batch.map((item, index) => {
        const offset = index * 3;
        values.push(item.id, item.patientId, JSON.stringify(item.data));
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}::jsonb)`;
      });
      await client.query(
        `INSERT INTO imported_dataset_followups (followup_id, patient_id, data)
         VALUES ${tuples.join(', ')}`,
        values
      );
      importedFollowups += batch.length;
    }

    await client.query('COMMIT');
    console.log('Synthetic FollowCare dataset imported successfully.');
    console.log(`Patients: ${importedPatients}`);
    console.log(`Follow-ups: ${importedFollowups}`);
    console.log(`Patient risk samples: ${importedRisks}`);
    console.log('Personal contact fields and diagnosis-like free text were excluded from the imported copy.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch(error => {
    console.error('Dataset import failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

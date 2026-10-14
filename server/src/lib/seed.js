import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { encrypt, hashPhone } from './crypto.js';
import { Permissions, ROLE_PERMISSIONS, UserRole } from '@followcare/shared';

export async function runSeeds() {
  const client = await pool.connect();
  try {
    console.log('Seeding database with synthetic data...');
    await client.query('BEGIN');

    // 1. Permissions
    for (const [permKey, permId] of Object.entries(Permissions)) {
      await client.query(`
        INSERT INTO permissions (id, description)
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description
      `, [permId, `Permission for ${permKey}`]);
    }

    // 2. Role Permissions
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const permId of perms) {
        await client.query(`
          INSERT INTO role_permissions (role, permission_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [role, permId]);
      }
    }

    // 3. Priority Rules
    const priorityRules = [
      { key: 'overdue_window', weight: 40, description: 'Follow-up window has expired' },
      { key: 'urgency_urgent', weight: 30, description: 'Urgent clinical follow-up category' },
      { key: 'urgency_priority', weight: 15, description: 'Priority clinical follow-up category' },
      { key: 'patient_requested_help', weight: 35, description: 'Patient flagged a barrier or requested assistance' },
      { key: 'failed_delivery', weight: 25, description: 'Reminder delivery failed' },
      { key: 'invalid_contact', weight: 25, description: 'Contact number invalid or unreachable' },
      { key: 'unacknowledged_instructions', weight: 15, description: 'Instructions not yet acknowledged' },
      { key: 'due_soon', weight: 10, description: 'Window closing within 7 days' },
      { key: 'missing_owner', weight: 20, description: 'Task has no assigned staff member' },
      { key: 'missing_date', weight: 20, description: 'Appointment date not yet booked' },
      { key: 'duplicate_suspected', weight: 10, description: 'Potential duplicate patient record detected' }
    ];

    for (const rule of priorityRules) {
      await client.query(`
        INSERT INTO priority_rules (key, weight, active, description)
        VALUES ($1, $2, TRUE, $3)
        ON CONFLICT (key) DO UPDATE SET weight = EXCLUDED.weight, description = EXCLUDED.description
      `, [rule.key, rule.weight, rule.description]);
    }

    // 4. Message Templates (Privacy-preserving: NO diagnosis or clinician names)
    const templates = [
      {
        key: 'window_reminder',
        channel: 'sms',
        language: 'en',
        body_generic: 'You have an upcoming follow-up care window with your hospital. Please review your instructions and options: {{portal_url}}'
      },
      {
        key: 'window_reminder',
        channel: 'whatsapp',
        language: 'en',
        body_generic: 'Greetings from FollowCare Hospital Support. You have an upcoming follow-up window. Please tap to view your care instructions: {{portal_url}}'
      },
      {
        key: 'appointment_confirmed',
        channel: 'sms',
        language: 'en',
        body_generic: 'Your follow-up visit is confirmed for {{scheduled_date}}. Check details: {{portal_url}}'
      },
      {
        key: 'barrier_support',
        channel: 'sms',
        language: 'en',
        body_generic: 'We received your assistance request. A care coordinator will contact you shortly to help resolve any scheduling or travel difficulties.'
      }
    ];

    for (const t of templates) {
      await client.query(`
        INSERT INTO message_templates (key, channel, language, body_generic, approved)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (key, channel, language) DO UPDATE SET body_generic = EXCLUDED.body_generic
      `, [t.key, t.channel, t.language, t.body_generic]);
    }

    // 5. Departments
    const depts = [
      { name: 'Cardiology', code: 'CARD' },
      { name: 'Oncology', code: 'ONCO' },
      { name: 'Orthopedics', code: 'ORTHO' },
      { name: 'General Medicine', code: 'GMED' }
    ];
    const deptMap = {};

    for (const d of depts) {
      const res = await client.query(`
        INSERT INTO departments (name, code, active)
        VALUES ($1, $2, TRUE)
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
        RETURNING id, code
      `, [d.name, d.code]);
      deptMap[d.code] = res.rows[0].id;
    }

    // 6. Staff Users (Password: Password123!)
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const users = [
      { email: 'admin@followcare.org', name: 'System Administrator', role: 'admin', depts: ['CARD', 'ONCO', 'ORTHO', 'GMED'] },
      { email: 'doctor.sharma@followcare.org', name: 'Dr. Rajesh Sharma', role: 'doctor', depts: ['CARD'] },
      { email: 'doctor.patel@followcare.org', name: 'Dr. Neha Patel', role: 'doctor', depts: ['ONCO'] },
      { email: 'nurse.anita@followcare.org', name: 'Nurse Anita Roy', role: 'nurse', depts: ['CARD', 'ONCO'] },
      { email: 'coord.rahul@followcare.org', name: 'Rahul Verma (Coordinator)', role: 'coordinator', depts: ['CARD', 'ONCO', 'ORTHO'] },
      { email: 'hw.priya@followcare.org', name: 'Priya Singh (Health Worker)', role: 'health_worker', depts: ['GMED'] }
    ];
    const userMap = {};

    for (const u of users) {
      const res = await client.query(`
        INSERT INTO users (email, password_hash, full_name, role, status)
        VALUES ($1, $2, $3, $4, 'active')
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name, role = EXCLUDED.role
        RETURNING id, email
      `, [u.email, passwordHash, u.name, u.role]);
      userMap[u.email] = res.rows[0].id;

      // Assign department memberships
      for (const dCode of u.depts) {
        await client.query(`
          INSERT INTO department_members (user_id, department_id, role_in_dept)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, department_id) DO NOTHING
        `, [res.rows[0].id, deptMap[dCode], u.role]);
      }
    }

    // 7. Synthetic Patients
    const patients = [
      {
        reg: 'FC-1001',
        name: 'Aarav Mehta',
        dob: '1982-04-12',
        sex: 'Male',
        phone: '+919876543210',
        dept: 'CARD',
        clinician: 'doctor.sharma@followcare.org'
      },
      {
        reg: 'FC-1002',
        name: 'Sunita Devi',
        dob: '1975-09-23',
        sex: 'Female',
        phone: '+919876543211',
        dept: 'ONCO',
        clinician: 'doctor.patel@followcare.org'
      },
      {
        reg: 'FC-1003',
        name: 'Ramesh Kumar',
        dob: '1990-11-05',
        sex: 'Male',
        phone: '+919876543212',
        dept: 'ORTHO',
        clinician: 'doctor.sharma@followcare.org'
      },
      {
        reg: 'FC-1004',
        name: 'Fatima Begum',
        dob: '1968-02-17',
        sex: 'Female',
        phone: '+919876543213',
        dept: 'GMED',
        clinician: 'doctor.sharma@followcare.org'
      },
      {
        reg: 'FC-1005',
        name: 'Vijay Kulkarni',
        dob: '1959-07-30',
        sex: 'Male',
        phone: '+919876543214',
        dept: 'CARD',
        clinician: 'doctor.sharma@followcare.org'
      },
      {
        reg: 'FC-1006',
        name: 'Meera Joshi',
        dob: '1988-12-19',
        sex: 'Female',
        phone: '+919876543215',
        dept: 'ONCO',
        clinician: 'doctor.patel@followcare.org'
      }
    ];

    const patientMap = {};
    for (const p of patients) {
      const res = await client.query(`
        INSERT INTO patients (
          hospital_reg_no, full_name_enc, dob, sex,
          primary_phone_enc, phone_hash, assigned_department_id, assigned_clinician_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (hospital_reg_no) DO UPDATE SET
          full_name_enc = EXCLUDED.full_name_enc,
          primary_phone_enc = EXCLUDED.primary_phone_enc,
          phone_hash = EXCLUDED.phone_hash
        RETURNING id, hospital_reg_no
      `, [
        p.reg,
        encrypt(p.name),
        p.dob,
        p.sex,
        encrypt(p.phone),
        hashPhone(p.phone),
        deptMap[p.dept],
        userMap[p.clinician]
      ]);
      patientMap[p.reg] = res.rows[0].id;

      // Consent record
      await client.query(`
        INSERT INTO patient_consents (patient_id, consent_type, granted)
        VALUES ($1, 'reminders', TRUE)
        ON CONFLICT (patient_id, consent_type) DO NOTHING
      `, [res.rows[0].id]);
    }

    // 8. Follow-up Plans, Instructions, Tasks, Appointments & Outcomes
    const today = new Date();
    const addDays = (d, n) => {
      const res = new Date(d);
      res.setDate(res.getDate() + n);
      return res.toISOString().split('T')[0];
    };

    // Plan 1: Aarav Mehta (Due soon, routine)
    const p1 = await client.query(`
      INSERT INTO follow_up_plans (
        patient_id, department_id, created_by, owner_task_assignee,
        window_start, window_end, urgency, reason_category, status, ack_status,
        required_tests
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'routine', 'Post-procedure review', 'active', 'pending', ARRAY['Lipid Profile', 'ECG'])
      RETURNING id
    `, [
      patientMap['FC-1001'],
      deptMap['CARD'],
      userMap['doctor.sharma@followcare.org'],
      userMap['coord.rahul@followcare.org'],
      addDays(today, 2),
      addDays(today, 6)
    ]);
    const plan1Id = p1.rows[0].id;

    await client.query(`
      INSERT INTO plan_instructions (plan_id, original_text, approved_text, approved_by)
      VALUES ($1, $2, $2, $3)
    `, [plan1Id, 'Post-stenting 30-day review. Continue dual antiplatelet therapy. Fasting lipid profile required before consultation.', userMap['doctor.sharma@followcare.org']]);

    await client.query(`
      INSERT INTO tasks (
        plan_id, patient_id, department_id, type, title, status,
        priority_score, priority_reasons, assignee_id, due_at
      )
      VALUES ($1, $2, $3, 'contact_patient', 'Reach out for post-procedure check', 'todo', 10, '[{"rule": "due_soon", "points": 10}]'::jsonb, $4, NOW() + INTERVAL '3 days')
    `, [plan1Id, patientMap['FC-1001'], deptMap['CARD'], userMap['coord.rahul@followcare.org']]);

    // Plan 2: Sunita Devi (Overdue by 4 days, Urgent)
    const p2 = await client.query(`
      INSERT INTO follow_up_plans (
        patient_id, department_id, created_by, owner_task_assignee,
        window_start, window_end, urgency, reason_category, status, ack_status,
        required_tests
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'urgent', 'Oncology chemotherapy monitoring', 'active', 'pending', ARRAY['CBC', 'Liver Enzymes'])
      RETURNING id
    `, [
      patientMap['FC-1002'],
      deptMap['ONCO'],
      userMap['doctor.patel@followcare.org'],
      userMap['coord.rahul@followcare.org'],
      addDays(today, -8),
      addDays(today, -4)
    ]);
    const plan2Id = p2.rows[0].id;

    await client.query(`
      INSERT INTO plan_instructions (plan_id, original_text, approved_text, approved_by)
      VALUES ($1, $2, $2, $3)
    `, [plan2Id, 'Chemotherapy cycle 3 follow-up. Check for neutropenia or febrile symptoms. Urgent blood work review.', userMap['doctor.patel@followcare.org']]);

    await client.query(`
      INSERT INTO tasks (
        plan_id, patient_id, department_id, type, title, status,
        priority_score, priority_reasons, assignee_id, due_at
      )
      VALUES (
        $1, $2, $3, 'resolve_barrier', 'Resolve barrier: Overdue urgent oncology follow-up', 'todo',
        70, '[{"rule": "overdue_window", "points": 40}, {"rule": "urgency_urgent", "points": 30}]'::jsonb,
        $4, NOW() - INTERVAL '2 days'
      )
    `, [plan2Id, patientMap['FC-1002'], deptMap['ONCO'], userMap['coord.rahul@followcare.org']]);

    // Plan 3: Ramesh Kumar (Confirmed appointment today)
    const p3 = await client.query(`
      INSERT INTO follow_up_plans (
        patient_id, department_id, created_by, owner_task_assignee,
        window_start, window_end, urgency, reason_category, status, ack_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'routine', 'Cast removal & physiotherapy review', 'active', 'acknowledged')
      RETURNING id
    `, [
      patientMap['FC-1003'],
      deptMap['ORTHO'],
      userMap['doctor.sharma@followcare.org'],
      userMap['coord.rahul@followcare.org'],
      addDays(today, 0),
      addDays(today, 2)
    ]);
    const plan3Id = p3.rows[0].id;

    await client.query(`
      INSERT INTO appointments (plan_id, patient_id, department_id, scheduled_at, status)
      VALUES ($1, $2, $3, NOW() + INTERVAL '1 day', 'confirmed')
    `, [plan3Id, patientMap['FC-1003'], deptMap['ORTHO']]);

    await client.query(`
      INSERT INTO tasks (
        plan_id, patient_id, department_id, type, title, status,
        priority_score, priority_reasons, assignee_id
      )
      VALUES ($1, $2, $3, 'reschedule', 'Appointment confirmed for cast review', 'completed', 0, '[]'::jsonb, $4)
    `, [plan3Id, patientMap['FC-1003'], deptMap['ORTHO'], userMap['coord.rahul@followcare.org']]);

    // Plan 4: Fatima Begum (Returned / Attended)
    const p4 = await client.query(`
      INSERT INTO follow_up_plans (
        patient_id, department_id, created_by, owner_task_assignee,
        window_start, window_end, urgency, reason_category, status, ack_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'routine', 'Chronic disease management', 'completed', 'acknowledged')
      RETURNING id
    `, [
      patientMap['FC-1004'],
      deptMap['GMED'],
      userMap['doctor.sharma@followcare.org'],
      userMap['hw.priya@followcare.org'],
      addDays(today, -10),
      addDays(today, -5)
    ]);
    const plan4Id = p4.rows[0].id;

    await client.query(`
      INSERT INTO follow_up_outcomes (plan_id, final_status, closed_by)
      VALUES ($1, 'attended', $2)
    `, [plan4Id, userMap['hw.priya@followcare.org']]);

    // Plan 5: Vijay Kulkarni (Invalid contact / Unreachable barrier)
    const p5 = await client.query(`
      INSERT INTO follow_up_plans (
        patient_id, department_id, created_by, owner_task_assignee,
        window_start, window_end, urgency, reason_category, status, ack_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'priority', 'Arrhythmia follow-up', 'active', 'pending')
      RETURNING id
    `, [
      patientMap['FC-1005'],
      deptMap['CARD'],
      userMap['doctor.sharma@followcare.org'],
      userMap['coord.rahul@followcare.org'],
      addDays(today, 0),
      addDays(today, 4)
    ]);
    const plan5Id = p5.rows[0].id;

    const t5 = await client.query(`
      INSERT INTO tasks (
        plan_id, patient_id, department_id, type, title, status,
        priority_score, priority_reasons, assignee_id
      )
      VALUES (
        $1, $2, $3, 'verify_contact', 'Resolve unreachable: Phone delivery bounced', 'in_progress',
        40, '[{"rule": "invalid_contact", "points": 25}, {"rule": "urgency_priority", "points": 15}]'::jsonb,
        $4
      )
      RETURNING id
    `, [plan5Id, patientMap['FC-1005'], deptMap['CARD'], userMap['coord.rahul@followcare.org']]);

    await client.query(`
      INSERT INTO contact_attempts (task_id, patient_id, staff_id, channel, outcome, notes)
      VALUES ($1, $2, $3, 'sms', 'invalid_contact', 'SMS provider bounced: Destination number unreachable or temporarily out of service')
    `, [t5.rows[0].id, patientMap['FC-1005'], userMap['coord.rahul@followcare.org']]);

    // Plan 6: Meera Joshi (Patient requested help - travel barrier)
    const p6 = await client.query(`
      INSERT INTO follow_up_plans (
        patient_id, department_id, created_by, owner_task_assignee,
        window_start, window_end, urgency, reason_category, status, ack_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'priority', 'Post-mastectomy follow-up', 'active', 'pending')
      RETURNING id
    `, [
      patientMap['FC-1006'],
      deptMap['ONCO'],
      userMap['doctor.patel@followcare.org'],
      userMap['coord.rahul@followcare.org'],
      addDays(today, -1),
      addDays(today, 0)
    ]);
    const plan6Id = p6.rows[0].id;

    const t6 = await client.query(`
      INSERT INTO tasks (
        plan_id, patient_id, department_id, type, title, status,
        priority_score, priority_reasons, assignee_id
      )
      VALUES (
        $1, $2, $3, 'resolve_barrier', 'Patient reported travel barrier: Transport unavailable', 'todo',
        50, '[{"rule": "patient_requested_help", "points": 35}, {"rule": "urgency_priority", "points": 15}]'::jsonb,
        $4
      )
      RETURNING id
    `, [plan6Id, patientMap['FC-1006'], deptMap['ONCO'], userMap['coord.rahul@followcare.org']]);

    await client.query(`
      INSERT INTO barrier_reports (plan_id, patient_id, barrier_type, note, reported_via, resolved_task_id)
      VALUES ($1, $2, 'travel', 'Patient resides 120km away in a rural village; public bus line is suspended this week. Needs teleconsultation or community health worker visit.', 'patient_portal', $3)
    `, [plan6Id, patientMap['FC-1006'], t6.rows[0].id]);

    await client.query('COMMIT');
    console.log('Synthetic seed data created successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] === (await import('url')).fileURLToPath(import.meta.url)) {
  runSeeds()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

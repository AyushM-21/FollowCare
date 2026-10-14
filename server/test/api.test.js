import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { pool } from '../src/config/db.js';
import { redis } from '../src/config/redis.js';

describe('FollowCare Backend MVP Domain Modules & APIs Integration Suite', () => {
  let doctorAgent;
  let coordinatorAgent;
  let adminAgent;
  let patientAgent;
  let otpCode;

  let cardDeptId;
  let oncoDeptId;
  let cardPatientId;
  let oncoPatientId;
  let createdPlanId;
  let createdTaskId;

  beforeAll(async () => {
    // 1. Fetch department IDs from synthetic seeds
    const depts = await pool.query(`SELECT id, code FROM departments WHERE code IN ('CARD', 'ONCO')`);
    for (const d of depts.rows) {
      if (d.code === 'CARD') cardDeptId = d.id;
      if (d.code === 'ONCO') oncoDeptId = d.id;
    }

    // 2. Fetch seeded synthetic patient IDs
    const pts = await pool.query(
      `SELECT id, hospital_reg_no, assigned_department_id FROM patients WHERE hospital_reg_no IN ('FC-1001', 'FC-1002')`
    );
    for (const p of pts.rows) {
      if (p.hospital_reg_no === 'FC-1001') cardPatientId = p.id;
      if (p.hospital_reg_no === 'FC-1002') oncoPatientId = p.id;
    }

    // 3. Initialize supertest agents for session cookie persistence
    doctorAgent = request.agent(app);
    coordinatorAgent = request.agent(app);
    adminAgent = request.agent(app);
    patientAgent = request.agent(app);
  });

  afterAll(async () => {
    // Clean up created test plan if any
    if (createdPlanId) {
      await pool.query(`DELETE FROM follow_up_plans WHERE id = $1`, [createdPlanId]).catch(() => {});
    }
    await pool.end().catch(() => {});
    await redis.quit().catch(() => {});
  });

  // ==========================================================================
  // 1. Authentication & Session Management
  // ==========================================================================
  describe('1. Authentication & Session Management', () => {
    it('rejects invalid password with 401 and RFC 7807 problem details', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'doctor.sharma@followcare.org', password: 'WrongPassword123!' });

      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.title).toBe('Unauthorized');
      expect(res.body.detail).toBe('Invalid email or password');
    });

    it('authenticates Doctor Sharma and establishes staff session', async () => {
      const res = await doctorAgent
        .post('/api/auth/login')
        .send({ email: 'doctor.sharma@followcare.org', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('doctor');
      expect(res.body.permissions).toContain('plan:create');
      expect(res.body.permissions).toContain('plan:approve');
      expect(res.body.departments[0].code).toBe('CARD');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('authenticates Coordinator Rahul and establishes coordinator session', async () => {
      const res = await coordinatorAgent
        .post('/api/auth/login')
        .send({ email: 'coord.rahul@followcare.org', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('coordinator');
      expect(res.body.permissions).toContain('task:work');
      expect(res.body.permissions).not.toContain('plan:create');
    });

    it('authenticates System Administrator and establishes admin session', async () => {
      const res = await adminAgent
        .post('/api/auth/login')
        .send({ email: 'admin@followcare.org', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('admin');
      expect(res.body.permissions).toContain('audit:view');
    });

    it('returns 401 when accessing /api/auth/me without a session', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.title).toBe('Unauthorized');
    });

    it('returns authenticated user profile on GET /api/auth/me with session', async () => {
      const res = await doctorAgent.get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('doctor.sharma@followcare.org');
      expect(res.body.user.role).toBe('doctor');
    });

    it('requests patient OTP with generic anti-enumeration response', async () => {
      const res = await request(app)
        .post('/api/patient-auth/otp/request')
        .send({ phone: '+919876543210' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('verification code has been sent');
      expect(res.body.debugCode).toMatch(/^\d{6}$/);
      otpCode = res.body.debugCode;
    });

    it('rejects a wrong or hardcoded OTP and gives no signal about registration', async () => {
      const bad = await request(app)
        .post('/api/patient-auth/otp/verify')
        .send({ phone: '+919876543210', code: otpCode === '000000' ? '111111' : '000000' });
      expect(bad.status).toBe(400);

      const unknown = await request(app)
        .post('/api/patient-auth/otp/verify')
        .send({ phone: '+910000000001', code: '123456' });
      expect(unknown.status).toBe(400);
    });

    it('verifies patient OTP and establishes patient portal session', async () => {
      const res = await patientAgent
        .post('/api/patient-auth/otp/verify')
        .send({ phone: '+919876543210', code: otpCode });

      expect(res.status).toBe(200);
      expect(res.body.patient.hospitalRegNo).toBe('FC-1001');
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });

  // ==========================================================================
  // 2. Server-Enforced RBAC & Access Control
  // ==========================================================================
  describe('2. Server-Enforced RBAC & Access Control', () => {
    it('forbids Coordinator from creating follow-up plan (lacks plan:create)', async () => {
      const res = await coordinatorAgent
        .post('/api/plans')
        .send({
          patient_id: cardPatientId,
          department_id: cardDeptId,
          window_start: '2026-11-01',
          window_end: '2026-11-07',
          urgency: 'routine',
          reason_category: 'Routine Cardiology Follow-up',
          channel: 'in_person',
          instructions_text: 'Check blood pressure daily'
        });

      expect(res.status).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.title).toBe('Forbidden');
      expect(res.body.detail).toContain("lacks permission 'plan:create'");
    });

    it('forbids Doctor from viewing administrative audit logs (lacks audit:view)', async () => {
      const res = await doctorAgent.get('/api/audit-logs');
      expect(res.status).toBe(403);
      expect(res.body.title).toBe('Forbidden');
    });

    it('allows Admin to view audit logs', async () => {
      const res = await adminAgent.get('/api/audit-logs');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('auditLogs');
      expect(Array.isArray(res.body.auditLogs)).toBe(true);
    });
  });

  // ==========================================================================
  // 3. Department-Scoped Authorization & Privacy Masking
  // ==========================================================================
  describe('3. Department-Scoped Authorization & Privacy Masking', () => {
    it('prevents Dr. Sharma (Cardiology only) from accessing Oncology patient detail', async () => {
      const res = await doctorAgent.get(`/api/patients/${oncoPatientId}`);
      expect(res.status).toBe(403);
      expect(res.body.title).toBe('Forbidden');
      expect(res.body.detail).toContain('unauthorized department');
    });

    it('returns masked phone number and logs audit entry when viewing patient', async () => {
      const res = await doctorAgent.get(`/api/patients/${cardPatientId}`);

      expect(res.status).toBe(200);
      expect(res.body.patient.hospitalRegNo).toBe('FC-1001');
      expect(res.body.patient.fullName).toBe('Aarav Mehta');
      expect(res.body.patient.phone).toMatch(/^\+91 •••• \d{3}$/); // Masked format

      // Verify audit log entry was written
      const auditRes = await pool.query(
        `SELECT id, action, entity_type, patient_id FROM audit_logs 
         WHERE patient_id = $1 AND action = 'view' ORDER BY created_at DESC LIMIT 1`,
        [cardPatientId]
      );
      expect(auditRes.rowCount).toBe(1);
    });
  });

  // ==========================================================================
  // 4. Follow-up Plan Creation, Versioning & Auto-Tasks
  // ==========================================================================
  describe('4. Follow-up Plan Creation, Versioning & Auto-Tasks', () => {
    it('creates plan with Version 1 and auto-generates contact task', async () => {
      const res = await doctorAgent
        .post('/api/plans')
        .send({
          patient_id: cardPatientId,
          department_id: cardDeptId,
          window_start: '2026-11-10',
          window_end: '2026-11-20',
          urgency: 'priority',
          reason_category: 'Post-CABG recovery review',
          reason_note: 'Monitor sternal healing and exercise tolerance',
          channel: 'in_person',
          instructions_text: 'Keep incision dry, walk 15 mins twice daily, complete ECG.',
          required_tests: ['ECG', 'Echocardiogram']
        });

      expect(res.status).toBe(201);
      expect(res.body.plan).toHaveProperty('id');
      expect(res.body.plan.current_version).toBe(1);
      expect(res.body.plan.status).toBe('active'); // Doctor created -> active
      expect(res.body.plan.initialTaskId).toBeDefined();

      createdPlanId = res.body.plan.id;
      createdTaskId = res.body.plan.initialTaskId;

      // Verify Version 1 snapshot was persisted
      const versionRes = await pool.query(
        `SELECT version, snapshot FROM follow_up_plan_versions WHERE plan_id = $1 AND version = 1`,
        [createdPlanId]
      );
      expect(versionRes.rowCount).toBe(1);
      expect(versionRes.rows[0].snapshot.urgency).toBe('priority');

      // Verify auto-generated task in tasks table
      const taskRes = await pool.query(`SELECT id, type, status, priority_score FROM tasks WHERE id = $1`, [createdTaskId]);
      expect(taskRes.rowCount).toBe(1);
      expect(taskRes.rows[0].type).toBe('contact_patient');
      expect(taskRes.rows[0].priority_score).toBe(15); // 'urgency_priority' rule weight
    });

    it('patches plan, increments to Version 2 and records snapshot', async () => {
      const res = await doctorAgent
        .patch(`/api/plans/${createdPlanId}`)
        .send({
          urgency: 'urgent',
          instructions_text: 'Incision showing redness: report to clinic immediately.',
          change_reason: 'Patient reported symptoms requiring urgent evaluation'
        });

      expect(res.status).toBe(200);
      expect(res.body.plan.current_version).toBe(2);
      expect(res.body.plan.urgency).toBe('urgent');

      // Verify Version 2 snapshot in follow_up_plan_versions
      const versionRes = await pool.query(
        `SELECT version, change_reason FROM follow_up_plan_versions WHERE plan_id = $1 ORDER BY version DESC`,
        [createdPlanId]
      );
      expect(versionRes.rowCount).toBe(2);
      expect(versionRes.rows[0].version).toBe(2);
      expect(versionRes.rows[0].change_reason).toContain('urgent evaluation');
    });
  });

  // ==========================================================================
  // 5. Kanban Task Board & Lifecycle Transitions
  // ==========================================================================
  describe('5. Kanban Task Board & Lifecycle Transitions', () => {
    it('returns Kanban board grouped by 5 status columns', async () => {
      const res = await coordinatorAgent.get('/api/tasks/board');

      expect(res.status).toBe(200);
      expect(res.body.board).toHaveProperty('todo');
      expect(res.body.board).toHaveProperty('in_progress');
      expect(res.body.board).toHaveProperty('awaiting_response');
      expect(res.body.board).toHaveProperty('escalated');
      expect(res.body.board).toHaveProperty('completed');
    });

    it('transitions task status to in_progress with a comment', async () => {
      const res = await coordinatorAgent
        .patch(`/api/tasks/${createdTaskId}/status`)
        .send({
          status: 'in_progress',
          comment: 'Initiated outbound call attempt to patient'
        });

      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe('in_progress');

      // Verify comment was logged in task_comments
      const commentRes = await pool.query(
        `SELECT body FROM task_comments WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [createdTaskId]
      );
      expect(commentRes.rowCount).toBe(1);
      expect(commentRes.rows[0].body).toContain('Initiated outbound call');
    });

    it('logs contact attempt and closes follow-up outcome when completed', async () => {
      const res = await coordinatorAgent
        .post(`/api/tasks/${createdTaskId}/contact-attempts`)
        .send({
          channel: 'phone_call',
          outcome: 'reached',
          notes: 'Patient confirmed visit with private physician; symptoms resolved.',
          close_follow_up: true,
          final_status: 'visited_elsewhere'
        });

      expect(res.status).toBe(201);
      expect(res.body.contactAttempt.outcome).toBe('reached');

      // Verify task and plan are now closed
      const planRes = await pool.query(`SELECT status FROM follow_up_plans WHERE id = $1`, [createdPlanId]);
      expect(planRes.rows[0].status).toBe('completed');

      const outcomeRes = await pool.query(`SELECT final_status FROM follow_up_outcomes WHERE plan_id = $1`, [createdPlanId]);
      expect(outcomeRes.rows[0].final_status).toBe('visited_elsewhere');
    });
  });

  // ==========================================================================
  // 6. Command Center Metrics & Priority Queue
  // ==========================================================================
  describe('6. Command Center Metrics & Priority Queue', () => {
    it('returns Command Center KPI tiles computed from v_follow_up_status', async () => {
      const res = await doctorAgent.get('/api/dashboard/metrics');

      expect(res.status).toBe(200);
      expect(res.body.metrics).toHaveProperty('activePlans');
      expect(res.body.metrics).toHaveProperty('overdue');
      expect(res.body.metrics).toHaveProperty('dueSoon');
      expect(res.body.metrics).toHaveProperty('returned');
      expect(res.body.metrics).toHaveProperty('unreachable');
      expect(typeof res.body.metrics.overdue.count).toBe('number');
    });

    it('returns priority queue tasks ranked with transparent rule points', async () => {
      const res = await coordinatorAgent.get('/api/priority-queue');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.queue)).toBe(true);
      if (res.body.queue.length > 0) {
        const topTask = res.body.queue[0];
        expect(topTask).toHaveProperty('priority_score');
        expect(topTask).toHaveProperty('priority_reasons');
        expect(Array.isArray(topTask.priority_reasons)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // 7. Patient Portal & Barrier Reporting
  // ==========================================================================
  describe('7. Patient Portal & Barrier Reporting', () => {
    it('retrieves patient follow-ups for authenticated patient', async () => {
      const res = await patientAgent.get('/api/me/follow-ups');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.followUps)).toBe(true);
    });

    it('patient reports transport barrier and auto-generates priority coordinator task', async () => {
      // Find a plan belonging to FC-1001
      const planRes = await pool.query(
        `SELECT id FROM follow_up_plans WHERE patient_id = $1 AND deleted_at IS NULL LIMIT 1`,
        [cardPatientId]
      );
      if (planRes.rowCount > 0) {
        const pId = planRes.rows[0].id;
        const res = await patientAgent
          .post('/api/me/barriers')
          .send({
            plan_id: pId,
            barrier_type: 'travel',
            note: 'Family car unavailable and distance is 40km.',
            requested_callback: true
          });

        expect(res.status).toBe(201);
        expect(res.body.message).toContain('care coordinator has been notified');
        expect(res.body.report.barrier_type).toBe('travel');
        expect(res.body.report.resolved_task_id).toBeDefined();

        // Verify task has score 35 from patient_requested_help rule
        const taskRes = await pool.query(
          `SELECT priority_score, priority_reasons FROM tasks WHERE id = $1`,
          [res.body.report.resolved_task_id]
        );
        expect(taskRes.rows[0].priority_score).toBe(35);
      }
    });
  });
  describe('8. One identity per session (shared browser cookie)', () => {
    const phone = '+919876543210';
    async function otpFor(agent) {
      const r = await agent.post('/api/patient-auth/otp/request').send({ phone });
      return r.body.debugCode;
    }

    it('patient login on a browser that already has a staff session yields a patient-only session', async () => {
      const agent = request.agent(app);
      await agent.post('/api/auth/login').send({ email: 'coord.rahul@followcare.org', password: 'Password123!' }).expect(200);
      await agent.get('/api/dashboard/metrics').expect(200);

      const code = await otpFor(agent);
      await agent.post('/api/patient-auth/otp/verify').send({ phone, code }).expect(200);

      await agent.get('/api/me/follow-ups').expect(200);       // patient endpoints work
      const staffCall = await agent.get('/api/dashboard/metrics');
      expect([401, 403]).toContain(staffCall.status);          // staff identity is gone
    });

    it('staff login on a browser that already has a patient session yields a staff-only session', async () => {
      const agent = request.agent(app);
      const code = await otpFor(agent);
      await agent.post('/api/patient-auth/otp/verify').send({ phone, code }).expect(200);
      await agent.get('/api/me/follow-ups').expect(200);

      await agent.post('/api/auth/login').send({ email: 'coord.rahul@followcare.org', password: 'Password123!' }).expect(200);
      await agent.get('/api/dashboard/metrics').expect(200);
      const patientCall = await agent.get('/api/me/follow-ups');
      expect(patientCall.status).toBe(403);
    });
  });
});

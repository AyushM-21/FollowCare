import { Router } from 'express';
import { Permissions } from '@followcare/shared';
import { pool } from '../../config/db.js';
import { decrypt, maskPhone } from '../../lib/crypto.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { deptScope } from '../../middleware/deptScope.js';
import { recordAuditLog } from '../../middleware/audit.js';
import { AppError } from '../../middleware/errorHandler.js';

export const patientsRouter = Router();

// ============================================================================
// GET /patients (Department-scoped list with masked PHI)
// ============================================================================
patientsRouter.get(
  '/patients',
  authenticate,
  requirePermission(Permissions.PATIENT_VIEW_DEMOGRAPHICS),
  deptScope(),
  async (req, res, next) => {
    try {
      let queryText = `
        SELECT 
          p.id,
          p.hospital_reg_no,
          p.full_name_enc,
          p.dob,
          p.sex,
          p.preferred_language,
          p.preferred_channel,
          p.primary_phone_enc,
          p.assigned_department_id,
          d.name AS department_name,
          p.status
        FROM patients p
        LEFT JOIN departments d ON p.assigned_department_id = d.id
        WHERE p.deleted_at IS NULL
      `;
      const params = [];

      // Server-enforced department scoping
      if (req.departmentIds !== null) {
        if (req.departmentIds.length === 0) {
          return res.status(200).json({ patients: [] });
        }
        queryText += ` AND p.assigned_department_id = ANY($1::uuid[])`;
        params.push(req.departmentIds);
      }

      queryText += ` ORDER BY p.created_at DESC LIMIT 100`;

      const result = await pool.query(queryText, params);

      const patients = result.rows.map(row => {
        const fullName = decrypt(row.full_name_enc);
        const rawPhone = decrypt(row.primary_phone_enc);
        return {
          id: row.id,
          hospitalRegNo: row.hospital_reg_no,
          fullName,
          dob: row.dob,
          sex: row.sex,
          preferredLanguage: row.preferred_language,
          preferredChannel: row.preferred_channel,
          phoneMasked: maskPhone(rawPhone),
          departmentId: row.assigned_department_id,
          departmentName: row.department_name,
          status: row.status
        };
      });

      res.status(200).json({ patients });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// GET /patients/:id (Detail view with department check, active task check, and audit)
// ============================================================================
patientsRouter.get(
  '/patients/:id',
  authenticate,
  requirePermission(Permissions.PATIENT_VIEW_DEMOGRAPHICS),
  deptScope(),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const ptRes = await pool.query(
        `SELECT 
          p.id,
          p.hospital_reg_no,
          p.full_name_enc,
          p.dob,
          p.sex,
          p.preferred_language,
          p.preferred_channel,
          p.preferred_contact_window,
          p.quiet_hours,
          p.primary_phone_enc,
          p.email_enc,
          p.address_enc,
          p.accessibility_needs,
          p.assigned_department_id,
          d.name AS department_name,
          p.status
        FROM patients p
        LEFT JOIN departments d ON p.assigned_department_id = d.id
        WHERE p.id = $1 AND p.deleted_at IS NULL`,
        [id]
      );

      if (ptRes.rowCount === 0) {
        return next(new AppError('Patient not found', 404, 'https://followcare.org/errors/not-found'));
      }

      const patient = ptRes.rows[0];

      // Server-enforced department access check
      if (req.departmentIds !== null && !req.departmentIds.includes(patient.assigned_department_id)) {
        return next(new AppError('Forbidden: Patient belongs to an unauthorized department', 403, 'https://followcare.org/errors/forbidden'));
      }

      // Check whether user is permitted to view unmasked phone number
      // ARCHITECTURE.md Section 6: Coordinator / Health worker on active task only
      let canViewUnmaskedPhone = false;
      if (req.user.role === 'coordinator' || req.user.role === 'health_worker') {
        const taskCheck = await pool.query(
          `SELECT 1 FROM tasks 
           WHERE patient_id = $1 AND assignee_id = $2 AND status != 'completed' LIMIT 1`,
          [id, req.user.id]
        );
        canViewUnmaskedPhone = taskCheck.rowCount > 0;
      }

      const fullName = decrypt(patient.full_name_enc);
      const rawPhone = decrypt(patient.primary_phone_enc);
      const email = decrypt(patient.email_enc);
      const address = decrypt(patient.address_enc);

      // Audit log entry for PHI view
      await recordAuditLog({
        req,
        action: 'view',
        entityType: 'patients',
        entityId: patient.id,
        patientId: patient.id,
        departmentId: patient.assigned_department_id,
        metadata: { unmaskedContactViewed: canViewUnmaskedPhone },
        required: true
      });

      res.status(200).json({
        patient: {
          id: patient.id,
          hospitalRegNo: patient.hospital_reg_no,
          fullName,
          dob: patient.dob,
          sex: patient.sex,
          preferredLanguage: patient.preferred_language,
          preferredChannel: patient.preferred_channel,
          preferredContactWindow: patient.preferred_contact_window,
          quietHours: patient.quiet_hours,
          phone: canViewUnmaskedPhone ? rawPhone : maskPhone(rawPhone),
          phoneMasked: maskPhone(rawPhone),
          canViewUnmaskedPhone,
          email: canViewUnmaskedPhone ? email : null,
          address: canViewUnmaskedPhone ? address : null,
          accessibilityNeeds: patient.accessibility_needs,
          departmentId: patient.assigned_department_id,
          departmentName: patient.department_name,
          status: patient.status
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

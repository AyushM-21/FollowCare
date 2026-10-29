import { z } from 'zod';

export const UserRole = {
  ADMIN: 'admin',
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  COORDINATOR: 'coordinator',
  HEALTH_WORKER: 'health_worker',
  PATIENT: 'patient',
  CAREGIVER: 'caregiver'
};

export const UserStatus = {
  INVITED: 'invited',
  ACTIVE: 'active',
  DEACTIVATED: 'deactivated',
  LOCKED: 'locked'
};

export const UrgencyLevel = {
  ROUTINE: 'routine',
  PRIORITY: 'priority',
  URGENT: 'urgent'
};

export const PlanStatus = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  SUPERSEDED: 'superseded'
};

export const VisitChannel = {
  IN_PERSON: 'in_person',
  TELECONSULTATION: 'teleconsultation'
};

export const AppointmentStatus = {
  REQUESTED: 'requested',
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  CHECKED_IN: 'checked_in',
  ATTENDED: 'attended',
  MISSED: 'missed',
  CANCELLED: 'cancelled',
  RESCHEDULED: 'rescheduled'
};

export const TaskStatus = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  AWAITING_RESPONSE: 'awaiting_response',
  ESCALATED: 'escalated',
  COMPLETED: 'completed'
};

export const TaskType = {
  CONTACT_PATIENT: 'contact_patient',
  RESCHEDULE: 'reschedule',
  RESOLVE_FAILED_DELIVERY: 'resolve_failed_delivery',
  RESOLVE_BARRIER: 'resolve_barrier',
  REVIEW_AMBIGUITY: 'review_ambiguity',
  ESCALATE_CLINICAL: 'escalate_clinical',
  VERIFY_CONTACT: 'verify_contact'
};

export const ContactChannel = {
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
  EMAIL: 'email',
  IN_APP: 'in_app',
  PHONE_CALL: 'phone_call'
};

export const ContactOutcome = {
  REACHED: 'reached',
  NO_ANSWER: 'no_answer',
  INVALID_CONTACT: 'invalid_contact',
  REQUESTED_CALLBACK: 'requested_callback',
  REQUESTED_RESCHEDULE: 'requested_reschedule',
  CANNOT_TRAVEL: 'cannot_travel',
  DECLINED: 'declined',
  VISITED_ELSEWHERE: 'visited_elsewhere',
  CAREGIVER_CONTACTED: 'caregiver_contacted'
};

export const DeliveryStatus = {
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  SUPPRESSED: 'suppressed'
};

export const AckStatus = {
  PENDING: 'pending',
  ACKNOWLEDGED: 'acknowledged',
  NOT_REQUIRED: 'not_required'
};

export const BarrierType = {
  TRAVEL: 'travel',
  COST: 'cost',
  WORK_SCHEDULE: 'work_schedule',
  CAREGIVER_UNAVAILABLE: 'caregiver_unavailable',
  HEALTH_CONCERN: 'health_concern',
  LANGUAGE: 'language',
  CONTACT_ISSUE: 'contact_issue',
  OTHER: 'other'
};

export const ConsentType = {
  REMINDERS: 'reminders',
  CAREGIVER_SHARING: 'caregiver_sharing',
  DATA_PROCESSING: 'data_processing',
  WHATSAPP_CONTACT: 'whatsapp_contact',
  RESEARCH_EXPORT: 'research_export'
};

export const AuditAction = {
  VIEW: 'view',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  EXPORT: 'export',
  SHARE: 'share',
  LOGIN: 'login',
  LOGOUT: 'logout',
  FAILED_LOGIN: 'failed_login',
  PERMISSION_CHANGE: 'permission_change',
  MERGE: 'merge'
};

export const Permissions = {
  MANAGE_SETTINGS: 'manage:settings',
  MANAGE_STAFF: 'manage:staff',
  PLAN_CREATE: 'plan:create',
  PLAN_APPROVE: 'plan:approve',
  PLAN_EDIT: 'plan:edit',
  PATIENT_VIEW_DEMOGRAPHICS: 'patient:view_demographics',
  PATIENT_VIEW_CLINICAL: 'patient:view_clinical',
  PATIENT_VIEW_CONTACT: 'patient:view_contact',
  TASK_WORK: 'task:work',
  TASK_LOG_OUTCOME: 'task:log_outcome',
  APPOINTMENT_BOOK: 'appointment:book',
  REPORT_EXPORT: 'report:export',
  AUDIT_VIEW: 'audit:view'
};

export const ROLE_PERMISSIONS = {
  [UserRole.ADMIN]: [
    Permissions.MANAGE_SETTINGS,
    Permissions.MANAGE_STAFF,
    Permissions.PLAN_CREATE,
    Permissions.PLAN_APPROVE,
    Permissions.PLAN_EDIT,
    Permissions.PATIENT_VIEW_DEMOGRAPHICS,
    Permissions.TASK_WORK,
    Permissions.TASK_LOG_OUTCOME,
    Permissions.APPOINTMENT_BOOK,
    Permissions.REPORT_EXPORT,
    Permissions.AUDIT_VIEW
  ],
  [UserRole.DOCTOR]: [
    Permissions.PLAN_CREATE,
    Permissions.PLAN_APPROVE,
    Permissions.PLAN_EDIT,
    Permissions.PATIENT_VIEW_DEMOGRAPHICS,
    Permissions.PATIENT_VIEW_CLINICAL,
    Permissions.TASK_WORK,
    Permissions.TASK_LOG_OUTCOME,
    Permissions.APPOINTMENT_BOOK,
    Permissions.REPORT_EXPORT
  ],
  [UserRole.NURSE]: [
    Permissions.PLAN_CREATE, // draft only
    Permissions.PATIENT_VIEW_DEMOGRAPHICS,
    Permissions.PATIENT_VIEW_CLINICAL,
    Permissions.TASK_WORK,
    Permissions.TASK_LOG_OUTCOME,
    Permissions.APPOINTMENT_BOOK
  ],
  [UserRole.COORDINATOR]: [
    Permissions.PATIENT_VIEW_DEMOGRAPHICS,
    Permissions.PATIENT_VIEW_CONTACT, // on active task
    Permissions.TASK_WORK,
    Permissions.TASK_LOG_OUTCOME,
    Permissions.APPOINTMENT_BOOK
  ],
  [UserRole.HEALTH_WORKER]: [
    Permissions.PATIENT_VIEW_DEMOGRAPHICS,
    Permissions.PATIENT_VIEW_CONTACT, // on active task
    Permissions.TASK_WORK,
    Permissions.TASK_LOG_OUTCOME,
    Permissions.APPOINTMENT_BOOK
  ],
  [UserRole.PATIENT]: [],
  [UserRole.CAREGIVER]: []
};

// Validation Schemas

export const CreateAppointmentSchema = z.object({
  plan_id: z.string().uuid().nullable().optional(),
  patient_id: z.string().uuid(),
  department_id: z.string().uuid(),
  clinician_id: z.string().uuid().nullable().optional(),
  scheduled_at: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid appointment date/time'
  }),
  walk_in: z.boolean().default(false)
});

export const UpdateAppointmentSchema = z.object({
  status: z.enum(['requested', 'scheduled', 'confirmed', 'checked_in', 'attended', 'missed', 'cancelled', 'rescheduled']).optional(),
  scheduled_at: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid appointment date/time'
  }).optional()
}).refine((value) => value.status !== undefined || value.scheduled_at !== undefined, {
  message: 'At least one of status or scheduled_at must be provided'
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const PatientOtpRequestSchema = z.object({
  phone: z.string().min(10).max(15)
});

export const PatientOtpVerifySchema = z.object({
  phone: z.string().min(10).max(15),
  code: z.string().length(6)
});

export const CreatePlanSchema = z.object({
  patient_id: z.string().uuid(),
  department_id: z.string().uuid(),
  window_start: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid start date' }),
  window_end: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid end date' }),
  urgency: z.enum(['routine', 'priority', 'urgent']).default('routine'),
  reason_category: z.string().min(1),
  reason_note: z.string().optional(),
  channel: z.enum(['in_person', 'teleconsultation']).default('in_person'),
  instructions_text: z.string().min(3),
  required_tests: z.array(z.string()).default([]),
  required_documents: z.array(z.string()).default([]),
  owner_task_assignee: z.string().uuid().optional()
});

export const UpdateTaskStatusSchema = z.object({
  status: z.enum(['todo', 'in_progress', 'awaiting_response', 'escalated', 'completed']),
  comment: z.string().optional()
});

export const AssignTaskSchema = z.object({
  assignee_id: z.string().uuid()
});

export const LogContactAttemptSchema = z.object({
  channel: z.enum(['sms', 'whatsapp', 'email', 'in_app', 'phone_call']),
  outcome: z.enum([
    'reached',
    'no_answer',
    'invalid_contact',
    'requested_callback',
    'requested_reschedule',
    'cannot_travel',
    'declined',
    'visited_elsewhere',
    'caregiver_contacted'
  ]),
  notes: z.string().optional(),
  callback_at: z.string().optional(),
  close_follow_up: z.boolean().optional(),
  final_status: z.enum(['attended', 'rescheduled', 'visited_elsewhere', 'declined', 'unreachable_unresolved', 'cancelled']).optional(),
  barrier_type: z.enum(['travel', 'cost', 'work_schedule', 'caregiver_unavailable', 'health_concern', 'language', 'contact_issue', 'other']).optional()
});

export const PatientHelpRequestSchema = z.object({
  plan_id: z.string().uuid(),
  barrier_type: z.enum(['travel', 'cost', 'work_schedule', 'caregiver_unavailable', 'health_concern', 'language', 'contact_issue', 'other']),
  note: z.string().max(500).optional(),
  requested_callback: z.boolean().default(true)
});

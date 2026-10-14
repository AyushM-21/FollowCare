-- 001_enums.sql: FollowCare domain enums per ARCHITECTURE.md Section 7.1

CREATE TYPE user_role AS ENUM (
  'admin',
  'doctor',
  'nurse',
  'coordinator',
  'health_worker',
  'patient',
  'caregiver'
);

CREATE TYPE user_status AS ENUM (
  'invited',
  'active',
  'deactivated',
  'locked'
);

CREATE TYPE urgency_level AS ENUM (
  'routine',
  'priority',
  'urgent'
);

CREATE TYPE plan_status AS ENUM (
  'draft',
  'pending_approval',
  'active',
  'completed',
  'cancelled',
  'superseded'
);

CREATE TYPE visit_channel AS ENUM (
  'in_person',
  'teleconsultation'
);

CREATE TYPE appointment_status AS ENUM (
  'requested',
  'scheduled',
  'confirmed',
  'checked_in',
  'attended',
  'missed',
  'cancelled',
  'rescheduled'
);

CREATE TYPE task_status AS ENUM (
  'todo',
  'in_progress',
  'awaiting_response',
  'escalated',
  'completed'
);

CREATE TYPE task_type AS ENUM (
  'contact_patient',
  'reschedule',
  'resolve_failed_delivery',
  'resolve_barrier',
  'review_ambiguity',
  'escalate_clinical',
  'verify_contact'
);

CREATE TYPE contact_channel AS ENUM (
  'sms',
  'whatsapp',
  'email',
  'in_app',
  'phone_call'
);

CREATE TYPE contact_outcome AS ENUM (
  'reached',
  'no_answer',
  'invalid_contact',
  'requested_callback',
  'requested_reschedule',
  'cannot_travel',
  'declined',
  'visited_elsewhere',
  'caregiver_contacted'
);

CREATE TYPE delivery_status AS ENUM (
  'queued',
  'sent',
  'delivered',
  'failed',
  'suppressed'
);

CREATE TYPE ack_status AS ENUM (
  'pending',
  'acknowledged',
  'not_required'
);

CREATE TYPE barrier_type AS ENUM (
  'travel',
  'cost',
  'work_schedule',
  'caregiver_unavailable',
  'health_concern',
  'language',
  'contact_issue',
  'other'
);

CREATE TYPE consent_type AS ENUM (
  'reminders',
  'caregiver_sharing',
  'data_processing',
  'whatsapp_contact',
  'research_export'
);

CREATE TYPE audit_action AS ENUM (
  'view',
  'create',
  'update',
  'delete',
  'export',
  'share',
  'login',
  'logout',
  'failed_login',
  'permission_change',
  'merge'
);

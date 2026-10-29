import { describe, expect, it } from 'vitest';
import {
  CreateAppointmentSchema,
  CreatePlanSchema,
  UpdateAppointmentSchema
} from '@followcare/shared';

const validPlan = {
  patient_id: '11111111-1111-4111-8111-111111111111',
  department_id: '22222222-2222-4222-8222-222222222222',
  window_start: '2026-11-01',
  window_end: '2026-11-07',
  urgency: 'routine',
  reason_category: 'routine_follow_up',
  channel: 'in_person',
  instructions_text: 'Please attend your follow-up appointment.'
};

describe('SRS input validation: follow-up plans and appointments', () => {
  it('accepts a valid follow-up date range', () => {
    expect(CreatePlanSchema.safeParse(validPlan).success).toBe(true);
  });

  it('rejects a follow-up window ending before it starts', () => {
    const result = CreatePlanSchema.safeParse({
      ...validPlan,
      window_start: '2026-11-08',
      window_end: '2026-11-07'
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid appointment timestamp', () => {
    const result = CreateAppointmentSchema.safeParse({
      patient_id: '11111111-1111-4111-8111-111111111111',
      department_id: '22222222-2222-4222-8222-222222222222',
      scheduled_at: 'not-a-date'
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty appointment update', () => {
    expect(UpdateAppointmentSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a reschedule update with a valid timestamp', () => {
    expect(UpdateAppointmentSchema.safeParse({ scheduled_at: '2026-11-08T10:30:00Z' }).success).toBe(true);
  });
});

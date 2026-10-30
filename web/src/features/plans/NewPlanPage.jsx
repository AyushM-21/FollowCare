/**
 * FollowCare — New Follow-up Plan Page (Doctor/Nurse workflow)
 * Uses CreatePlanSchema from @followcare/shared for validation.
 * POST /api/plans
 */

import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePatients } from '../../api/queries.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { api } from '../../api/client.js';
import { UrgencyLevel, VisitChannel } from '@followcare/shared';
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  FileText,
  Info,
  Plus,
  UserRound,
  AlertCircle
} from 'lucide-react';

const REASON_CATEGORIES = [
  'Post-surgical follow-up',
  'Chronic disease management',
  'Medication review',
  'Lab/investigation review',
  'Physiotherapy follow-up',
  'Oncology follow-up',
  'Cardiac follow-up',
  'Diabetic care',
  'Mental health follow-up',
  'Other'
];

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60';

function SectionHeading({ icon: Icon, title, description }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function FieldLabel({ htmlFor, children, required = false }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-semibold text-slate-700"
    >
      {children}
      {required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}
    </label>
  );
}

export default function NewPlanPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeDepartmentId, departments } = useAuth();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    patient_id: searchParams.get('patient') || '',
    department_id: activeDepartmentId || (departments[0]?.id ?? ''),
    window_start: '',
    window_end: '',
    urgency: UrgencyLevel.ROUTINE,
    reason_category: '',
    reason_note: '',
    channel: VisitChannel.IN_PERSON,
    instructions_text: '',
    required_tests: '',
    required_documents: ''
  });

  const [validationError, setValidationError] = useState('');

  const patientsQuery = usePatients({
    departmentId: form.department_id
  });

  const patientsAll = patientsQuery.data?.patients || [];

  const mutation = useMutation({
    mutationFn: payload => api.post('/api/plans', payload),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      navigate(`/staff/plans/${data.plan?.id || ''}`, { replace: true });
    }
  });

  const set = field => event => {
    const value = event.target.value;
    setForm(current => ({ ...current, [field]: value }));
  };

  const handleSubmit = event => {
    event.preventDefault();
    setValidationError('');

    if (!form.patient_id) {
      return setValidationError('Select a patient.');
    }

    if (!form.department_id) {
      return setValidationError('Select a department.');
    }

    if (!form.window_start || !form.window_end) {
      return setValidationError('Set the follow-up window dates.');
    }

    if (new Date(form.window_end) < new Date(form.window_start)) {
      return setValidationError('End date must be after start date.');
    }

    if (!form.reason_category) {
      return setValidationError('Select a reason category.');
    }

    if (!form.instructions_text || form.instructions_text.trim().length < 3) {
      return setValidationError('Instructions must be at least 3 characters.');
    }

    const payload = {
      patient_id: form.patient_id,
      department_id: form.department_id,
      window_start: form.window_start,
      window_end: form.window_end,
      urgency: form.urgency,
      reason_category: form.reason_category,
      reason_note: form.reason_note || undefined,
      channel: form.channel,
      instructions_text: form.instructions_text.trim(),
      required_tests: form.required_tests
        ? form.required_tests.split(',').map(value => value.trim()).filter(Boolean)
        : [],
      required_documents: form.required_documents
        ? form.required_documents.split(',').map(value => value.trim()).filter(Boolean)
        : []
    };

    mutation.mutate(payload);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link
          to="/staff/plans"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to plans
        </Link>

        <div className="flex items-start gap-4">
          <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 sm:flex">
            <Plus className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              Care management
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
              New Follow-up Plan
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Set up a follow-up schedule and provide the patient with instructions.
            </p>
          </div>
        </div>
      </div>

      {/* Form errors */}
      {(validationError || mutation.isError) && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{validationError || mutation.error?.message || 'Unable to create plan.'}</p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
      >
        <div className="space-y-8 p-5 sm:p-7">
          {/* Patient and department */}
          <section>
            <SectionHeading
              icon={UserRound}
              title="Patient and department"
              description="Choose the patient and the department responsible for follow-up."
            />

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="patient_id" required>Patient</FieldLabel>
                <select
                  id="patient_id"
                  className={inputClass}
                  value={form.patient_id}
                  onChange={set('patient_id')}
                  required
                  disabled={patientsQuery.isLoading}
                >
                  <option value="">
                    {patientsQuery.isLoading ? 'Loading patients...' : 'Select patient'}
                  </option>
                  {patientsAll.map(patient => (
                    <option key={patient.id} value={patient.id}>
                      {patient.patientName || patient.hospital_reg_no}
                    </option>
                  ))}
                </select>
                {patientsQuery.isError && (
                  <p className="mt-1.5 text-xs text-red-600">
                    Could not load patients. Please refresh and try again.
                  </p>
                )}
              </div>

              <div>
                <FieldLabel htmlFor="department_id" required>Department</FieldLabel>
                <select
                  id="department_id"
                  className={inputClass}
                  value={form.department_id}
                  onChange={set('department_id')}
                  required
                >
                  <option value="">Select department</option>
                  {departments.map(department => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <div className="border-t border-slate-100" />

          {/* Follow-up schedule */}
          <section>
            <SectionHeading
              icon={CalendarDays}
              title="Follow-up schedule"
              description="Define the follow-up date window and communication preferences."
            />

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="window_start" required>Window start</FieldLabel>
                <input
                  id="window_start"
                  type="date"
                  className={inputClass}
                  value={form.window_start}
                  onChange={set('window_start')}
                  required
                />
              </div>

              <div>
                <FieldLabel htmlFor="window_end" required>Window end</FieldLabel>
                <input
                  id="window_end"
                  type="date"
                  className={inputClass}
                  value={form.window_end}
                  onChange={set('window_end')}
                  min={form.window_start || undefined}
                  required
                />
              </div>

              <div>
                <FieldLabel htmlFor="urgency">Urgency</FieldLabel>
                <select
                  id="urgency"
                  className={inputClass}
                  value={form.urgency}
                  onChange={set('urgency')}
                >
                  <option value="routine">Routine</option>
                  <option value="priority">Priority</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <FieldLabel htmlFor="channel">Visit channel</FieldLabel>
                <select
                  id="channel"
                  className={inputClass}
                  value={form.channel}
                  onChange={set('channel')}
                >
                  <option value="in_person">In-person</option>
                  <option value="teleconsultation">Teleconsultation</option>
                </select>
              </div>
            </div>
          </section>

          <div className="border-t border-slate-100" />

          {/* Reason and instructions */}
          <section>
            <SectionHeading
              icon={FileText}
              title="Reason and instructions"
              description="Record the follow-up reason and the instructions visible to the patient."
            />

            <div className="space-y-5">
              <div>
                <FieldLabel htmlFor="reason_category" required>
                  Reason category
                </FieldLabel>
                <select
                  id="reason_category"
                  className={inputClass}
                  value={form.reason_category}
                  onChange={set('reason_category')}
                  required
                >
                  <option value="">Select reason</option>
                  {REASON_CATEGORIES.map(reason => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
              </div>

              <div>
                <FieldLabel htmlFor="reason_note">
                  Clinical note <span className="font-normal text-slate-400">(optional)</span>
                </FieldLabel>
                <textarea
                  id="reason_note"
                  className={inputClass}
                  rows={3}
                  value={form.reason_note}
                  onChange={set('reason_note')}
                  placeholder="Additional clinical context..."
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Stored encrypted. Not included in patient reminders.
                </p>
              </div>

              <div>
                <FieldLabel htmlFor="instructions_text" required>
                  Patient instructions
                </FieldLabel>
                <textarea
                  id="instructions_text"
                  className={inputClass}
                  rows={4}
                  value={form.instructions_text}
                  onChange={set('instructions_text')}
                  placeholder="Write clear, plain-language instructions for the patient..."
                  required
                />
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-blue-50 p-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                  <p className="text-xs leading-5 text-blue-800">
                    Reminders sent to patients use generic text only. These instructions are shown after secure login.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <div className="border-t border-slate-100" />

          {/* Requirements */}
          <section>
            <SectionHeading
              icon={ClipboardList}
              title="Additional requirements"
              description="List any tests or documents needed for the follow-up."
            />

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="required_tests">Required tests</FieldLabel>
                <input
                  id="required_tests"
                  type="text"
                  className={inputClass}
                  value={form.required_tests}
                  onChange={set('required_tests')}
                  placeholder="CBC, HbA1c, ECG..."
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Separate multiple items with commas.
                </p>
              </div>

              <div>
                <FieldLabel htmlFor="required_documents">Required documents</FieldLabel>
                <input
                  id="required_documents"
                  type="text"
                  className={inputClass}
                  value={form.required_documents}
                  onChange={set('required_documents')}
                  placeholder="ID, previous reports..."
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Separate multiple items with commas.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/15"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={mutation.isPending}
            aria-busy={mutation.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {mutation.isPending ? 'Creating plan...' : 'Create follow-up plan'}
          </button>
        </div>
      </form>
    </div>
  );
}

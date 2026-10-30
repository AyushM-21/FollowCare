/**
 * FollowCare — New Follow-up Plan Page (Doctor/Nurse workflow)
 * ARCHITECTURE.md Section 10.3 (View 2)
 *
 * Uses CreatePlanSchema from @followcare/shared for validation.
 * POST /api/plans
 * Nurse plans → pending_approval; Doctor/Admin plans → active (enforced server-side)
 */

import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePatients } from '../../api/queries.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { api } from '../../api/client.js';
import { UrgencyLevel, VisitChannel } from '@followcare/shared';

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
  const [patientSearch, setPatientSearch] = useState('');

  const patientsQuery = usePatients({
    search: patientSearch.trim() || undefined,
    departmentId: form.department_id
  });
  const patientsAll = patientsQuery.data?.patients || [];

  const mutation = useMutation({
    mutationFn: (payload) => api.post('/api/plans', payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      navigate(`/staff/plans/${data.plan?.id || ''}`, { replace: true });
    }
  });

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');

    if (!form.patient_id) return setValidationError('Select a patient.');
    if (!form.department_id) return setValidationError('Select a department.');
    if (!form.window_start || !form.window_end) return setValidationError('Set the follow-up window dates.');
    if (new Date(form.window_end) < new Date(form.window_start)) return setValidationError('End date must be after start date.');
    if (!form.reason_category) return setValidationError('Select a reason category.');
    if (!form.instructions_text || form.instructions_text.trim().length < 3) return setValidationError('Instructions must be at least 3 characters.');

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
      required_tests: form.required_tests ? form.required_tests.split(',').map(s => s.trim()).filter(Boolean) : [],
      required_documents: form.required_documents ? form.required_documents.split(',').map(s => s.trim()).filter(Boolean) : []
    };

    mutation.mutate(payload);
  };

  const fieldClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-60";

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-xl font-bold text-slate-900">New Follow-up Plan</h1>

      {(validationError || mutation.isError) && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
          {validationError || mutation.error?.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 space-y-5" noValidate>
        {/* Patient */}
        <div>
          <label htmlFor="patient_search" className="block text-sm font-medium text-slate-700 mb-1">
            Search patients
          </label>
          <input
            id="patient_search"
            type="search"
            className={fieldClass}
            value={patientSearch}
            onChange={event => setPatientSearch(event.target.value)}
            placeholder="Search by patient name or registration number…"
            autoComplete="off"
          />
          <label htmlFor="patient_id" className="block text-sm font-medium text-slate-700 mt-3 mb-1">
            Patient <span className="text-red-500">*</span>
          </label>
          <select
            id="patient_id"
            className={fieldClass}
            value={form.patient_id}
            onChange={set('patient_id')}
            required
            disabled={patientsQuery.isLoading || patientsAll.length === 0}
          >
            <option value="">
              {patientsQuery.isLoading ? 'Loading patients…' : 'Select patient…'}
            </option>
            {patientsAll.map(patient => (
              <option key={patient.id} value={patient.id}>
                {patient.fullName || patient.hospitalRegNo || 'Unnamed patient'}
                {patient.hospitalRegNo ? ` — ${patient.hospitalRegNo}` : ''}
              </option>
            ))}
          </select>
          {patientsQuery.isError && (
            <p className="mt-1 text-sm text-red-600" role="alert">
              Could not load patients. Please refresh and try again.
            </p>
          )}
          {!patientsQuery.isLoading && !patientsQuery.isError && patientsAll.length === 0 && (
            <p className="mt-1 text-sm text-slate-500">
              {patientSearch.trim()
                ? 'No patients match that search.'
                : 'No patients are available in this department.'}
            </p>
          )}
        </div>

        {/* Department */}
        <div>
          <label htmlFor="department_id" className="block text-sm font-medium text-slate-700 mb-1">
            Department <span className="text-red-500">*</span>
          </label>
          <select id="department_id" className={fieldClass} value={form.department_id} onChange={set('department_id')} required>
            <option value="">Select department…</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Window */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="window_start" className="block text-sm font-medium text-slate-700 mb-1">
              Window start <span className="text-red-500">*</span>
            </label>
            <input id="window_start" type="date" className={fieldClass} value={form.window_start} onChange={set('window_start')} required />
          </div>
          <div>
            <label htmlFor="window_end" className="block text-sm font-medium text-slate-700 mb-1">
              Window end <span className="text-red-500">*</span>
            </label>
            <input id="window_end" type="date" className={fieldClass} value={form.window_end} onChange={set('window_end')} required />
          </div>
        </div>

        {/* Urgency & Channel */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="urgency" className="block text-sm font-medium text-slate-700 mb-1">Urgency</label>
            <select id="urgency" className={fieldClass} value={form.urgency} onChange={set('urgency')}>
              <option value="routine">Routine</option>
              <option value="priority">Priority</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label htmlFor="channel" className="block text-sm font-medium text-slate-700 mb-1">Visit channel</label>
            <select id="channel" className={fieldClass} value={form.channel} onChange={set('channel')}>
              <option value="in_person">In-person</option>
              <option value="teleconsultation">Teleconsultation</option>
            </select>
          </div>
        </div>

        {/* Reason */}
        <div>
          <label htmlFor="reason_category" className="block text-sm font-medium text-slate-700 mb-1">
            Reason category <span className="text-red-500">*</span>
          </label>
          <select id="reason_category" className={fieldClass} value={form.reason_category} onChange={set('reason_category')} required>
            <option value="">Select reason…</option>
            {REASON_CATEGORIES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="reason_note" className="block text-sm font-medium text-slate-700 mb-1">
            Clinical note <span className="text-xs text-slate-500">(optional, encrypted at rest)</span>
          </label>
          <textarea id="reason_note" className={fieldClass} rows={2} value={form.reason_note} onChange={set('reason_note')}
            placeholder="Stored encrypted. Not included in patient reminders." />
        </div>

        {/* Instructions */}
        <div>
          <label htmlFor="instructions_text" className="block text-sm font-medium text-slate-700 mb-1">
            Patient instructions <span className="text-red-500">*</span>
          </label>
          <textarea id="instructions_text" className={fieldClass} rows={3} required
            value={form.instructions_text} onChange={set('instructions_text')}
            placeholder="Plain-language instructions for the patient…" />
          <p className="text-xs text-slate-500 mt-1">
            ⚠️ Reminders sent to patients use generic text only. These instructions are shown after secure login.
          </p>
        </div>

        {/* Tests & docs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="required_tests" className="block text-sm font-medium text-slate-700 mb-1">
              Required tests <span className="text-xs text-slate-500">(comma-separated)</span>
            </label>
            <input id="required_tests" type="text" className={fieldClass}
              value={form.required_tests} onChange={set('required_tests')} placeholder="CBC, HbA1c, ECG…" />
          </div>
          <div>
            <label htmlFor="required_documents" className="block text-sm font-medium text-slate-700 mb-1">
              Required documents <span className="text-xs text-slate-500">(comma-separated)</span>
            </label>
            <input id="required_documents" type="text" className={fieldClass}
              value={form.required_documents} onChange={set('required_documents')} placeholder="ID, previous reports…" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-5 py-2.5 rounded-md bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
            aria-busy={mutation.isPending}
          >
            {mutation.isPending ? 'Creating…' : 'Create Plan'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

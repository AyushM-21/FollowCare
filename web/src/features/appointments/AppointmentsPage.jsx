import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppointments, usePatients, useDepartments } from '../../api/queries.js';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import { Calendar, Clock, UserRound, CalendarDays, Plus, X, RefreshCw } from 'lucide-react';

const STATUS_STYLES = {
  scheduled: 'bg-blue-50 text-blue-700 ring-blue-600/10',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  checked_in: 'bg-teal-50 text-teal-700 ring-teal-600/10',
  attended: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  missed: 'bg-red-50 text-red-700 ring-red-600/10',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/10',
  requested: 'bg-amber-50 text-amber-700 ring-amber-600/10',
  rescheduled: 'bg-violet-50 text-violet-700 ring-violet-600/10'
};

function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) return 'Date not set';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function AppointmentRow({ appointment, onReschedule }) {
  const status = String(appointment.status || 'unknown').toLowerCase();
  const statusStyle = STATUS_STYLES[status] || 'bg-slate-100 text-slate-600 ring-slate-500/10';

  return (
    <li className="group px-4 py-4 transition-colors hover:bg-slate-50/80 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <CalendarDays className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-900">
              {appointment.patientName || appointment.patient_id || 'Unknown patient'}
            </h2>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                {formatDate(appointment.scheduled_at)}
              </span>

              {appointment.clinician_name && (
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="h-3.5 w-3.5 text-slate-400" />
                  {appointment.clinician_name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pl-14 sm:pl-0">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${statusStyle}`}>
            {status.replaceAll('_', ' ')}
          </span>
          {['scheduled', 'confirmed', 'missed', 'rescheduled'].includes(status) && (
            <button type="button" onClick={() => onReschedule(appointment)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Reschedule
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function AppointmentsPage() {
  const { activeDepartmentId } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useAppointments({ departmentId: activeDepartmentId });
  const patientsQuery = usePatients({ departmentId: activeDepartmentId });
  const departmentsQuery = useDepartments();
  const [showForm, setShowForm] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientId, setPatientId] = useState('');
  const [departmentId, setDepartmentId] = useState(activeDepartmentId || '');
  const [clinicianId, setClinicianId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const patients = patientsQuery.data?.patients || [];
  const selectedPatient = patients.find(patient => patient.id === patientId);
  const effectiveDepartmentId = selectedPatient?.departmentId || departmentId || activeDepartmentId || '';
  const cliniciansQuery = useQuery({
    queryKey: ['department-members', effectiveDepartmentId],
    queryFn: () => api.get(`/api/departments/${effectiveDepartmentId}/members`),
    enabled: Boolean(effectiveDepartmentId && showForm),
    staleTime: 60_000
  });

  const saveMutation = useMutation({
    mutationFn: ({ appointmentId, payload }) => appointmentId
      ? api.patch(`/api/appointments/${appointmentId}`, payload)
      : api.post('/api/appointments', payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['me', 'appointments'] });
      setShowForm(false);
      setEditingAppointment(null);
      setPatientId('');
      setPatientSearch('');
      setClinicianId('');
      setScheduledAt('');
    }
  });

  const appointments = data?.appointments || [];
  const openBooking = () => {
    setEditingAppointment(null);
    setPatientId('');
    setPatientSearch('');
    setClinicianId('');
    setDepartmentId(activeDepartmentId || '');
    setScheduledAt('');
    saveMutation.reset();
    setShowForm(true);
  };
  const openReschedule = appointment => {
    setEditingAppointment(appointment);
    setScheduledAt(toLocalDateTime(appointment.scheduled_at));
    saveMutation.reset();
    setShowForm(true);
  };
  const handleSubmit = event => {
    event.preventDefault();
    if (!scheduledAt) return;
    if (editingAppointment) {
      saveMutation.mutate({
        appointmentId: editingAppointment.id,
        payload: {
          scheduled_at: new Date(scheduledAt).toISOString(),
          status: editingAppointment.status === 'rescheduled' ? 'scheduled' : 'rescheduled'
        }
      });
      return;
    }
    if (!selectedPatient) return;
    const targetDepartmentId = selectedPatient.departmentId || departmentId || activeDepartmentId;
    if (!targetDepartmentId) return;
    saveMutation.mutate({
      payload: {
        patient_id: patientId,
        department_id: targetDepartmentId,
        clinician_id: clinicianId || undefined,
        scheduled_at: new Date(scheduledAt).toISOString()
      }
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Care coordination</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Appointments
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            View scheduled patient appointments and their current status.
          </p>
        </div>

        {!isLoading && !isError && (
          <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm">
            <Calendar className="h-4 w-4 text-blue-600" />
            <span className="font-semibold tabular-nums text-slate-900">
              {appointments.length}
            </span>
            <span className="text-slate-500">
              {appointments.length === 1 ? 'appointment' : 'appointments'}
            </span>
          </div>
        )}
      </header>

      <div className="flex justify-end">
        <button type="button" onClick={openBooking} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">
          <Plus className="h-4 w-4" /> Book appointment
        </button>
      </div>

      {showForm && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">{editingAppointment ? 'Reschedule appointment' : 'Book an appointment'}</h2>
              <p className="mt-1 text-xs text-slate-500">{editingAppointment ? 'Choose a new date and time.' : 'Select a patient, department, doctor and time.'}</p>
            </div>
            <button type="button" onClick={() => { setShowForm(false); setEditingAppointment(null); saveMutation.reset(); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close appointment form">
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            {!editingAppointment && (
              <>
                <div className="sm:col-span-2">
                  <label htmlFor="appointment-patient-search" className="mb-1.5 block text-xs font-semibold text-slate-600">Find patient</label>
                  <input id="appointment-patient-search" value={patientSearch} onChange={event => { setPatientSearch(event.target.value); setPatientId(''); }} placeholder="Filter by patient name or registration number" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  <label htmlFor="appointment-patient" className="mb-1.5 mt-3 block text-xs font-semibold text-slate-600">Patient</label>
                  <select id="appointment-patient" required value={patientId} onChange={event => { setPatientId(event.target.value); setClinicianId(''); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                    <option value="">Select patient</option>
                    {patients.filter(patient => !patientSearch || patient.fullName?.toLowerCase().includes(patientSearch.toLowerCase()) || patient.hospitalRegNo?.toLowerCase().includes(patientSearch.toLowerCase())).map(patient => (
                      <option key={patient.id} value={patient.id}>{patient.fullName} · {patient.hospitalRegNo}</option>
                    ))}
                  </select>
                  {patientsQuery.isError && <p className="mt-1 text-xs text-red-700">{patientsQuery.error?.message || 'Could not load patients.'}</p>}
                  {!patientsQuery.isLoading && patients.length === 0 && <p className="mt-1 text-xs text-slate-500">No patient records available in your permitted departments.</p>}
                </div>

                {!selectedPatient?.departmentId && (
                  <div>
                    <label htmlFor="appointment-department" className="mb-1.5 block text-xs font-semibold text-slate-600">Department</label>
                    <select id="appointment-department" required value={departmentId} onChange={event => { setDepartmentId(event.target.value); setClinicianId(''); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                      <option value="">Select department</option>
                      {(departmentsQuery.data?.departments || []).map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label htmlFor="appointment-clinician" className="mb-1.5 block text-xs font-semibold text-slate-600">Doctor (optional)</label>
                  <select id="appointment-clinician" value={clinicianId} onChange={event => setClinicianId(event.target.value)} disabled={!effectiveDepartmentId || cliniciansQuery.isLoading} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm disabled:bg-slate-50">
                    <option value="">No doctor assigned</option>
                    {(cliniciansQuery.data?.members || []).filter(member => member.role === 'doctor').map(member => <option key={member.id} value={member.id}>{member.fullName}</option>)}
                  </select>
                  {cliniciansQuery.isError && <p className="mt-1 text-xs text-red-700">Could not load doctors for this department.</p>}
                </div>
              </>
            )}

            <div className={editingAppointment ? 'sm:col-span-2' : ''}>
              <label htmlFor="appointment-date" className="mb-1.5 block text-xs font-semibold text-slate-600">Date and time</label>
              <input id="appointment-date" type="datetime-local" required value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            </div>

            {saveMutation.isError && <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{saveMutation.error?.message || 'Could not save appointment.'}</p>}

            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={() => { setShowForm(false); setEditingAppointment(null); saveMutation.reset(); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="submit" disabled={saveMutation.isPending || (!editingAppointment && (!patientId || !effectiveDepartmentId))} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saveMutation.isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
                {saveMutation.isPending ? 'Saving…' : editingAppointment ? 'Save new time' : 'Book appointment'}
              </button>
            </div>
          </form>
        </section>
      )}

      {isLoading && <LoadingSpinner label="Loading appointments…" />}

      {isError && (
        <ErrorState
          title="Failed to load appointments"
          message={error?.message}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Appointment schedule
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Department appointments
              </p>
            </div>
            <Clock className="h-5 w-5 text-slate-400" />
          </div>

          {appointments.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                <CalendarDays className="h-6 w-6 text-slate-400" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-900">
                No appointments found
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                There are no appointments available for this department.
              </p>
            </div>
          ) : (
            <ul role="list" className="divide-y divide-slate-100">
              {appointments.map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  onReschedule={openReschedule}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

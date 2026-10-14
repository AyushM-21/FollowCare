/**
 * FollowCare — Patient Appointments Page
 * GET /api/me/appointments
 */

import React from 'react';
import { usePatientAppointments } from '../../api/queries.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import { Calendar, Clock, MapPin } from 'lucide-react';

const STATUS_STYLES = {
  requested: 'bg-amber-100 text-amber-700',
  scheduled: 'bg-brand-100 text-brand-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  checked_in: 'bg-teal-100 text-teal-700',
  attended: 'bg-emerald-100 text-emerald-700',
  missed: 'bg-red-100 text-red-600',
  cancelled: 'bg-slate-100 text-slate-500',
  rescheduled: 'bg-violet-100 text-violet-700'
};

const STATUS_LABELS = {
  requested: 'Requested',
  scheduled: 'Scheduled',
  confirmed: 'Confirmed ✓',
  checked_in: 'Checked In',
  attended: 'Attended',
  missed: 'Missed',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled'
};

function AppointmentCard({ appt }) {
  const statusStyle = STATUS_STYLES[appt.status] || 'bg-slate-100 text-slate-600';
  const scheduledAt = appt.scheduled_at ? new Date(appt.scheduled_at) : null;
  const isPast = scheduledAt && scheduledAt < new Date();
  const isMissed = appt.status === 'missed';

  return (
    <div className={`rounded-xl border p-4 ${isMissed ? 'bg-red-50 border-red-200' : isPast ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">Hospital Appointment</p>
          {appt.department_name && (
            <p className="text-sm text-slate-500 mt-0.5">{appt.department_name}</p>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusStyle}`}>
          {STATUS_LABELS[appt.status] || appt.status}
        </span>
      </div>

      {scheduledAt && (
        <div className="flex items-center gap-2 mt-3 text-sm text-slate-700">
          <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span>
            <strong>{scheduledAt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</strong>
            {' at '}
            <strong>{scheduledAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</strong>
          </span>
        </div>
      )}

      {appt.clinician_name && (
        <div className="flex items-center gap-2 mt-2 text-sm text-slate-500">
          <Clock className="w-4 h-4" />
          Doctor: {appt.clinician_name}
        </div>
      )}

      {isMissed && (
        <div className="mt-3 p-3 bg-red-100 rounded-lg">
          <p className="text-sm text-red-800 font-medium">You missed this appointment.</p>
          <p className="text-xs text-red-600 mt-0.5">Your care team will reach out to reschedule.</p>
        </div>
      )}

      {appt.status === 'confirmed' && (
        <div className="mt-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
          <p className="text-sm text-emerald-800 font-medium">Your appointment is confirmed.</p>
          <p className="text-xs text-emerald-600 mt-0.5">Please arrive 15 minutes early.</p>
        </div>
      )}
    </div>
  );
}

export default function PatientAppointmentsPage() {
  const { data, isLoading, isError, error, refetch } = usePatientAppointments();
  const appointments = data?.appointments || [];

  const upcoming = appointments.filter(a => !['attended', 'missed', 'cancelled'].includes(a.status))
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const past = appointments.filter(a => ['attended', 'missed', 'cancelled'].includes(a.status));

  if (isLoading) return <LoadingSpinner label="Loading appointments…" />;
  if (isError) return <ErrorState title="Unable to load appointments" message={error?.message} onRetry={refetch} />;

  return (
    <div className="p-4 space-y-5">
      <h1 className="text-lg font-bold text-slate-900">My Appointments</h1>

      {upcoming.length === 0 && past.length === 0 && (
        <div className="text-center py-12 text-sm text-slate-500">
          No appointments scheduled.
        </div>
      )}

      {upcoming.length > 0 && (
        <section aria-label="Upcoming appointments">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Upcoming</h2>
          <div className="space-y-3">
            {upcoming.map(a => <AppointmentCard key={a.id} appt={a} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section aria-label="Past appointments">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Past</h2>
          <div className="space-y-3">
            {past.map(a => <AppointmentCard key={a.id} appt={a} />)}
          </div>
        </section>
      )}
    </div>
  );
}

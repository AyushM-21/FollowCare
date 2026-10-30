import { useAppointments } from '../../api/queries.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import { Calendar, Clock, UserRound, CalendarDays } from 'lucide-react';

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

function AppointmentRow({ appointment }) {
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

        <div className="flex items-center pl-14 sm:pl-0">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${statusStyle}`}>
            {status.replaceAll('_', ' ')}
          </span>
        </div>
      </div>
    </li>
  );
}

export default function AppointmentsPage() {
  const { activeDepartmentId } = useAuth();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch
  } = useAppointments({ departmentId: activeDepartmentId });

  const appointments = data?.appointments || [];

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
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

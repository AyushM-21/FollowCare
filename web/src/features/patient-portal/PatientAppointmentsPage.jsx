import React from 'react';
import { usePatientAppointments } from '../../api/queries.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Stethoscope,
} from 'lucide-react';

const STATUS_STYLES = {
  requested: 'bg-amber-50 text-amber-700 ring-amber-200',
  scheduled: 'bg-blue-50 text-blue-700 ring-blue-200',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  checked_in: 'bg-teal-50 text-teal-700 ring-teal-200',
  attended: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  missed: 'bg-red-50 text-red-700 ring-red-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
  rescheduled: 'bg-violet-50 text-violet-700 ring-violet-200',
};

const STATUS_LABELS = {
  requested: 'Requested',
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  attended: 'Attended',
  missed: 'Missed',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
};

function getAppointmentDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function AppointmentCard({ appt }) {
  const scheduledAt = getAppointmentDate(appt.scheduled_at);
  const isMissed = appt.status === 'missed';
  const isPast = ['attended', 'missed', 'cancelled'].includes(appt.status);
  const statusStyle =
    STATUS_STYLES[appt.status] || 'bg-slate-100 text-slate-600 ring-slate-200';

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${
        isMissed ? 'border-red-200' : 'border-slate-200'
      }`}
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <CalendarDays size={22} />
            </span>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900">
                Hospital appointment
              </h3>
              {appt.department_name && (
                <p className="mt-1 text-sm text-slate-500">
                  {appt.department_name}
                </p>
              )}
            </div>
          </div>

          <span
            className={`inline-flex w-fit shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyle}`}
          >
            {STATUS_LABELS[appt.status] || appt.status || 'Unknown'}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 shadow-sm">
              <CalendarDays size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Date and time</p>
              {scheduledAt ? (
                <>
                  <p className="mt-0.5 text-sm font-semibold text-slate-800">
                    {scheduledAt.toLocaleDateString(undefined, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {scheduledAt.toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </>
              ) : (
                <p className="mt-0.5 text-sm font-medium text-slate-700">
                  Not scheduled yet
                </p>
              )}
            </div>
          </div>

          {appt.clinician_name && (
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 shadow-sm">
                <Stethoscope size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Clinician</p>
                <p className="mt-0.5 break-words text-sm font-semibold text-slate-800">
                  {appt.clinician_name}
                </p>
              </div>
            </div>
          )}
        </div>

        {isMissed && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle size={19} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                This appointment was marked as missed.
              </p>
              <p className="mt-1 text-sm leading-5 text-red-700">
                Please contact your care team for information about arranging
                another appointment.
              </p>
            </div>
          </div>
        )}

        {appt.status === 'confirmed' && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2
              size={19}
              className="mt-0.5 shrink-0 text-emerald-600"
            />
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                Your appointment is confirmed.
              </p>
              <p className="mt-1 text-sm leading-5 text-emerald-700">
                Please plan to arrive 15 minutes early.
              </p>
            </div>
          </div>
        )}

        {appt.status === 'requested' && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Your appointment request is awaiting confirmation.
          </div>
        )}

        {appt.status === 'checked_in' && (
          <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
            You have been checked in for this appointment.
          </div>
        )}

        {isPast && appt.status === 'attended' && (
          <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 size={17} />
            Appointment attended
          </div>
        )}
      </div>
    </article>
  );
}

function EmptyState({ past = false }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        <CalendarDays size={23} />
      </div>
      <h3 className="mt-3 font-semibold text-slate-900">
        {past ? 'No past appointments' : 'No upcoming appointments'}
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">
        {past
          ? 'Your attended, missed, and cancelled appointments will appear here.'
          : 'There are no upcoming appointments in your schedule right now.'}
      </p>
    </div>
  );
}

export default function PatientAppointmentsPage() {
  const { data, isLoading, isError, error, refetch } =
    usePatientAppointments();

  if (isLoading) {
    return <LoadingSpinner label="Loading appointments…" />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Unable to load appointments"
        message={error?.message}
        onRetry={refetch}
      />
    );
  }

  const appointments = Array.isArray(data?.appointments)
    ? data.appointments
    : [];

  const pastStatuses = ['attended', 'missed', 'cancelled'];

  const upcoming = appointments
    .filter((item) => !pastStatuses.includes(item.status))
    .sort((a, b) => {
      const dateA = getAppointmentDate(a.scheduled_at)?.getTime() ?? Infinity;
      const dateB = getAppointmentDate(b.scheduled_at)?.getTime() ?? Infinity;
      return dateA - dateB;
    });

  const past = appointments
    .filter((item) => pastStatuses.includes(item.status))
    .sort((a, b) => {
      const dateA = getAppointmentDate(a.scheduled_at)?.getTime() ?? 0;
      const dateB = getAppointmentDate(b.scheduled_at)?.getTime() ?? 0;
      return dateB - dateA;
    });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7 px-4 py-5 sm:px-6 sm:py-7">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
          <CalendarDays size={14} />
          YOUR SCHEDULE
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          My appointments
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
          Review your upcoming visits and keep track of your appointment
          history.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Upcoming appointments</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {upcoming.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Past appointments</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {past.length}
          </p>
        </div>
      </div>

      {appointments.length === 0 && <EmptyState />}

      {upcoming.length > 0 && (
        <section aria-label="Upcoming appointments">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Upcoming</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your scheduled and requested visits
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {upcoming.length}
            </span>
          </div>
          <div className="space-y-4">
            {upcoming.map((appointment) => (
              <AppointmentCard key={appointment.id} appt={appointment} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section aria-label="Past appointments">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Past visits</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your appointment history
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {past.length}
            </span>
          </div>
          <div className="space-y-4">
            {past.map((appointment) => (
              <AppointmentCard key={appointment.id} appt={appointment} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

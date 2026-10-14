/**
 * FollowCare — Appointments Page
 * GET /api/appointments
 */

import React from 'react';
import { useAppointments } from '../../api/queries.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import { Calendar, Clock } from 'lucide-react';

const STATUS_STYLES = {
  scheduled: 'bg-brand-100 text-brand-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  checked_in: 'bg-teal-100 text-teal-700',
  attended: 'bg-emerald-100 text-emerald-700',
  missed: 'bg-red-100 text-red-600',
  cancelled: 'bg-slate-100 text-slate-500',
  requested: 'bg-amber-100 text-amber-700',
  rescheduled: 'bg-violet-100 text-violet-700'
};

export default function AppointmentsPage() {
  const { activeDepartmentId } = useAuth();
  const { data, isLoading, isError, error, refetch } = useAppointments({ departmentId: activeDepartmentId });
  const appointments = data?.appointments || [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Appointments</h1>

      {isLoading && <LoadingSpinner label="Loading appointments…" />}
      {isError && <ErrorState title="Failed to load appointments" message={error?.message} onRetry={refetch} />}

      {!isLoading && !isError && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          {appointments.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-500">No appointments found.</div>
          ) : (
            <ul role="list" className="divide-y divide-slate-100">
              {appointments.map(appt => (
                <li key={appt.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {appt.patientName || appt.patient_id}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        <Calendar className="w-3 h-3" />
                        {appt.scheduled_at ? new Date(appt.scheduled_at).toLocaleString() : '—'}
                        {appt.clinician_name && <span>· {appt.clinician_name}</span>}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_STYLES[appt.status] || 'bg-slate-100 text-slate-600'}`}>
                      {appt.status.replace('_', ' ')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

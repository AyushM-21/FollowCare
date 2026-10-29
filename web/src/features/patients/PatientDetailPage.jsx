/**
 * FollowCare — Patient Detail Page
 * Renders patient demographics and their follow-up plans.
 */

import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePatient, usePlans } from '../../api/queries.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import { ArrowLeft, Calendar, ClipboardList } from 'lucide-react';

function PlanStatusBadge({ status }) {
  const styles = {
    draft: 'bg-slate-100 text-slate-600',
    pending_approval: 'bg-amber-100 text-amber-700',
    active: 'bg-brand-100 text-brand-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-600',
    superseded: 'bg-slate-100 text-slate-500'
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] || ''}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

export default function PatientDetailPage() {
  const { id } = useParams();
  const patientQuery = usePatient(id);
  const plansQuery = usePlans({ patientId: id });

  if (patientQuery.isLoading) return <LoadingSpinner label="Loading patient…" />;
  if (patientQuery.isError) return <ErrorState title="Patient not found" message={patientQuery.error?.message} />;

  const pt = patientQuery.data?.patient || patientQuery.data;
  const plans = plansQuery.data?.plans || [];

  return (
    <div className="space-y-5">
      <Link to="/staff/patients" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to patients
      </Link>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h1 className="text-xl font-bold text-slate-900">{pt?.patientName || pt?.full_name}</h1>
        <p className="text-sm text-slate-500 mt-1">Reg: {pt?.hospitalRegNo}</p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {pt?.sex && <div><span className="text-slate-500">Sex: </span>{pt.sex}</div>}
          {pt?.preferred_language && <div><span className="text-slate-500">Language: </span>{pt.preferred_language}</div>}
          {pt?.preferred_channel && <div><span className="text-slate-500">Preferred channel: </span>{pt.preferred_channel}</div>}
        </div>
        <div className="mt-4">
          <Link
            to={`/staff/plans/new?patient=${id}`}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700 transition-colors"
          >
            <ClipboardList className="w-4 h-4" /> New Follow-up Plan
          </Link>
        </div>
      </div>

      {/* Plans */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Follow-up Plans</h2>
        {plansQuery.isLoading && <LoadingSpinner label="Loading plans…" />}
        {plansQuery.isError && <ErrorState title="Failed to load plans" message={plansQuery.error?.message} />}
        {!plansQuery.isLoading && plans.length === 0 && (
          <p className="text-sm text-slate-500">No follow-up plans yet.</p>
        )}
        <div className="space-y-2">
          {plans.map(plan => (
            <Link
              key={plan.id}
              to={`/staff/plans/${plan.id}`}
              className="block bg-white rounded-lg border border-slate-200 p-4 hover:border-brand-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">{plan.reason_category}</span>
                <PlanStatusBadge status={plan.status} />
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {plan.window_start ? new Date(plan.window_start).toLocaleDateString() : '—'} →{' '}
                  {plan.window_end ? new Date(plan.window_end).toLocaleDateString() : '—'}
                </span>
                <span className={plan.urgency === 'urgent' ? 'text-red-600 font-medium' : plan.urgency === 'priority' ? 'text-amber-600' : 'text-sky-600'}>
                  {plan.urgency}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * FollowCare — Plans List Page
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePlans } from '../../api/queries.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import { Plus, Calendar, ChevronRight } from 'lucide-react';

const STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-100 text-amber-700',
  active: 'bg-brand-100 text-brand-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-600',
  superseded: 'bg-slate-100 text-slate-500'
};

export default function PlansPage() {
  const { activeDepartmentId } = useAuth();
  const { data, isLoading, isError, error, refetch } = usePlans({ departmentId: activeDepartmentId });
  const plans = data?.plans || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Follow-up Plans</h1>
        <Link
          to="/staff/plans/new"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Plan
        </Link>
      </div>

      {isLoading && <LoadingSpinner label="Loading plans…" />}
      {isError && <ErrorState title="Failed to load plans" message={error?.message} onRetry={refetch} />}

      {!isLoading && !isError && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          {plans.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-500">
              No follow-up plans yet.{' '}
              <Link to="/staff/plans/new" className="text-brand-600 hover:underline">Create one.</Link>
            </div>
          ) : (
            <ul role="list" className="divide-y divide-slate-100">
              {plans.map(plan => (
                <li key={plan.id}>
                  <Link
                    to={`/staff/plans/${plan.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-800 truncate">{plan.reason_category}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[plan.status] || ''}`}>
                          {plan.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Patient: {plan.hospital_reg_no || plan.patient_id}
                      </p>
                      <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                        <Calendar className="w-3 h-3" />
                        {plan.window_end ? new Date(plan.window_end).toLocaleDateString() : '—'}
                        <span className={`ml-2 font-medium ${plan.urgency === 'urgent' ? 'text-red-600' : plan.urgency === 'priority' ? 'text-amber-600' : 'text-sky-600'}`}>
                          {plan.urgency}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * FollowCare — Plans List Page
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePlans } from '../../api/queries.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import {
  Plus,
  Calendar,
  ChevronRight,
  ClipboardList,
  Clock
} from 'lucide-react';

const STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-100 text-amber-700',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-600',
  superseded: 'bg-slate-100 text-slate-500'
};

function StatusBadge({ status }) {
  const normalizedStatus = status || 'unknown';

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
      STATUS_STYLES[normalizedStatus] || 'bg-slate-100 text-slate-600'
    }`}>
      {normalizedStatus.replaceAll('_', ' ')}
    </span>
  );
}

function UrgencyLabel({ urgency }) {
  const normalizedUrgency = urgency || 'routine';

  const styles = {
    urgent: 'text-red-600 bg-red-50',
    priority: 'text-amber-700 bg-amber-50',
    routine: 'text-sky-700 bg-sky-50'
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
      styles[normalizedUrgency] || 'text-slate-600 bg-slate-50'
    }`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {normalizedUrgency}
    </span>
  );
}

export default function PlansPage() {
  const { activeDepartmentId } = useAuth();
  const { data, isLoading, isError, error, refetch } = usePlans({
    departmentId: activeDepartmentId
  });

  const plans = data?.plans || [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
            Care management
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            Follow-up Plans
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create and manage patient follow-up plans.
          </p>
        </div>

        <Link
          to="/staff/plans/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Plan
        </Link>
      </div>

      {/* Loading and error states */}
      {isLoading && <LoadingSpinner label="Loading plans..." />}

      {isError && (
        <ErrorState
          title="Failed to load plans"
          message={error?.message}
          onRetry={refetch}
        />
      )}

      {/* Plans list */}
      {!isLoading && !isError && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                All plans
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Follow-up plans in the selected department.
              </p>
            </div>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {plans.length} {plans.length === 1 ? 'plan' : 'plans'}
            </span>
          </div>

          {plans.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-14 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <ClipboardList className="h-6 w-6 text-slate-400" aria-hidden="true" />
              </div>

              <h3 className="text-sm font-bold text-slate-800">
                No follow-up plans yet
              </h3>

              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Create a follow-up plan to begin organizing and tracking patient care.
              </p>

              <Link
                to="/staff/plans/new"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create your first plan
              </Link>
            </div>
          ) : (
            <ul role="list" className="divide-y divide-slate-100">
              {plans.map(plan => (
                <li key={plan.id}>
                  <Link
                    to={`/staff/plans/${plan.id}`}
                    className="group flex items-center gap-3 px-5 py-4 transition hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:gap-4 sm:px-6"
                  >
                    <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 sm:flex">
                      <ClipboardList className="h-5 w-5" aria-hidden="true" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-slate-900 transition group-hover:text-brand-700">
                          {plan.reason_category || 'Follow-up plan'}
                        </p>
                        <StatusBadge status={plan.status} />
                      </div>

                      <p className="mt-1 truncate text-xs text-slate-500">
                        Patient: {plan.hospital_reg_no || plan.patient_id || '—'}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                          Due: {plan.window_end
                            ? new Date(plan.window_end).toLocaleDateString()
                            : '—'}
                        </span>

                        <UrgencyLabel urgency={plan.urgency} />
                      </div>
                    </div>

                    <ChevronRight
                      className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

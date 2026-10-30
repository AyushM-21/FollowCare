/**
 * FollowCare — Patient Detail Page
 * Renders patient demographics and their follow-up plans.
 */

import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePatient, usePlans } from '../../api/queries.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import {
  ArrowLeft,
  Calendar,
  ClipboardList,
  UserRound,
  Languages,
  MessageCircle,
  ChevronRight
} from 'lucide-react';

function PlanStatusBadge({ status }) {
  const styles = {
    draft: 'bg-slate-100 text-slate-600',
    pending_approval: 'bg-amber-100 text-amber-700',
    active: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-600',
    superseded: 'bg-slate-100 text-slate-500'
  };

  const label = (status || 'unknown').replaceAll('_', ' ');

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
      {label}
    </span>
  );
}

function DetailItem({ icon: Icon, label, value }) {
  if (!value) return null;

  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl bg-slate-50 p-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

export default function PatientDetailPage() {
  const { id } = useParams();
  const patientQuery = usePatient(id);
  const plansQuery = usePlans({ patientId: id });

  if (patientQuery.isLoading) {
    return <LoadingSpinner label="Loading patient..." />;
  }

  if (patientQuery.isError) {
    return (
      <ErrorState
        title="Patient not found"
        message={patientQuery.error?.message}
      />
    );
  }

  const pt = patientQuery.data?.patient || patientQuery.data;
  const plans = plansQuery.data?.plans || [];

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Link
        to="/staff/patients"
        className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-slate-500 transition hover:text-brand-700 focus-visible:outline-none"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to patients
      </Link>

      {/* Patient profile */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50/80 via-white to-white px-5 py-6 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 ring-1 ring-blue-200/70">
                <UserRound className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                  Patient profile
                </p>
                <h1 className="mt-1 break-words text-2xl font-bold tracking-tight text-slate-950">
                  {pt?.patientName || pt?.full_name || 'Patient'}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Registration number: {pt?.hospitalRegNo || '—'}
                </p>
              </div>
            </div>

            <Link
              to={`/staff/plans/new?patient=${id}`}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20"
            >
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              New Follow-up Plan
            </Link>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          <h2 className="mb-3 text-sm font-bold text-slate-900">
            Patient information
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DetailItem
              icon={UserRound}
              label="Sex"
              value={pt?.sex}
            />
            <DetailItem
              icon={Languages}
              label="Preferred language"
              value={pt?.preferred_language}
            />
            <DetailItem
              icon={MessageCircle}
              label="Preferred channel"
              value={pt?.preferred_channel}
            />
          </div>
        </div>
      </section>

      {/* Follow-up plans */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-base font-bold tracking-tight text-slate-900">
              Follow-up Plans
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Follow-up activity associated with this patient.
            </p>
          </div>

          {!plansQuery.isLoading && !plansQuery.isError && (
            <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {plans.length} {plans.length === 1 ? 'plan' : 'plans'}
            </span>
          )}
        </div>

        <div className="p-4 sm:p-6">
          {plansQuery.isLoading && (
            <LoadingSpinner label="Loading plans..." />
          )}

          {plansQuery.isError && (
            <ErrorState
              title="Failed to load plans"
              message={plansQuery.error?.message}
              onRetry={plansQuery.refetch}
            />
          )}

          {!plansQuery.isLoading && !plansQuery.isError && plans.length === 0 && (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                <ClipboardList className="h-5 w-5 text-slate-400" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800">
                No follow-up plans yet
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Create a follow-up plan to start tracking this patient's care.
              </p>
              <Link
                to={`/staff/plans/new?patient=${id}`}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                Create follow-up plan
              </Link>
            </div>
          )}

          {!plansQuery.isLoading && !plansQuery.isError && plans.length > 0 && (
            <div className="space-y-3">
              {plans.map(plan => (
                <Link
                  key={plan.id}
                  to={`/staff/plans/${plan.id}`}
                  className="group block rounded-xl border border-slate-200 p-4 transition hover:border-brand-300 hover:bg-blue-50/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/15 sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 transition group-hover:text-brand-700">
                        {plan.reason_category || 'Follow-up plan'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                          {plan.window_start
                            ? new Date(plan.window_start).toLocaleDateString()
                            : '—'}
                          {' → '}
                          {plan.window_end
                            ? new Date(plan.window_end).toLocaleDateString()
                            : '—'}
                        </span>

                        <span
                          className={`font-semibold capitalize ${
                            plan.urgency === 'urgent'
                              ? 'text-red-600'
                              : plan.urgency === 'priority'
                                ? 'text-amber-600'
                                : 'text-sky-600'
                          }`}
                        >
                          {plan.urgency || 'routine'}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                      <PlanStatusBadge status={plan.status} />
                      <ChevronRight
                        className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

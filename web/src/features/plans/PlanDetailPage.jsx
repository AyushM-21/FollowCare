/**
 * FollowCare — Plan Detail + Version History
 * GET /api/plans/:id (with versions in response)
 */

import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePlan } from '../../api/queries.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { api } from '../../api/client.js';
import { Permissions } from '@followcare/shared';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import {
  ArrowLeft,
  CheckCircle2,
  Calendar,
  History,
  ClipboardList,
  Clock,
  Building2,
  MessageSquare,
  AlertCircle,
  FileText
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
  const normalized = status || 'unknown';

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${
      STATUS_STYLES[normalized] || 'bg-slate-100 text-slate-600'
    }`}>
      {normalized.replaceAll('_', ' ')}
    </span>
  );
}

function DetailField({ label, value, icon: Icon }) {
  if (value === null || value === undefined || value === '') return null;

  return (
    <div className="rounded-xl bg-slate-50 p-3.5">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
        {label}
      </div>
      <p className="mt-2 break-words text-sm font-semibold capitalize text-slate-800">
        {value}
      </p>
    </div>
  );
}

export default function PlanDetailPage() {
  const { id } = useParams();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = usePlan(id);

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/api/plans/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plans', id] })
  });

  if (isLoading) return <LoadingSpinner label="Loading plan..." />;

  if (isError) {
    return (
      <ErrorState
        title="Plan not found"
        message={error?.message}
      />
    );
  }

  const plan = data?.plan || data;

  if (!plan) {
    return (
      <ErrorState
        title="Plan not found"
        message="The requested follow-up plan could not be found."
      />
    );
  }

  const canApprove =
    hasPermission(Permissions.PLAN_APPROVE) &&
    plan.status === 'pending_approval';

  const instructions =
    plan.instructions?.approved_text ||
    plan.instructions?.original_text;

  const versions = data?.versions || [];

  return (
    <div className="max-w-4xl space-y-6">
      {/* Back navigation */}
      <Link
        to="/staff/plans"
        className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-slate-500 transition hover:text-brand-700 focus-visible:outline-none"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to plans
      </Link>

      {/* Plan overview */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50/80 via-white to-white px-5 py-6 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <ClipboardList className="h-6 w-6" aria-hidden="true" />
              </div>

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                  Follow-up plan
                </p>
                <h1 className="mt-1 break-words text-2xl font-bold tracking-tight text-slate-950">
                  {plan.reason_category || 'Follow-up plan'}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Version {plan.current_version ?? '—'}
                </p>
              </div>
            </div>

            <StatusBadge status={plan.status} />
          </div>
        </div>

        <div className="space-y-6 p-5 sm:p-7">
          {/* Approval */}
          {canApprove && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <AlertCircle className="h-5 w-5" aria-hidden="true" />
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-amber-900">
                    Clinical approval required
                  </h2>
                  <p className="mt-1 text-sm text-amber-800">
                    This plan is awaiting approval before it can proceed.
                  </p>

                  {approveMutation.isError && (
                    <p role="alert" className="mt-2 text-sm font-medium text-red-700">
                      Approval failed: {approveMutation.error?.message || 'Please try again.'}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending}
                    className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/20"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {approveMutation.isPending ? 'Approving...' : 'Approve plan'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Plan details */}
          <div>
            <h2 className="mb-3 text-sm font-bold text-slate-900">
              Plan information
            </h2>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DetailField
                label="Urgency"
                value={plan.urgency}
                icon={AlertCircle}
              />
              <DetailField
                label="Communication channel"
                value={plan.channel}
                icon={MessageSquare}
              />
              <DetailField
                label="Acknowledgement"
                value={plan.ack_status}
                icon={CheckCircle2}
              />
              <DetailField
                label="Window start"
                value={plan.window_start
                  ? new Date(plan.window_start).toLocaleDateString()
                  : null}
                icon={Calendar}
              />
              <DetailField
                label="Window end"
                value={plan.window_end
                  ? new Date(plan.window_end).toLocaleDateString()
                  : null}
                icon={Calendar}
              />
              <DetailField
                label="Department"
                value={plan.department_name || plan.department_id}
                icon={Building2}
              />
            </dl>
          </div>

          {/* Patient instructions */}
          {instructions && (
            <div className="border-t border-slate-100 pt-5">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" aria-hidden="true" />
                <h2 className="text-sm font-bold text-slate-900">
                  Patient instructions
                </h2>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {instructions}
                </p>
              </div>
            </div>
          )}

          {/* Required tests */}
          {plan.required_tests?.length > 0 && (
            <div className="border-t border-slate-100 pt-5">
              <h2 className="mb-3 text-sm font-bold text-slate-900">
                Required tests
              </h2>

              <div className="flex flex-wrap gap-2">
                {plan.required_tests.map(test => (
                  <span
                    key={test}
                    className="inline-flex items-center rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                  >
                    {test}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Version history */}
      {versions.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-slate-500" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">
                Version history
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              A record of changes made to this follow-up plan.
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <ol className="relative ml-2 space-y-5 border-l border-slate-200 pl-6">
              {versions.map((version, index) => (
                <li key={version.id} className="relative">
                  <span className={`absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white ${
                    index === 0 ? 'bg-brand-500' : 'bg-slate-300'
                  }`} />

                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-bold text-slate-800">
                      Version {version.version}
                    </span>

                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {version.created_at
                        ? new Date(version.created_at).toLocaleString()
                        : 'Date unavailable'}
                    </span>
                  </div>

                  {version.change_reason && (
                    <p className="mt-1 text-sm leading-5 text-slate-600">
                      {version.change_reason}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </div>
  );
}

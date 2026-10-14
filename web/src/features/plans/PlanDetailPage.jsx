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
import { Permissions, UserRole } from '@followcare/shared';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import { ArrowLeft, CheckCircle2, Clock, History } from 'lucide-react';

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 mt-0.5">{value}</dd>
    </div>
  );
}

export default function PlanDetailPage() {
  const { id } = useParams();
  const { user, hasPermission, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = usePlan(id);

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/api/plans/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plans', id] })
  });

  if (isLoading) return <LoadingSpinner label="Loading plan…" />;
  if (isError) return <ErrorState title="Plan not found" message={error?.message} />;

  const plan = data?.plan || data;
  if (!plan) return null;

  const canApprove = hasPermission(Permissions.PLAN_APPROVE) && plan.status === 'pending_approval';

  return (
    <div className="max-w-2xl space-y-5">
      <Link to="/staff/plans" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to plans
      </Link>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{plan.reason_category}</h1>
            <p className="text-sm text-slate-500 mt-0.5">Version {plan.current_version}</p>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-semibold
            ${plan.status === 'active' ? 'bg-brand-100 text-brand-700' :
              plan.status === 'pending_approval' ? 'bg-amber-100 text-amber-700' :
              plan.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
              'bg-slate-100 text-slate-600'}`}>
            {plan.status.replace('_', ' ')}
          </span>
        </div>

        {canApprove && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-sm text-amber-800 font-medium mb-2">This plan requires clinical approval.</p>
            <button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              {approveMutation.isPending ? 'Approving…' : 'Approve Plan'}
            </button>
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-4">
          <Field label="Urgency" value={plan.urgency} />
          <Field label="Channel" value={plan.channel} />
          <Field label="Window start" value={plan.window_start ? new Date(plan.window_start).toLocaleDateString() : null} />
          <Field label="Window end" value={plan.window_end ? new Date(plan.window_end).toLocaleDateString() : null} />
          <Field label="Acknowledgement" value={plan.ack_status} />
          <Field label="Department" value={plan.department_name || plan.department_id} />
        </dl>

        {plan.instructions && (
          <div className="mt-4 p-3 bg-slate-50 rounded-md border border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-1">Patient Instructions</p>
            <p className="text-sm text-slate-800">{plan.instructions.approved_text || plan.instructions.original_text}</p>
          </div>
        )}

        {plan.required_tests?.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-500 mb-1">Required tests</p>
            <div className="flex flex-wrap gap-1.5">
              {plan.required_tests.map(t => (
                <span key={t} className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-xs border border-brand-100">{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Version history */}
      {data?.versions?.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" /> Version History
          </h2>
          <ol className="relative border-l border-slate-200 pl-4 space-y-4">
            {data.versions.map(v => (
              <li key={v.id} className="relative">
                <div className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-brand-200 border-2 border-white" />
                <div>
                  <span className="text-xs font-semibold text-brand-700">v{v.version}</span>
                  <span className="text-xs text-slate-500 ml-2">{new Date(v.created_at).toLocaleString()}</span>
                  {v.change_reason && <p className="text-xs text-slate-600 mt-0.5">{v.change_reason}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

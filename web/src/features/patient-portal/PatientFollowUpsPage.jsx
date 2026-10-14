/**
 * FollowCare — Patient Follow-Ups Page
 * GET /api/me/follow-ups
 * POST /api/me/follow-ups/:id/acknowledge
 * ARCHITECTURE.md Section 10.3 (View 4)
 */

import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePatientFollowUps } from '../../api/queries.js';
import { api } from '../../api/client.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import { CheckCircle2, Calendar, Clock, ClipboardCheck } from 'lucide-react';

const STATUS_LABEL = {
  active: 'Active',
  pending_approval: 'Pending',
  draft: 'Draft',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const ACK_COLORS = {
  pending: 'bg-amber-50 border-amber-200',
  acknowledged: 'bg-emerald-50 border-emerald-200',
  not_required: 'bg-slate-50 border-slate-200'
};

function FollowUpCard({ followUp, onAcknowledge, acknowledging }) {
  const cardStyle = ACK_COLORS[followUp.ack_status] || 'bg-white border-slate-200';
  const windowEnd = followUp.window_end ? new Date(followUp.window_end) : null;
  const daysLeft = windowEnd ? Math.ceil((windowEnd - new Date()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <div className={`rounded-xl border p-4 ${cardStyle}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{followUp.reason_category}</p>
          <p className="text-sm text-slate-500 mt-0.5">{followUp.department_name}</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 font-medium flex-shrink-0">
          {STATUS_LABEL[followUp.status] || followUp.status}
        </span>
      </div>

      {/* Window */}
      {windowEnd && (
        <div className="flex items-center gap-2 mt-3 text-sm">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-slate-600">Visit by:</span>
          <strong className="text-slate-800">{windowEnd.toLocaleDateString()}</strong>
          {daysLeft !== null && (
            <span className={`ml-auto text-xs font-semibold ${
              daysLeft < 0 ? 'text-red-600' : daysLeft <= 7 ? 'text-amber-600' : 'text-slate-500'
            }`}>
              {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
            </span>
          )}
        </div>
      )}

      {/* Channel */}
      <div className="flex items-center gap-2 mt-2 text-sm text-slate-500">
        <Clock className="w-4 h-4" />
        {followUp.channel === 'in_person' ? 'In-person visit' : 'Teleconsultation'}
      </div>

      {/* Instructions */}
      {followUp.instructions_text && (
        <div className="mt-3 p-3 bg-white rounded-lg border border-slate-100">
          <p className="text-xs font-medium text-slate-500 mb-1">Your instructions</p>
          <p className="text-sm text-slate-800">{followUp.instructions_text}</p>
        </div>
      )}

      {/* Required tests */}
      {followUp.required_tests?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-500 mb-1">Tests to bring results for:</p>
          <div className="flex flex-wrap gap-1">
            {followUp.required_tests.map(t => (
              <span key={t} className="text-xs px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-100">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Acknowledge button */}
      {followUp.ack_status === 'pending' && followUp.status === 'active' && (
        <button
          onClick={() => onAcknowledge(followUp.id)}
          disabled={acknowledging === followUp.id}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
          aria-busy={acknowledging === followUp.id}
        >
          <ClipboardCheck className="w-5 h-5" />
          {acknowledging === followUp.id ? 'Saving…' : 'I acknowledge this plan'}
        </button>
      )}

      {followUp.ack_status === 'acknowledged' && (
        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="w-5 h-5" />
          You have acknowledged this plan
        </div>
      )}
    </div>
  );
}

export default function PatientFollowUpsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = usePatientFollowUps();
  const [acknowledging, setAcknowledging] = React.useState(null);

  const acknowledgeMutation = useMutation({
    mutationFn: (planId) => api.post(`/api/me/follow-ups/${planId}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'follow-ups'] });
      setAcknowledging(null);
    },
    onError: () => setAcknowledging(null)
  });

  const handleAcknowledge = (planId) => {
    setAcknowledging(planId);
    acknowledgeMutation.mutate(planId);
  };

  if (isLoading) return <LoadingSpinner label="Loading your follow-ups…" />;
  if (isError) return <ErrorState title="Unable to load follow-ups" message={error?.message} onRetry={refetch} />;

  const followUps = data?.followUps || [];
  const active = followUps.filter(f => f.status !== 'completed' && f.status !== 'cancelled');
  const past = followUps.filter(f => f.status === 'completed' || f.status === 'cancelled');

  return (
    <div className="p-4 space-y-5">
      <h1 className="text-lg font-bold text-slate-900">My Follow-Ups</h1>

      {active.length === 0 && past.length === 0 && (
        <div className="text-center py-12 text-sm text-slate-500">
          No follow-up plans assigned yet.
        </div>
      )}

      {active.length > 0 && (
        <section aria-label="Active follow-up plans">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Active Plans</h2>
          <div className="space-y-3">
            {active.map(f => (
              <FollowUpCard
                key={f.id}
                followUp={f}
                onAcknowledge={handleAcknowledge}
                acknowledging={acknowledging}
              />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section aria-label="Past follow-up plans">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Past Plans</h2>
          <div className="space-y-3">
            {past.map(f => (
              <FollowUpCard
                key={f.id}
                followUp={f}
                onAcknowledge={handleAcknowledge}
                acknowledging={acknowledging}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

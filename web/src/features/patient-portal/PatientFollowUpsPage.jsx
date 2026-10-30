import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePatientFollowUps } from '../../api/queries.js';
import { api } from '../../api/client.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  FlaskConical,
  RefreshCw,
} from 'lucide-react';

const STATUS_LABEL = {
  active: 'Active',
  pending_approval: 'Pending approval',
  draft: 'Draft',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function formatDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getDaysLeft(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.ceil((date - today) / (1000 * 60 * 60 * 24));
}

function StatusBadge({ status }) {
  const styles = {
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    pending_approval: 'bg-amber-50 text-amber-700 ring-amber-200',
    draft: 'bg-slate-100 text-slate-600 ring-slate-200',
    completed: 'bg-blue-50 text-blue-700 ring-blue-200',
    cancelled: 'bg-red-50 text-red-700 ring-red-200',
  };

  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${styles[status] || styles.draft}`}>
      {STATUS_LABEL[status] || status || 'Unknown'}
    </span>
  );
}

function FollowUpCard({ followUp, onAcknowledge, acknowledging }) {
  const daysLeft = getDaysLeft(followUp.window_end);
  const formattedDate = formatDate(followUp.window_end);
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
  const isAcknowledged = followUp.ack_status === 'acknowledged';
  const needsAcknowledgement =
    followUp.ack_status === 'pending' && followUp.status === 'active';

  const timingStyle = isOverdue
    ? 'bg-red-50 text-red-700'
    : isDueSoon
      ? 'bg-amber-50 text-amber-700'
      : 'bg-slate-100 text-slate-600';

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Follow-up plan
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">
              {followUp.reason_category || 'Scheduled follow-up'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {followUp.department_name || 'Care team'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={followUp.status} />
            {isAcknowledged && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 size={13} />
                Acknowledged
              </span>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 shadow-sm">
              <CalendarDays size={19} />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Visit by</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">
                {formattedDate || 'Date not specified'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 shadow-sm">
              <Clock3 size={19} />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Appointment type</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">
                {followUp.channel === 'in_person'
                  ? 'In-person visit'
                  : followUp.channel === 'teleconsultation'
                    ? 'Teleconsultation'
                    : followUp.channel || 'Not specified'}
              </p>
            </div>
          </div>
        </div>

        {daysLeft !== null && (
          <div className="mt-3">
            <span className={`inline-flex rounded-lg px-3 py-1.5 text-xs font-semibold ${timingStyle}`}>
              {isOverdue
                ? `${Math.abs(daysLeft)} days overdue`
                : daysLeft === 0
                  ? 'Due today'
                  : `${daysLeft} days remaining`}
            </span>
          </div>
        )}

        {followUp.instructions_text && (
          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <FileText size={17} className="text-blue-700" />
              Your instructions
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {followUp.instructions_text}
            </p>
          </div>
        )}

        {Array.isArray(followUp.required_tests) &&
          followUp.required_tests.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <FlaskConical size={17} className="text-blue-700" />
                Tests to bring results for
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {followUp.required_tests.map((test, index) => (
                  <span
                    key={`${test}-${index}`}
                    className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800"
                  >
                    {test}
                  </span>
                ))}
              </div>
            </div>
          )}

        {needsAcknowledgement && (
          <button
            type="button"
            onClick={() => onAcknowledge(followUp.id)}
            disabled={acknowledging === followUp.id}
            aria-busy={acknowledging === followUp.id}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-56"
          >
            {acknowledging === followUp.id ? (
              <RefreshCw size={17} className="animate-spin" />
            ) : (
              <ClipboardCheck size={18} />
            )}
            {acknowledging === followUp.id
              ? 'Saving acknowledgement…'
              : 'I acknowledge this plan'}
            {acknowledging !== followUp.id && <ArrowRight size={16} />}
          </button>
        )}

        {isAcknowledged && (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <span>You have acknowledged this follow-up plan.</span>
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
        {past ? <CheckCircle2 size={23} /> : <ClipboardCheck size={23} />}
      </div>
      <h3 className="mt-3 font-semibold text-slate-900">
        {past ? 'No past plans' : 'No active follow-ups'}
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">
        {past
          ? 'Completed or cancelled follow-up plans will appear here.'
          : 'You do not have any active follow-up plans assigned right now.'}
      </p>
    </div>
  );
}

export default function PatientFollowUpsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = usePatientFollowUps();
  const [acknowledging, setAcknowledging] = React.useState(null);

  const acknowledgeMutation = useMutation({
    mutationFn: (planId) =>
      api.post(`/api/me/follow-ups/${planId}/acknowledge`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['me', 'follow-ups'],
      });
      setAcknowledging(null);
    },
    onError: () => setAcknowledging(null),
  });

  const handleAcknowledge = (planId) => {
    if (acknowledging !== null) return;
    setAcknowledging(planId);
    acknowledgeMutation.mutate(planId);
  };

  if (isLoading) {
    return <LoadingSpinner label="Loading your follow-ups…" />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Unable to load follow-ups"
        message={error?.message}
        onRetry={refetch}
      />
    );
  }

  const followUps = Array.isArray(data?.followUps) ? data.followUps : [];
  const active = followUps.filter(
    (item) => item.status !== 'completed' && item.status !== 'cancelled'
  );
  const past = followUps.filter(
    (item) => item.status === 'completed' || item.status === 'cancelled'
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7 px-4 py-5 sm:px-6 sm:py-7">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
          <ClipboardCheck size={14} />
          YOUR CARE
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          My follow-ups
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
          Review your follow-up plans, check visit dates, and acknowledge plans
          shared by your care team.
        </p>
      </header>

      {acknowledgeMutation.isError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <AlertCircle size={19} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Acknowledgement could not be saved</p>
            <p className="mt-1">
              {acknowledgeMutation.error?.message ||
                'Please try again. Your plan has not been acknowledged.'}
            </p>
            <button
              type="button"
              onClick={() => acknowledgeMutation.reset()}
              className="mt-2 font-semibold underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Active plans</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{active.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Past plans</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{past.length}</p>
        </div>
      </div>

      {followUps.length === 0 && <EmptyState />}

      {active.length > 0 && (
        <section aria-label="Active follow-up plans">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Active plans</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your current and upcoming follow-ups
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {active.length}
            </span>
          </div>
          <div className="space-y-4">
            {active.map((item) => (
              <FollowUpCard
                key={item.id}
                followUp={item}
                onAcknowledge={handleAcknowledge}
                acknowledging={acknowledging}
              />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section aria-label="Past follow-up plans">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Past plans</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your completed and cancelled follow-ups
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {past.length}
            </span>
          </div>
          <div className="space-y-4">
            {past.map((item) => (
              <FollowUpCard
                key={item.id}
                followUp={item}
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

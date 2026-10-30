import { normalizeReasons, formatRule } from '../../lib/priority.js';
import { usePriorityQueue } from '../../api/queries.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import { AlertTriangle, Clock, TrendingUp, ShieldCheck, ListOrdered } from 'lucide-react';

const URGENCY_STYLES = {
  urgent: 'bg-red-50 text-red-700 ring-red-600/10',
  priority: 'bg-amber-50 text-amber-700 ring-amber-600/10',
  routine: 'bg-sky-50 text-sky-700 ring-sky-600/10'
};

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
}

function PriorityCard({ item, index }) {
  const urgency = String(item.urgency || 'routine').toLowerCase();
  const urgencyStyle = URGENCY_STYLES[urgency] || 'bg-slate-100 text-slate-600 ring-slate-500/10';
  const reasons = normalizeReasons(item.priority_reasons);
  const windowEnd = formatDate(item.window_end);

  return (
    <article className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-500 sm:flex">
          {index + 1}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-slate-900">
              {item.title || 'Untitled follow-up'}
            </h2>
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${urgencyStyle}`}>
              {urgency}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            {item.patientName || 'Unknown patient'}
            {item.department_name ? ` · ${item.department_name}` : ''}
          </p>

          {item.assignee_name && (
            <p className="mt-2 text-sm text-blue-700">
              Assigned to {item.assignee_name}
            </p>
          )}

          {windowEnd && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              Follow-up window ends {windowEnd}
            </p>
          )}

          {reasons.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Score breakdown
              </p>
              <div className="flex flex-wrap gap-2">
                {reasons.map((reason, reasonIndex) => (
                  <span
                    key={`${reason.rule}-${reasonIndex}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800"
                  >
                    {formatRule(reason.rule)}
                    <span className="font-bold tabular-nums">+{reason.points}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
            <span className="text-lg font-bold tabular-nums">
              {item.priority_score ?? '—'}
            </span>
          </div>
          <span className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Score
          </span>
        </div>
      </div>
    </article>
  );
}

export default function PriorityQueuePage() {
  const { data, isLoading, isError, error, refetch } = usePriorityQueue();
  const queue = data?.queue || [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Work management</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Priority Queue
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Review follow-ups ordered by administrative priority score, with a
            transparent breakdown of the rules contributing to each score.
          </p>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm">
          <ListOrdered className="h-4 w-4 text-blue-600" />
          <span className="tabular-nums">{queue.length}</span>
          <span className="font-normal text-slate-500">items</span>
        </div>
      </header>

      <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
        <div>
          <p className="text-sm font-semibold text-blue-950">
            Transparent administrative scoring
          </p>
          <p className="mt-1 text-sm leading-5 text-blue-800">
            Scores are based on administrative rules and their displayed
            weights. They do not represent clinical judgment or medical
            prioritization.
          </p>
        </div>
      </div>

      {isLoading && <LoadingSpinner label="Loading priority queue…" />}

      {isError && (
        <ErrorState
          title="Failed to load priority queue"
          message={error?.message}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && (
        queue.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
              <TrendingUp className="h-6 w-6 text-slate-400" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">
              Your priority queue is clear
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              There are currently no items in the priority queue.
            </p>
          </div>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                Ranked follow-ups
              </h2>
              <span className="text-xs text-slate-400">
                Highest score first
              </span>
            </div>

            {queue.map((item, index) => (
              <PriorityCard
                key={item.task_id ?? `${item.title}-${index}`}
                item={item}
                index={index}
              />
            ))}
          </section>
        )
      )}
    </div>
  );
}

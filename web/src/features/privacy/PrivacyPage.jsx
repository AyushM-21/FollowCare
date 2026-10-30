import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import {
  ShieldCheck,
  Activity,
  Clock3,
  UserRound,
  Database,
  RefreshCw,
  LockKeyhole,
} from 'lucide-react';

function useAuditLogs() {
  return useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => api.get('/api/audit-logs'),
    staleTime: 30_000,
  });
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Unknown date';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatAction(value) {
  if (!value) return 'Unknown action';

  return String(value)
    .replaceAll('_', ' ')
    .replaceAll('.', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PrivacyPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useAuditLogs();
  const logs = data?.logs || [];

  return (
    <div className="mx-auto max-w-7xl space-y-7 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-700">
            <ShieldCheck className="h-4 w-4" />
            Security and governance
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Privacy &amp; Audit Log
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Review recorded data access and changes across FollowCare.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh log
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="fc-panel flex items-start gap-4 p-5">
          <div className="rounded-xl bg-blue-50 p-3">
            <LockKeyhole className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Append-only audit trail</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              Audit events are recorded to help track data access and changes.
            </p>
          </div>
        </div>

        <div className="fc-panel flex items-start gap-4 p-5">
          <div className="rounded-xl bg-violet-50 p-3">
            <UserRound className="h-6 w-6 text-violet-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Access accountability</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              Events include the recorded actor, role, action, and affected entity.
            </p>
          </div>
        </div>
      </section>

      <section className="fc-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5">
              <Activity className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Audit events</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Recorded activity history
              </p>
            </div>
          </div>

          {!isLoading && !isError && (
            <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              {logs.length} {logs.length === 1 ? 'event' : 'events'}
            </span>
          )}
        </div>

        {isLoading && (
          <div className="p-10">
            <LoadingSpinner label="Loading audit log…" />
          </div>
        )}

        {isError && (
          <div className="p-5">
            <ErrorState
              title="Failed to load audit log"
              message={error?.message}
              onRetry={refetch}
            />
          </div>
        )}

        {!isLoading && !isError && logs.length === 0 && (
          <div className="px-5 py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Database className="h-7 w-7 text-slate-400" />
            </div>
            <h3 className="font-semibold text-slate-900">No audit events yet</h3>
            <p className="mt-1 text-sm text-slate-500">
              Recorded activity will appear here when available.
            </p>
          </div>
        )}

        {!isLoading && !isError && logs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left" aria-label="Audit log">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Time
                  </th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Actor
                  </th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Action
                  </th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Entity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="transition hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-5 py-4">
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <Clock3 className="h-4 w-4 text-slate-400" />
                        {formatDate(log.created_at)}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-mono text-xs text-slate-700">
                        {log.actor_id ? `${log.actor_id.slice(0, 8)}…` : '—'}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {log.actor_role || 'Unknown role'}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700">
                        {formatAction(log.action)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {log.entity_type || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3">
          <p className="text-xs leading-5 text-slate-500">
            This view displays events returned by the audit-log service. It does not
            independently verify the completeness or integrity of the underlying records.
          </p>
        </div>
      </section>
    </div>
  );
}

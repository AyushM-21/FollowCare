import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import {
  Database, RefreshCw, Users, ClipboardList, Activity,
  Info, Filter, FileSearch, AlertCircle
} from 'lucide-react';

function StatCard({ label, value, description, icon: Icon, tone }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    violet: 'bg-violet-50 text-violet-700',
    teal: 'bg-teal-50 text-teal-700'
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
            {Number(value || 0).toLocaleString()}
          </p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.blue}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function StatusPill({ value }) {
  const valueText = String(value || 'unknown').replace(/_/g, ' ');
  const style = value === 'missed'
    ? 'bg-red-50 text-red-700 ring-red-100'
    : value === 'rescheduled' || value === 'completed_late'
      ? 'bg-amber-50 text-amber-700 ring-amber-100'
      : value === 'completed_on_time'
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
        : 'bg-slate-100 text-slate-700 ring-slate-200';

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${style}`}>
      {valueText}
    </span>
  );
}

function SectionHeader({ title, description, icon: Icon, action }) {
  return (
    <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function TableEmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <FileSearch className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-700">No records found</p>
      <p className="mt-1 text-xs text-slate-500">{message}</p>
    </div>
  );
}

function TableLoading({ label }) {
  return (
    <div className="p-8">
      <LoadingSpinner label={label} />
    </div>
  );
}

const tableHeadClass = 'whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500';
const tableCellClass = 'whitespace-nowrap px-4 py-3.5 text-sm text-slate-600';

export default function DatasetExplorerPage() {
  const [status, setStatus] = useState('');

  const summary = useQuery({
    queryKey: ['dataset', 'summary'],
    queryFn: () => api.get('/api/dataset/summary')
  });

  const followups = useQuery({
    queryKey: ['dataset', 'followups', status],
    queryFn: () => api.get(`/api/dataset/followups?limit=25${status ? `&status=${encodeURIComponent(status)}` : ''}`)
  });

  const risks = useQuery({
    queryKey: ['dataset', 'risk'],
    queryFn: () => api.get('/api/dataset/risk?limit=10')
  });

  const refresh = () => {
    summary.refetch();
    followups.refetch();
    risks.refetch();
  };

  const isRefreshing = summary.isFetching || followups.isFetching || risks.isFetching;

  if (summary.isLoading) {
    return <LoadingSpinner label="Loading imported dataset…" />;
  }

  if (summary.isError) {
    return (
      <ErrorState
        title="Could not load dataset"
        message={summary.error?.message}
        onRetry={refresh}
      />
    );
  }

  const stats = summary.data?.summary || {};
  const availableStatuses = (stats.followupStatuses || [])
    .map(item => item.status)
    .filter(Boolean);

  const followupRows = followups.data?.followups || [];
  const riskRows = risks.data?.risks || [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-600">
            <Database className="h-4 w-4" />
            Data & analytics
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Dataset Explorer
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Explore imported synthetic records and historical follow-up patterns.
            These samples are separate from live patient records.
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={isRefreshing}
          className="inline-flex w-fit items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing…' : 'Refresh data'}
        </button>
      </header>

      <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
          <Info className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-sky-950">Exploratory dataset only</p>
          <p className="mt-1 text-xs leading-5 text-sky-800">
            Dataset scores are provided by the source files. They do not affect FollowCare’s
            live priority queue and must not be used to make clinical decisions.
          </p>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Patient samples"
          value={stats.patients}
          description="Minimal, de-identified fields imported"
          icon={Users}
          tone="blue"
        />
        <StatCard
          label="Follow-up records"
          value={stats.followups}
          description="Status, due dates, outreach and priority labels"
          icon={ClipboardList}
          tone="violet"
        />
        <StatCard
          label="Risk samples"
          value={stats.riskSamples}
          description="Source score and missed-follow-up history"
          icon={Activity}
          tone="teal"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <SectionHeader
          title="Follow-up sample records"
          description="Sorted by source priority, then overdue days."
          icon={ClipboardList}
          action={
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <Filter className="h-4 w-4 text-slate-400" />
              <span className="sr-only">Filter by status</span>
              <select
                className="max-w-[180px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                value={status}
                onChange={event => setStatus(event.target.value)}
              >
                <option value="">All statuses</option>
                {availableStatuses.map(item => (
                  <option key={item} value={item}>
                    {item.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
          }
        />

        {followups.isLoading ? (
          <TableLoading label="Loading follow-ups…" />
        ) : followups.isError ? (
          <div className="p-5">
            <ErrorState
              title="Could not load follow-up records"
              message={followups.error?.message}
              onRetry={() => followups.refetch()}
            />
          </div>
        ) : followupRows.length === 0 ? (
          <TableEmptyState message="No records match the selected status. Try another filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={tableHeadClass}>Reference</th>
                  <th className={tableHeadClass}>Type</th>
                  <th className={tableHeadClass}>Due date</th>
                  <th className={tableHeadClass}>Status</th>
                  <th className={`${tableHeadClass} text-right`}>Days overdue</th>
                  <th className={`${tableHeadClass} text-right`}>Outreach</th>
                  <th className={tableHeadClass}>Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {followupRows.map(row => (
                  <tr key={row.reference} className="transition-colors hover:bg-slate-50/80">
                    <td className={`${tableCellClass} font-mono text-xs font-medium text-slate-700`}>
                      {row.reference}
                    </td>
                    <td className={`${tableCellClass} capitalize`}>
                      {String(row.type || 'unknown').replace(/_/g, ' ')}
                    </td>
                    <td className={tableCellClass}>{row.dueDate || '—'}</td>
                    <td className={tableCellClass}>
                      <StatusPill value={row.status} />
                    </td>
                    <td className={`${tableCellClass} text-right font-medium tabular-nums`}>
                      {row.daysOverdue ?? '—'}
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`}>
                      {row.outreachAttempts ?? 0}
                    </td>
                    <td className={`${tableCellClass} capitalize`}>
                      {row.priority || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!followups.isLoading && !followups.isError && followupRows.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3">
            <p className="text-xs text-slate-500">
              Showing {followupRows.length} sample records
            </p>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <SectionHeader
          title="Source risk samples"
          description="Supplied source scores are shown for comparison only."
          icon={Activity}
        />

        {risks.isLoading ? (
          <TableLoading label="Loading risk samples…" />
        ) : risks.isError ? (
          <div className="p-5">
            <ErrorState
              title="Could not load risk samples"
              message={risks.error?.message}
              onRetry={() => risks.refetch()}
            />
          </div>
        ) : riskRows.length === 0 ? (
          <TableEmptyState message="There are no source risk samples to display." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={tableHeadClass}>Sample reference</th>
                  <th className={`${tableHeadClass} text-right`}>Age</th>
                  <th className={`${tableHeadClass} text-right`}>Missed follow-ups, 12 months</th>
                  <th className={`${tableHeadClass} text-right`}>Source score</th>
                  <th className={tableHeadClass}>Source label</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {riskRows.map(row => (
                  <tr key={row.reference} className="transition-colors hover:bg-slate-50/80">
                    <td className={`${tableCellClass} font-mono text-xs font-medium text-slate-700`}>
                      {row.reference}
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`}>
                      {row.ageYears ?? '—'}
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`}>
                      {row.missedFollowupsLast12Months ?? '—'}
                    </td>
                    <td className={`${tableCellClass} text-right font-semibold tabular-nums text-slate-800`}>
                      {row.sourceRiskScore ?? '—'}
                    </td>
                    <td className={`${tableCellClass} capitalize`}>
                      {row.sourceRiskLevel || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!risks.isLoading && !risks.isError && riskRows.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3">
            <p className="text-xs text-slate-500">
              Showing {riskRows.length} source risk samples
            </p>
          </div>
        )}
      </section>

      <div className="flex items-start gap-2 rounded-xl bg-slate-100/80 px-4 py-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <p className="text-xs leading-5 text-slate-500">
          {summary.data?.note || risks.data?.note || 'Dataset records are provided for demonstration and exploratory analysis only.'}
        </p>
      </div>
    </div>
  );
}

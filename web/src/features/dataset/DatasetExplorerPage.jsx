import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import { Database, RefreshCw } from 'lucide-react';

function StatCard({ label, value, description }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{Number(value || 0).toLocaleString()}</p>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
    </div>
  );
}

function StatusPill({ value }) {
  const valueText = String(value || 'unknown').replace(/_/g, ' ');
  const style = value === 'missed' ? 'bg-red-50 text-red-700'
    : value === 'rescheduled' || value === 'completed_late' ? 'bg-amber-50 text-amber-700'
    : value === 'completed_on_time' ? 'bg-emerald-50 text-emerald-700'
    : 'bg-slate-100 text-slate-700';
  return <span className={`inline-flex rounded px-2 py-1 text-xs font-medium capitalize ${style}`}>{valueText}</span>;
}

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

  if (summary.isLoading) return <LoadingSpinner label="Loading imported dataset…" />;
  if (summary.isError) {
    return <ErrorState title="Could not load dataset" message={summary.error?.message} onRetry={refresh} />;
  }

  const stats = summary.data?.summary || {};
  const availableStatuses = (stats.followupStatuses || []).map(item => item.status).filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-brand-600" /> Dataset Explorer
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Imported synthetic records for demonstrating follow-up patterns. Separate from live patient records.
          </p>
        </div>
        <button onClick={refresh} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        Dataset scores are provided by the source files. They are exploratory only and do not affect FollowCare’s live priority queue or make clinical decisions.
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Patient samples" value={stats.patients} description="Minimal, de-identified fields imported" />
        <StatCard label="Follow-up records" value={stats.followups} description="Status, due dates, outreach and priority labels" />
        <StatCard label="Risk samples" value={stats.riskSamples} description="Source score and missed-follow-up history" />
      </section>

      <section className="bg-white rounded-lg border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-900">Follow-up sample records</h2>
            <p className="text-xs text-slate-500 mt-1">Sorted by source priority, then overdue days.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Status
            <select className="rounded-md border border-slate-300 px-2 py-1.5 bg-white" value={status} onChange={event => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {availableStatuses.map(item => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
        </div>

        {followups.isLoading ? <div className="p-6"><LoadingSpinner label="Loading follow-ups…" /></div>
          : followups.isError ? <div className="p-4"><ErrorState title="Could not load follow-up records" message={followups.error?.message} onRetry={() => followups.refetch()} /></div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Due date</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Days overdue</th>
                    <th className="px-4 py-3 font-medium text-right">Outreach</th>
                    <th className="px-4 py-3 font-medium">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(followups.data?.followups || []).map(row => (
                    <tr key={row.reference} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.reference}</td>
                      <td className="px-4 py-3 text-slate-700">{String(row.type || 'unknown').replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-slate-600">{row.dueDate || '—'}</td>
                      <td className="px-4 py-3"><StatusPill value={row.status} /></td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.daysOverdue ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.outreachAttempts ?? 0}</td>
                      <td className="px-4 py-3 capitalize">{row.priority || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(followups.data?.followups || []).length === 0 && <p className="p-6 text-center text-sm text-slate-500">No records match this status.</p>}
            </div>
          )}
      </section>

      <section className="bg-white rounded-lg border border-slate-200">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Source risk samples</h2>
          <p className="text-xs text-slate-500 mt-1">The supplied score is shown for comparison only. It is not FollowCare’s rule-based task priority.</p>
        </div>
        {risks.isLoading ? <div className="p-6"><LoadingSpinner label="Loading risk samples…" /></div>
          : risks.isError ? <div className="p-4"><ErrorState title="Could not load risk samples" message={risks.error?.message} onRetry={() => risks.refetch()} /></div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Sample reference</th>
                    <th className="px-4 py-3 font-medium text-right">Age</th>
                    <th className="px-4 py-3 font-medium text-right">Missed follow-ups, 12 months</th>
                    <th className="px-4 py-3 font-medium text-right">Source score</th>
                    <th className="px-4 py-3 font-medium">Source label</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(risks.data?.risks || []).map(row => (
                    <tr key={row.reference} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.reference}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.ageYears ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.missedFollowupsLast12Months ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.sourceRiskScore ?? '—'}</td>
                      <td className="px-4 py-3 capitalize">{row.sourceRiskLevel || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>

      <p className="text-xs text-slate-500">
        {summary.data?.note || risks.data?.note}
      </p>
    </div>
  );
}

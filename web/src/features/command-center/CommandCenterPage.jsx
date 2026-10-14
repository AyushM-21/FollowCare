/**
 * FollowCare — Command Center (Hospital Admin Dashboard)
 * ARCHITECTURE.md Section 10.3, 9.4
 *
 * Displays real data from:
 *   GET /api/dashboard/metrics  — KPI tiles (activePlans, dueToday, overdue, …)
 *   GET /api/dashboard/workload — staff workload bar chart
 *   GET /api/dashboard/overdue  — overdue follow-up priority list
 */

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import {
  useDashboardMetrics,
  useDashboardWorkload,
  useDashboardOverdue
} from '../../api/queries.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
  MessageSquareWarning,
  BellOff,
  RefreshCw,
  ArrowRight
} from 'lucide-react';

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, count, icon: Icon, colorClass, accent, subtitle }) {
  return (
    <div
      className={`bg-white rounded-lg border ${accent} shadow-sm p-4 flex flex-col gap-1`}
      role="figure"
      aria-label={`${label}: ${count}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-md flex items-center justify-center ${colorClass}`}>
          <Icon className="w-4 h-4" aria-hidden="true" />
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-900 tabular-nums">{count.toLocaleString()}</p>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}

// ── Urgency badge ─────────────────────────────────────────────────────────────
const URGENCY_STYLES = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  priority: 'bg-amber-100 text-amber-700 border-amber-200',
  routine: 'bg-sky-100 text-sky-700 border-sky-200'
};

function UrgencyBadge({ urgency }) {
  const cls = URGENCY_STYLES[urgency] || 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {urgency}
    </span>
  );
}

// ── Overdue Table ─────────────────────────────────────────────────────────────
function OverdueTable({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-slate-500">
        No overdue follow-ups — great work!
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Overdue follow-ups">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient</th>
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Department</th>
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Urgency</th>
            <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Days Overdue</th>
            <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Score</th>
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Owner</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {data.map(row => (
            <tr key={row.plan_id} className="hover:bg-slate-50 transition-colors">
              <td className="py-2.5 px-3">
                <div className="font-medium text-slate-800">{row.patientName}</div>
                <div className="text-xs text-slate-500">{row.hospital_reg_no}</div>
              </td>
              <td className="py-2.5 px-3 text-slate-600">{row.department_name || '—'}</td>
              <td className="py-2.5 px-3">
                <UrgencyBadge urgency={row.urgency} />
              </td>
              <td className="py-2.5 px-3 text-right">
                <span className="font-semibold text-red-600">{row.days_overdue}d</span>
              </td>
              <td className="py-2.5 px-3 text-right text-slate-700 font-mono text-xs">
                {row.priority_score}
              </td>
              <td className="py-2.5 px-3 text-slate-600">
                {row.owner_name || <span className="text-slate-400 italic">Unassigned</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Workload Chart ────────────────────────────────────────────────────────────
function WorkloadChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">No workload data available.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 40 }}>
        <XAxis
          dataKey="staff_name"
          tick={{ fontSize: 11, fill: '#64748b' }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
          formatter={(value, name) => [value, name === 'active_tasks' ? 'Active' : 'Escalated']}
        />
        <Bar dataKey="active_tasks" name="active_tasks" radius={[3, 3, 0, 0]} maxBarSize={40}>
          {data.map((entry, idx) => (
            <Cell
              key={`cell-${idx}`}
              fill={entry.escalated_tasks > 0 ? '#f59e0b' : '#0284c7'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Section card wrapper ──────────────────────────────────────────────────────
function Section({ title, action, children }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Command Center Page ───────────────────────────────────────────────────────
export default function CommandCenterPage() {
  const metrics = useDashboardMetrics();
  const workload = useDashboardWorkload();
  const overdue = useDashboardOverdue();

  const isLoading = metrics.isLoading || workload.isLoading || overdue.isLoading;
  const hasError = metrics.isError || workload.isError || overdue.isError;

  const refetchAll = () => {
    metrics.refetch();
    workload.refetch();
    overdue.refetch();
  };

  if (isLoading) {
    return <LoadingSpinner label="Loading Command Center…" />;
  }

  if (hasError) {
    const errMsg =
      metrics.error?.message ||
      workload.error?.message ||
      overdue.error?.message;
    return (
      <ErrorState
        title="Failed to load dashboard"
        message={errMsg}
        onRetry={refetchAll}
      />
    );
  }

  const m = metrics.data?.metrics || {};

  const kpiCards = [
    {
      label: 'Active Plans',
      count: m.activePlans?.count ?? 0,
      icon: Users,
      colorClass: 'bg-brand-50 text-brand-600',
      accent: 'border-slate-200'
    },
    {
      label: 'Due Today',
      count: m.dueToday?.count ?? 0,
      icon: Clock,
      colorClass: 'bg-amber-50 text-amber-600',
      accent: 'border-amber-100'
    },
    {
      label: 'Overdue',
      count: m.overdue?.count ?? 0,
      icon: AlertTriangle,
      colorClass: 'bg-red-50 text-red-600',
      accent: 'border-red-100'
    },
    {
      label: 'Confirmed',
      count: m.confirmed?.count ?? 0,
      icon: CheckCircle2,
      colorClass: 'bg-emerald-50 text-emerald-600',
      accent: 'border-emerald-100'
    },
    {
      label: 'Awaiting Action',
      count: m.awaitingAction?.count ?? 0,
      icon: MessageSquareWarning,
      colorClass: 'bg-violet-50 text-violet-600',
      accent: 'border-violet-100'
    },
    {
      label: 'Unacknowledged',
      count: m.unacknowledged?.count ?? 0,
      icon: BellOff,
      colorClass: 'bg-orange-50 text-orange-600',
      accent: 'border-orange-100'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Command Center</h1>
          <p className="text-sm text-slate-500 mt-0.5">Live follow-up status across your department</p>
        </div>
        <button
          onClick={refetchAll}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
          aria-label="Refresh dashboard"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* KPI Grid */}
      <section aria-label="Key performance indicators">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {kpiCards.map(card => (
            <KpiCard key={card.label} {...card} />
          ))}
        </div>
      </section>

      {/* Extra metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="bg-white rounded-lg border border-slate-200 p-3 flex justify-between items-center">
          <span className="text-slate-500">Due in 7 days</span>
          <span className="font-bold text-slate-800">{(m.dueSoon?.count ?? 0).toLocaleString()}</span>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3 flex justify-between items-center">
          <span className="text-slate-500">Returned</span>
          <span className="font-bold text-slate-800">{(m.returned?.count ?? 0).toLocaleString()}</span>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3 flex justify-between items-center">
          <span className="text-slate-500">Unreachable</span>
          <span className="font-bold text-slate-800">{(m.unreachable?.count ?? 0).toLocaleString()}</span>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3 flex justify-between items-center">
          <span className="text-slate-500">Acknowledged</span>
          <span className="font-bold text-slate-800">
            {Math.max(0, (m.activePlans?.count ?? 0) - (m.unacknowledged?.count ?? 0)).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Bottom grid: workload + overdue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Workload */}
        <Section title="Staff Workload">
          <WorkloadChart data={workload.data?.workload} />
        </Section>

        {/* Overdue list */}
        <Section
          title={`Overdue Follow-ups (${overdue.data?.overdue?.length ?? 0})`}
          action={
            overdue.data?.overdue?.length > 0 ? (
              <a
                href="/staff/priority"
                className="text-xs text-brand-600 hover:underline flex items-center gap-0.5"
              >
                View all <ArrowRight className="w-3 h-3" />
              </a>
            ) : null
          }
        >
          <OverdueTable data={overdue.data?.overdue} />
        </Section>
      </div>
    </div>
  );
}

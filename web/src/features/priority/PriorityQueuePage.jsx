/**
 * FollowCare — Priority Queue Page
 * GET /api/priority-queue
 * Shows transparent scoring with priority_reasons per ARCHITECTURE.md §9.5
 */

import React from 'react';
import { usePriorityQueue } from '../../api/queries.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import { AlertTriangle, Clock, TrendingUp } from 'lucide-react';

const URGENCY_STYLES = {
  urgent: 'text-red-600 bg-red-50',
  priority: 'text-amber-600 bg-amber-50',
  routine: 'text-sky-600 bg-sky-50'
};

function PriorityCard({ item }) {
  const urgencyStyle = URGENCY_STYLES[item.urgency] || 'text-slate-600 bg-slate-50';
  const reasons = item.priority_reasons || {};

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm hover:border-brand-200 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-800 truncate">{item.title}</h3>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${urgencyStyle}`}>{item.urgency}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{item.patientName} · {item.department_name}</p>
          {item.assignee_name && (
            <p className="text-xs text-brand-600 mt-1">Assignee: {item.assignee_name}</p>
          )}
          {item.window_end && (
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Window ends: {new Date(item.window_end).toLocaleDateString()}
            </p>
          )}
          {/* Priority reasons — transparent scoring */}
          {Object.keys(reasons).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(reasons).map(([k, v]) => (
                <span key={k} className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                  {k.replace(/_/g, ' ')}: +{v}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-800 text-white flex items-center justify-center">
            <span className="text-sm font-bold tabular-nums">{item.priority_score}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">score</p>
        </div>
      </div>
    </div>
  );
}

export default function PriorityQueuePage() {
  const { data, isLoading, isError, error, refetch } = usePriorityQueue();
  const queue = data?.queue || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Priority Queue</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Administratively scored — rule weights shown transparently. No clinical prioritization.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <TrendingUp className="w-4 h-4" />
          {queue.length} items
        </div>
      </div>

      {isLoading && <LoadingSpinner label="Loading priority queue…" />}
      {isError && <ErrorState title="Failed to load priority queue" message={error?.message} onRetry={refetch} />}

      {!isLoading && !isError && (
        queue.length === 0 ? (
          <div className="text-center py-16 text-sm text-slate-500 bg-white rounded-lg border border-slate-200">
            Priority queue is empty.
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map((item, idx) => (
              <div key={item.task_id} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 text-xs font-bold text-slate-400 text-right mt-4">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <PriorityCard item={item} />
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

/**
 * FollowCare — Privacy & Audit Log Page
 * GET /api/audit-logs (admin)
 * ARCHITECTURE.md Section 11
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import { ShieldCheck } from 'lucide-react';

function useAuditLogs() {
  return useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => api.get('/api/audit-logs'),
    staleTime: 30_000
  });
}

export default function PrivacyPage() {
  const { data, isLoading, isError, error, refetch } = useAuditLogs();
  const logs = data?.logs || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-slate-600" />
        <h1 className="text-xl font-bold text-slate-900">Privacy &amp; Audit Log</h1>
      </div>
      <p className="text-sm text-slate-500">
        Append-only audit trail of all data access and changes. Patients can request their own access log.
      </p>

      {isLoading && <LoadingSpinner label="Loading audit log…" />}
      {isError && <ErrorState title="Failed to load audit log" message={error?.message} onRetry={refetch} />}

      {!isLoading && !isError && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          {logs.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-500">No audit events recorded.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Audit log">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2.5 px-4 text-xs font-semibold text-slate-500 uppercase">Time</th>
                    <th className="text-left py-2.5 px-4 text-xs font-semibold text-slate-500 uppercase">Actor</th>
                    <th className="text-left py-2.5 px-4 text-xs font-semibold text-slate-500 uppercase">Action</th>
                    <th className="text-left py-2.5 px-4 text-xs font-semibold text-slate-500 uppercase">Entity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2 px-4 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 px-4 text-xs text-slate-700">
                        {log.actor_id ? `${log.actor_id.slice(0, 8)}…` : '—'}{' '}
                        <span className="text-slate-400">[{log.actor_role}]</span>
                      </td>
                      <td className="py-2 px-4">
                        <span className="text-xs font-medium text-slate-700 uppercase">{log.action}</span>
                      </td>
                      <td className="py-2 px-4 text-xs text-slate-600">
                        {log.entity_type}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

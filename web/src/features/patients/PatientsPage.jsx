/**
 * FollowCare — Patients List Page
 * Requires: patient:view_demographics permission
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePatients } from '../../api/queries.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import { Search, ChevronRight } from 'lucide-react';

export default function PatientsPage() {
  const { activeDepartmentId } = useAuth();
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, error, refetch } = usePatients({
    search: search.trim() || undefined,
    departmentId: activeDepartmentId
  });

  const patients = data?.patients || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Patients</h1>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          className="pl-9 pr-3 py-2 w-full text-sm rounded-md border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          placeholder="Search by name or registration number…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search patients"
        />
      </div>

      {isLoading && <LoadingSpinner label="Loading patients…" />}
      {isError && <ErrorState title="Failed to load patients" message={error?.message} onRetry={refetch} />}

      {!isLoading && !isError && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          {patients.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-500">
              {search ? `No patients found matching "${search}"` : 'No patients in your department.'}
            </div>
          ) : (
            <ul role="list" className="divide-y divide-slate-100">
              {patients.map(pt => (
                <li key={pt.id}>
                  <Link
                    to={`/staff/patients/${pt.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{pt.patientName || pt.full_name_enc}</p>
                      <p className="text-xs text-slate-500">{pt.hospital_reg_no}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

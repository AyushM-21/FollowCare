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
import { Search, ChevronRight, Users, X } from 'lucide-react';

export default function PatientsPage() {
  const { activeDepartmentId } = useAuth();
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error, refetch } = usePatients({
    search: search.trim() || undefined,
    departmentId: activeDepartmentId
  });

  const patients = data?.patients || [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600">
            <Users className="h-4 w-4" aria-hidden="true" />
            Care management
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            Patients
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Find and manage patient records in your department.
          </p>
        </div>

        {!isLoading && !isError && (
          <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm">
            <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <span className="font-semibold tabular-nums text-slate-900">
              {patients.length.toLocaleString()}
            </span>
            <span className="text-slate-500">
              {patients.length === 1 ? 'patient' : 'patients'}
            </span>
          </div>
        )}
      </div>

      {/* Search panel */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-sm">
        <label
          htmlFor="patient-search"
          className="mb-2 block text-sm font-semibold text-slate-800"
        >
          Search patient records
        </label>

        <div className="relative max-w-xl">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="patient-search"
            type="search"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10"
            placeholder="Search by name or registration number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search patients"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
              aria-label="Clear patient search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Search using a patient's name or hospital registration number.
        </p>
      </section>

      {/* Loading and error states */}
      {isLoading && <LoadingSpinner label="Loading patients..." />}

      {isError && (
        <ErrorState
          title="Failed to load patients"
          message={error?.message}
          onRetry={refetch}
        />
      )}

      {/* Patient list */}
      {!isLoading && !isError && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Patient directory
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Select a record to view patient details.
              </p>
            </div>
            <span className="text-xs font-medium text-slate-500">
              {search.trim() ? 'Search results' : 'Department records'}
            </span>
          </div>

          {patients.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-14 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                <Users className="h-5 w-5 text-slate-400" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800">
                {search.trim() ? 'No matching patients' : 'No patients found'}
              </h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                {search.trim()
                  ? `No patients found matching "${search}". Try another name or registration number.`
                  : 'There are currently no patient records available in your department.'}
              </p>
              {search.trim() && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="mt-4 text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <ul role="list" className="divide-y divide-slate-100">
              {patients.map(pt => {
                const initials = (pt.fullName || '?')
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map(part => part[0])
                  .join('')
                  .toUpperCase();

                return (
                  <li key={pt.id}>
                    <Link
                      to={`/staff/patients/${pt.id}`}
                      className="group flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-slate-50/80 focus-visible:bg-blue-50/50 sm:px-5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700 ring-1 ring-blue-100"
                          aria-hidden="true"
                        >
                          {initials}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800 transition-colors group-hover:text-brand-700">
                            {pt.fullName}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            Registration number: {pt.hospitalRegNo}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-xs font-medium text-slate-400 transition-colors group-hover:text-brand-600 sm:inline">
                          View record
                        </span>
                        <ChevronRight
                          className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600"
                          aria-hidden="true"
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {patients.length > 0 && (
            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-500 sm:px-5">
              Showing {patients.length.toLocaleString()} patient records
            </div>
          )}
        </section>
      )}
    </div>
  );
}

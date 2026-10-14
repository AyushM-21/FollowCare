/**
 * FollowCare — Patient Portal Home Page
 * Mobile-first, large tap targets.
 * ARCHITECTURE.md Section 10.3 (View 4)
 *
 * GET /api/me/follow-ups → shows next upcoming follow-up card
 * GET /api/me/appointments → shows next appointment
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePatientFollowUps, usePatientAppointments } from '../../api/queries.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { Calendar, ClipboardList, HelpCircle, ArrowRight, CheckCircle2 } from 'lucide-react';

function NextFollowUpCard({ followUps }) {
  const upcoming = followUps
    .filter(f => ['active', 'draft', 'pending_approval'].includes(f.status))
    .sort((a, b) => new Date(a.window_end) - new Date(b.window_end))[0];

  if (!upcoming) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-center gap-3">
        <CheckCircle2 className="w-8 h-8 text-emerald-500 flex-shrink-0" />
        <div>
          <p className="font-semibold text-emerald-800">All caught up!</p>
          <p className="text-sm text-emerald-600 mt-0.5">No pending follow-ups at this time.</p>
        </div>
      </div>
    );
  }

  const windowEnd = upcoming.window_end ? new Date(upcoming.window_end) : null;
  const daysLeft = windowEnd ? Math.ceil((windowEnd - new Date()) / (1000 * 60 * 60 * 24)) : null;
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;

  return (
    <div className={`rounded-xl p-5 border ${
      isOverdue ? 'bg-red-50 border-red-200' :
      isDueSoon ? 'bg-amber-50 border-amber-200' :
      'bg-white border-slate-200'
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Next Follow-Up</p>
          <p className="text-base font-semibold text-slate-900">{upcoming.reason_category}</p>
          <p className="text-sm text-slate-600 mt-0.5">{upcoming.department_name}</p>
        </div>
        <div className="text-right">
          {daysLeft !== null && (
            <p className={`text-2xl font-bold ${isOverdue ? 'text-red-600' : isDueSoon ? 'text-amber-600' : 'text-slate-800'}`}>
              {Math.abs(daysLeft)}
            </p>
          )}
          <p className="text-xs text-slate-500">
            {isOverdue ? 'days overdue' : 'days left'}
          </p>
        </div>
      </div>

      {windowEnd && (
        <div className="flex items-center gap-1.5 mt-3 text-sm text-slate-600">
          <Calendar className="w-4 h-4 flex-shrink-0" />
          Visit by: <strong>{windowEnd.toLocaleDateString()}</strong>
        </div>
      )}

      {upcoming.ack_status === 'pending' && (
        <Link
          to="/portal/follow-ups"
          className="mt-4 flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-colors"
        >
          View &amp; Acknowledge <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Link
        to="/portal/follow-ups"
        className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors min-h-[90px]"
      >
        <ClipboardList className="w-7 h-7 text-brand-600" aria-hidden="true" />
        <span className="text-sm font-medium text-slate-700">My Follow-Ups</span>
      </Link>
      <Link
        to="/portal/appointments"
        className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors min-h-[90px]"
      >
        <Calendar className="w-7 h-7 text-brand-600" aria-hidden="true" />
        <span className="text-sm font-medium text-slate-700">Appointments</span>
      </Link>
      <Link
        to="/portal/help"
        className="col-span-2 flex items-center justify-center gap-2 p-4 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
      >
        <HelpCircle className="w-6 h-6 text-amber-600" aria-hidden="true" />
        <span className="text-sm font-semibold text-amber-800">Need help? Request assistance</span>
      </Link>
    </div>
  );
}

export default function PatientHomePage() {
  const followUpsQuery = usePatientFollowUps();

  if (followUpsQuery.isLoading) return <LoadingSpinner label="Loading your information…" />;

  const followUps = followUpsQuery.data?.followUps || [];

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Hello</h2>
        <p className="text-sm text-slate-500">Here's your health follow-up summary</p>
      </div>

      <NextFollowUpCard followUps={followUps} />

      <QuickActions />

      <p className="text-xs text-slate-400 text-center pb-2">
        Your information is private and secure. Only your hospital team can see your health records.
      </p>
    </div>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import { usePatientFollowUps } from '../../api/queries.js';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  HelpCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

function getDaysLeft(dateValue) {
  if (!dateValue) return null;

  const target = new Date(dateValue);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function formatDate(dateValue) {
  if (!dateValue) return 'Date not specified';

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Date not specified';

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function NextFollowUpCard({ followUps }) {
  const upcoming = followUps
    .filter((item) =>
      ['active', 'draft', 'pending_approval'].includes(item?.status)
    )
    .sort((a, b) => {
      const dateA = a.window_end ? new Date(a.window_end).getTime() : Infinity;
      const dateB = b.window_end ? new Date(b.window_end).getTime() : Infinity;
      return dateA - dateB;
    })[0];

  if (!upcoming) {
    return (
      <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
            <CheckCircle2 size={25} />
          </div>
          <div>
            <p className="font-semibold text-emerald-900">You're all caught up</p>
            <p className="mt-1 text-sm leading-6 text-emerald-800">
              There are no pending follow-ups at the moment. You can check your
              appointments or return here for updates.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const daysLeft = getDaysLeft(upcoming.window_end);
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;

  const tone = isOverdue
    ? {
        card: 'border-red-200 bg-red-50',
        number: 'text-red-700',
        label: 'text-red-700',
        icon: 'bg-white text-red-600',
        message: 'This follow-up is overdue. Please contact your care team.',
      }
    : isDueSoon
      ? {
          card: 'border-amber-200 bg-amber-50',
          number: 'text-amber-700',
          label: 'text-amber-700',
          icon: 'bg-white text-amber-600',
          message: 'Your follow-up is coming up soon.',
        }
      : {
          card: 'border-slate-200 bg-white',
          number: 'text-slate-900',
          label: 'text-slate-500',
          icon: 'bg-blue-50 text-blue-700',
          message: 'Keep track of your upcoming care.',
        };

  return (
    <section className={`overflow-hidden rounded-2xl border p-5 sm:p-6 ${tone.card}`}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm ${tone.icon}`}>
            <CalendarDays size={24} />
          </div>

          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Your next follow-up
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
              {upcoming.reason_category || 'Scheduled follow-up'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {upcoming.department_name || 'Your care team'}
            </p>
          </div>
        </div>

        {daysLeft !== null && (
          <div className="flex items-center gap-3 rounded-xl bg-white/80 px-4 py-3 sm:min-w-28 sm:flex-col sm:gap-0 sm:text-center">
            <span className={`text-3xl font-bold tabular-nums ${tone.number}`}>
              {Math.abs(daysLeft)}
            </span>
            <span className={`text-xs font-medium ${tone.label}`}>
              {isOverdue
                ? 'days overdue'
                : daysLeft === 0
                  ? 'due today'
                  : 'days remaining'}
            </span>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200/70 pt-4 text-sm text-slate-600">
        <span className="inline-flex items-center gap-2">
          <Clock3 size={16} />
          Visit by: <strong className="font-semibold text-slate-800">{formatDate(upcoming.window_end)}</strong>
        </span>
        {upcoming.ack_status === 'pending' && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            Acknowledgement needed
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-slate-600">{tone.message}</p>

      {upcoming.ack_status === 'pending' && (
        <Link
          to="/portal/follow-ups"
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-blue-700 sm:w-auto"
        >
          View and acknowledge
          <ArrowRight size={17} />
        </Link>
      )}
    </section>
  );
}

function QuickAction({ to, icon: Icon, title, description }) {
  return (
    <Link
      to={to}
      className="group flex min-h-24 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus-visible:outline-blue-600"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-100">
        <Icon size={23} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="mt-1 block text-sm text-slate-500">{description}</span>
      </span>
      <ArrowRight size={18} className="shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-blue-700" />
    </Link>
  );
}

export default function PatientHomePage() {
  const followUpsQuery = usePatientFollowUps();
  const followUps = Array.isArray(followUpsQuery.data?.followUps)
    ? followUpsQuery.data.followUps
    : [];

  if (followUpsQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <LoadingSpinner label="Loading your information…" />
      </div>
    );
  }

  if (followUpsQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <Activity size={24} />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">
          We couldn't load your follow-ups
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Please check your connection and try again. Your information has not
          been changed.
        </p>
        <button
          type="button"
          onClick={() => followUpsQuery.refetch()}
          disabled={followUpsQuery.isFetching}
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={followUpsQuery.isFetching ? 'animate-spin' : ''} />
          {followUpsQuery.isFetching ? 'Retrying…' : 'Try again'}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7 px-4 py-5 sm:px-6 sm:py-7">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
          <Activity size={14} />
          PATIENT PORTAL
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Your care overview
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
          Keep track of your follow-ups, appointments, and messages from your care team.
        </p>
      </header>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">Upcoming care</h2>
          <Link
            to="/portal/follow-ups"
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900"
          >
            All follow-ups <ArrowRight size={15} />
          </Link>
        </div>
        <NextFollowUpCard followUps={followUps} />
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold text-slate-900">Quick access</h2>
          <p className="mt-1 text-sm text-slate-500">
            Find the information or support you need.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <QuickAction
            to="/portal/follow-ups"
            icon={ClipboardList}
            title="My follow-ups"
            description="Review and acknowledge your care plan"
          />
          <QuickAction
            to="/portal/appointments"
            icon={CalendarDays}
            title="Appointments"
            description="View your appointment schedule"
          />
          <QuickAction
            to="/portal/help"
            icon={HelpCircle}
            title="Request assistance"
            description="Get help from your care team"
          />
        </div>
      </section>

      <footer className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <ShieldCheck size={19} className="mt-0.5 shrink-0 text-slate-500" />
        <p className="text-xs leading-5 text-slate-500">
          This portal displays information provided by your care team. For
          urgent medical concerns, contact your hospital or local emergency
          services directly.
        </p>
      </footer>
    </div>
  );
}

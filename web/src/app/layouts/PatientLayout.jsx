/**
 * FollowCare — Patient Portal Layout
 * Responsive patient workspace with desktop sidebar and mobile tab navigation.
 */

import React, { useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import {
  Activity,
  Calendar,
  ClipboardList,
  HeartHandshake,
  Home,
  LogOut,
  ShieldCheck,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/portal/home', label: 'Overview', icon: Home },
  { to: '/portal/follow-ups', label: 'My follow-ups', icon: ClipboardList },
  { to: '/portal/appointments', label: 'Appointments', icon: Calendar },
  { to: '/portal/help', label: 'Get support', icon: HeartHandshake },
];

function PatientNavigation({ mobile = false }) {
  return (
    <nav
      aria-label="Patient portal navigation"
      className={mobile ? 'fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-safe shadow-[0_-8px_24px_rgba(15,23,42,0.06)] lg:hidden' : 'hidden lg:block'}
    >
      <ul className={mobile ? 'flex items-stretch justify-around px-2 pt-2' : 'space-y-1'}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to} className={mobile ? 'min-w-0 flex-1' : ''}>
              <NavLink
                to={item.to}
                end
                className={({ isActive }) => mobile
                  ? `mx-auto flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-colors ${isActive ? 'text-blue-700' : 'text-slate-500 hover:text-slate-800'}`
                  : `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${isActive ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                aria-label={item.label}
              >
                <Icon className={mobile ? 'h-5 w-5' : 'h-5 w-5'} aria-hidden="true" />
                <span>{mobile ? item.label.replace('My ', '') : item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SignOutButton({ compact = false }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/portal/login', { replace: true });
  }, [logout, navigate]);

  return (
    <button
      onClick={handleLogout}
      className={compact
        ? 'inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900'
        : 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900'}
      aria-label="Sign out"
      title="Sign out"
    >
      <LogOut className="h-5 w-5" aria-hidden="true" />
      {!compact && <span>Sign out</span>}
    </button>
  );
}

function DesktopSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-20 items-center gap-3 border-b border-slate-100 px-7">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-sm shadow-blue-900/15">
          <Activity className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="text-lg font-extrabold tracking-tight text-slate-900">FollowCare</p>
          <p className="text-xs font-medium text-slate-500">Patient workspace</p>
        </div>
      </div>

      <div className="px-5 pb-3 pt-8">
        <p className="px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Your care</p>
      </div>
      <div className="px-4">
        <PatientNavigation />
      </div>

      <div className="mt-auto border-t border-slate-100 p-4">
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">Private and secure</p>
            <p className="text-xs text-slate-500">Your care information</p>
          </div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}

function MobileHeader() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-700 text-white">
          <Activity className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-base font-extrabold tracking-tight text-slate-900">FollowCare</p>
          <p className="text-[11px] text-slate-500">Your patient portal</p>
        </div>
      </div>
      <SignOutButton compact />
    </header>
  );
}

export function PatientLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <DesktopSidebar />
      <div className="min-h-screen lg:pl-72">
        <MobileHeader />
        <header className="hidden h-16 items-center justify-between border-b border-slate-200 bg-white px-8 xl:flex 2xl:px-12">
          <div>
            <p className="text-sm font-semibold text-slate-800">Your care, in one place</p>
            <p className="text-xs text-slate-500">Stay up to date with your follow-ups and appointments</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Secure patient portal
          </div>
        </header>
        <main
          className="mx-auto min-h-[calc(100vh-4rem)] w-full max-w-[1600px] px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10 2xl:px-12"
          role="main"
          aria-label="Patient portal content"
        >
          {children}
        </main>
      </div>
      <PatientNavigation mobile />
    </div>
  );
}

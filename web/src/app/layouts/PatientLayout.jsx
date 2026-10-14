/**
 * FollowCare — Patient Portal Layout
 * ARCHITECTURE.md Section 10.2, 10.3
 *
 * Mobile-first: bottom tab bar, large tap targets, plain-language copy.
 * Max width constrained for readability on tablet.
 */

import React, { useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Home, ClipboardList, Calendar, HelpCircle, LogOut } from 'lucide-react';

const TAB_ITEMS = [
  { to: '/portal/home', label: 'Home', icon: Home },
  { to: '/portal/follow-ups', label: 'Follow-Ups', icon: ClipboardList },
  { to: '/portal/appointments', label: 'Appointments', icon: Calendar },
  { to: '/portal/help', label: 'Get Help', icon: HelpCircle }
];

function BottomTabBar() {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-20 safe-area-bottom"
      aria-label="Patient portal navigation"
    >
      <ul className="flex" role="list">
        {TAB_ITEMS.map(item => {
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                className={({ isActive }) => `
                  flex flex-col items-center justify-center py-2.5 gap-1 text-xs font-medium transition-colors
                  min-h-[60px] w-full
                  ${isActive
                    ? 'text-brand-600'
                    : 'text-slate-500 hover:text-slate-800'
                  }
                `}
                aria-label={item.label}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function PatientHeader() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/portal/login', { replace: true });
  }, [logout, navigate]);

  return (
    <header className="bg-brand-600 text-white px-4 py-3 flex items-center justify-between">
      <div>
        <h1 className="text-base font-semibold">FollowCare</h1>
        <p className="text-xs text-brand-100">Your health follow-up portal</p>
      </div>
      <button
        onClick={handleLogout}
        className="p-2 rounded text-brand-100 hover:text-white hover:bg-brand-700 transition-colors"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </header>
  );
}

export function PatientLayout({ children }) {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 max-w-lg mx-auto">
      <PatientHeader />
      <main
        className="flex-1 pb-20 overflow-auto"
        role="main"
        aria-label="Patient portal content"
      >
        {children}
      </main>
      <BottomTabBar />
    </div>
  );
}

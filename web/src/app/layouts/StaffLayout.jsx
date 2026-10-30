/**
 * FollowCare — Staff Application Layout
 * Preserves permission-filtered navigation and existing auth behavior.
 */

import React, { useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Permissions, UserRole } from '@followcare/shared';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  KanbanSquare,
  Calendar,
  AlertTriangle,
  ShieldCheck,
  Database,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Building2,
  Menu,
  X,
  HeartPulse,
} from 'lucide-react';

const NAV_ITEMS = [
  {
    to: '/staff/overview',
    label: 'Command Center',
    icon: LayoutDashboard,
    roles: [UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.COORDINATOR, UserRole.HEALTH_WORKER],
  },
  {
    to: '/staff/patients',
    label: 'Patients',
    icon: Users,
    permission: Permissions.PATIENT_VIEW_DEMOGRAPHICS,
  },
  {
    to: '/staff/plans',
    label: 'Follow-up Plans',
    icon: ClipboardList,
    permission: Permissions.PLAN_CREATE,
  },
  {
    to: '/staff/tasks',
    label: 'Task Board',
    icon: KanbanSquare,
    permission: Permissions.TASK_WORK,
  },
  {
    to: '/staff/appointments',
    label: 'Appointments',
    icon: Calendar,
    permission: Permissions.APPOINTMENT_BOOK,
  },
  {
    to: '/staff/priority',
    label: 'Priority Queue',
    icon: AlertTriangle,
    roles: [UserRole.ADMIN, UserRole.COORDINATOR],
  },
  {
    to: '/staff/dataset',
    label: 'Dataset Explorer',
    icon: Database,
    roles: [UserRole.ADMIN, UserRole.COORDINATOR],
  },
  {
    to: '/staff/privacy',
    label: 'Privacy & Audit',
    icon: ShieldCheck,
    permission: Permissions.AUDIT_VIEW,
  },
];

function navItemVisible(item, role, hasPermission) {
  if (item.roles && !item.roles.includes(role)) return false;
  if (item.permission && !hasPermission(item.permission)) return false;
  return true;
}

function DepartmentSwitcher() {
  const { departments, activeDepartmentId, setActiveDepartmentId, role } = useAuth();

  if (role === UserRole.ADMIN) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <Building2 className="h-4 w-4 text-slate-400" />
        <span>All departments</span>
      </div>
    );
  }

  if (departments.length === 0) return null;

  if (departments.length === 1) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <Building2 className="h-4 w-4 text-slate-400" />
        <span>{departments[0].name}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 flex-shrink-0 text-slate-400" />
      <select
        aria-label="Switch active department"
        className="max-w-[180px] cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        value={activeDepartmentId || ''}
        onChange={e => setActiveDepartmentId(e.target.value || null)}
      >
        {departments.map(department => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Sidebar({ collapsed, onToggle, visibleItems, onNavigate }) {
  return (
    <aside
      className={`
        flex min-h-screen flex-shrink-0 flex-col
        border-r border-slate-800/70 bg-[#101b32] text-white
        transition-[width] duration-200 ease-in-out
        ${collapsed ? 'w-[76px]' : 'w-[252px]'}
      `}
      aria-label="Main navigation"
    >
      <div className={`flex h-[76px] items-center border-b border-white/[0.08] px-5 ${collapsed ? 'justify-center px-2' : 'gap-3'}`}>
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500 shadow-lg shadow-blue-950/30">
          <HeartPulse className="h-6 w-6 text-white" strokeWidth={2.4} />
        </span>

        {!collapsed && (
          <div className="min-w-0">
            <p className="text-base font-bold tracking-tight text-white">FollowCare</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Care coordination
            </p>
          </div>
        )}
      </div>

      <div className={`px-4 pb-2 pt-7 ${collapsed ? 'px-2 text-center' : ''}`}>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {collapsed ? '•••' : 'Workspace'}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-5" aria-label="Sidebar navigation">
        <ul className="space-y-1" role="list">
          {visibleItems.map(item => {
            const Icon = item.icon;

            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end
                  onClick={onNavigate}
                  className={({ isActive }) => `
                    group relative flex min-h-[44px] items-center gap-3 rounded-xl
                    px-3 py-2.5 text-[13px] font-medium transition-all duration-150
                    ${collapsed ? 'justify-center px-2' : ''}
                    ${isActive
                      ? 'bg-blue-500/15 text-blue-300 shadow-sm'
                      : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                    }
                  `}
                  title={collapsed ? item.label : undefined}
                  aria-label={item.label}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-blue-400" />
                      )}
                      <Icon
                        className={`h-[18px] w-[18px] flex-shrink-0 ${isActive ? 'text-blue-300' : 'text-slate-400 group-hover:text-white'}`}
                        aria-hidden="true"
                      />
                      {!collapsed && <span>{item.label}</span>}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/[0.08] p-3">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse sidebar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function Header({ onMobileMenuOpen }) {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const roleLabel = {
    admin: 'Administrator',
    doctor: 'Doctor',
    nurse: 'Nurse',
    coordinator: 'Coordinator',
    health_worker: 'Health Worker',
  }[role] || role;

  const initials = (user?.fullName || 'User')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 md:hidden"
          onClick={onMobileMenuOpen}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <p className="mb-1 hidden text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400 sm:block">
            Hospital workspace
          </p>
          <DepartmentSwitcher />
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-3 sm:gap-4">
        <div className="hidden h-9 w-px bg-slate-200 sm:block" />

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-xs font-bold text-blue-700">
            {initials}
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="max-w-[180px] truncate text-sm font-semibold text-slate-800">
              {user?.fullName || 'Staff member'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{roleLabel}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="h-[17px] w-[17px]" />
        </button>
      </div>
    </header>
  );
}

export function StaffLayout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { role, hasPermission } = useAuth();

  const visibleItems = NAV_ITEMS.filter(item =>
    navItemVisible(item, role, hasPermission)
  );

  return (
    <div className="flex min-h-screen bg-[#f5f7fb]">
      <div className="hidden md:flex">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(current => !current)}
          visibleItems={visibleItems}
        />
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation overlay"
          />

          <div className="relative min-h-full w-[280px] max-w-[85vw] shadow-2xl">
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileMenuOpen(false)}
              visibleItems={visibleItems}
              onNavigate={() => setMobileMenuOpen(false)}
            />
            <button
              className="absolute right-3 top-5 rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Header onMobileMenuOpen={() => setMobileMenuOpen(true)} />

        <main
          className="w-full flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8"
          role="main"
        >
          <div className="mx-auto w-full max-w-[1600px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

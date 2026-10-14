/**
 * FollowCare — Staff Application Layout
 * ARCHITECTURE.md Section 10.2
 *
 * - Collapsible sidebar with permission-filtered nav
 * - Department switcher in header (the "class" switcher)
 * - Header with user info and logout
 * - Content area with accessible landmark roles
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
  ChevronLeft,
  ChevronRight,
  LogOut,
  Building2,
  Menu,
  X
} from 'lucide-react';

// ── Nav configuration (permission-filtered) ───────────────────────────────────
const NAV_ITEMS = [
  {
    to: '/staff/overview',
    label: 'Command Center',
    icon: LayoutDashboard,
    roles: [UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.COORDINATOR, UserRole.HEALTH_WORKER]
  },
  {
    to: '/staff/patients',
    label: 'Patients',
    icon: Users,
    permission: Permissions.PATIENT_VIEW_DEMOGRAPHICS
  },
  {
    to: '/staff/plans',
    label: 'Follow-up Plans',
    icon: ClipboardList,
    permission: Permissions.PLAN_CREATE
  },
  {
    to: '/staff/tasks',
    label: 'Task Board',
    icon: KanbanSquare,
    permission: Permissions.TASK_WORK
  },
  {
    to: '/staff/appointments',
    label: 'Appointments',
    icon: Calendar,
    permission: Permissions.APPOINTMENT_BOOK
  },
  {
    to: '/staff/priority',
    label: 'Priority Queue',
    icon: AlertTriangle,
    roles: [UserRole.ADMIN, UserRole.COORDINATOR]
  },
  {
    to: '/staff/privacy',
    label: 'Privacy & Audit',
    icon: ShieldCheck,
    permission: Permissions.AUDIT_VIEW
  }
];

function navItemVisible(item, role, hasPermission) {
  if (item.roles && !item.roles.includes(role)) return false;
  if (item.permission && !hasPermission(item.permission)) return false;
  return true;
}

// ── Department Switcher ────────────────────────────────────────────────────────
function DepartmentSwitcher() {
  const { departments, activeDepartmentId, setActiveDepartmentId, role } = useAuth();

  if (role === UserRole.ADMIN) {
    return (
      <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
        <Building2 className="w-3.5 h-3.5" />
        All departments
      </span>
    );
  }

  if (departments.length === 0) return null;
  if (departments.length === 1) {
    return (
      <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
        <Building2 className="w-3.5 h-3.5" />
        {departments[0].name}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Building2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
      <select
        aria-label="Switch active department"
        className="text-xs font-medium text-slate-700 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-brand-500 rounded cursor-pointer max-w-[140px]"
        value={activeDepartmentId || ''}
        onChange={e => setActiveDepartmentId(e.target.value || null)}
      >
        {departments.map(d => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
function Sidebar({ collapsed, onToggle, visibleItems }) {
  return (
    <aside
      className={`
        flex flex-col bg-slate-900 text-white transition-all duration-200
        ${collapsed ? 'w-16' : 'w-56'}
        min-h-screen flex-shrink-0
      `}
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className={`flex items-center gap-2 px-4 py-4 border-b border-slate-700 ${collapsed ? 'justify-center' : ''}`}>
        <span className="w-7 h-7 bg-brand-500 rounded-md flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">FC</span>
        </span>
        {!collapsed && (
          <span className="font-semibold text-sm tracking-tight">FollowCare</span>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-3 overflow-y-auto" aria-label="Sidebar navigation">
        <ul className="space-y-0.5 px-2" role="list">
          {visibleItems.map(item => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => `
                    flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors
                    ${isActive
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                    }
                    ${collapsed ? 'justify-center' : ''}
                  `}
                  title={collapsed ? item.label : undefined}
                  aria-label={item.label}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-slate-700 p-2">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2 px-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRight className="w-4 h-4" />
            : <><ChevronLeft className="w-4 h-4 mr-1" /><span className="text-xs">Collapse</span></>
          }
        </button>
      </div>
    </aside>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────
function Header({ onMobileMenuOpen }) {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const roleLabel = {
    admin: 'Admin',
    doctor: 'Doctor',
    nurse: 'Nurse',
    coordinator: 'Coordinator',
    health_worker: 'Health Worker'
  }[role] || role;

  return (
    <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-4 sticky top-0 z-10">
      {/* Mobile hamburger */}
      <button
        className="md:hidden p-1.5 rounded text-slate-600 hover:bg-slate-100"
        onClick={onMobileMenuOpen}
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Department switcher */}
      <div className="flex-1 min-w-0">
        <DepartmentSwitcher />
      </div>

      {/* User info + logout */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="hidden sm:block text-right">
          <p className="text-sm font-medium text-slate-800 leading-none">{user?.fullName}</p>
          <p className="text-xs text-slate-500 mt-0.5">{roleLabel}</p>
        </div>
        <button
          onClick={handleLogout}
          className="p-2 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

// ── Main Layout ────────────────────────────────────────────────────────────────
export function StaffLayout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { role, hasPermission } = useAuth();

  const visibleItems = NAV_ITEMS.filter(item => navItemVisible(item, role, hasPermission));

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
          visibleItems={visibleItems}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-56 min-h-full">
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileMenuOpen(false)}
              visibleItems={visibleItems}
            />
            <button
              className="absolute top-3 right-3 text-slate-300 hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <Header onMobileMenuOpen={() => setMobileMenuOpen(true)} />
        <main className="flex-1 p-4 md:p-6 overflow-auto" role="main">
          {children}
        </main>
      </div>
    </div>
  );
}

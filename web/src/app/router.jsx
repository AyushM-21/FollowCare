/**
 * FollowCare — React Router v6 configuration
 * ARCHITECTURE.md Section 10.1
 *
 * Staff routes: /staff/* (session-based, cookie auth)
 * Patient routes: /portal/* (OTP session, mobile-first)
 * Auth routes: /login, /portal/login
 */

import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';

import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { NotFound } from '../components/common/NotFound.jsx';
import { RequireAuth, RequirePermission, RequireRole } from '../auth/guards.jsx';
import { Permissions, UserRole } from '@followcare/shared';

// ── Layouts ──────────────────────────────────────────────────────────────────
import { StaffLayout } from './layouts/StaffLayout.jsx';
import { PatientLayout } from './layouts/PatientLayout.jsx';

// ── Auth pages ───────────────────────────────────────────────────────────────
const LoginPage = lazy(() => import('../features/auth/LoginPage.jsx'));
const PatientLoginPage = lazy(() => import('../features/auth/PatientLoginPage.jsx'));

// ── Staff feature pages ───────────────────────────────────────────────────────
const CommandCenterPage = lazy(() => import('../features/command-center/CommandCenterPage.jsx'));
const PatientsPage = lazy(() => import('../features/patients/PatientsPage.jsx'));
const PatientDetailPage = lazy(() => import('../features/patients/PatientDetailPage.jsx'));
const PlansPage = lazy(() => import('../features/plans/PlansPage.jsx'));
const PlanDetailPage = lazy(() => import('../features/plans/PlanDetailPage.jsx'));
const NewPlanPage = lazy(() => import('../features/plans/NewPlanPage.jsx'));
const KanbanBoardPage = lazy(() => import('../features/tasks/KanbanBoardPage.jsx'));
const AppointmentsPage = lazy(() => import('../features/appointments/AppointmentsPage.jsx'));
const PriorityQueuePage = lazy(() => import('../features/priority/PriorityQueuePage.jsx'));
const PrivacyPage = lazy(() => import('../features/privacy/PrivacyPage.jsx'));
const DatasetExplorerPage = lazy(() => import('../features/dataset/DatasetExplorerPage.jsx'));

// ── Patient portal pages ──────────────────────────────────────────────────────
const PatientHomePage = lazy(() => import('../features/patient-portal/PatientHomePage.jsx'));
const PatientFollowUpsPage = lazy(() => import('../features/patient-portal/PatientFollowUpsPage.jsx'));
const PatientAppointmentsPage = lazy(() => import('../features/patient-portal/PatientAppointmentsPage.jsx'));
const PatientHelpPage = lazy(() => import('../features/patient-portal/PatientHelpPage.jsx'));

function PageLoader() {
  return <LoadingSpinner label="Loading..." />;
}

function SuspenseOutlet() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  // ── Root redirect ───────────────────────────────────────────────────────────
  {
    index: true,
    path: '/',
    element: <Navigate to="/staff/overview" replace />
  },

  // ── Staff login ─────────────────────────────────────────────────────────────
  {
    path: '/login',
    element: (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    )
  },

  // ── Staff portal ────────────────────────────────────────────────────────────
  {
    path: '/staff',
    element: (
      <RequireAuth redirectTo="/login" mode="staff">
        <StaffLayout>
          <SuspenseOutlet />
        </StaffLayout>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/staff/overview" replace /> },
      { path: 'overview', element: <CommandCenterPage /> },
      { path: 'patients', element: <PatientsPage /> },
      { path: 'patients/:id', element: <PatientDetailPage /> },
      {
        path: 'plans',
        element: (
          <RequirePermission permission={Permissions.PLAN_CREATE} fallback="plans">
            <Outlet />
          </RequirePermission>
        ),
        children: [
          { index: true, element: <PlansPage /> },
          { path: 'new', element: <NewPlanPage /> },
          { path: ':id', element: <PlanDetailPage /> }
        ]
      },
      {
        path: 'tasks',
        element: (
          <RequirePermission permission={Permissions.TASK_WORK} fallback="tasks">
            <KanbanBoardPage />
          </RequirePermission>
        )
      },
      { path: 'appointments', element: <AppointmentsPage /> },
      { path: 'priority', element: <PriorityQueuePage /> },
      {
        path: 'dataset',
        element: (
          <RequireRole allowedRoles={[UserRole.ADMIN, UserRole.COORDINATOR]} fallback="dataset explorer">
            <RequirePermission permission={Permissions.TASK_WORK} fallback="dataset explorer">
              <DatasetExplorerPage />
            </RequirePermission>
          </RequireRole>
        )
      },
      { path: 'privacy', element: <PrivacyPage /> }
    ]
  },

  // ── Patient portal ──────────────────────────────────────────────────────────
  {
    path: '/portal',
    children: [
      { index: true, element: <Navigate to="/portal/login" replace /> },
      {
        path: 'login',
        element: (
          <Suspense fallback={<PageLoader />}>
            <PatientLoginPage />
          </Suspense>
        )
      },
      {
        path: '',
        element: (
          <RequireAuth redirectTo="/portal/login" mode="patient">
            <PatientLayout>
              <SuspenseOutlet />
            </PatientLayout>
          </RequireAuth>
        ),
        children: [
          { path: 'home', element: <PatientHomePage /> },
          { path: 'follow-ups', element: <PatientFollowUpsPage /> },
          { path: 'appointments', element: <PatientAppointmentsPage /> },
          { path: 'help', element: <PatientHelpPage /> }
        ]
      }
    ]
  },

  // ── 404 ─────────────────────────────────────────────────────────────────────
  { path: '*', element: <NotFound /> }
]);

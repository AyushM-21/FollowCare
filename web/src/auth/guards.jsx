/**
 * FollowCare — Route guards
 * ARCHITECTURE.md Section 10.2
 *
 * Frontend guards are defence-in-depth only.
 * All authorization is enforced server-side.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { Forbidden } from '../components/common/Forbidden.jsx';

/**
 * RequireAuth — redirects unauthenticated users to login.
 * mode: 'staff' checks req.user, 'patient' checks req.patient.
 */
export function RequireAuth({ children, redirectTo = '/login', mode = 'staff' }) {
  const { isLoading, isStaff, isPatient } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner label="Verifying session..." />;
  }

  const isAuthorized = mode === 'patient' ? isPatient : isStaff;

  if (!isAuthorized) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/**
 * RequirePermission — renders Forbidden if the authenticated staff user
 * does not hold the required permission string.
 * fallback: a label used in the Forbidden message.
 */
export function RequirePermission({ children, permission, fallback = 'this resource' }) {
  const { hasPermission, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner label="Checking permissions..." />;
  }

  if (!hasPermission(permission)) {
    return (
      <Forbidden
        title="Permission Required"
        message={`You do not have the '${permission}' permission required to access ${fallback}.`}
      />
    );
  }

  return <>{children}</>;
}

/**
 * RequireRole — renders Forbidden if the user's role is not in allowedRoles.
 */
export function RequireRole({ children, allowedRoles = [], fallback = 'this resource' }) {
  const { hasRole, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner label="Checking role..." />;
  }

  if (!hasRole(...allowedRoles)) {
    return (
      <Forbidden
        title="Role Restricted"
        message={`This section requires one of the following roles: ${allowedRoles.join(', ')}.`}
      />
    );
  }

  return <>{children}</>;
}

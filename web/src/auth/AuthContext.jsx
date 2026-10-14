import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [patient, setPatient] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [activeDepartmentId, setActiveDepartmentId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Retrieve current session on app startup (GET /api/auth/me)
  const refreshSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.get('/api/auth/me');

      if (data.user) {
        setUser(data.user);
        setPatient(null);
        setPermissions(data.permissions || []);
        const depts = data.departments || [];
        setDepartments(depts);
        // Default active department: first available department or null (all) if admin
        if (data.user.role !== 'admin' && depts.length > 0) {
          setActiveDepartmentId(depts[0].id);
        } else {
          setActiveDepartmentId(null);
        }
      } else if (data.patient) {
        setPatient(data.patient);
        setUser(null);
        setPermissions([]);
        setDepartments([]);
        setActiveDepartmentId(null);
      } else {
        setUser(null);
        setPatient(null);
        setPermissions([]);
        setDepartments([]);
      }
    } catch (err) {
      // 401 is normal when not logged in
      if (err.status !== 401) {
        setError(err.message);
      }
      setUser(null);
      setPatient(null);
      setPermissions([]);
      setDepartments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Staff Login
  const login = async (email, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.post('/api/auth/login', { email, password });
      setUser(data.user);
      setPatient(null);
      setPermissions(data.permissions || []);
      const depts = data.departments || [];
      setDepartments(depts);
      if (data.user.role !== 'admin' && depts.length > 0) {
        setActiveDepartmentId(depts[0].id);
      } else {
        setActiveDepartmentId(null);
      }
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Patient OTP Login
  const patientLogin = async (phone, code) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.post('/api/patient-auth/otp/verify', { phone, code });
      setPatient(data.patient);
      setUser(null);
      setPermissions([]);
      setDepartments([]);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout
  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (err) {
      console.warn('Logout notification failed, clearing local state', err);
    } finally {
      setUser(null);
      setPatient(null);
      setPermissions([]);
      setDepartments([]);
      setActiveDepartmentId(null);
    }
  };

  const role = user?.role || (patient ? 'patient' : null);

  const hasPermission = useCallback((permission) => {
    if (!user) return false;
    return permissions.includes(permission);
  }, [user, permissions]);

  const hasRole = useCallback((...allowedRoles) => {
    if (!role) return false;
    return allowedRoles.includes(role);
  }, [role]);

  const value = {
    user,
    patient,
    role,
    permissions,
    departments,
    activeDepartmentId,
    setActiveDepartmentId,
    isAuthenticated: Boolean(user || patient),
    isStaff: Boolean(user),
    isPatient: Boolean(patient),
    hasPermission,
    hasRole,
    login,
    patientLogin,
    logout,
    refreshSession,
    isLoading,
    error
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

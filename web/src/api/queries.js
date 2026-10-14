/**
 * FollowCare — Dashboard API hooks
 * Uses TanStack Query with the fetch client.
 * Cache times are short because this is operational data.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from './client.js';

/**
 * GET /api/dashboard/metrics
 * Returns: { metrics: { activePlans, dueToday, dueSoon, overdue, confirmed, returned, unreachable, awaitingAction, unacknowledged } }
 */
export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: () => api.get('/api/dashboard/metrics'),
    staleTime: 30_000, // 30 s per ARCHITECTURE.md §9.4
    refetchInterval: 60_000
  });
}

/**
 * GET /api/dashboard/workload
 * Returns: { workload: [{ staff_id, staff_name, staff_role, active_tasks, completed_tasks, escalated_tasks }] }
 */
export function useDashboardWorkload() {
  return useQuery({
    queryKey: ['dashboard', 'workload'],
    queryFn: () => api.get('/api/dashboard/workload'),
    staleTime: 60_000,
    refetchInterval: 120_000
  });
}

/**
 * GET /api/dashboard/overdue
 * Returns: { overdue: [{ plan_id, patient_id, hospital_reg_no, patientName, department_name, urgency, window_end, days_overdue, priority_score, owner_name }] }
 */
export function useDashboardOverdue() {
  return useQuery({
    queryKey: ['dashboard', 'overdue'],
    queryFn: () => api.get('/api/dashboard/overdue'),
    staleTime: 30_000,
    refetchInterval: 60_000
  });
}

/**
 * GET /api/priority-queue
 * Returns: { queue: [...] }
 */
export function usePriorityQueue() {
  return useQuery({
    queryKey: ['priority-queue'],
    queryFn: () => api.get('/api/priority-queue'),
    staleTime: 30_000
  });
}

/**
 * GET /api/tasks/board?assignee=<id>
 * Returns: { board: { todo, in_progress, awaiting_response, escalated, completed } }
 */
export function useTasksBoard({ departmentId, assigneeId } = {}) {
  const params = new URLSearchParams();
  if (assigneeId) params.set('assignee', assigneeId);

  return useQuery({
    queryKey: ['tasks', 'board', { departmentId, assigneeId }],
    queryFn: () => api.get(`/api/tasks/board${params.toString() ? `?${params}` : ''}`),
    staleTime: 15_000
  });
}

/**
 * GET /api/patients
 */
export function usePatients({ search, departmentId } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (departmentId) params.set('department_id', departmentId);

  return useQuery({
    queryKey: ['patients', { search, departmentId }],
    queryFn: () => api.get(`/api/patients${params.toString() ? `?${params}` : ''}`),
    staleTime: 60_000
  });
}

/**
 * GET /api/patients/:id
 */
export function usePatient(id) {
  return useQuery({
    queryKey: ['patients', id],
    queryFn: () => api.get(`/api/patients/${id}`),
    enabled: Boolean(id),
    staleTime: 60_000
  });
}

/**
 * GET /api/plans/:id
 */
export function usePlan(id) {
  return useQuery({
    queryKey: ['plans', id],
    queryFn: () => api.get(`/api/plans/${id}`),
    enabled: Boolean(id),
    staleTime: 30_000
  });
}

/**
 * GET /api/plans
 */
export function usePlans({ patientId, departmentId, status } = {}) {
  const params = new URLSearchParams();
  if (patientId) params.set('patient_id', patientId);
  if (departmentId) params.set('department_id', departmentId);
  if (status) params.set('status', status);

  return useQuery({
    queryKey: ['plans', { patientId, departmentId, status }],
    queryFn: () => api.get(`/api/plans${params.toString() ? `?${params}` : ''}`),
    staleTime: 30_000
  });
}

/**
 * GET /api/departments
 */
export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/api/departments'),
    staleTime: 5 * 60_000 // 5 min — departments change rarely
  });
}

/**
 * GET /api/appointments
 */
export function useAppointments({ departmentId } = {}) {
  const params = new URLSearchParams();
  if (departmentId) params.set('department_id', departmentId);

  return useQuery({
    queryKey: ['appointments', { departmentId }],
    queryFn: () => api.get(`/api/appointments${params.toString() ? `?${params}` : ''}`),
    staleTime: 30_000
  });
}

// ── Patient Portal hooks ────────────────────────────────────────────────────────

/**
 * GET /api/me/follow-ups
 */
export function usePatientFollowUps() {
  return useQuery({
    queryKey: ['me', 'follow-ups'],
    queryFn: () => api.get('/api/me/follow-ups'),
    staleTime: 60_000
  });
}

/**
 * GET /api/me/appointments
 */
export function usePatientAppointments() {
  return useQuery({
    queryKey: ['me', 'appointments'],
    queryFn: () => api.get('/api/me/appointments'),
    staleTime: 60_000
  });
}

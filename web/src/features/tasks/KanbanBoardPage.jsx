import { normalizeReasons, formatRule } from '../../lib/priority.js';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTasksBoard } from '../../api/queries.js';
import { api } from '../../api/client.js';
import { TaskStatus, TaskType, Permissions } from '@followcare/shared';
import { useAuth } from '../../auth/AuthContext.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import {
  X, ChevronDown, UserCheck, MessageSquarePlus, Phone,
  Clock, ListTodo, ShieldAlert, CalendarDays, UserRound
} from 'lucide-react';

const COLUMNS = [
  { key: TaskStatus.TODO, label: 'To Do', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  { key: TaskStatus.IN_PROGRESS, label: 'In Progress', color: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  { key: TaskStatus.AWAITING_RESPONSE, label: 'Awaiting Response', color: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  { key: TaskStatus.ESCALATED, label: 'Escalated', color: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  { key: TaskStatus.COMPLETED, label: 'Completed', color: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' }
];

const URGENCY_STYLES = {
  urgent: 'bg-red-50 text-red-700',
  priority: 'bg-amber-50 text-amber-700',
  routine: 'bg-sky-50 text-sky-700'
};

const URGENCY_DOT = {
  urgent: 'bg-red-500',
  priority: 'bg-amber-500',
  routine: 'bg-sky-500'
};

const TASK_TYPE_LABELS = {
  [TaskType.CONTACT_PATIENT]: 'Contact Patient',
  [TaskType.RESCHEDULE]: 'Reschedule',
  [TaskType.RESOLVE_FAILED_DELIVERY]: 'Failed Delivery',
  [TaskType.RESOLVE_BARRIER]: 'Resolve Barrier',
  [TaskType.REVIEW_AMBIGUITY]: 'Review Ambiguity',
  [TaskType.ESCALATE_CLINICAL]: 'Clinical Escalation',
  [TaskType.VERIFY_CONTACT]: 'Verify Contact'
};

function formatDate(value, includeTime = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString(undefined, includeTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' }
  );
}

function TaskCard({ task, onOpen }) {
  const urgency = String(task.urgency || 'routine').toLowerCase();
  const dueDate = formatDate(task.dueAt);

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      aria-label={`Open task: ${task.title}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${URGENCY_STYLES[urgency] || 'bg-slate-100 text-slate-600'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${URGENCY_DOT[urgency] || 'bg-slate-400'}`} />
          {urgency}
        </span>
        {task.priorityScore > 0 && (
          <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] font-semibold text-slate-600">
            #{task.priorityScore}
          </span>
        )}
      </div>

      <h3 className="mt-3 text-sm font-semibold leading-5 text-slate-900">
        {task.title || 'Untitled task'}
      </h3>

      <p className="mt-1 truncate text-xs text-slate-500">
        {task.patientName || 'Unknown patient'}
      </p>

      <div className="mt-3 border-t border-slate-100 pt-2.5">
        <p className="text-[11px] font-medium text-slate-500">
          {TASK_TYPE_LABELS[task.type] || task.type || 'Task'}
        </p>

        {task.assigneeName && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-blue-700">
            <UserCheck className="h-3.5 w-3.5" />
            <span className="truncate">{task.assigneeName}</span>
          </p>
        )}

        {dueDate && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            Due {dueDate}
          </p>
        )}
      </div>
    </button>
  );
}

function KanbanColumn({ column, tasks, onOpenTask }) {
  return (
    <section className="flex w-[280px] shrink-0 flex-col sm:w-[300px]" aria-label={`${column.label} tasks`}>
      <div className="mb-2 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${column.dot}`} />
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">
            {column.label}
          </h2>
        </div>
        <span className={`rounded-lg px-2 py-1 text-xs font-bold tabular-nums ${column.color}`}>
          {tasks.length}
        </span>
      </div>

      <div className="flex max-h-[calc(100vh-300px)] min-h-[220px] flex-1 flex-col gap-2.5 overflow-y-auto rounded-xl bg-slate-100/70 p-2">
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} onOpen={onOpenTask} />
        ))}

        {tasks.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <ListTodo className="h-6 w-6 text-slate-300" />
            <p className="mt-2 text-xs font-medium text-slate-400">No tasks here</p>
          </div>
        )}
      </div>
    </section>
  );
}

function TaskDrawer({ task, onClose }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const activityQuery = useQuery({
    queryKey: ['tasks', task.id, 'activity'],
    queryFn: () => api.get(`/api/tasks/${task.id}/activity`),
    enabled: Boolean(task.id),
    staleTime: 0
  });
  const canWork = hasPermission(Permissions.TASK_WORK);
  const canLogOutcome = hasPermission(Permissions.TASK_LOG_OUTCOME);

  const [newStatus, setNewStatus] = useState(task.status);
  const [comment, setComment] = useState('');
  const [contactChannel, setContactChannel] = useState('phone_call');
  const [contactOutcome, setContactOutcome] = useState('reached');
  const [contactNotes, setContactNotes] = useState('');
  const [closeFollowUp, setCloseFollowUp] = useState(false);
  const [finalStatus, setFinalStatus] = useState('');
  const [contactLogged, setContactLogged] = useState('');
  const [showContactForm, setShowContactForm] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks', 'board'] });
    queryClient.invalidateQueries({ queryKey: ['tasks', task.id, 'activity'] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ status, comment }) =>
      api.patch(`/api/tasks/${task.id}/status`, {
        status,
        comment: comment || undefined
      }),
    onSuccess: () => {
      invalidate();
      onClose();
    }
  });

  const commentMutation = useMutation({
    mutationFn: body => api.post(`/api/tasks/${task.id}/comments`, { body }),
    onSuccess: () => {
      setComment('');
      invalidate();
    }
  });

  const contactMutation = useMutation({
    mutationFn: data => api.post(`/api/tasks/${task.id}/contact-attempts`, data),
    onSuccess: (_data, vars) => {
      setContactNotes('');
      setCloseFollowUp(false);
      setFinalStatus('');
      setShowContactForm(false);
      setContactLogged(
        `Contact attempt logged (${vars.outcome.replace(/_/g, ' ')}) at ${new Date().toLocaleTimeString()}`
      );
      invalidate();
    }
  });

  const handleStatusSave = () => {
    statusMutation.mutate({ status: newStatus, comment });
  };

  const handleContactSubmit = event => {
    event.preventDefault();
    contactMutation.mutate({
      channel: contactChannel,
      outcome: contactOutcome,
      notes: contactNotes || undefined,
      close_follow_up: closeFollowUp,
      final_status: closeFollowUp ? finalStatus : undefined
    });
  };

  const isChangingStatus = newStatus !== task.status;
  const urgency = String(task.urgency || 'routine').toLowerCase();

  const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
  const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-600';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Task details">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close task details"
      />

      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="min-w-0 pr-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
              {TASK_TYPE_LABELS[task.type] || task.type}
            </p>
            <h2 className="mt-1 text-lg font-bold leading-6 text-slate-900">
              {task.title || 'Untitled task'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Task overview
              </h3>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${URGENCY_STYLES[urgency] || 'bg-slate-100 text-slate-600'}`}>
                {urgency}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-400">Patient</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <UserRound className="h-4 w-4 text-slate-400" />
                  {task.patientName || 'Unknown patient'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Department</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {task.departmentName || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Priority score</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-800">
                  {task.priorityScore ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Assignee</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {task.assigneeName || 'Unassigned'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Due date</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {formatDate(task.dueAt, true) || 'Not set'}
                </p>
              </div>
            </div>

            {normalizeReasons(task.priorityReasons).length > 0 && (
              <div className="mt-4 border-t border-slate-200 pt-3">
                <p className="mb-2 text-xs font-semibold text-slate-500">
                  Priority score breakdown
                </p>
                <ul className="space-y-1.5">
                  {normalizeReasons(task.priorityReasons).map((reason, index) => (
                    <li key={`${reason.rule}-${index}`} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-600">{formatRule(reason.rule)}</span>
                      <span className="font-semibold tabular-nums text-amber-700">+{reason.points}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {canWork && (
            <section className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-900">Update status</h3>
              <p className="mt-1 text-xs text-slate-500">
                Choose the next workflow stage for this task.
              </p>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select
                  className={`${fieldClass} flex-1`}
                  value={newStatus}
                  onChange={event => setNewStatus(event.target.value)}
                  aria-label="Select new task status"
                >
                  {COLUMNS.filter(column =>
                    column.key !== TaskStatus.COMPLETED || [TaskStatus.IN_PROGRESS, TaskStatus.AWAITING_RESPONSE, TaskStatus.ESCALATED, TaskStatus.COMPLETED].includes(task.status)
                  ).map(column => (
                    <option key={column.key} value={column.key}>{column.label}</option>
                  ))}
                </select>

                {isChangingStatus && (
                  <button
                    type="button"
                    onClick={handleStatusSave}
                    disabled={statusMutation.isPending}
                    className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {statusMutation.isPending ? 'Saving…' : 'Save status'}
                  </button>
                )}
              </div>

              {isChangingStatus && (
                <textarea
                  className={`${fieldClass} mt-3 resize-y`}
                  rows={2}
                  placeholder="Add a comment about this status change (optional)…"
                  value={comment}
                  onChange={event => setComment(event.target.value)}
                  aria-label="Status change comment"
                />
              )}

              {statusMutation.isError && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                  {statusMutation.error?.message || 'Could not update task status.'}
                </p>
              )}
            </section>
          )}

          {canLogOutcome && (
            <section className="rounded-2xl border border-slate-200 p-4">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => setShowContactForm(value => !value)}
                aria-expanded={showContactForm}
              >
                <span className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <Phone className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-900">Log contact attempt</span>
                    <span className="mt-0.5 block text-xs text-slate-500">Record channel and outcome</span>
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showContactForm ? 'rotate-180' : ''}`} />
              </button>

              {showContactForm && (
                <form onSubmit={handleContactSubmit} className="mt-4 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Channel</label>
                      <select className={fieldClass} value={contactChannel} onChange={event => setContactChannel(event.target.value)}>
                        <option value="phone_call">Phone call</option>
                        <option value="sms">SMS</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="email">Email</option>
                        <option value="in_app">In-app</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Outcome</label>
                      <select className={fieldClass} value={contactOutcome} onChange={event => setContactOutcome(event.target.value)}>
                        <option value="reached">Reached</option>
                        <option value="no_answer">No answer</option>
                        <option value="invalid_contact">Invalid contact</option>
                        <option value="requested_callback">Requested callback</option>
                        <option value="requested_reschedule">Requested reschedule</option>
                        <option value="cannot_travel">Cannot travel</option>
                        <option value="declined">Declined</option>
                        <option value="visited_elsewhere">Visited elsewhere</option>
                        <option value="caregiver_contacted">Caregiver contacted</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Notes (optional)</label>
                    <textarea
                      className={`${fieldClass} resize-y`}
                      rows={3}
                      placeholder="Add relevant contact notes…"
                      value={contactNotes}
                      onChange={event => setContactNotes(event.target.value)}
                      aria-label="Contact attempt notes"
                    />
                  </div>

                  {task.planId && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <label className="flex items-start gap-2 text-sm font-semibold text-amber-900">
                        <input
                          type="checkbox"
                          checked={closeFollowUp}
                          onChange={event => {
                            setCloseFollowUp(event.target.checked);
                            if (!event.target.checked) setFinalStatus('');
                          }}
                          className="mt-0.5 rounded border-amber-300"
                        />
                        Close this follow-up after recording the contact
                      </label>
                      {closeFollowUp && (
                        <div className="mt-3">
                          <label className={labelClass} htmlFor="final-follow-up-status">Final outcome</label>
                          <select
                            id="final-follow-up-status"
                            className={fieldClass}
                            value={finalStatus}
                            onChange={event => setFinalStatus(event.target.value)}
                            required
                          >
                            <option value="">Select final outcome</option>
                            <option value="attended">Attended</option>
                            <option value="rescheduled">Rescheduled</option>
                            <option value="visited_elsewhere">Visited elsewhere</option>
                            <option value="declined">Declined</option>
                            <option value="unreachable_unresolved">Unreachable — unresolved</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                          <p className="mt-2 text-xs text-amber-800">
                            All checklist items must be completed before the follow-up can be closed.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={contactMutation.isPending || (closeFollowUp && !finalStatus)}
                    className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {contactMutation.isPending ? 'Logging attempt…' : 'Log contact attempt'}
                  </button>

                  {contactMutation.isError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                      {contactMutation.error?.message || 'Could not log contact attempt.'}
                    </p>
                  )}
                </form>
              )}

              {contactLogged && (
                <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800" role="status">
                  {contactLogged}
                </p>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900">Team comment</h3>
            </div>

            <textarea
              className={`${fieldClass} resize-y`}
              rows={3}
              placeholder="Write a note for your team…"
              value={comment}
              onChange={event => setComment(event.target.value)}
              aria-label="Task comment"
            />

            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (comment.trim()) commentMutation.mutate(comment.trim());
                }}
                disabled={!comment.trim() || commentMutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MessageSquarePlus className="h-4 w-4" />
                {commentMutation.isPending ? 'Posting…' : 'Post comment'}
              </button>
            </div>

            {commentMutation.isError && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                {commentMutation.error?.message || 'Could not post comment.'}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">Task history</h3>
              <button
                type="button"
                onClick={() => activityQuery.refetch()}
                className="text-xs font-semibold text-blue-700 hover:text-blue-800"
              >
                Refresh
              </button>
            </div>

            {activityQuery.isLoading && <p className="text-xs text-slate-500">Loading task history…</p>}
            {activityQuery.isError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                {activityQuery.error?.message || 'Could not load task history.'}
              </p>
            )}

            {!activityQuery.isLoading && !activityQuery.isError && (
              <div className="space-y-4">
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contact attempts</h4>
                  {(activityQuery.data?.contactAttempts || []).length === 0 ? (
                    <p className="text-xs text-slate-400">No contact attempts recorded.</p>
                  ) : (
                    <ul className="space-y-2">
                      {activityQuery.data.contactAttempts.map(attempt => (
                        <li key={attempt.id} className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs font-semibold text-slate-800">
                            {String(attempt.outcome || '').replaceAll('_', ' ')} · {String(attempt.channel || '').replaceAll('_', ' ')}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {attempt.staff_name || 'Staff'} · {formatDate(attempt.attempted_at, true) || 'Date unavailable'}
                          </p>
                          {attempt.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{attempt.notes}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Team comments</h4>
                  {(activityQuery.data?.comments || []).length === 0 ? (
                    <p className="text-xs text-slate-400">No comments recorded.</p>
                  ) : (
                    <ul className="space-y-2">
                      {activityQuery.data.comments.map(item => (
                        <li key={item.id} className="rounded-xl bg-slate-50 p-3">
                          <p className="whitespace-pre-wrap text-sm text-slate-700">{item.body}</p>
                          <p className="mt-2 text-xs text-slate-500">
                            {item.author_name || 'Staff'} · {formatDate(item.created_at, true) || 'Date unavailable'}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Assignment history</h4>
                  {(activityQuery.data?.transfers || []).length === 0 ? (
                    <p className="text-xs text-slate-400">No reassignment history.</p>
                  ) : (
                    <ul className="space-y-2">
                      {activityQuery.data.transfers.map(item => (
                        <li key={item.id} className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                          {item.from_user_name || 'Unassigned'} → {item.to_user_name || 'Unknown'}
                          <p className="mt-1 text-slate-500">{formatDate(item.created_at, true) || 'Date unavailable'}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

export default function KanbanBoardPage() {
  const { activeDepartmentId } = useAuth();
  const { data, isLoading, isError, error, refetch } = useTasksBoard({
    departmentId: activeDepartmentId
  });
  const [selectedTask, setSelectedTask] = useState(null);

  if (isLoading) return <LoadingSpinner label="Loading task board…" />;

  if (isError) {
    return (
      <ErrorState
        title="Failed to load tasks"
        message={error?.message}
        onRetry={refetch}
      />
    );
  }

  const board = data?.board || {};
  const totalTasks = COLUMNS.reduce(
    (total, column) => total + (board[column.key] || []).length,
    0
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Work management</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Task Board
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Track coordinator work across each stage of the follow-up workflow.
          </p>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm">
          <ListTodo className="h-4 w-4 text-blue-600" />
          <span className="font-semibold tabular-nums text-slate-900">{totalTasks}</span>
          <span className="text-slate-500">tasks</span>
        </div>
      </header>

      <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <p className="text-xs leading-5 text-amber-900">
          Open a task to update its status, add a team comment, or log a contact attempt.
          Status changes are made through the task details panel.
        </p>
      </div>

      <div
        className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-4"
        role="region"
        aria-label="Kanban task board"
        tabIndex={0}
      >
        {COLUMNS.map(column => (
          <KanbanColumn
            key={column.key}
            column={column}
            tasks={board[column.key] || []}
            onOpenTask={setSelectedTask}
          />
        ))}
      </div>

      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}

/**
 * FollowCare — Kanban Task Board
 * ARCHITECTURE.md Sections 10.3, 8.4
 *
 * Five columns: todo → in_progress → awaiting_response → escalated → completed
 * Data from GET /api/tasks/board
 * Status transitions via PATCH /api/tasks/:id/status
 * Task drawer: comments, contact-attempt logger, assignment
 *
 * No DnD library dependency yet — status transitions via task drawer dropdowns
 * (full drag-and-drop can be added later per ARCHITECTURE.md §10.3).
 */

import React, { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTasksBoard } from '../../api/queries.js';
import { api } from '../../api/client.js';
import { TaskStatus, TaskType, ContactChannel, ContactOutcome, Permissions } from '@followcare/shared';
import { useAuth } from '../../auth/AuthContext.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';
import {
  X,
  ChevronDown,
  UserCheck,
  MessageSquarePlus,
  Phone,
  AlertTriangle,
  Clock,
  MoreVertical
} from 'lucide-react';

// ── Column config ─────────────────────────────────────────────────────────────
const COLUMNS = [
  { key: TaskStatus.TODO, label: 'To Do', color: 'bg-slate-100 text-slate-700' },
  { key: TaskStatus.IN_PROGRESS, label: 'In Progress', color: 'bg-brand-100 text-brand-700' },
  { key: TaskStatus.AWAITING_RESPONSE, label: 'Awaiting Response', color: 'bg-amber-100 text-amber-700' },
  { key: TaskStatus.ESCALATED, label: 'Escalated', color: 'bg-red-100 text-red-700' },
  { key: TaskStatus.COMPLETED, label: 'Completed', color: 'bg-emerald-100 text-emerald-700' }
];

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

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onOpen }) {
  const urgencyDot = URGENCY_DOT[task.urgency] || 'bg-slate-400';

  return (
    <button
      className="w-full text-left bg-white rounded-lg border border-slate-200 shadow-sm p-3 hover:border-brand-300 hover:shadow transition-all"
      onClick={() => onOpen(task)}
      aria-label={`Open task: ${task.title}`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${urgencyDot}`}
          aria-label={`Urgency: ${task.urgency}`}
          title={task.urgency}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{task.patientName}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs text-slate-400">{TASK_TYPE_LABELS[task.type] || task.type}</span>
            {task.priorityScore > 0 && (
              <span className="text-xs font-mono text-slate-400">#{task.priorityScore}</span>
            )}
          </div>
          {task.assigneeName && (
            <p className="text-xs text-brand-600 mt-1 flex items-center gap-1">
              <UserCheck className="w-3 h-3" />
              {task.assigneeName}
            </p>
          )}
          {task.dueAt && (
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(task.dueAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────
function KanbanColumn({ column, tasks, onOpenTask }) {
  return (
    <div className="flex flex-col min-w-[240px] max-w-[280px] flex-shrink-0">
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${column.color}`}>
        <span className="text-xs font-semibold uppercase tracking-wide">{column.label}</span>
        <span className="text-xs font-bold">{tasks.length}</span>
      </div>
      <div className="flex-1 bg-slate-50 rounded-b-lg p-2 space-y-2 min-h-[200px] overflow-y-auto max-h-[calc(100vh-260px)]">
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} onOpen={onOpenTask} />
        ))}
        {tasks.length === 0 && (
          <div className="text-center py-8 text-xs text-slate-400">No tasks</div>
        )}
      </div>
    </div>
  );
}

// ── Task Drawer ───────────────────────────────────────────────────────────────
function TaskDrawer({ task, onClose }) {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canWork = hasPermission(Permissions.TASK_WORK);
  const canLogOutcome = hasPermission(Permissions.TASK_LOG_OUTCOME);

  const [newStatus, setNewStatus] = useState(task.status);
  const [comment, setComment] = useState('');
  const [contactChannel, setContactChannel] = useState('phone_call');
  const [contactOutcome, setContactOutcome] = useState('reached');
  const [contactNotes, setContactNotes] = useState('');
  const [showContactForm, setShowContactForm] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks', 'board'] });
  };

  // Status transition
  const statusMutation = useMutation({
    mutationFn: ({ status, comment }) =>
      api.patch(`/api/tasks/${task.id}/status`, { status, comment: comment || undefined }),
    onSuccess: () => {
      invalidate();
      onClose();
    }
  });

  // Add comment
  const commentMutation = useMutation({
    mutationFn: (body) => api.post(`/api/tasks/${task.id}/comments`, { body }),
    onSuccess: () => { setComment(''); invalidate(); }
  });

  // Log contact attempt
  const contactMutation = useMutation({
    mutationFn: (data) => api.post(`/api/tasks/${task.id}/contact-attempts`, data),
    onSuccess: () => { setContactNotes(''); setShowContactForm(false); invalidate(); }
  });

  const handleStatusSave = () => {
    statusMutation.mutate({ status: newStatus, comment });
  };

  const handleContactSubmit = (e) => {
    e.preventDefault();
    contactMutation.mutate({
      channel: contactChannel,
      outcome: contactOutcome,
      notes: contactNotes || undefined
    });
  };

  const isChangingStatus = newStatus !== task.status;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Task details">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} aria-hidden="true" />

      {/* Drawer */}
      <div className="w-full max-w-md bg-white shadow-xl flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-slate-100">
          <div>
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              {TASK_TYPE_LABELS[task.type] || task.type}
            </span>
            <h2 className="text-base font-semibold text-slate-900 mt-0.5">{task.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Task metadata */}
        <div className="p-4 border-b border-slate-100 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Patient</span>
            <span className="font-medium text-slate-800">{task.patientName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Department</span>
            <span className="text-slate-700">{task.departmentName || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Urgency</span>
            <span className={`font-medium ${task.urgency === 'urgent' ? 'text-red-600' : task.urgency === 'priority' ? 'text-amber-600' : 'text-sky-600'}`}>
              {task.urgency}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Priority score</span>
            <span className="font-mono text-slate-700">{task.priorityScore ?? '—'}</span>
          </div>
          {task.assigneeName && (
            <div className="flex justify-between">
              <span className="text-slate-500">Assignee</span>
              <span className="text-slate-700">{task.assigneeName}</span>
            </div>
          )}
          {task.dueAt && (
            <div className="flex justify-between">
              <span className="text-slate-500">Due</span>
              <span className="text-slate-700">{new Date(task.dueAt).toLocaleString()}</span>
            </div>
          )}
          {/* Priority reasons */}
          {task.priorityReasons && Object.keys(task.priorityReasons).length > 0 && (
            <div>
              <p className="text-slate-500 mb-1">Priority reasons</p>
              <ul className="text-xs text-slate-600 space-y-0.5">
                {Object.entries(task.priorityReasons).map(([k, v]) => (
                  <li key={k} className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    {k}: <span className="font-medium">+{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Actions */}
        {canWork && (
          <div className="p-4 border-b border-slate-100 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Update Status</h3>
            <div className="flex gap-2">
              <select
                className="flex-1 rounded-md border border-slate-300 text-sm px-2 py-1.5 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                value={newStatus}
                onChange={e => setNewStatus(e.target.value)}
                aria-label="Select new task status"
              >
                {COLUMNS.filter(c => c.key !== TaskStatus.COMPLETED || task.status === TaskStatus.COMPLETED).map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              {isChangingStatus && (
                <button
                  onClick={handleStatusSave}
                  disabled={statusMutation.isPending}
                  className="px-3 py-1.5 rounded-md bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {statusMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
            {statusMutation.isError && (
              <p className="text-xs text-red-600">{statusMutation.error.message}</p>
            )}

            {/* Comment with status change */}
            {isChangingStatus && (
              <textarea
                className="w-full rounded-md border border-slate-300 text-sm px-2 py-1.5 resize-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                rows={2}
                placeholder="Add a comment (optional)…"
                value={comment}
                onChange={e => setComment(e.target.value)}
                aria-label="Status change comment"
              />
            )}
          </div>
        )}

        {/* Contact attempt logger */}
        {canLogOutcome && (
          <div className="p-4 border-b border-slate-100">
            <button
              className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-800 transition-colors"
              onClick={() => setShowContactForm(v => !v)}
              aria-expanded={showContactForm}
            >
              <Phone className="w-4 h-4" />
              Log contact attempt
              <ChevronDown className={`w-4 h-4 transition-transform ${showContactForm ? 'rotate-180' : ''}`} />
            </button>

            {showContactForm && (
              <form onSubmit={handleContactSubmit} className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Channel</label>
                    <select
                      className="w-full rounded border border-slate-300 text-xs px-2 py-1.5 focus:ring-1 focus:ring-brand-500"
                      value={contactChannel}
                      onChange={e => setContactChannel(e.target.value)}
                    >
                      <option value="phone_call">Phone call</option>
                      <option value="sms">SMS</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="in_app">In-app</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Outcome</label>
                    <select
                      className="w-full rounded border border-slate-300 text-xs px-2 py-1.5 focus:ring-1 focus:ring-brand-500"
                      value={contactOutcome}
                      onChange={e => setContactOutcome(e.target.value)}
                    >
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
                <textarea
                  className="w-full rounded border border-slate-300 text-xs px-2 py-1.5 resize-none focus:ring-1 focus:ring-brand-500"
                  rows={2}
                  placeholder="Notes (optional)…"
                  value={contactNotes}
                  onChange={e => setContactNotes(e.target.value)}
                  aria-label="Contact attempt notes"
                />
                <button
                  type="submit"
                  disabled={contactMutation.isPending}
                  className="w-full py-1.5 rounded bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {contactMutation.isPending ? 'Logging…' : 'Log attempt'}
                </button>
                {contactMutation.isError && (
                  <p className="text-xs text-red-600">{contactMutation.error.message}</p>
                )}
              </form>
            )}
          </div>
        )}

        {/* Add standalone comment */}
        <div className="p-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Add Comment</h3>
          <div className="flex gap-2">
            <textarea
              className="flex-1 rounded-md border border-slate-300 text-sm px-2 py-1.5 resize-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              rows={2}
              placeholder="Write a note for your team…"
              value={comment}
              onChange={e => setComment(e.target.value)}
              aria-label="Task comment"
            />
            <button
              onClick={() => {
                if (comment.trim()) commentMutation.mutate(comment.trim());
              }}
              disabled={!comment.trim() || commentMutation.isPending}
              className="self-end px-3 py-1.5 rounded-md bg-slate-700 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50 transition-colors"
            >
              <MessageSquarePlus className="w-4 h-4" />
            </button>
          </div>
          {commentMutation.isError && (
            <p className="text-xs text-red-600 mt-1">{commentMutation.error.message}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Kanban Board Page ─────────────────────────────────────────────────────────
export default function KanbanBoardPage() {
  const { activeDepartmentId } = useAuth();
  const { data, isLoading, isError, error, refetch } = useTasksBoard({
    departmentId: activeDepartmentId
  });
  const [selectedTask, setSelectedTask] = useState(null);

  if (isLoading) return <LoadingSpinner label="Loading task board…" />;
  if (isError) return <ErrorState title="Failed to load tasks" message={error?.message} onRetry={refetch} />;

  const board = data?.board || {};

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Task Board</h1>
          <p className="text-sm text-slate-500 mt-0.5">Coordinator workflow — drag tasks between columns</p>
        </div>
      </div>

      {/* Horizontal scroll for kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4 flex-1" role="region" aria-label="Kanban task board">
        {COLUMNS.map(col => (
          <KanbanColumn
            key={col.key}
            column={col}
            tasks={board[col.key] || []}
            onOpenTask={setSelectedTask}
          />
        ))}
      </div>

      {selectedTask && (
        <TaskDrawer task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
}

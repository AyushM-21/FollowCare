/**
 * FollowCare — Patient Help / Barrier Assistance Page
 * POST /api/me/barriers (report barrier)
 * POST /api/me/requests (reschedule or callback request)
 * ARCHITECTURE.md Sections 8.5, 9.8, 10.3
 *
 * Plain-language barrier choices. Never labels patients as non-compliant.
 */

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePatientFollowUps } from '../../api/queries.js';
import { api } from '../../api/client.js';
import { BarrierType } from '@followcare/shared';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { CheckCircle2, HelpCircle } from 'lucide-react';

const BARRIER_OPTIONS = [
  { value: BarrierType.TRAVEL, label: 'I have trouble getting to the hospital', emoji: '🚌' },
  { value: BarrierType.COST, label: 'I\'m worried about cost', emoji: '💸' },
  { value: BarrierType.WORK_SCHEDULE, label: 'I can\'t take time off work', emoji: '🏢' },
  { value: BarrierType.CAREGIVER_UNAVAILABLE, label: 'I don\'t have someone to come with me', emoji: '👥' },
  { value: BarrierType.HEALTH_CONCERN, label: 'I\'m not feeling well enough to travel', emoji: '🤒' },
  { value: BarrierType.LANGUAGE, label: 'I need language support', emoji: '🗣️' },
  { value: BarrierType.CONTACT_ISSUE, label: 'I have a new contact number', emoji: '📞' },
  { value: BarrierType.OTHER, label: 'Something else', emoji: '❓' }
];

function SuccessMessage({ onReset }) {
  return (
    <div className="text-center py-10">
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-9 h-9 text-emerald-600" />
      </div>
      <h2 className="text-lg font-bold text-slate-900">Request received</h2>
      <p className="text-sm text-slate-600 mt-2 max-w-sm mx-auto">
        Thank you for reaching out. Your care team will contact you within 1–2 working days to help resolve this.
      </p>
      <button
        onClick={onReset}
        className="mt-6 px-5 py-2.5 rounded-lg bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-colors"
      >
        Back to home
      </button>
    </div>
  );
}

export default function PatientHelpPage() {
  const queryClient = useQueryClient();
  const { data: followUpsData, isLoading } = usePatientFollowUps();
  const followUps = followUpsData?.followUps?.filter(f => f.status === 'active') || [];

  const [step, setStep] = useState('choose'); // 'choose' | 'detail' | 'success'
  const [selectedBarrier, setSelectedBarrier] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [note, setNote] = useState('');
  const [requestCallback, setRequestCallback] = useState(true);
  const [error, setError] = useState('');

  const barrierMutation = useMutation({
    mutationFn: (payload) => api.post('/api/me/barriers', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'follow-ups'] });
      setStep('success');
    },
    onError: (err) => setError(err.message || 'Something went wrong. Please try again.')
  });

  const handleBarrierSelect = (value) => {
    setSelectedBarrier(value);
    setStep('detail');
    // Auto-select first active plan if only one
    if (followUps.length === 1) setSelectedPlanId(followUps[0].id);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!selectedPlanId) {
      setError('Please select which follow-up this is about.');
      return;
    }

    barrierMutation.mutate({
      plan_id: selectedPlanId,
      barrier_type: selectedBarrier,
      note: note.trim() || undefined,
      requested_callback: requestCallback
    });
  };

  if (isLoading) return <LoadingSpinner label="Loading…" />;

  if (step === 'success') {
    return (
      <div className="p-4">
        <SuccessMessage onReset={() => { setStep('choose'); setSelectedBarrier(''); setNote(''); }} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Get Help</h1>
        <p className="text-sm text-slate-500 mt-1">
          We're here to support you. Tell us what's making it difficult and we'll find a way to help.
        </p>
      </div>

      {step === 'choose' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">What's making it hard to come in?</p>
          {BARRIER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleBarrierSelect(opt.value)}
              className="w-full text-left flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors min-h-[60px]"
            >
              <span className="text-2xl flex-shrink-0" aria-hidden="true">{opt.emoji}</span>
              <span className="text-sm font-medium text-slate-800">{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'detail' && (
        <div>
          <button
            onClick={() => setStep('choose')}
            className="text-sm text-brand-600 hover:underline mb-4"
          >
            ← Change my answer
          </button>

          <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mb-5">
            <p className="text-sm font-semibold text-brand-800">
              {BARRIER_OPTIONS.find(o => o.value === selectedBarrier)?.emoji}{' '}
              {BARRIER_OPTIONS.find(o => o.value === selectedBarrier)?.label}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Plan selector */}
            {followUps.length > 1 && (
              <div>
                <label htmlFor="plan_select" className="block text-sm font-medium text-slate-700 mb-1">
                  Which follow-up is this about?
                </label>
                <select
                  id="plan_select"
                  className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm focus:ring-2 focus:ring-brand-500"
                  value={selectedPlanId}
                  onChange={e => setSelectedPlanId(e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {followUps.map(f => (
                    <option key={f.id} value={f.id}>{f.reason_category}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Note */}
            <div>
              <label htmlFor="help_note" className="block text-sm font-medium text-slate-700 mb-1">
                Any other details? <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="help_note"
                className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm resize-none focus:ring-2 focus:ring-brand-500"
                rows={3}
                placeholder="Tell us anything that would help us support you…"
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={500}
              />
            </div>

            {/* Callback preference */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-5 h-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={requestCallback}
                onChange={e => setRequestCallback(e.target.checked)}
              />
              <span className="text-sm text-slate-700">Please have someone from my care team call me</span>
            </label>

            <button
              type="submit"
              disabled={barrierMutation.isPending}
              className="w-full py-3.5 rounded-xl bg-brand-600 text-white font-semibold text-base hover:bg-brand-700 disabled:opacity-50 transition-colors"
              aria-busy={barrierMutation.isPending}
            >
              {barrierMutation.isPending ? 'Sending…' : 'Send my request'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

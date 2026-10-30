
/**
 * FollowCare — Patient Help / Barrier Assistance Page
 * Preserves the existing barrier-reporting API and workflow.
 */

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePatientFollowUps } from '../../api/queries.js';
import { api } from '../../api/client.js';
import { BarrierType } from '@followcare/shared';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  HeartHandshake,
  Phone,
  Send,
  ShieldCheck,
} from 'lucide-react';

const BARRIER_OPTIONS = [
  { value: BarrierType.TRAVEL, label: 'Getting to the hospital', description: 'Travel or transport is difficult', emoji: '🚌' },
  { value: BarrierType.COST, label: 'Cost concerns', description: 'I am worried about the cost of care', emoji: '💸' },
  { value: BarrierType.WORK_SCHEDULE, label: 'Work or schedule conflict', description: 'I cannot take time off work', emoji: '🏢' },
  { value: BarrierType.CAREGIVER_UNAVAILABLE, label: 'Need someone to accompany me', description: 'I do not have someone available to come with me', emoji: '👥' },
  { value: BarrierType.HEALTH_CONCERN, label: 'Not feeling well enough to travel', description: 'My health makes travelling difficult', emoji: '🤒' },
  { value: BarrierType.LANGUAGE, label: 'Language support', description: 'I would like help communicating', emoji: '🗣️' },
  { value: BarrierType.CONTACT_ISSUE, label: 'Contact information changed', description: 'I have a new phone number or contact detail', emoji: '📞' },
  { value: BarrierType.OTHER, label: 'Something else', description: 'I have another concern to share', emoji: '💬' },
];

function SuccessMessage({ onReset }) {
  return (
    <section className="fc-panel mx-auto max-w-xl px-6 py-12 text-center sm:px-10">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
        <CheckCircle2 className="h-9 w-9 text-emerald-600" />
      </div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
        Request submitted
      </p>
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">
        Thank you for letting us know
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
        Your care team has received your request. The expected response time is
        1–2 working days.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-7 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        Back to help options
        <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}

export default function PatientHelpPage() {
  const queryClient = useQueryClient();
  const { data: followUpsData, isLoading } = usePatientFollowUps();
  const followUps = followUpsData?.followUps?.filter((f) => f.status === 'active') || [];

  const [step, setStep] = useState('choose');
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
    onError: (err) => setError(err.message || 'Something went wrong. Please try again.'),
  });

  const handleBarrierSelect = (value) => {
    setSelectedBarrier(value);
    setError('');
    setStep('detail');

    if (followUps.length === 1) {
      setSelectedPlanId(followUps[0].id);
    }
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
      requested_callback: requestCallback,
    });
  };

  const resetForm = () => {
    setStep('choose');
    setSelectedBarrier('');
    setSelectedPlanId('');
    setNote('');
    setRequestCallback(true);
    setError('');
  };

  if (isLoading) return <LoadingSpinner label="Loading help options…" />;

  if (step === 'success') {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <SuccessMessage onReset={resetForm} />
      </div>
    );
  }

  const selectedOption = BARRIER_OPTIONS.find((option) => option.value === selectedBarrier);

  return (
    <div className="mx-auto max-w-5xl space-y-7 p-4 sm:p-6 lg:p-8">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
          <HeartHandshake className="h-4 w-4" />
          Patient support
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Get help with your care
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
            Let your care team know what is making your follow-up difficult.
            We will work with you to find a way forward.
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="fc-panel flex items-start gap-3 p-4">
          <div className="rounded-xl bg-blue-50 p-2.5">
            <HeartHandshake className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Support without judgement</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Your concerns help us support you.</p>
          </div>
        </div>
        <div className="fc-panel flex items-start gap-3 p-4">
          <div className="rounded-xl bg-violet-50 p-2.5">
            <Phone className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Choose a callback</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Tell us if you would like a call.</p>
          </div>
        </div>
        <div className="fc-panel flex items-start gap-3 p-4">
          <div className="rounded-xl bg-emerald-50 p-2.5">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">A simple request</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Only share details needed to help.</p>
          </div>
        </div>
      </div>

      <section className="fc-panel overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Help request
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                {step === 'choose' ? 'What do you need help with?' : 'Tell us a little more'}
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              Step {step === 'choose' ? '1' : '2'} of 2
            </span>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full bg-blue-600 transition-all ${step === 'choose' ? 'w-1/2' : 'w-full'}`}
            />
          </div>
        </div>

        <div className="p-5 sm:p-7">
          {step === 'choose' && (
            <div>
              <p className="mb-5 text-sm text-slate-500">
                Select the option that best describes your situation.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {BARRIER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleBarrierSelect(option.value)}
                    className="group flex min-h-24 items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/50 focus-visible:outline-blue-500"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-2xl transition group-hover:bg-blue-100">
                      {option.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        {option.description}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'detail' && (
            <div>
              <button
                type="button"
                onClick={() => {
                  setStep('choose');
                  setError('');
                }}
                className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Change my answer
              </button>

              <div className="mb-6 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                <span className="text-2xl">{selectedOption?.emoji}</span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    Selected concern
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-blue-950">
                    {selectedOption?.label}
                  </p>
                </div>
              </div>

              {error && (
                <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {followUps.length > 1 && (
                  <div>
                    <label htmlFor="plan_select" className="mb-2 block text-sm font-semibold text-slate-800">
                      Which follow-up is this about?
                    </label>
                    <select
                      id="plan_select"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      value={selectedPlanId}
                      onChange={(e) => setSelectedPlanId(e.target.value)}
                      required
                    >
                      <option value="">Select a follow-up</option>
                      {followUps.map((followUp) => (
                        <option key={followUp.id} value={followUp.id}>
                          {followUp.reason_category}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label htmlFor="help_note" className="mb-2 block text-sm font-semibold text-slate-800">
                    Anything else we should know?
                    <span className="ml-2 font-normal text-slate-400">Optional</span>
                  </label>
                  <textarea
                    id="help_note"
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    rows={4}
                    placeholder="Share any details that could help your care team support you…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                  />
                  <p className="mt-1 text-right text-xs text-slate-400">{note.length}/500</p>
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={requestCallback}
                    onChange={(e) => setRequestCallback(e.target.checked)}
                  />
                  <span>
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <Phone className="h-4 w-4 text-slate-500" />
                      Please have someone from my care team call me
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      You can leave this unchecked if you prefer another way to be contacted.
                    </span>
                  </span>
                </label>

                <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                  Your care team is expected to respond within 1–2 working days.
                </div>

                <button
                  type="submit"
                  disabled={barrierMutation.isPending}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-busy={barrierMutation.isPending}
                >
                  <Send className="h-4 w-4" />
                  {barrierMutation.isPending ? 'Sending request…' : 'Send my request'}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

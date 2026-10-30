import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { api } from '../../api/client.js';

export default function PatientLoginPage() {
  const { patientLogin } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [debugCode, setDebugCode] = useState('');

  const handlePhoneSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await api.post('/api/patient-auth/otp/request', {
        phone: phone.trim(),
      });
      setDebugCode(res?.debugCode || '');
      setStep('code');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await patientLogin(phone.trim(), code.trim());
      navigate('/portal/home', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid or expired code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const changeNumber = () => {
    setStep('phone');
    setError('');
    setCode('');
    setDebugCode('');
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link to="/portal/login" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
              <span className="text-lg font-bold text-white">F</span>
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight text-slate-900">FollowCare</p>
              <p className="text-xs text-slate-500">Patient portal</p>
            </div>
          </Link>
          <span className="hidden rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 sm:inline-flex">
            Patient access
          </span>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                className="h-7 w-7"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5 6v5c0 4.5 2.9 8.1 7 10 4.1-1.9 7-5.5 7-10V6l-7-3Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M12 9v6" />
              </svg>
            </div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-blue-600">
              Patient portal
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {step === 'phone' ? 'Welcome to FollowCare' : 'Verify your number'}
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-500">
              {step === 'phone'
                ? 'Sign in securely using the mobile number registered with your care team.'
                : 'Enter the verification code to continue to your patient portal.'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-7">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                <span className={step === 'phone' ? 'text-blue-700' : 'text-slate-400'}>
                  1. Mobile number
                </span>
                <span className={step === 'code' ? 'text-blue-700' : 'text-slate-400'}>
                  2. Verification
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-blue-600 transition-all duration-300 ${
                    step === 'code' ? 'w-full' : 'w-1/2'
                  }`}
                />
              </div>
            </div>

            {error && (
              <div
                className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                role="alert"
                aria-live="assertive"
              >
                <span className="font-bold" aria-hidden="true">!</span>
                <p>{error}</p>
              </div>
            )}

            {step === 'phone' ? (
              <form onSubmit={handlePhoneSubmit} noValidate>
                <div className="mb-6">
                  <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-slate-700">
                    Registered mobile number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    disabled={submitting}
                    aria-required="true"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-50 disabled:opacity-60"
                  />
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    Use the number associated with your hospital registration.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !phone.trim()}
                  aria-busy={submitting}
                  className="w-full rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Sending code...' : 'Send verification code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleCodeSubmit} noValidate>
                <div className="mb-6">
                  <label htmlFor="otp" className="mb-2 block text-sm font-semibold text-slate-700">
                    Six-digit verification code
                  </label>
                  <p className="mb-4 text-sm text-slate-500">
                    If your number is registered, a code was sent to{' '}
                    <strong className="font-semibold text-slate-700">{phone}</strong>.
                  </p>
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    disabled={submitting}
                    aria-required="true"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-center font-mono text-3xl font-semibold tracking-[0.5em] text-slate-900 placeholder:text-slate-300 placeholder:tracking-[0.5em] transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-50 disabled:opacity-60"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Enter all six digits to continue.
                  </p>
                </div>

                {debugCode && (
                  <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="note">
                    <p className="font-semibold">Development test mode</p>
                    <p className="mt-1">
                      Mock SMS code: <strong className="font-mono">{debugCode}</strong>
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || code.length !== 6}
                  aria-busy={submitting}
                  className="w-full rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Verifying...' : 'Verify and continue'}
                </button>

                <button
                  type="button"
                  onClick={changeNumber}
                  disabled={submitting}
                  className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50"
                >
                  ← Use a different number
                </button>
              </form>
            )}

            <div className="mt-7 border-t border-slate-100 pt-5">
              <p className="text-center text-xs leading-relaxed text-slate-500">
                Your sign-in session is managed securely by FollowCare.
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            Hospital staff?
            {' '}
            <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700 hover:underline">
              Sign in to the staff portal
            </Link>
          </p>

          <p className="mt-8 text-center text-xs text-slate-400">
            FollowCare · Hospital Follow-up Management
          </p>
        </div>
      </section>
    </main>
  );
}

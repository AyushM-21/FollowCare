/**
 * FollowCare — Patient OTP Login Page
 * ARCHITECTURE.md Sections 10.1, 9.8
 *
 * Two-step flow:
 *   Step 1: Enter phone → POST /api/patient-auth/otp/request → get code
 *   Step 2: Enter code → POST /api/patient-auth/otp/verify → session cookie set
 *
 * Anti-enumeration: backend always returns 200 to OTP request regardless of
 * whether the phone is registered. We display the same generic message.
 * Nothing is stored in localStorage.
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { api } from '../../api/client.js';

export default function PatientLoginPage() {
  const { patientLogin } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [debugCode, setDebugCode] = useState('');

  const handlePhoneSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await api.post('/api/patient-auth/otp/request', { phone: phone.trim() });
      setDebugCode(res?.debugCode || ''); // only present outside production (mock SMS)
      setOtpSent(true);
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

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-xl">FC</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">FollowCare</h1>
          <p className="text-sm text-slate-500 mt-1">Patient Portal</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          {step === 'phone' ? (
            <>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Sign in with your mobile number</h2>
              <p className="text-sm text-slate-500 mb-5">
                We'll send a one-time verification code to your registered mobile number.
              </p>

              {error && (
                <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={handlePhoneSubmit} noValidate>
                <div className="mb-4">
                  <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">
                    Mobile number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-60"
                    placeholder="+91 98765 43210"
                    disabled={submitting}
                    aria-required="true"
                    inputMode="tel"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || !phone}
                  className="w-full py-3 px-4 rounded-md bg-brand-600 text-white text-base font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                  aria-busy={submitting}
                >
                  {submitting ? 'Sending code…' : 'Send verification code'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Enter verification code</h2>
              <p className="text-sm text-slate-500 mb-5">
                If your number is registered, a code was sent to <strong>{phone}</strong>.
              </p>

              {error && (
                <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
                  {error}
                </div>
              )}

              {debugCode && (
                <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800" role="note">
                  Test mode (mock SMS): your code is <strong className="font-mono">{debugCode}</strong>
                </div>
              )}

              <form onSubmit={handleCodeSubmit} noValidate>
                <div className="mb-4">
                  <label htmlFor="otp" className="block text-sm font-medium text-slate-700 mb-1">
                    6-digit code
                  </label>
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-md border border-slate-300 px-3 py-3 text-2xl font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-60"
                    placeholder="······"
                    disabled={submitting}
                    aria-required="true"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || code.length !== 6}
                  className="w-full py-3 px-4 rounded-md bg-brand-600 text-white text-base font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 mb-3"
                  aria-busy={submitting}
                >
                  {submitting ? 'Verifying…' : 'Verify and continue'}
                </button>
                <button
                  type="button"
                  className="w-full py-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
                  onClick={() => { setStep('phone'); setError(''); setCode(''); }}
                  disabled={submitting}
                >
                  ← Use a different number
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 mt-4">
          Staff member?{' '}
          <Link to="/login" className="text-brand-600 hover:underline font-medium">
            Sign in to the staff portal
          </Link>
        </p>
      </div>
    </div>
  );
}

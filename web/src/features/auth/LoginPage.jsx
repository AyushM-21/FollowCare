/**
 * FollowCare — Staff Login Page
 * ARCHITECTURE.md Section 10.1
 *
 * Uses POST /api/auth/login with { email, password }.
 * Cookie session is set by the server — nothing stored in localStorage.
 * On success, navigates to the originally requested route (or /staff/overview).
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';

export default function LoginPage() {
  const { login, isAuthenticated, isStaff, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/staff/overview';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Redirect already-authenticated staff
  useEffect(() => {
    if (!isLoading && isAuthenticated && isStaff) {
      navigate(from, { replace: true });
    }
  }, [isLoading, isAuthenticated, isStaff, navigate, from]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      // Surface only the safe message — never expose stack traces
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner label="Loading FollowCare..." />;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-xl">FC</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">FollowCare</h1>
          <p className="text-sm text-slate-500 mt-1">Hospital Follow-up Management</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-5">Staff Sign In</h2>

          {error && (
            <div
              className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-60"
                  placeholder="staff@hospital.org"
                  disabled={submitting}
                  aria-required="true"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-60"
                  disabled={submitting}
                  aria-required="true"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !email || !password}
                className="w-full py-2.5 px-4 rounded-md bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                aria-busy={submitting}
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>

        {/* Patient portal link */}
        <p className="text-center text-xs text-slate-500 mt-4">
          Patient?{' '}
          <Link to="/portal/login" className="text-brand-600 hover:underline font-medium">
            Sign in to the patient portal
          </Link>
        </p>
      </div>
    </div>
  );
}

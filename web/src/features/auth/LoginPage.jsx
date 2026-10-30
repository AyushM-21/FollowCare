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
  const [showPassword, setShowPassword] = useState(false);

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
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner label="Loading FollowCare..." />;
  }

  return (
    <main className="min-h-screen bg-slate-50 flex">
      {/* Brand panel */}
      <section className="hidden lg:flex lg:w-[48%] xl:w-1/2 bg-[#101b32] text-white relative overflow-hidden flex-col justify-between p-12 xl:p-16">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full border border-white/10" />
        <div className="absolute -bottom-40 -left-24 w-[30rem] h-[30rem] rounded-full border border-white/10" />
        <div className="absolute top-1/2 right-0 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-950/30">
            <span className="text-white text-xl font-bold">F</span>
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight">FollowCare</p>
            <p className="text-xs text-slate-400">Care coordination platform</p>
          </div>
        </div>

        <div className="relative z-10 max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs font-medium text-blue-200 mb-7">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            Hospital follow-up management
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight">
            Better coordination.
            <span className="block text-blue-400">More connected care.</span>
          </h1>

          <p className="mt-6 text-base xl:text-lg leading-relaxed text-slate-300 max-w-md">
            Bring follow-up plans, appointments, and care coordination tasks
            together in one organized workspace.
          </p>

          <div className="mt-12 space-y-5">
            {[
              ['01', 'Organized follow-ups', 'Keep track of upcoming and overdue tasks.'],
              ['02', 'Coordinated teams', 'Give staff a shared view of their workload.'],
              ['03', 'Clear priorities', 'Make administrative work easier to manage.'],
            ].map(([number, title, description]) => (
              <div key={number} className="flex items-start gap-4">
                <span className="text-xs font-semibold text-blue-400 pt-1">{number}</span>
                <div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="text-sm text-slate-400 mt-1">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-500">
          FollowCare · Care coordination workspace
        </p>
      </section>

      {/* Login panel */}
      <section className="flex-1 flex flex-col justify-center items-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-12">
            <div className="h-11 w-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
              <span className="text-white text-xl font-bold">F</span>
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight text-slate-900">FollowCare</p>
              <p className="text-xs text-slate-500">Care coordination platform</p>
            </div>
          </div>

          <div className="mb-8">
            <p className="text-sm font-semibold text-blue-600 mb-3">STAFF WORKSPACE</p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to access your care coordination workspace.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8">
            {error && (
              <div
                className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                role="alert"
                aria-live="assertive"
              >
                <span className="font-bold" aria-hidden="true">!</span>
                <p>{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@hospital.org"
                    disabled={submitting}
                    aria-required="true"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                      Password
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      disabled={submitting}
                      aria-required="true"
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-16 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-50 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(value => !value)}
                      disabled={submitting}
                      className="absolute inset-y-0 right-0 px-4 text-xs font-semibold text-slate-500 hover:text-blue-600 disabled:opacity-50"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !email.trim() || !password}
                  aria-busy={submitting}
                  className="w-full rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Signing in...' : 'Sign in to FollowCare'}
                </button>
              </div>
            </form>

            <div className="mt-7 border-t border-slate-100 pt-6">
              <p className="text-center text-sm text-slate-500">
                Access is intended for authorized hospital staff.
              </p>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              Patient?
              {' '}
              <Link
                to="/portal/login"
                className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                Go to the patient portal
              </Link>
            </p>
          </div>

          <p className="mt-10 text-center text-xs text-slate-400">
            FollowCare · Hospital Follow-up Management
          </p>
        </div>
      </section>
    </main>
  );
}

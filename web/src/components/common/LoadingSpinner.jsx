import React from 'react';

export function LoadingSpinner({ label = 'Loading FollowCare...' }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 min-h-[300px]" role="status" aria-live="polite">
      <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
      <p className="mt-4 text-sm font-medium text-slate-600">{label}</p>
      <span className="sr-only">{label}</span>
    </div>
  );
}

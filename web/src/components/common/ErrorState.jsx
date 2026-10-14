import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div className="rounded-lg bg-red-50 p-6 border border-red-200 text-center my-4" role="alert">
      <div className="flex justify-center mb-3">
        <AlertCircle className="w-8 h-8 text-red-600" />
      </div>
      <h3 className="text-base font-semibold text-red-800">{title}</h3>
      {message && <p className="mt-1 text-sm text-red-700">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded bg-white text-red-700 border border-red-300 hover:bg-red-50 shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}

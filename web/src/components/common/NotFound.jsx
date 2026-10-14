import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion, Home } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mb-4 border border-slate-200">
        <FileQuestion className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold text-slate-800">Page Not Found</h2>
      <p className="mt-2 text-sm text-slate-600 max-w-sm">
        The requested clinical or operational screen does not exist or may have been moved.
      </p>
      <Link
        to="/staff/overview"
        className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700 transition"
      >
        <Home className="w-4 h-4" />
        Return to Home
      </Link>
    </div>
  );
}

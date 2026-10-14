import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export function Forbidden({ 
  title = 'Access Restricted', 
  message = 'You do not have the required permissions or department credentials to view this clinical resource.' 
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center min-h-[400px]">
      <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-4 border border-amber-200">
        <ShieldAlert className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold text-slate-800">{title}</h2>
      <p className="mt-2 text-sm text-slate-600 max-w-md">{message}</p>
      <div className="mt-6 flex gap-3">
        <Link
          to="/staff/overview"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Command Center
        </Link>
      </div>
    </div>
  );
}

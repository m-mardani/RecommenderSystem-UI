'use client';

import { translations } from '@/lib/utils/translations';

export const LoadingSpinner = ({ message }: { message?: string }) => {
  return (
    <div className="app-card flex min-h-[220px] flex-col items-center justify-center px-6 py-10 text-center">
      <div className="h-14 w-14 animate-spin rounded-full border-[3px] border-sky-200 border-t-sky-500"></div>
      <p className="mt-5 text-sm font-medium text-slate-600">
        {message || translations.common.loading}
      </p>
    </div>
  );
};

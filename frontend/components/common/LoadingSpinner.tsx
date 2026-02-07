'use client';

import { translations } from '@/lib/utils/translations';

export const LoadingSpinner = ({ message }: { message?: string }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      {message && <p className="mt-4 text-gray-600">{message}</p>}
      {!message && <p className="mt-4 text-gray-600">{translations.common.loading}</p>}
    </div>
  );
};

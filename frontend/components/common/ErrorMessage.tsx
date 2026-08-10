'use client';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorMessage = ({ message, onRetry }: ErrorMessageProps) => {
  return (
    <div className="flex min-h-[220px] items-center justify-center">
      <div className="app-card max-w-xl px-6 py-7">
        <div className="mb-4 flex items-center">
          <svg
            className="ml-2 h-6 w-6 text-rose-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-lg font-semibold text-slate-900">خطا</h3>
        </div>
        <p className="mb-4 text-sm leading-7 text-slate-600">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="app-btn app-btn-danger w-full"
          >
            تلاش مجدد
          </button>
        )}
      </div>
    </div>
  );
};

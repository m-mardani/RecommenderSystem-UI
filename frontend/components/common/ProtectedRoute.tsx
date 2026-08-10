'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSpinner } from './LoadingSpinner';
import { translations } from '@/lib/utils/translations';

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
}

export const ProtectedRoute = ({ children, adminOnly = false }: ProtectedRouteProps) => {
  const { loading, isAuthenticated, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        router.push('/login');
      }
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return <LoadingSpinner message="در حال بررسی احراز هویت..." />;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (adminOnly && !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="app-card max-w-xl px-8 py-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-700/70">403</p>
          <h1 className="mt-3 text-3xl font-black text-slate-900">دسترسی محدود</h1>
          <p className="mt-4 text-sm leading-7 text-slate-600">{translations.errors.forbidden}</p>
          <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-xs text-sky-700">
            این بخش فقط برای کاربران دارای نقش مدیر قابل استفاده است.
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

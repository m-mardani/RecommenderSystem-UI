'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSpinner } from './LoadingSpinner';
import { translations } from '@/lib/utils/translations';

export const AdminOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { loading, isAuthenticated, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) router.push('/login');
  }, [loading, isAuthenticated, router]);

  if (loading) return <LoadingSpinner message="در حال بررسی دسترسی..." />;
  if (!isAuthenticated) return null;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-xl mx-auto bg-white border border-gray-200 rounded-lg shadow-md p-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">403</h1>
            <p className="text-gray-700">{translations.errors.forbidden}</p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

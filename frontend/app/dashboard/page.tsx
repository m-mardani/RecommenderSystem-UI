'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/common/AppShell';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { translations } from '@/lib/utils/translations';
import { datasetApi, trainingApi, modelApi } from '@/lib/api';

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const [stats, setStats] = useState({
    totalDatasets: 0,
    totalModels: 0,
    activeJobs: 0,
    completedJobs: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const [datasets, jobs, models] = await Promise.all([
        isAdmin ? datasetApi.getAll() : Promise.resolve([]),
        isAdmin ? trainingApi.getJobs() : Promise.resolve([]),
        modelApi.getAll(isAdmin ? 'admin' : 'available'),
      ]);

      setStats({
        totalDatasets: datasets.length,
        totalModels: models.length,
        activeJobs: jobs.filter((j) => j.status === 'running' || j.status === 'pending').length,
        completedJobs: jobs.filter((j) => j.status === 'completed').length,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  return (
    <ProtectedRoute>
      <AppShell
        title={translations.nav.dashboard}
        description={
          isAdmin ? 'نمای کلی عملیات، داده‌ها، آموزش‌ها و سلامت سامانه.' : 'دسترسی سریع به مدل‌های آماده و دریافت توصیه.'
        }
      >
        <div className="mb-6 app-card bg-gradient-to-l from-sky-500/12 via-white/80 to-violet-500/8 px-6 py-6">
          <h2 className="text-2xl font-black text-slate-900">
            {translations.dashboard.welcome}، {user?.username}!
          </h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            {isAdmin ? 'مدیریت سیستم توصیه‌گر هوشمند' : 'دسترسی به مدل‌های آماده و دریافت توصیه'}
          </p>
        </div>

        <div className="space-y-6">
          {loading ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="app-card p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="mb-1 text-sm text-slate-500">{translations.dashboard.totalDatasets}</p>
                      <p className="text-3xl font-black text-sky-600">{stats.totalDatasets}</p>
                    </div>
                    <div className="rounded-2xl bg-sky-100 p-3">
                      <svg className="h-8 w-8 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="app-card p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="mb-1 text-sm text-slate-500">{translations.dashboard.totalModels}</p>
                      <p className="text-3xl font-black text-emerald-600">{stats.totalModels}</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-100 p-3">
                      <svg className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="app-card p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="mb-1 text-sm text-slate-500">{translations.dashboard.activeJobs}</p>
                      <p className="text-3xl font-black text-amber-500">{stats.activeJobs}</p>
                    </div>
                    <div className="rounded-2xl bg-amber-100 p-3">
                      <svg className="h-8 w-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="app-card p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="mb-1 text-sm text-slate-500">{translations.dashboard.completedJobs}</p>
                      <p className="text-3xl font-black text-violet-600">{stats.completedJobs}</p>
                    </div>
                    <div className="rounded-2xl bg-violet-100 p-3">
                      <svg className="h-8 w-8 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              <div className="app-card p-6">
                <h2 className="mb-4 text-xl font-black text-slate-900">{translations.dashboard.quickActions}</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {isAdmin && (
                    <Link
                      href="/datasets"
                      className="app-panel flex items-center border border-sky-100 p-4 transition hover:-translate-y-0.5 hover:bg-sky-50/80"
                    >
                      <svg className="ml-3 h-10 w-10 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="font-semibold text-slate-700">{translations.dashboard.uploadDataset}</span>
                    </Link>
                  )}

                  {isAdmin && (
                    <Link
                      href="/training"
                      className="app-panel flex items-center border border-emerald-100 p-4 transition hover:-translate-y-0.5 hover:bg-emerald-50/80"
                    >
                      <svg className="ml-3 h-10 w-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                      </svg>
                      <span className="font-semibold text-slate-700">{translations.dashboard.startTraining}</span>
                    </Link>
                  )}

                  <Link
                    href="/models"
                    className="app-panel flex items-center border border-violet-100 p-4 transition hover:-translate-y-0.5 hover:bg-violet-50/80"
                  >
                    <svg className="ml-3 h-10 w-10 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span className="font-semibold text-slate-700">{translations.dashboard.viewModels}</span>
                  </Link>

                  <Link
                    href="/recommendations"
                    className="app-panel flex items-center border border-amber-100 p-4 transition hover:-translate-y-0.5 hover:bg-amber-50/80"
                  >
                    <svg className="ml-3 h-10 w-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                    <span className="font-semibold text-slate-700">{translations.dashboard.getRecommendations}</span>
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}

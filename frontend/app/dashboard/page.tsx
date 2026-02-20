'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Navbar } from '@/components/common/Navbar';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { translations } from '@/lib/utils/translations';
import { datasetApi, trainingApi, modelApi } from '@/lib/api';
import { getAccessToken } from '@/lib/api/client';
import { TrainingJobState } from '@/types';

const POLL_MS = 5000;

const decodeTokenSubject = (): string => {
  if (typeof window === 'undefined') return 'anonymous';
  const token = getAccessToken();
  if (!token) return 'anonymous';

  try {
    const parts = token.split('.');
    if (parts.length < 2) return 'anonymous';
    const payloadRaw = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadRaw + '='.repeat((4 - (payloadRaw.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    const subject = payload.sub;
    if (typeof subject === 'string' && subject.trim()) return subject.trim();
  } catch {
    // ignore
  }

  return 'anonymous';
};

const getTrainingStorageKey = (): string => `training:lastJobId:${decodeTokenSubject()}`;

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalDatasets: 0,
    totalModels: 0,
    activeJobs: 0,
    completedJobs: 0,
  });
  const [loading, setLoading] = useState(true);
  const [latestTrainingState, setLatestTrainingState] = useState<TrainingJobState | null>(null);
  const [latestTrainingMessage, setLatestTrainingMessage] = useState('');

  const loadStats = useCallback(async () => {
    try {
      const [datasets, jobs, models] = await Promise.all([
        datasetApi.getAll(),
        trainingApi.getJobs(),
        modelApi.getAll(),
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
  }, []);

  const readPersistedJobId = useCallback((): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      const id = String(window.localStorage.getItem(getTrainingStorageKey()) || '').trim();
      return id || null;
    } catch {
      return null;
    }
  }, []);

  const writePersistedJobId = useCallback((jobId: string) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(getTrainingStorageKey(), jobId);
    } catch {
      // ignore
    }
  }, []);

  const clearPersistedJobId = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(getTrainingStorageKey());
    } catch {
      // ignore
    }
  }, []);

  const refreshLatestTrainingState = useCallback(async () => {
    let jobId = readPersistedJobId();

    if (!jobId) {
      const running = await trainingApi.getLatestRunningJobFromModels();
      if (running?.id) {
        jobId = running.id;
        writePersistedJobId(jobId);
      }
    }

    if (!jobId) {
      setLatestTrainingState(null);
      return;
    }

    try {
      const state = await trainingApi.getJobState(jobId);
      setLatestTrainingState(state);
      setLatestTrainingMessage('');
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err) || 'خطا در دریافت وضعیت آموزش';
      setLatestTrainingMessage(detail);

      const maybeStatus = (err as { response?: { status?: number } })?.response?.status;
      if (maybeStatus === 403 || maybeStatus === 404) {
        clearPersistedJobId();
        setLatestTrainingState(null);
      }
    }
  }, [clearPersistedJobId, readPersistedJobId, writePersistedJobId]);

  useEffect(() => {
    void loadStats();
    void refreshLatestTrainingState();
  }, [loadStats, refreshLatestTrainingState]);

  useEffect(() => {
    if (!latestTrainingState || latestTrainingState.is_terminal) return;
    const intervalId = window.setInterval(() => {
      void refreshLatestTrainingState();
    }, POLL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [latestTrainingState, refreshLatestTrainingState]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshLatestTrainingState();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshLatestTrainingState]);

  const statusLabel = useMemo(() => {
    const status = latestTrainingState?.status;
    if (!status) return 'نامشخص';
    if (status === 'running') return 'در حال آموزش';
    if (status === 'succeeded') return 'آموزش کامل شد';
    if (status === 'failed') return 'آموزش ناموفق بود';
    if (status === 'canceled') return 'آموزش لغو شد';
    return status;
  }, [latestTrainingState?.status]);

  const statusStyles = useMemo(() => {
    const status = latestTrainingState?.status;
    if (status === 'running') return 'bg-blue-50 border-blue-200 text-blue-800';
    if (status === 'succeeded') return 'bg-green-50 border-green-200 text-green-800';
    if (status === 'failed') return 'bg-red-50 border-red-200 text-red-800';
    if (status === 'canceled') return 'bg-gray-50 border-gray-300 text-gray-800';
    return 'bg-yellow-50 border-yellow-200 text-yellow-800';
  }, [latestTrainingState?.status]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              {translations.dashboard.welcome}، {user?.username}!
            </h1>
            <p className="text-gray-600">مدیریت سیستم توصیه‌گر هوشمند</p>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : (
            <>
              {latestTrainingState && (
                <div className={`mb-6 border rounded-lg p-4 ${statusStyles}`}>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold mb-1">آخرین وضعیت آموزش: {statusLabel}</p>
                      <p className="text-xs">شناسه کار: {latestTrainingState.job_id}</p>
                      {typeof latestTrainingState.progress_pct === 'number' && (
                        <div className="mt-2">
                          <p className="text-xs mb-1">پیشرفت: {latestTrainingState.progress_pct}%</p>
                          <div className="w-56 bg-white/70 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${latestTrainingState.progress_pct}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                      {typeof latestTrainingState.epoch === 'number' &&
                        typeof latestTrainingState.total_epochs === 'number' && (
                          <p className="text-xs mt-2">
                            Epoch: {latestTrainingState.epoch}/{latestTrainingState.total_epochs}
                          </p>
                        )}
                      {latestTrainingState.error && (
                        <p className="text-xs mt-2 text-red-700">{latestTrainingState.error}</p>
                      )}
                      {latestTrainingMessage && <p className="text-xs mt-2">{latestTrainingMessage}</p>}
                    </div>
                    <Link
                      href="/training"
                      className="inline-flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      مشاهده جزئیات آموزش
                    </Link>
                  </div>
                </div>
              )}

              {stats.activeJobs > 0 && (
                <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold text-yellow-800 mb-1">
                        {translations.dashboard.trainingInProgressTitle}
                      </p>
                      <p className="text-sm text-yellow-700">{translations.dashboard.trainingInProgressText}</p>
                      <p className="text-sm text-yellow-800 mt-1">
                        {translations.dashboard.activeTrainingsCount}: {stats.activeJobs}
                      </p>
                    </div>
                    <Link
                      href="/jobs"
                      className="inline-flex items-center bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
                    >
                      {translations.dashboard.viewTrainingJobs}
                    </Link>
                  </div>
                </div>
              )}

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 text-sm mb-1">{translations.dashboard.totalDatasets}</p>
                      <p className="text-3xl font-bold text-blue-600">{stats.totalDatasets}</p>
                    </div>
                    <div className="bg-blue-100 p-3 rounded-full">
                      <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 text-sm mb-1">{translations.dashboard.totalModels}</p>
                      <p className="text-3xl font-bold text-green-600">{stats.totalModels}</p>
                    </div>
                    <div className="bg-green-100 p-3 rounded-full">
                      <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 text-sm mb-1">{translations.dashboard.activeJobs}</p>
                      <p className="text-3xl font-bold text-yellow-600">{stats.activeJobs}</p>
                    </div>
                    <div className="bg-yellow-100 p-3 rounded-full">
                      <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 text-sm mb-1">{translations.dashboard.completedJobs}</p>
                      <p className="text-3xl font-bold text-purple-600">{stats.completedJobs}</p>
                    </div>
                    <div className="bg-purple-100 p-3 rounded-full">
                      <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold text-gray-800 mb-4">{translations.dashboard.quickActions}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Link
                    href="/datasets"
                    className="flex items-center p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <svg className="w-10 h-10 text-blue-600 ml-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="font-medium text-gray-700">{translations.dashboard.uploadDataset}</span>
                  </Link>

                  <Link
                    href="/training"
                    className="flex items-center p-4 border-2 border-green-200 rounded-lg hover:bg-green-50 transition-colors"
                  >
                    <svg className="w-10 h-10 text-green-600 ml-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                    </svg>
                    <span className="font-medium text-gray-700">{translations.dashboard.startTraining}</span>
                  </Link>

                  <Link
                    href="/models"
                    className="flex items-center p-4 border-2 border-purple-200 rounded-lg hover:bg-purple-50 transition-colors"
                  >
                    <svg className="w-10 h-10 text-purple-600 ml-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span className="font-medium text-gray-700">{translations.dashboard.viewModels}</span>
                  </Link>

                  <Link
                    href="/recommendations"
                    className="flex items-center p-4 border-2 border-yellow-200 rounded-lg hover:bg-yellow-50 transition-colors"
                  >
                    <svg className="w-10 h-10 text-yellow-600 ml-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                    <span className="font-medium text-gray-700">{translations.dashboard.getRecommendations}</span>
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

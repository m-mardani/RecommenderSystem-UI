'use client';

import { useCallback, useEffect, useState } from 'react';
import { Navbar } from '@/components/common/Navbar';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { translations } from '@/lib/utils/translations';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { trainingApi } from '@/lib/api';
import { TrainingJob } from '@/types';

export default function JobsPage() {
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchJobs = useCallback(async () => {
    try {
      setError('');
      const data = await trainingApi.getJobs();
      setJobs(data);
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) || translations.errors.generic);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await fetchJobs();
    } finally {
      setRefreshing(false);
    }
  }, [fetchJobs]);

  useEffect(() => {
    let mounted = true;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          await fetchJobs();
        } finally {
          if (mounted) setLoading(false);
        }
      })();
    }, 0);
    const intervalId = window.setInterval(() => {
      void fetchJobs();
    }, 5000); // Auto-refresh every 5 seconds
    return () => {
      mounted = false;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [fetchJobs]);

  const handleCancel = async (jobId: string) => {
    const confirmed = window.confirm(translations.jobs.confirmCancel);
    if (!confirmed) return;

    try {
      setCancellingJobId(jobId);
      await trainingApi.cancelJob(jobId);
      alert(translations.jobs.cancelSuccess);
      await fetchJobs();
    } catch (err: unknown) {
      alert(getApiErrorDetail(err) || translations.jobs.cancelError);
    } finally {
      setCancellingJobId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'canceled':
        return 'bg-gray-200 text-gray-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: translations.jobs.statuses.pending,
      running: translations.jobs.statuses.running,
      completed: translations.jobs.statuses.completed,
      canceled: translations.jobs.statuses.canceled,
      failed: translations.jobs.statuses.failed,
    };
    return statusMap[status] || status;
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800">{translations.jobs.title}</h1>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            >
              {refreshing ? translations.common.loading : translations.jobs.refresh}
            </button>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <ErrorMessage message={error} onRetry={handleRefresh} />
          ) : jobs.length === 0 ? (
            <div className="bg-white p-8 rounded-lg shadow-md text-center">
              <p className="text-gray-600">{translations.jobs.noJobs}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => (
                <div key={job.id} className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center space-x-reverse space-x-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-800">
                          {translations.jobs.jobId}: {job.id}
                        </h3>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            job.status
                          )}`}
                        >
                          {getStatusText(job.status)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">
                        <strong>{translations.jobs.modelType}:</strong> {job.model_type || '-'}
                      </p>
                      <p className="text-sm text-gray-600 mb-1">
                        <strong>{translations.jobs.createdAt}:</strong>{' '}
                        {job.created_at ? new Date(job.created_at).toLocaleString('fa-IR') : '-'}
                      </p>
                      {job.started_at && (
                        <p className="text-sm text-gray-600 mb-1">
                          <strong>{translations.jobs.startedAt}:</strong>{' '}
                          {new Date(job.started_at).toLocaleString('fa-IR')}
                        </p>
                      )}
                      {job.completed_at && (
                        <p className="text-sm text-gray-600 mb-1">
                          <strong>{translations.jobs.completedAt}:</strong>{' '}
                          {new Date(job.completed_at).toLocaleString('fa-IR')}
                        </p>
                      )}
                      {job.error_message && (
                        <p className="text-sm text-red-600 mt-2">
                          <strong>خطا:</strong> {job.error_message}
                        </p>
                      )}
                    </div>
                    {(job.status === 'pending' || job.status === 'running') && (
                      <button
                        onClick={() => void handleCancel(job.id)}
                        disabled={cancellingJobId === job.id}
                        className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors disabled:bg-gray-400"
                      >
                        {cancellingJobId === job.id ? translations.common.loading : translations.jobs.cancel}
                      </button>
                    )}
                  </div>

                  {job.status === 'running' && job.progress !== undefined && (
                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700">
                          {translations.jobs.progress}
                        </span>
                        <span className="text-sm font-medium text-gray-700">{job.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${job.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

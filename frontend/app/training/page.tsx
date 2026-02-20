'use client';

import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navbar } from '@/components/common/Navbar';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { translations } from '@/lib/utils/translations';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { datasetApi, trainingApi } from '@/lib/api';
import { getAccessToken } from '@/lib/api/client';
import { Dataset, TrainingJobState } from '@/types';

type LoadStateReason = 'mount' | 'poll' | 'focus' | 'start';

const POLL_BASE_MS = 3000;
const POLL_MAX_MS = 15000;

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

const buildStorageKey = (): string => `training:lastJobId:${decodeTokenSubject()}`;

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

const normalizePct = (value: unknown): number | undefined => {
  const n = toNumber(value);
  if (n === undefined) return undefined;
  const pct = n >= 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
};

const readProgressPatch = (raw: unknown): Partial<TrainingJobState> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;

  return {
    progress_status: typeof record.status === 'string' ? record.status.toLowerCase() : undefined,
    stage: typeof record.stage === 'string' ? record.stage : undefined,
    epoch: toNumber(record.epoch) ?? toNumber(record.current_epoch),
    total_epochs: toNumber(record.total_epochs) ?? toNumber(record.num_epochs),
    progress_pct:
      normalizePct(record.progress_pct) ?? normalizePct(record.percent) ?? normalizePct(record.progress),
  };
};

const emptyState = (jobId: string): TrainingJobState => ({
  job_id: jobId,
  status: null,
  progress_status: null,
  stage: null,
  epoch: undefined,
  total_epochs: undefined,
  progress_pct: undefined,
  started_at: undefined,
  completed_at: undefined,
  duration_seconds: undefined,
  is_terminal: false,
  error: null,
});

export default function TrainingPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [persistedJobId, setPersistedJobId] = useState<string | null>(null);
  const [trainingState, setTrainingState] = useState<TrainingJobState | null>(null);
  const [stateMessage, setStateMessage] = useState('');
  const [pollDelayMs, setPollDelayMs] = useState(POLL_BASE_MS);

  const [formData, setFormData] = useState({
    datasetId: '',
  });

  const isActiveTraining = Boolean(
    persistedJobId && trainingState && !trainingState.is_terminal && trainingState.status !== 'failed'
  );

  const readPersistedJobId = useCallback((): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      const value = window.localStorage.getItem(buildStorageKey());
      const id = String(value || '').trim();
      return id || null;
    } catch {
      return null;
    }
  }, []);

  const writePersistedJobId = useCallback((jobId: string) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(buildStorageKey(), jobId);
    } catch {
      // ignore
    }
  }, []);

  const clearPersistedJobId = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(buildStorageKey());
    } catch {
      // ignore
    }
  }, []);

  const loadDatasets = useCallback(async () => {
    try {
      setLoading(true);
      const data = await datasetApi.getAll();
      setDatasets(data);
      setError('');
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) || translations.errors.generic);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadJobState = useCallback(
    async (jobId: string, reason: LoadStateReason): Promise<void> => {
      try {
        const state = await trainingApi.getJobState(jobId);
        let nextState = state;

        try {
          const progress = await trainingApi.getJobProgress(jobId);
          nextState = {
            ...nextState,
            ...readProgressPatch(progress),
            progress_status:
              nextState.progress_status ?? readProgressPatch(progress).progress_status ?? null,
            stage: nextState.stage ?? readProgressPatch(progress).stage ?? null,
            epoch: nextState.epoch ?? readProgressPatch(progress).epoch,
            total_epochs: nextState.total_epochs ?? readProgressPatch(progress).total_epochs,
            progress_pct: nextState.progress_pct ?? readProgressPatch(progress).progress_pct,
          };
        } catch {
          // optional endpoint; ignore failures
        }

        setPersistedJobId(jobId);
        setTrainingState(nextState);
        setStateMessage('');
        setPollDelayMs(POLL_BASE_MS);
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          const statusCode = err.response?.status;

          if (statusCode === 403 || statusCode === 404) {
            clearPersistedJobId();
            setPersistedJobId(null);
            setTrainingState(null);
            setStateMessage('کار آموزشی یافت نشد یا دسترسی به آن ندارید.');
            return;
          }

          if (statusCode === 401) {
            setStateMessage('نشست شما منقضی شده است. لطفاً دوباره وارد شوید.');
            return;
          }

          if (!err.response) {
            setStateMessage('مشکل شبکه در دریافت وضعیت آموزش. تلاش مجدد انجام می‌شود...');
            setPollDelayMs((prev) => Math.min(POLL_MAX_MS, Math.max(POLL_BASE_MS, prev * 2)));
            return;
          }
        }

        setStateMessage(getApiErrorDetail(err) || 'خطا در دریافت وضعیت آموزش');
        if (reason === 'poll') {
          setPollDelayMs((prev) => Math.min(POLL_MAX_MS, Math.max(POLL_BASE_MS, prev * 2)));
        }
      }
    },
    [clearPersistedJobId]
  );

  const restoreLastJob = useCallback(async () => {
    const savedJobId = readPersistedJobId();
    if (savedJobId) {
      setPersistedJobId(savedJobId);
      setTrainingState((prev) => prev || emptyState(savedJobId));
      await loadJobState(savedJobId, 'mount');
      return;
    }

    try {
      const latestRunning = await trainingApi.getLatestRunningJobFromModels();
      if (latestRunning?.id) {
        writePersistedJobId(latestRunning.id);
        setPersistedJobId(latestRunning.id);
        setTrainingState(emptyState(latestRunning.id));
        await loadJobState(latestRunning.id, 'mount');
      }
    } catch {
      // ignore fallback failures
    }
  }, [loadJobState, readPersistedJobId, writePersistedJobId]);

  useEffect(() => {
    void loadDatasets();
    void restoreLastJob();
  }, [loadDatasets, restoreLastJob]);

  useEffect(() => {
    if (!persistedJobId || !trainingState || trainingState.is_terminal) return;

    const timeoutId = window.setTimeout(() => {
      void loadJobState(persistedJobId, 'poll');
    }, pollDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [persistedJobId, trainingState, pollDelayMs, loadJobState]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && persistedJobId) {
        void loadJobState(persistedJobId, 'focus');
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [persistedJobId, loadJobState]);

  const handleTrain = useCallback(async () => {
    if (!formData.datasetId) return;
    setSubmitting(true);
    setStateMessage('');

    try {
      const startedJob = await trainingApi.trainAsync(formData.datasetId);
      writePersistedJobId(startedJob.id);
      setPersistedJobId(startedJob.id);
      setTrainingState(emptyState(startedJob.id));
      await loadJobState(startedJob.id, 'start');
      setFormData({ datasetId: '' });
      alert(translations.training.startSuccess);
    } catch (err: unknown) {
      alert(getApiErrorDetail(err) || translations.training.startError);
    } finally {
      setSubmitting(false);
    }
  }, [formData.datasetId, loadJobState, writePersistedJobId]);

  const statusLabel = useMemo(() => {
    const s = trainingState?.status;
    if (!s) return 'نامشخص';
    if (s === 'running') return 'در حال آموزش';
    if (s === 'succeeded') return 'آموزش کامل شد';
    if (s === 'failed') return 'آموزش ناموفق بود';
    if (s === 'canceled') return 'آموزش لغو شد';
    return s;
  }, [trainingState?.status]);

  const statusColor = useMemo(() => {
    const s = trainingState?.status;
    if (s === 'running') return 'bg-blue-50 border-blue-200 text-blue-800';
    if (s === 'succeeded') return 'bg-green-50 border-green-200 text-green-800';
    if (s === 'failed') return 'bg-red-50 border-red-200 text-red-800';
    if (s === 'canceled') return 'bg-gray-50 border-gray-300 text-gray-800';
    return 'bg-yellow-50 border-yellow-200 text-yellow-800';
  }, [trainingState?.status]);

  const progressValue = trainingState?.progress_pct;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">{translations.training.title}</h1>

          {(persistedJobId || trainingState) && (
            <div className={`border rounded-lg p-4 mb-6 max-w-2xl ${statusColor}`}>
              <p className="text-sm font-semibold mb-1">وضعیت آموزش: {statusLabel}</p>
              <p className="text-xs opacity-90">شناسه کار: {trainingState?.job_id || persistedJobId}</p>

              {typeof progressValue === 'number' && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span>پیشرفت</span>
                    <span>{progressValue}%</span>
                  </div>
                  <div className="w-full bg-white/70 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${progressValue}%` }}></div>
                  </div>
                </div>
              )}

              {typeof trainingState?.epoch === 'number' && typeof trainingState?.total_epochs === 'number' && (
                <p className="text-xs mt-2">Epoch: {trainingState.epoch}/{trainingState.total_epochs}</p>
              )}

              {trainingState?.is_terminal && (
                <span className="inline-block mt-2 text-xs px-2 py-1 rounded bg-black/10">Terminal</span>
              )}

              {trainingState?.error && (
                <p className="text-xs mt-2 text-red-700">{trainingState.error}</p>
              )}

              {stateMessage && <p className="text-xs mt-2">{stateMessage}</p>}
            </div>
          )}

          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <ErrorMessage
              message={error}
              onRetry={() => {
                void loadDatasets();
                if (persistedJobId) void loadJobState(persistedJobId, 'focus');
              }}
            />
          ) : (
            <div className="bg-white p-8 rounded-lg shadow-md max-w-2xl">
              <h2 className="text-xl font-bold text-gray-800 mb-6">{translations.training.startNew}</h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {translations.training.selectDataset}
                  </label>
                  <select
                    value={formData.datasetId}
                    onChange={(e) => setFormData({ ...formData, datasetId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">{translations.training.selectDataset}</option>
                    {datasets.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>
                        {dataset.name}
                      </option>
                    ))}
                  </select>
                </div>

                {isActiveTraining && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">{translations.training.oneAtATime}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleTrain}
                  disabled={submitting || !formData.datasetId || isActiveTraining}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                >
                  {submitting ? translations.common.loading : translations.training.trainEngine}
                </button>
              </div>

              {datasets.length === 0 && (
                <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    هیچ مجموعه داده‌ای موجود نیست. لطفاً ابتدا یک مجموعه داده بارگذاری کنید.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

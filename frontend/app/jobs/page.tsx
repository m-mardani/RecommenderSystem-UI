'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/common/AppShell';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { translations } from '@/lib/utils/translations';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { trainingApi } from '@/lib/api';
import {
  TrainingJob,
  TrainingJobEpochStream,
  TrainingJobEventRecord,
  TrainingJobProgressStream,
  TrainingJobState,
} from '@/types';

type JobMonitorDetails = {
  state?: TrainingJobState;
  progress?: TrainingJobProgressStream;
  epochs?: TrainingJobEpochStream;
};

const getEventTimestamp = (event: TrainingJobEventRecord): number | null => {
  const candidates = [
    event.created_at,
    event.timestamp,
    event.ts,
    event.time,
    event.completed_at,
    event.started_at,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === 'string' && candidate.trim()) {
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const numberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const stringOrNull = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
};

const mergeJobEvents = (details?: JobMonitorDetails): TrainingJobEventRecord[] => {
  const source = [
    ...(details?.progress?.events ?? []),
    ...(details?.epochs?.events ?? []),
  ];
  const unique = new Map<string, TrainingJobEventRecord>();
  source.forEach((event, index) => {
    const key = JSON.stringify(event) || `event-${index}`;
    if (!unique.has(key)) unique.set(key, event);
  });
  return Array.from(unique.values()).sort((a, b) => {
    const ta = getEventTimestamp(a);
    const tb = getEventTimestamp(b);
    if (ta !== null && tb !== null) return ta - tb;
    if (ta !== null) return -1;
    if (tb !== null) return 1;
    return 0;
  });
};

const buildEventMessage = (event: TrainingJobEventRecord): string => {
  const status = stringOrNull(event.status);
  const stage = stringOrNull(event.stage);
  const error = stringOrNull(event.error);
  const epoch = numberOrNull(event.epoch) ?? numberOrNull(event.current_epoch);
  const totalEpochs = numberOrNull(event.total_epochs);
  const trainLoss = numberOrNull(event.train_loss);
  const valLoss = numberOrNull(event.val_loss);
  const epochTime = numberOrNull(event.epoch_time);

  if (status === 'queued' && stage === 'scheduled') {
    return 'Job scheduled. Waiting to start.';
  }
  if (status === 'running' && stage === 'graph_sync') {
    return 'Graph sync started. Training is not blocked, but graph import is in progress.';
  }
  if (status === 'running' && stage === 'train' && (epoch === null || epoch === 0)) {
    return 'Training started.';
  }
  if (status === 'running' && stage === 'train' && epoch !== null && totalEpochs !== null) {
    const parts = [`Epoch ${epoch}/${totalEpochs} completed.`];
    if (trainLoss !== null) parts.push(`Train loss: ${trainLoss.toFixed(2)}.`);
    if (valLoss !== null) parts.push(`Validation loss: ${valLoss.toFixed(2)}.`);
    if (epochTime !== null) parts.push(`Epoch time: ${epochTime.toFixed(1)}s.`);
    return parts.join(' ');
  }
  if (status === 'running' && stage === 'extract_embeddings') {
    return 'Training epochs finished. Extracting embeddings.';
  }
  if (status === 'running' && stage === 'finalize') {
    return 'Finalizing model artifacts.';
  }
  if (status === 'completed') {
    return 'Training completed successfully.';
  }
  if (status === 'failed') {
    return `Training failed: ${error || 'Unknown error.'}`;
  }
  if (status === 'canceled' || stage === 'canceled') {
    return 'Training was canceled.';
  }

  const rawStatus = status || 'unknown';
  const rawStage = stage || 'unspecified';
  return `Status: ${rawStatus}. Stage: ${rawStage}.`;
};

const buildActivityLog = (details?: JobMonitorDetails): string[] => {
  const state = details?.state;
  const mergedEvents = mergeJobEvents(details);
  const logLines = mergedEvents.map(buildEventMessage);

  if (
    state?.stage === 'graph_sync' &&
    (!details?.epochs?.events || details.epochs.events.length === 0)
  ) {
    logLines.unshift('Job is currently syncing graph data. Epoch training has not started yet.');
  }

  if (state?.is_terminal) {
    if (state.status === 'completed') logLines.push('Training completed successfully.');
    if (state.status === 'failed' && state.error) logLines.push(`Training failed: ${state.error}`);
    if (state.status === 'canceled') logLines.push('Training was canceled.');
  } else if (state?.error) {
    logLines.push(`Training failed: ${state.error}`);
  }

  if (logLines.length === 0 && state?.stage === 'train' && state.epoch && state.total_epochs) {
    logLines.push(`Epoch ${state.epoch}/${state.total_epochs} in progress.`);
  }

  return Array.from(new Set(logLines));
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cancelingJobId, setCancelingJobId] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<Record<string, JobMonitorDetails>>({});

  const fetchJobs = useCallback(async () => {
    try {
      setError('');
      const data = await trainingApi.getJobs();
      setJobs(data);
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) || translations.errors.generic);
    }
  }, []);

  const fetchJobDetails = useCallback(async (job: TrainingJob) => {
    const jobId = String(job.id).trim();
    if (!jobId) return;

    try {
      const state = await trainingApi.getJobState(jobId);
      const nextDetails: JobMonitorDetails = { state };

      try {
        const progress = await trainingApi.getJobProgressStream(jobId, 100);
        nextDetails.progress = progress;
      } catch {
        // Keep state-based monitoring even if progress stream is unavailable.
      }

      if (state.stage === 'train') {
        try {
          const epochs = await trainingApi.getJobEpochStream(jobId, 100);
          nextDetails.epochs = epochs;
        } catch {
          // Optional; state + progress remain enough.
        }
      }

      setJobDetails((prev) => ({ ...prev, [jobId]: nextDetails }));
    } catch {
      // Do not override the main page error with per-job polling failures.
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
    }, 5000);

    return () => {
      mounted = false;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [fetchJobs]);

  useEffect(() => {
    const activeJobs = jobs.filter((job) => job.status === 'pending' || job.status === 'running');
    if (activeJobs.length === 0) return;

    activeJobs.forEach((job) => {
      void fetchJobDetails(job);
    });

    const stateTimer = window.setInterval(() => {
      activeJobs.forEach((job) => {
        const details = jobDetails[job.id];
        if (!details?.state?.is_terminal) void fetchJobDetails(job);
      });
    }, 3000);

    return () => {
      window.clearInterval(stateTimer);
    };
  }, [jobs, fetchJobDetails, jobDetails]);

  const handleCancel = async (jobId: string) => {
    const id = String(jobId).trim();
    if (!id) return;
    if (!window.confirm(translations.jobs.confirmCancel)) return;

    try {
      setCancelingJobId(id);
      setError('');
      await trainingApi.cancelJob(id);
      await fetchJobs();
      const refreshed = jobs.find((job) => job.id === id);
      if (refreshed) await fetchJobDetails(refreshed);
    } catch (err: unknown) {
      alert(getApiErrorDetail(err) || translations.jobs.cancelError);
    } finally {
      setCancelingJobId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-amber-100 text-amber-800';
      case 'running':
        return 'bg-sky-100 text-sky-800';
      case 'completed':
        return 'bg-emerald-100 text-emerald-800';
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

  const formatEta = (seconds?: number) => {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '-';
    if (seconds < 60) return `${Math.round(seconds)} ثانیه`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} دقیقه`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return minutes > 0 ? `${hours} ساعت و ${minutes} دقیقه` : `${hours} ساعت`;
  };

  const getStatusDisplay = (job: TrainingJob, details?: JobMonitorDetails) => {
    const liveStatus = details?.state?.status || job.status;
    const base = getStatusText(liveStatus);
    const etaSeconds = details?.state?.eta_seconds ?? job.eta_seconds;
    const estimatedCompletion = details?.state?.estimated_completion_at ?? job.estimated_completion_at;
    if (liveStatus !== 'running') return base;
    if (typeof etaSeconds === 'number' && Number.isFinite(etaSeconds) && etaSeconds >= 0) {
      return `${base} · ${formatEta(etaSeconds)}`;
    }
    if (estimatedCompletion) {
      return `${base} · تا ${new Date(estimatedCompletion).toLocaleTimeString('fa-IR')}`;
    }
    return base;
  };

  const cards = useMemo(
    () =>
      jobs.map((job) => {
        const details = jobDetails[job.id];
        const liveProgress = details?.state?.progress_pct ?? details?.epochs?.progress_pct ?? job.progress;
        const liveStage = details?.state?.stage ?? details?.epochs?.stage ?? '-';
        const liveEpoch = details?.state?.epoch ?? details?.epochs?.current_epoch;
        const liveTotalEpochs = details?.state?.total_epochs ?? details?.epochs?.total_epochs;
        const epochText = details?.state?.epoch_text ?? details?.epochs?.epoch_text;
        const activityLog = buildActivityLog(details);

        return {
          job,
          details,
          liveProgress,
          liveStage,
          liveEpoch,
          liveTotalEpochs,
          epochText,
          activityLog,
        };
      }),
    [jobs, jobDetails]
  );

  return (
    <ProtectedRoute adminOnly>
      <AppShell
        title={translations.nav.jobs}
        description="نمای زنده‌ای از وضعیت آموزش‌ها، eventهای ساخت‌یافته و گزارش متنی اجرای job."
        actions={
          <button onClick={handleRefresh} disabled={refreshing} className="app-btn app-btn-primary">
            {refreshing ? translations.common.loading : translations.jobs.refresh}
          </button>
        }
      >
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage message={error} onRetry={handleRefresh} />
        ) : jobs.length === 0 ? (
          <div className="app-empty">
            <p>{translations.jobs.noJobs}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {cards.map(({ job, details, liveProgress, liveStage, liveEpoch, liveTotalEpochs, epochText, activityLog }) => (
              <div key={job.id} className="app-card p-6">
                <div className="mb-4 flex justify-between items-start">
                  <div>
                    <div className="flex items-center space-x-reverse space-x-3 mb-2">
                      <h3 className="text-lg font-bold text-slate-900">
                        {translations.jobs.jobId}: {job.id}
                      </h3>
                      <span className={`app-badge ${getStatusColor(details?.state?.status || job.status)}`}>
                        {getStatusDisplay(job, details)}
                      </span>
                    </div>
                    <p className="mb-1 text-sm text-slate-600">
                      <strong>{translations.jobs.modelType}:</strong> {job.model_type || '-'}
                    </p>
                    <p className="mb-1 text-sm text-slate-600">
                      <strong>{translations.jobs.createdAt}:</strong>{' '}
                      {job.created_at ? new Date(job.created_at).toLocaleString('fa-IR') : '-'}
                    </p>
                    {job.started_at && (
                      <p className="mb-1 text-sm text-slate-600">
                        <strong>{translations.jobs.startedAt}:</strong> {new Date(job.started_at).toLocaleString('fa-IR')}
                      </p>
                    )}
                    {job.completed_at && (
                      <p className="mb-1 text-sm text-slate-600">
                        <strong>{translations.jobs.completedAt}:</strong> {new Date(job.completed_at).toLocaleString('fa-IR')}
                      </p>
                    )}
                    {(details?.state?.estimated_completion_at || job.estimated_completion_at) && (
                      <p className="mb-1 text-sm text-slate-600">
                        <strong>{translations.jobs.estimatedCompletion}:</strong>{' '}
                        {new Date(details?.state?.estimated_completion_at || job.estimated_completion_at || '').toLocaleString('fa-IR')}
                      </p>
                    )}
                    {job.duration_seconds !== undefined && (
                      <p className="mb-1 text-sm text-slate-600">
                        <strong>{translations.jobs.durationSeconds}:</strong> {job.duration_seconds}
                      </p>
                    )}
                    {(details?.state?.eta_seconds ?? job.eta_seconds) !== undefined && (
                      <p className="mb-1 text-sm text-slate-600">
                        <strong>{translations.jobs.eta}:</strong> {formatEta(details?.state?.eta_seconds ?? job.eta_seconds)}
                      </p>
                    )}
                    <p className="mb-1 text-sm text-slate-600">
                      <strong>Stage:</strong> {liveStage}
                    </p>
                    {epochText && (
                      <p className="mb-1 text-sm text-slate-600">
                        <strong>Epoch:</strong> {epochText}
                      </p>
                    )}
                    {liveEpoch !== undefined && liveTotalEpochs !== undefined && (
                      <p className="mb-1 text-sm text-slate-600">
                        <strong>Epoch Progress:</strong> {liveEpoch}/{liveTotalEpochs}
                      </p>
                    )}
                    {(details?.state?.error || job.error_message) && (
                      <p className="mt-2 text-sm text-rose-600">
                        <strong>خطا:</strong> {details?.state?.error || job.error_message}
                      </p>
                    )}
                  </div>
                  {(job.status === 'pending' || job.status === 'running') && !details?.state?.is_terminal && (
                    <button
                      onClick={() => void handleCancel(job.id)}
                      disabled={cancelingJobId === job.id}
                      className="app-btn app-btn-danger"
                    >
                      {cancelingJobId === job.id ? translations.common.loading : translations.jobs.cancel}
                    </button>
                  )}
                </div>

                {typeof liveProgress === 'number' && (
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-slate-700">{translations.jobs.progress}</span>
                      <span className="text-sm font-medium text-slate-700">{liveProgress}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-200">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-500"
                        style={{ width: `${liveProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{translations.jobs.activityLog}</p>
                    {details?.progress?.total_events !== undefined && (
                      <span className="text-xs text-slate-500">
                        {translations.jobs.latestActivity}: {details.progress.total_events}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 text-sm leading-7 text-slate-700">
                    {activityLog.length > 0 ? (
                      activityLog.map((line, index) => (
                        <p key={`${job.id}-activity-${index}`} className="rounded-xl bg-white px-4 py-3 border border-slate-200">
                          {line}
                        </p>
                      ))
                    ) : (
                      <p className="rounded-xl bg-white px-4 py-3 border border-slate-200">
                        {translations.jobs.graphSyncNotice}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AppShell>
    </ProtectedRoute>
  );
}

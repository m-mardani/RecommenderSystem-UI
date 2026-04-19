'use client';

import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navbar } from '@/components/common/Navbar';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { ScenarioSelector } from '@/components/common/ScenarioSelector';
import { translations } from '@/lib/utils/translations';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { datasetApi, trainingApi } from '@/lib/api';
import { getScenarioConfig } from '@/lib/utils/scenarios';
import {
  Dataset,
  ScenarioType,
  TrainingEpochEvent,
  TrainingEpochsResponse,
  TrainingProgressStatus,
} from '@/types';

const ACTIVE_JOB_STORAGE_KEY = 'training.activeJobId';
const LAST_NUM_EPOCHS_STORAGE_KEY = 'training.lastNumEpochs';
const POLL_BASE_MS = 1500;
const POLL_MAX_MS = 10000;
const DEFAULT_NUM_EPOCHS = 20;

const normalizeStatus = (value: unknown): TrainingProgressStatus | null => {
  const status = String(value ?? '').trim().toLowerCase();
  if (!status) return null;
  if (['queued', 'queue', 'pending', 'pended'].includes(status)) return 'queued';
  if (['running', 'in_progress', 'in-progress', 'started', 'processing'].includes(status)) return 'running';
  if (['completed', 'complete', 'done', 'succeeded', 'success', 'finished'].includes(status)) return 'completed';
  if (['failed', 'failure', 'error', 'errored', 'exception'].includes(status)) return 'failed';
  return null;
};

const statusLabelMap: Record<TrainingProgressStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

const statusClassMap: Record<TrainingProgressStatus, string> = {
  queued: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  running: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

const clampProgress = (value: number): number => Math.max(0, Math.min(100, value));

const getEpochText = (currentEpoch: number | null, totalEpochs: number | null): string => {
  if (currentEpoch === null || totalEpochs === null) return '-';
  return `${currentEpoch}/${totalEpochs}`;
};

const getEventTimestampText = (event: TrainingEpochEvent): string => {
  if (event.ts === null || !Number.isFinite(event.ts)) return '-';
  const ms = event.ts < 1_000_000_000_000 ? event.ts * 1000 : event.ts;
  return new Date(ms).toLocaleString('fa-IR');
};

const getLatestEventError = (events: TrainingEpochEvent[]): string | null => {
  for (const event of events) {
    if (event.error) return event.error;
    if (event.message) return event.message;
    const metricError = event.metrics?.error;
    if (typeof metricError === 'string' && metricError.trim()) return metricError.trim();
  }
  return null;
};

export default function TrainingPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [datasetError, setDatasetError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType | ''>('');
  const [numEpochsInput, setNumEpochsInput] = useState(String(DEFAULT_NUM_EPOCHS));
  const [activeJobNumEpochs, setActiveJobNumEpochs] = useState<number | null>(null);
  const [activeJobScenario, setActiveJobScenario] = useState<ScenarioType | null>(null);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<TrainingProgressStatus | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [currentEpoch, setCurrentEpoch] = useState<number | null>(null);
  const [totalEpochs, setTotalEpochs] = useState<number | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [events, setEvents] = useState<TrainingEpochEvent[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasFirstPollResponse, setHasFirstPollResponse] = useState(false);

  const pollTimeoutRef = useRef<number | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const requestTokenRef = useRef(0);
  const backoffMsRef = useRef(POLL_BASE_MS);

  const clearPollTimeout = useCallback(() => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const readPersistedJobId = useCallback((): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
      const id = String(raw || '').trim();
      return id || null;
    } catch {
      return null;
    }
  }, []);

  const writePersistedJobId = useCallback((jobId: string) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, jobId);
    } catch {
      // ignore
    }
  }, []);

  const clearPersistedJobId = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const readPersistedNumEpochs = useCallback((): number => {
    if (typeof window === 'undefined') return DEFAULT_NUM_EPOCHS;
    try {
      const raw = window.localStorage.getItem(LAST_NUM_EPOCHS_STORAGE_KEY);
      if (!raw) return DEFAULT_NUM_EPOCHS;
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) return DEFAULT_NUM_EPOCHS;
      return Math.max(1, Math.min(1000, parsed));
    } catch {
      return DEFAULT_NUM_EPOCHS;
    }
  }, []);

  const writePersistedNumEpochs = useCallback((value: number) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LAST_NUM_EPOCHS_STORAGE_KEY, String(value));
    } catch {
      // ignore
    }
  }, []);

  const applySnapshot = useCallback(
    (jobId: string, snapshot: TrainingEpochsResponse) => {
      if (activeJobIdRef.current !== jobId) return;

      setStatus(snapshot.status);
      setStage(snapshot.stage);
      setCurrentEpoch(snapshot.current_epoch);
      setTotalEpochs(snapshot.total_epochs);
      setProgressPct(clampProgress(snapshot.progress_pct));
      setEvents(snapshot.events.slice(0, 100));
      setTotalEvents(snapshot.total_events);
      setHasFirstPollResponse(true);

      if (snapshot.status === 'completed' || snapshot.status === 'failed') {
        clearPersistedJobId();
      }
    },
    [clearPersistedJobId]
  );

  const schedulePoll = useCallback(
    (jobId: string, delayMs: number, callback: (id: string) => void) => {
      clearPollTimeout();
      pollTimeoutRef.current = window.setTimeout(() => {
        callback(jobId);
      }, delayMs);
    },
    [clearPollTimeout]
  );

  const stopPolling = useCallback(() => {
    clearPollTimeout();
    setIsPolling(false);
  }, [clearPollTimeout]);

  const pollEpochs = useCallback(
    async (jobId: string) => {
      if (!jobId || activeJobIdRef.current !== jobId) return;

      setIsPolling(true);
      const requestToken = ++requestTokenRef.current;

      try {
        const snapshot = await trainingApi.getTrainingEpochs(jobId, { tail: 100 });
        if (activeJobIdRef.current !== jobId || requestToken !== requestTokenRef.current) return;

        applySnapshot(jobId, snapshot);
        setErrorMessage(null);
        backoffMsRef.current = POLL_BASE_MS;
        setIsPolling(false);

        if (snapshot.status === 'completed' || snapshot.status === 'failed') {
          stopPolling();
          return;
        }

        schedulePoll(jobId, POLL_BASE_MS, (id) => {
          void pollEpochs(id);
        });
      } catch (err: unknown) {
        if (activeJobIdRef.current !== jobId || requestToken !== requestTokenRef.current) return;

        setIsPolling(false);

        if (axios.isAxiosError(err) && err.response?.status === 404) {
          stopPolling();
          clearPersistedJobId();
          setActiveJobId(null);
          setStatus(null);
          setStage(null);
          setCurrentEpoch(null);
          setTotalEpochs(null);
          setProgressPct(0);
          setEvents([]);
          setTotalEvents(0);
          setHasFirstPollResponse(true);
          setErrorMessage('No active training job');
          return;
        }

        const nextDelay = Math.min(POLL_MAX_MS, Math.max(POLL_BASE_MS, backoffMsRef.current * 2));
        backoffMsRef.current = nextDelay;
        setErrorMessage(getApiErrorDetail(err) || 'Failed to fetch training progress. Retrying...');

        schedulePoll(jobId, nextDelay, (id) => {
          void pollEpochs(id);
        });
      }
    },
    [applySnapshot, clearPersistedJobId, schedulePoll, stopPolling]
  );

  const beginPollingJob = useCallback(
    (jobId: string) => {
      activeJobIdRef.current = jobId;
      setActiveJobId(jobId);
      setHasFirstPollResponse(false);
      backoffMsRef.current = POLL_BASE_MS;
      requestTokenRef.current += 1;
      clearPollTimeout();
      void pollEpochs(jobId);
    },
    [clearPollTimeout, pollEpochs]
  );

  const loadDatasets = useCallback(async () => {
    try {
      setLoadingDatasets(true);
      setDatasetError('');
      const data = await datasetApi.getAll();
      setDatasets(data);
    } catch (err: unknown) {
      setDatasetError(getApiErrorDetail(err) || translations.errors.generic);
    } finally {
      setLoadingDatasets(false);
    }
  }, []);

  useEffect(() => {
    void loadDatasets();

    // Read ?scenario= URL param to pre-fill the selector when navigated from Scenarios page
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const scenarioParam = params.get('scenario');
      if (scenarioParam) {
        setSelectedScenario(scenarioParam as ScenarioType);
      }
    }

    const persistedEpochs = readPersistedNumEpochs();
    setNumEpochsInput(String(persistedEpochs));

    const savedJobId = readPersistedJobId();
    if (savedJobId) {
      beginPollingJob(savedJobId);
    } else {
      setHasFirstPollResponse(true);
    }

    return () => {
      stopPolling();
    };
  }, [beginPollingJob, loadDatasets, readPersistedJobId, readPersistedNumEpochs, stopPolling]);

  const trimmedNumEpochsInput = String(numEpochsInput).trim();
  const parsedNumEpochsRaw = Number.parseInt(trimmedNumEpochsInput, 10);
  const hasNumEpochsValue = trimmedNumEpochsInput.length > 0;
  const isIntegerEpochs = /^\d+$/.test(trimmedNumEpochsInput) && Number.isFinite(parsedNumEpochsRaw);
  const normalizedNumEpochs = isIntegerEpochs ? parsedNumEpochsRaw : Number.NaN;
  const isNumEpochsInRange = isIntegerEpochs && normalizedNumEpochs >= 1 && normalizedNumEpochs <= 1000;
  const numEpochsValidationError = !hasNumEpochsValue
    ? 'Epochs is required.'
    : !isIntegerEpochs
      ? 'Epochs must be an integer.'
      : !isNumEpochsInRange
        ? 'Epochs must be between 1 and 1000.'
        : '';
  const isNumEpochsValid = numEpochsValidationError.length === 0;

  const handleTrain = useCallback(async () => {
    if (!selectedDatasetId || !isNumEpochsValid) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const safeEpochs = Number.parseInt(String(numEpochsInput).trim(), 10);
      if (!Number.isFinite(safeEpochs) || safeEpochs < 1 || safeEpochs > 1000) {
        setErrorMessage('Invalid epochs value.');
        return;
      }

      const started = await trainingApi.startTrainingAsync({
        dataset_id: selectedDatasetId,
        num_epochs: safeEpochs,
        scenario: selectedScenario || undefined,
      });

      const nextStatus = normalizeStatus(started.result?.status) || 'queued';
      const jobId = started.job_id;

      setStatus(nextStatus);
      setStage('scheduled');
      setCurrentEpoch(0);
      setTotalEpochs(safeEpochs);
      setActiveJobNumEpochs(safeEpochs);
      setActiveJobScenario(selectedScenario || null);
      setProgressPct(0);
      setEvents([]);
      setTotalEvents(0);
      setHasFirstPollResponse(false);
      writePersistedJobId(jobId);
      writePersistedNumEpochs(safeEpochs);
      beginPollingJob(jobId);
      setSelectedDatasetId('');
      setSelectedScenario('');
      alert(translations.training.startSuccess);
    } catch (err: unknown) {
      alert(getApiErrorDetail(err) || translations.training.startError);
    } finally {
      setSubmitting(false);
    }
  }, [
    beginPollingJob,
    isNumEpochsValid,
    numEpochsInput,
    selectedDatasetId,    selectedScenario,    writePersistedJobId,
    writePersistedNumEpochs,
  ]);

  const isRunActive = status === 'queued' || status === 'running';

  const epochText = useMemo(() => {
    const eventEpochText = events[0]?.epoch_text;
    if (eventEpochText) return eventEpochText;
    return getEpochText(currentEpoch, totalEpochs);
  }, [currentEpoch, events, totalEpochs]);

  const failedMessage = useMemo(() => {
    if (status !== 'failed') return null;
    return getLatestEventError(events) || errorMessage || 'Training failed.';
  }, [errorMessage, events, status]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-linear-to-br from-gray-50 via-blue-50/30 to-purple-50/20">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">{translations.training.title}</h1>

          {loadingDatasets ? (
            <LoadingSpinner />
          ) : datasetError ? (
            <ErrorMessage message={datasetError} onRetry={() => void loadDatasets()} />
          ) : (
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-lg shadow-md max-w-2xl relative overflow-hidden">
                <h2 className="text-xl font-bold text-gray-800 mb-6">{translations.training.startNew}</h2>

                <div
                  className={`space-y-6 transition ${
                    isRunActive ? 'blur-[2px] opacity-70 pointer-events-none select-none' : ''
                  }`}
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {translations.training.selectDataset}
                    </label>
                    <select
                      value={selectedDatasetId}
                      onChange={(e) => setSelectedDatasetId(e.target.value)}
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

                  <ScenarioSelector
                    value={selectedScenario}
                    onChange={setSelectedScenario}
                    disabled={isRunActive}
                  />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="num_epochs">
                      num_epochs
                    </label>
                    <input
                      id="num_epochs"
                      name="num_epochs"
                      type="number"
                      min={1}
                      max={1000}
                      step={1}
                      required
                      value={numEpochsInput}
                      onChange={(e) => setNumEpochsInput(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Number of training epochs</p>
                    {numEpochsValidationError && (
                      <p className="text-xs text-red-600 mt-1">{numEpochsValidationError}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleTrain}
                    disabled={submitting || !selectedDatasetId || isRunActive || !isNumEpochsValid}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                  >
                    {submitting ? translations.common.loading : translations.training.trainEngine}
                  </button>
                </div>

                {isRunActive && (
                  <div className="absolute inset-0 bg-white/35 backdrop-blur-[1px] flex items-center justify-center px-6">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-lg">
                      <p className="text-sm text-yellow-800">{translations.training.oneAtATime}</p>
                    </div>
                  </div>
                )}

                {datasets.length === 0 && (
                  <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      هیچ مجموعه داده‌ای موجود نیست. لطفاً ابتدا یک مجموعه داده بارگذاری کنید.
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Training Progress</h2>

                {!activeJobId ? (
                  <p className="text-sm text-gray-600">No active training job</p>
                ) : (
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4 bg-gray-50/70">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-sm text-gray-700">Job ID:</span>
                        <span className="text-sm font-mono text-gray-900 break-all">{activeJobId}</span>
                        {status && (
                          <span className={`text-xs px-2 py-1 rounded border ${statusClassMap[status]}`}>
                            {statusLabelMap[status]}
                          </span>
                        )}
                        {activeJobScenario && (() => {
                          const cfg = getScenarioConfig(activeJobScenario);
                          return cfg ? (
                            <span className={`text-xs px-2 py-1 rounded text-white bg-linear-to-r ${cfg.gradient}`}>
                              {cfg.icon} {cfg.labelFa}
                            </span>
                          ) : null;
                        })()}
                        {isPolling && <span className="text-xs text-blue-600">Polling…</span>}
                      </div>
                      <p className="text-sm text-gray-700">
                        Stage: <span className="font-medium">{stage || '-'}</span>
                      </p>
                      <p className="text-sm text-gray-700">
                        Num Epochs:{' '}
                        <span className="font-medium">{activeJobNumEpochs ?? totalEpochs ?? '-'}</span>
                      </p>
                    </div>

                    {activeJobId && !hasFirstPollResponse ? (
                      <div className="animate-pulse space-y-3">
                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                        <div className="h-2 bg-gray-200 rounded w-full"></div>
                        <div className="h-24 bg-gray-100 rounded"></div>
                      </div>
                    ) : (
                      <>
                        <div className="border rounded-lg p-4">
                          <div className="flex justify-between text-sm mb-1">
                            <span>Epoch: {epochText}</span>
                            <span>{progressPct}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${progressPct}%` }}
                            ></div>
                          </div>
                        </div>

                        {status === 'failed' && (
                          <div className="border border-red-200 bg-red-50 text-red-700 rounded-lg p-3 text-sm">
                            {failedMessage}
                          </div>
                        )}

                        <div className="border rounded-lg overflow-hidden">
                          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-800">Epoch Events</h3>
                            <span className="text-xs text-gray-600">Total events: {totalEvents}</span>
                          </div>

                          {events.length === 0 ? (
                            <p className="p-4 text-sm text-gray-600">Waiting for first epoch update…</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 text-gray-700">
                                  <tr>
                                    <th className="px-4 py-2 text-right">Epoch</th>
                                    <th className="px-4 py-2 text-right">Train Loss</th>
                                    <th className="px-4 py-2 text-right">Val Loss</th>
                                    <th className="px-4 py-2 text-right">Epoch Time (s)</th>
                                    <th className="px-4 py-2 text-right">Timestamp</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {events.slice(0, 100).map((event, index) => (
                                    <tr key={`${event.epoch}-${event.ts ?? index}`} className="border-t">
                                      <td className="px-4 py-2">{event.epoch_text || event.epoch}</td>
                                      <td className="px-4 py-2">{event.train_loss ?? '-'}</td>
                                      <td className="px-4 py-2">{event.val_loss ?? '-'}</td>
                                      <td className="px-4 py-2">{event.epoch_time ?? '-'}</td>
                                      <td className="px-4 py-2">{getEventTimestampText(event)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {errorMessage && status !== 'failed' && (
                <div className="border border-yellow-200 bg-yellow-50 text-yellow-800 rounded-lg p-3 text-sm">
                  {errorMessage}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

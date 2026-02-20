import { apiClient, setTokens, clearTokens, getAccessToken } from './client';
import type { AxiosProgressEvent } from 'axios';
import {
  LoginCredentials,
  RegisterData,
  TokenResponse,
  User,
  Dataset,
  TrainingJob,
  Model,
  Recommendation,
  RecommendationRequest,
  TrainingJobState,
} from '@/types';

type UploadedDatasetInfo = {
  dataset_id: string;
  original_filename?: string | null;
  created_at?: string | null;
  num_rows?: number | null;
  columns?: string[] | null;
};

type UploadedDatasetsResponse = {
  datasets: UploadedDatasetInfo[];
};

type EngineDatasetUploadResponse = {
  dataset_id: string;
  num_rows?: number | null;
  columns?: string[] | null;
};

type MultipartInitResponse = {
  dataset_id: string;
  upload_id: string;
  part_size_bytes?: number;
};

type MultipartPresignResponse = {
  url: string;
};

export type MultipartUploadedPart = {
  part_number: number;
  etag: string;
};

type MultipartCompleteRequest = {
  upload_id: string;
  parts: MultipartUploadedPart[];
};

export type MultipartCompleteResponse = {
  dataset_id: string;
  bucket?: string;
  object_key?: string;
  [key: string]: unknown;
};

export type SystemLogEvent = {
  event_id: string;
  created_at: string;
  action: string;
  actor_user_id?: number | null;
  actor_username?: string | null;
  actor_roles?: string[] | null;
  entity_type?: string | null;
  entity_id?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
  request_method?: string | null;
  request_path?: string | null;
  request_id?: string | null;
};

export type SystemLogsSnapshotPresence = {
  user_id: number;
  username?: string | null;
  last_seen_at?: string | null;
  is_online: boolean;
  last_ip?: string | null;
  last_user_agent?: string | null;
};

export type SystemLogsSnapshotUploadingDataset = {
  dataset_id: string;
  user_id: number;
  username?: string | null;
  original_filename?: string | null;
  upload_id?: string | null;
  upload_state?: string | null;
  bucket?: string | null;
  object_key?: string | null;
};

export type SystemLogsSnapshotActiveTraining = {
  job_id: string;
  status?: string | null;
  strategy?: string | null;
  dataset_id?: string | null;
  uploader_user_id?: number | null;
  uploader_username?: string | null;
  original_filename?: string | null;
  latest_progress?: Record<string, unknown> | null;
};

export type SystemLogsSnapshot = {
  generated_at: string;
  online_window_seconds: number;
  presence?: SystemLogsSnapshotPresence[] | null;
  uploading_datasets?: SystemLogsSnapshotUploadingDataset[] | null;
  active_trainings?: SystemLogsSnapshotActiveTraining[] | null;
};

export type SystemLogsResponse = {
  events: SystemLogEvent[];
  snapshot?: SystemLogsSnapshot | null;
};

export type FetchSystemLogsParams = {
  limit?: number;
  offset?: number;
  since?: string;
  action?: string;
  actor_user_id?: number;
  include_snapshot?: boolean;
  online_window_seconds?: number;
  snapshot_limit?: number;
};

export const fetchSystemLogs = async (params: FetchSystemLogsParams): Promise<SystemLogsResponse> => {
  const response = await apiClient.get<SystemLogsResponse>('/admin/system/logs', { params });
  return response.data;
};

type DatasetCreateOptions = {
  signal?: AbortSignal;
  onProgress?: (info: {
    loaded: number;
    total?: number;
    percent?: number;
  }) => void;
};

type MultipartUploadOptions = {
  signal?: AbortSignal;
  onProgressBytes?: (uploadedBytes: number) => void;
};

const joinUrl = (base: string, path: string): string => {
  const b = String(base || '').replace(/\/$/, '');
  const p = String(path || '');
  if (!b) return p;
  if (p.startsWith('/')) return `${b}${p}`;
  return `${b}/${p}`;
};

const fetchJson = async <T,>(
  url: string,
  init: RequestInit & { headers?: Record<string, string> },
  errorLabel: string
): Promise<T> => {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = '';
    try {
      const data = (await res.json()) as unknown;
      if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>;
        const maybeDetail = obj.detail ?? obj.message;
        if (typeof maybeDetail === 'string') detail = maybeDetail;
      }
    } catch {
      try {
        detail = await res.text();
      } catch {
        // ignore
      }
    }
    throw new Error(`${errorLabel}: ${res.status}${detail ? ` - ${detail}` : ''}`);
  }
  return (await res.json()) as T;
};

export const multipartUploadDataset = async (
  file: File,
  token: string,
  options?: MultipartUploadOptions
): Promise<MultipartCompleteResponse> => {
  const baseURL = String(apiClient.defaults.baseURL || '').replace(/\/$/, '');
  if (!baseURL) throw new Error('API base URL is not configured');
  const t = String(token || '').trim();
  if (!t) throw new Error('Access token is required');

  const initUrl = joinUrl(
    baseURL,
    `/engine/datasets/upload/multipart/init?filename=${encodeURIComponent(file.name)}&content_type=${encodeURIComponent(file.type || 'text/csv')}`
  );

  const authHeaders = { Authorization: `Bearer ${t}` };

  const initResp = await fetchJson<MultipartInitResponse>(
    initUrl,
    {
      method: 'POST',
      headers: authHeaders,
      signal: options?.signal,
    },
    'Multipart init failed'
  );

  const datasetId = String(initResp.dataset_id);
  const uploadId = String(initResp.upload_id);
  const partSize = Number.isFinite(initResp.part_size_bytes)
    ? Math.max(5 * 1024 * 1024, Number(initResp.part_size_bytes))
    : 16 * 1024 * 1024;

  if (!datasetId || !uploadId) throw new Error('Multipart init returned invalid dataset_id/upload_id');

  const totalBytes = file.size;
  const totalParts = Math.max(1, Math.ceil(totalBytes / partSize));
  let uploadedBytes = 0;
  options?.onProgressBytes?.(uploadedBytes);

  const parts: MultipartUploadedPart[] = [];

  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize, totalBytes);
    const chunk = file.slice(start, end);

    const presignUrl = joinUrl(
      baseURL,
      `/engine/datasets/upload/multipart/presign?dataset_id=${encodeURIComponent(datasetId)}&upload_id=${encodeURIComponent(uploadId)}&part_number=${encodeURIComponent(String(partNumber))}`
    );

    const presignResp = await fetchJson<MultipartPresignResponse>(
      presignUrl,
      {
        method: 'GET',
        headers: authHeaders,
        signal: options?.signal,
      },
      `Presign failed (part ${partNumber})`
    );

    const putRes = await fetch(presignResp.url, {
      method: 'PUT',
      body: chunk,
      signal: options?.signal,
    });

    if (!putRes.ok) {
      const text = await putRes.text().catch(() => '');
      throw new Error(
        `Part upload failed (part ${partNumber}): ${putRes.status}${text ? ` - ${text}` : ''}`
      );
    }

    const etagRaw = putRes.headers.get('etag') || '';
    const etag = etagRaw.replace(/^W\//, '').replace(/^"|"$/g, '').trim();
    if (!etag) throw new Error(`Missing ETag for part ${partNumber}`);

    parts.push({ part_number: partNumber, etag });
    uploadedBytes += chunk.size;
    options?.onProgressBytes?.(uploadedBytes);
  }

  const completeUrl = joinUrl(baseURL, `/engine/datasets/upload/multipart/complete?dataset_id=${encodeURIComponent(datasetId)}`);
  const body: MultipartCompleteRequest = {
    upload_id: uploadId,
    parts: [...parts].sort((a, b) => a.part_number - b.part_number),
  };

  const completeResp = await fetchJson<MultipartCompleteResponse>(
    completeUrl,
    {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    },
    'Multipart complete failed'
  );

  return completeResp;
};

type EngineDatasetPreviewResponse = {
  dataset_id: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  num_rows_returned: number;
};

type TrainedModelInfo = {
  job_id: string;
  status?: string | null;
  strategy?: string | null;
  experiment_name?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  dataset_id?: string | null;
  uploader_username?: string | null;
  original_filename?: string | null;
  model_s3_uri?: string | null;
  evaluation_metrics?: Record<string, unknown> | null;
};

type TrainedModelsResponse = {
  models: TrainedModelInfo[];
};

const normalizeEvaluationMetrics = (input: unknown): Record<string, unknown> | undefined => {
  if (!input) return undefined;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      return undefined;
    } catch {
      return undefined;
    }
  }
  if (input && typeof input === 'object' && !Array.isArray(input)) return input as Record<string, unknown>;
  return undefined;
};

type EngineTrainResponse = {
  job_id: string;
  result?: {
    status?: string | null;
  } | null;
};

type EngineRecommendResponse = {
  recommendations?: Array<{
    item_id: number | string;
    score: number | string;
  }>;
};

export type PredictionRecommendation = {
  item_id: number;
  score: number;
  rank?: number;
  strategy?: string;
  explanation?: Record<string, unknown>;
};

export type PredictionResponse = {
  job_id: string;
  dataset_id?: string;
  strategy?: string;
  required_fields?: string[];
  input_sample?: Record<string, unknown>;
  recommendations?: PredictionRecommendation[];
};

type PredictionRequest = {
  job_id: string;
  n: number;
  userId: string;
  movieId?: string;
  rating?: string;
  timestamp?: string;
  temporalFeatures?: string;
  spatialFeatures?: string;
  environmentalFeatures?: string;
  itemFeatures?: string;
};

const TRAINING_JOB_IDS_STORAGE_KEY = 'rs_training_job_ids';

const base64UrlDecode = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
};

const getTrackedJobStorageSuffix = (): string => {
  if (typeof window === 'undefined') return 'anonymous';
  const token = getAccessToken();
  if (!token) return 'anonymous';

  try {
    const parts = token.split('.');
    if (parts.length < 2) return 'anonymous';
    const payloadRaw = base64UrlDecode(parts[1]);
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    const subject = payload.sub;
    if (typeof subject === 'string' && subject.trim()) {
      return subject.trim();
    }
  } catch {
    // ignore
  }

  return 'anonymous';
};

const getTrackedJobStorageKey = (): string => {
  return `${TRAINING_JOB_IDS_STORAGE_KEY}:${getTrackedJobStorageSuffix()}`;
};

const getAllTrackedJobStorageKeys = (): string[] => {
  const keys = new Set<string>();
  keys.add(TRAINING_JOB_IDS_STORAGE_KEY);
  keys.add(getTrackedJobStorageKey());

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(`${TRAINING_JOB_IDS_STORAGE_KEY}:`)) {
          keys.add(key);
        }
      }
    } catch {
      // ignore
    }
  }

  return Array.from(keys);
};

const normalizeJobStatus = (status: unknown): string => {
  const s = String(status ?? '').trim().toLowerCase();
  if (!s) return '';
  if (['queued', 'queue', 'pending', 'pended'].includes(s)) return 'pending';
  if (['running', 'in_progress', 'in-progress', 'started', 'processing'].includes(s)) return 'running';
  if (['completed', 'complete', 'done', 'succeeded', 'success', 'finished'].includes(s)) return 'completed';
  if (['canceled', 'cancelled', 'aborted', 'stopped'].includes(s)) return 'canceled';
  if (['failed', 'failure', 'error', 'errored', 'exception'].includes(s)) return 'failed';
  return s;
};

const normalizeJobStateStatus = (status: unknown): TrainingJobState['status'] => {
  const s = String(status ?? '').trim().toLowerCase();
  if (!s) return null;
  if (['running', 'in_progress', 'in-progress', 'started', 'processing'].includes(s)) return 'running';
  if (['succeeded', 'completed', 'complete', 'done', 'success', 'finished'].includes(s)) return 'succeeded';
  if (['failed', 'failure', 'error', 'errored', 'exception'].includes(s)) return 'failed';
  if (['canceled', 'cancelled', 'aborted', 'stopped'].includes(s)) return 'canceled';
  return s;
};

const normalizeProgressStatus = (status: unknown): TrainingJobState['progress_status'] => {
  const s = String(status ?? '').trim().toLowerCase();
  if (!s) return null;
  if (['queued', 'queue', 'pending'].includes(s)) return 'queued';
  if (['running', 'in_progress', 'in-progress', 'started', 'processing'].includes(s)) return 'running';
  if (['completed', 'complete', 'done', 'finished', 'succeeded', 'success'].includes(s)) return 'completed';
  if (['failed', 'failure', 'error', 'errored', 'exception'].includes(s)) return 'failed';
  return s;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
};

const asStringValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
};

const asNumberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

const normalizeProgressPct = (value: unknown): number | undefined => {
  const n = asNumberValue(value);
  if (n === undefined) return undefined;
  const pct = n >= 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
};

const toTrainingJobState = (jobId: string, payload: unknown): TrainingJobState => {
  const top = asRecord(payload) || {};
  const state = asRecord(top.state) || asRecord(top.db) || top;
  const progress = asRecord(top.progress) || asRecord(state.progress);

  const rawStatus = state.status ?? top.status;
  const status = normalizeJobStateStatus(rawStatus);
  const progressStatus = normalizeProgressStatus(
    state.progress_status ?? progress?.status ?? top.progress_status
  );

  const epoch =
    asNumberValue(state.epoch) ??
    asNumberValue(state.current_epoch) ??
    asNumberValue(progress?.epoch) ??
    asNumberValue(progress?.current_epoch);

  const totalEpochs =
    asNumberValue(state.total_epochs) ??
    asNumberValue(state.num_epochs) ??
    asNumberValue(progress?.total_epochs) ??
    asNumberValue(progress?.num_epochs);

  const progressPct =
    normalizeProgressPct(state.progress_pct) ??
    normalizeProgressPct(progress?.progress_pct) ??
    normalizeProgressPct(progress?.percent) ??
    normalizeProgressPct(progress?.progress);

  const isTerminalValue = state.is_terminal ?? top.is_terminal;
  const isTerminal =
    typeof isTerminalValue === 'boolean'
      ? isTerminalValue
      : status === 'succeeded' || status === 'failed' || status === 'canceled';

  return {
    job_id: asStringValue(top.job_id) || asStringValue(state.job_id) || jobId,
    status,
    progress_status: progressStatus,
    stage: asStringValue(state.stage) || asStringValue(progress?.stage) || null,
    epoch,
    total_epochs: totalEpochs,
    progress_pct: progressPct,
    started_at: asStringValue(state.started_at),
    completed_at: asStringValue(state.completed_at),
    duration_seconds: asNumberValue(state.duration_seconds),
    is_terminal: isTerminal,
    error:
      asStringValue(state.error) ||
      asStringValue(state.error_message) ||
      asStringValue(top.error) ||
      asStringValue(top.error_message) ||
      null,
  };
};

const readTrackedJobIds = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const allIds: string[] = [];

    for (const key of getAllTrackedJobStorageKeys()) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) continue;
      for (const value of parsed) {
        const id = String(value).trim();
        if (id) allIds.push(id);
      }
    }

    return Array.from(new Set(allIds));
  } catch {
    return [];
  }
};

const writeTrackedJobIds = (ids: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    const normalized = Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean))).slice(0, 50);
    const serialized = JSON.stringify(normalized);
    window.localStorage.setItem(getTrackedJobStorageKey(), serialized);
    window.localStorage.setItem(TRAINING_JOB_IDS_STORAGE_KEY, serialized);
  } catch {
    // ignore
  }
};

const trackJobId = (id: string) => {
  if (typeof window === 'undefined') return;
  const trimmed = String(id).trim();
  if (!trimmed) return;
  const existing = readTrackedJobIds();
  const next = [trimmed, ...existing.filter((x) => x !== trimmed)].slice(0, 50);
  writeTrackedJobIds(next);
};

// Authentication APIs
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<TokenResponse> => {
    const response = await apiClient.post('/auth/login', {
      username: credentials.username,
      password: credentials.password,
    });
    return response.data;
  },

  register: async (data: RegisterData): Promise<User> => {
    const payload = {
      email: data.email,
      username: data.username,
      cellphone: data.cellphone,
      password: data.password,
    };
    const response = await apiClient.post('/auth/register', payload);
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  logout: (): void => {
    clearTokens();
  },
};

// Dataset APIs
export const datasetApi = {
  getAll: async (): Promise<Dataset[]> => {
    const response = await apiClient.get<UploadedDatasetsResponse>('/engine/datasets/db');
    const datasets = response.data?.datasets || [];

    return datasets.map((d) => {
      const columns = Array.isArray(d.columns) ? d.columns : [];
      return {
        id: String(d.dataset_id),
        name: String(d.original_filename || d.dataset_id),
        description: columns.length > 0 ? columns.join(', ') : '-',
        upload_date: String(d.created_at || new Date().toISOString()),
        row_count: typeof d.num_rows === 'number' ? d.num_rows : undefined,
        column_count: columns.length > 0 ? columns.length : undefined,
      };
    });
  },

  create: async (
    file: File,
    _name: string,
    _description: string,
    options?: DatasetCreateOptions
  ): Promise<Dataset> => {
    void _name;
    void _description;
    const response = await apiClient.post<EngineDatasetUploadResponse>(
      `/engine/datasets/upload?filename=${encodeURIComponent(file.name)}`,
      file,
      {
        headers: {
          'Content-Type': file.type || 'text/csv',
        },
        signal: options?.signal,
        onUploadProgress: (evt: AxiosProgressEvent) => {
          const loaded = typeof evt.loaded === 'number' ? evt.loaded : 0;
          const total = typeof evt.total === 'number' ? evt.total : undefined;
          const percent = total && total > 0 ? Math.round((loaded / total) * 100) : undefined;
          options?.onProgress?.({ loaded, total, percent });
        },
      }
    );
    const d = response.data;
    const columns = Array.isArray(d.columns) ? d.columns : [];
    return {
      id: String(d.dataset_id),
      name: file.name,
      description: '-',
      upload_date: new Date().toISOString(),
      row_count: typeof d.num_rows === 'number' ? d.num_rows : undefined,
      column_count: columns.length > 0 ? columns.length : undefined,
    };
  },

  delete: async (datasetId: string): Promise<void> => {
    const id = String(datasetId).trim();
    if (!id) throw new Error('dataset_id is required');
    await apiClient.delete(`/engine/datasets/${encodeURIComponent(id)}`);
  },

  getPreview: async (datasetId: string): Promise<EngineDatasetPreviewResponse> => {
    const id = String(datasetId).trim();
    if (!id) throw new Error('dataset_id is required');
    const response = await apiClient.get<EngineDatasetPreviewResponse>(
      `/engine/datasets/${encodeURIComponent(id)}/preview`
    );
    return response.data;
  },
};

// Training APIs
export const trainingApi = {
  trainAsync: async (datasetId: string): Promise<TrainingJob> => {
    const response = await apiClient.post<EngineTrainResponse>('/engine/train?async=true', {
      dataset_id: datasetId,
      num_epochs: 10,
    });

    const r = response.data;
    const jobId = String(r?.job_id || '').trim();
    if (!jobId) throw new Error('Training started but no job_id was returned by server.');
    trackJobId(jobId);
    return {
      id: jobId,
      dataset_id: String(datasetId),
      status: normalizeJobStatus(r.result?.status || 'running'),
      created_at: new Date().toISOString(),
    };
  },

  trainAuto: async (datasetId: string): Promise<TrainingJob> => {
    return trainingApi.trainAsync(datasetId);
  },

  trainEngine: async (datasetId: string): Promise<TrainingJob> => {
    return trainingApi.trainAsync(datasetId);
  },

  // Backward-compatible alias (older UI called this with a modelType that backend ignores).
  startTraining: async (datasetId: string, _modelType: string): Promise<TrainingJob> => {
    void _modelType;
    return trainingApi.trainAsync(datasetId);
  },

  getJobState: async (id: string): Promise<TrainingJobState> => {
    const jobId = String(id || '').trim();
    if (!jobId) throw new Error('job_id is required');
    const response = await apiClient.get(`/engine/jobs/${encodeURIComponent(jobId)}/state`);
    return toTrainingJobState(jobId, response.data);
  },

  getJobProgress: async (id: string): Promise<Record<string, unknown>> => {
    const jobId = String(id || '').trim();
    if (!jobId) throw new Error('job_id is required');
    const response = await apiClient.get(`/engine/jobs/${encodeURIComponent(jobId)}/progress`);
    const data = asRecord(response.data);
    return data || {};
  },

  getLatestRunningJobFromModels: async (): Promise<TrainingJob | null> => {
    const response = await apiClient.get<TrainedModelsResponse>('/engine/models/me');
    const models = response.data?.models || [];
    if (!models.length) return null;

    const getTime = (value?: string | null): number => {
      if (!value) return 0;
      const t = new Date(value).getTime();
      return Number.isFinite(t) ? t : 0;
    };

    const running = models
      .map((m) => ({
        id: String(m.job_id),
        dataset_id: m.dataset_id ? String(m.dataset_id) : undefined,
        model_type: m.strategy ? String(m.strategy) : undefined,
        status: normalizeJobStatus(m.status || ''),
        created_at: String(m.started_at || m.completed_at || ''),
        started_at: m.started_at ? String(m.started_at) : undefined,
        completed_at: m.completed_at ? String(m.completed_at) : undefined,
      }))
      .filter((m) => m.status === 'running')
      .sort((a, b) => getTime(b.started_at || b.created_at) - getTime(a.started_at || a.created_at));

    return running[0] || null;
  },

  getJobs: async (): Promise<TrainingJob[]> => {
    // Backend does not expose a dedicated jobs list; models/me lists engine_jobs.
    const response = await apiClient.get<TrainedModelsResponse>('/engine/models/me');
    const models = response.data?.models || [];
    const fromModels = models.map((m) => ({
      id: String(m.job_id),
      dataset_id: m.dataset_id ? String(m.dataset_id) : undefined,
      model_type: m.strategy ? String(m.strategy) : undefined,
      status: normalizeJobStatus(m.status || ''),
      created_at: String(m.started_at || m.completed_at || ''),
      started_at: m.started_at ? String(m.started_at) : undefined,
      completed_at: m.completed_at ? String(m.completed_at) : undefined,
    }));

    // Also include and revalidate jobs the user started from the UI (so running jobs stay accurate).
    const trackedIds = readTrackedJobIds();
    const idsToProbe = trackedIds.slice(0, 20);

    const extraJobs = await Promise.all(
      idsToProbe.map(async (id) => {
        try {
          return await trainingApi.getJobById(id);
        } catch {
          return null;
        }
      })
    );

    const resolvedExtras = extraJobs.filter(Boolean) as TrainingJob[];
    const resolvedExtraIds = new Set(resolvedExtras.map((j) => j.id));
    const unresolvedTrackedIds = idsToProbe.filter((id) => !resolvedExtraIds.has(id));

    const pendingFromTracked: TrainingJob[] = unresolvedTrackedIds.map((id) => ({
      id,
      status: 'pending',
      created_at: undefined,
    }));

    const byId = new Map<string, TrainingJob>();
    for (const job of fromModels) {
      byId.set(job.id, job);
    }
    for (const job of resolvedExtras) {
      byId.set(job.id, job);
    }
    for (const job of pendingFromTracked) {
      if (!byId.has(job.id)) byId.set(job.id, job);
    }

    // Prune tracked ids that are no longer active.
    if (typeof window !== 'undefined') {
      const mergedJobs = Array.from(byId.values());
      const stillActive = mergedJobs
        .filter((j) => j.status === 'pending' || j.status === 'running')
        .map((j) => j.id);
      const keep = [...stillActive, ...unresolvedTrackedIds].slice(0, 50);
      writeTrackedJobIds(Array.from(new Set(keep)));
    }

    const merged = Array.from(byId.values());
    return merged;
  },

  getJobById: async (id: string): Promise<TrainingJob> => {
    const response = await apiClient.get(`/engine/jobs/${encodeURIComponent(id)}`);
    const db = response.data?.db || {};
    return {
      id: String(response.data?.job_id || id),
      status: normalizeJobStatus(db.status || ''),
      created_at: db.created_at ? String(db.created_at) : undefined,
      started_at: db.started_at ? String(db.started_at) : undefined,
      completed_at: db.completed_at ? String(db.completed_at) : undefined,
    };
  },

  cancelJob: async (jobId: string): Promise<void> => {
    const id = String(jobId || '').trim();
    if (!id) throw new Error('job_id is required');

    const encodedId = encodeURIComponent(id);
    const attempts: Array<() => Promise<unknown>> = [
      () => apiClient.post(`/engine/jobs/${encodedId}/cancel`),
      () => apiClient.post(`/engine/jobs/${encodedId}/cancel/`),
      () => apiClient.post(`/training/jobs/${encodedId}/cancel`),
      () => apiClient.post(`/training/jobs/${encodedId}/cancel/`),
      () => apiClient.delete(`/engine/jobs/${encodedId}`),
    ];

    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        await attempt();
        return;
      } catch (err: unknown) {
        const statusCode =
          typeof err === 'object' && err && 'response' in err
            ? ((err as { response?: { status?: number } }).response?.status ?? 0)
            : 0;

        // Try next endpoint only when route is missing/method mismatch.
        if (![404, 405].includes(statusCode)) {
          throw err;
        }
        lastError = err;
      }
    }

    throw lastError || new Error('Cancel job endpoint is not available.');
  },
};

// Model APIs
export const modelApi = {
  getAll: async (): Promise<Model[]> => {
    const response = await apiClient.get<TrainedModelsResponse>('/engine/models/me');
    const models = response.data?.models || [];
    return models.map((m) => ({
      id: String(m.job_id),
      name: String(m.experiment_name || m.original_filename || m.job_id),
      model_type: String(m.strategy || 'engine'),
      created_at: m.started_at ? String(m.started_at) : undefined,
      dataset_id: m.dataset_id ? String(m.dataset_id) : undefined,
      uploader_username: m.uploader_username ? String(m.uploader_username) : undefined,
      original_filename: m.original_filename ? String(m.original_filename) : undefined,
      model_s3_uri: m.model_s3_uri ? String(m.model_s3_uri) : undefined,
      metrics: normalizeEvaluationMetrics(m.evaluation_metrics),
    }));
  },

  getById: async (id: string): Promise<Model> => {
    const response = await apiClient.get(`/engine/jobs/${encodeURIComponent(id)}`);
    const summary = response.data?.summary || {};
    return {
      id: String(response.data?.job_id || id),
      name: String(summary.experiment_name || id),
      model_type: String(summary.strategy || 'engine'),
      created_at: undefined,
    };
  },

  delete: async (jobId: string): Promise<void> => {
    const id = String(jobId).trim();
    if (!id) throw new Error('job_id is required');
    await apiClient.delete(`/engine/models/${encodeURIComponent(id)}`);
  },
};

// Recommendation APIs
export const recommendationApi = {
  getRecommendations: async (request: RecommendationRequest): Promise<Recommendation[]> => {
    const topK = request.top_k ?? 10;
    const response = await apiClient.get<EngineRecommendResponse>(
      `/engine/jobs/${encodeURIComponent(request.job_id)}/recommend`,
      {
        params: {
          user_id: request.user_id,
          top_k: topK,
        },
      }
    );

    const items = response.data?.recommendations || [];
    return items.map((r) => ({
      item_id: Number(r.item_id),
      score: Number(r.score),
    }));
  },
  getPrediction: async (request: PredictionRequest): Promise<PredictionResponse> => {
    const response = await apiClient.get<PredictionResponse>(
      `/engine/jobs/${encodeURIComponent(request.job_id)}/prediction`,
      {
        params: {
          n: request.n,
          userId: request.userId,
          movieId: request.movieId,
          rating: request.rating,
          timestamp: request.timestamp,
          temporalFeatures: request.temporalFeatures,
          spatialFeatures: request.spatialFeatures,
          environmentalFeatures: request.environmentalFeatures,
          itemFeatures: request.itemFeatures,
        },
      }
    );

    return response.data;
  },
};

export { setTokens };

import { apiClient, setTokens, clearTokens } from './client';
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

const TRAINING_JOB_IDS_STORAGE_KEY = 'rs_training_job_ids';

const normalizeJobStatus = (status: unknown): string => {
  const s = String(status ?? '').trim().toLowerCase();
  if (!s) return '';
  if (['queued', 'queue', 'pending', 'pended'].includes(s)) return 'pending';
  if (['running', 'in_progress', 'in-progress', 'started', 'processing'].includes(s)) return 'running';
  if (['completed', 'complete', 'done', 'succeeded', 'success', 'finished'].includes(s)) return 'completed';
  if (['failed', 'failure', 'error', 'errored', 'exception'].includes(s)) return 'failed';
  return s;
};

const readTrackedJobIds = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TRAINING_JOB_IDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => String(v)).filter(Boolean);
  } catch {
    return [];
  }
};

const writeTrackedJobIds = (ids: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TRAINING_JOB_IDS_STORAGE_KEY, JSON.stringify(ids));
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
  trainAuto: async (datasetId: string): Promise<TrainingJob> => {
    // Backend supports dataset_id + num_epochs (ADMIN-only).
    const response = await apiClient.post<EngineTrainResponse>('/engine/train/auto', {
      dataset_id: datasetId,
      num_epochs: 10,
    });

    const r = response.data;
    if (r?.job_id) trackJobId(String(r.job_id));
    return {
      id: String(r.job_id),
      dataset_id: String(datasetId),
      status: normalizeJobStatus(r.result?.status || 'queued'),
      created_at: new Date().toISOString(),
    };
  },

  trainEngine: async (datasetId: string): Promise<TrainingJob> => {
    // Backend supports dataset_id + num_epochs (ADMIN-only).
    const response = await apiClient.post<EngineTrainResponse>('/engine/train', {
      dataset_id: datasetId,
      num_epochs: 10,
    });

    const r = response.data;
    if (r?.job_id) trackJobId(String(r.job_id));
    return {
      id: String(r.job_id),
      dataset_id: String(datasetId),
      status: normalizeJobStatus(r.result?.status || 'queued'),
      created_at: new Date().toISOString(),
    };
  },

  // Backward-compatible alias (older UI called this with a modelType that backend ignores).
  startTraining: async (datasetId: string, _modelType: string): Promise<TrainingJob> => {
    void _modelType;
    return trainingApi.trainEngine(datasetId);
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

    // Also include any jobs the user started from the UI (so running jobs show up).
    const trackedIds = readTrackedJobIds();
    const existingIds = new Set(fromModels.map((j) => j.id));
    const missingIds = trackedIds.filter((id) => !existingIds.has(id)).slice(0, 20);

    const extraJobs = await Promise.all(
      missingIds.map(async (id) => {
        try {
          return await trainingApi.getJobById(id);
        } catch {
          return null;
        }
      })
    );

    // Prune tracked ids that are no longer active.
    const resolvedExtras = extraJobs.filter(Boolean) as TrainingJob[];
    if (typeof window !== 'undefined') {
      const stillActive = resolvedExtras
        .filter((j) => j.status === 'pending' || j.status === 'running')
        .map((j) => j.id);
      const keep = [...stillActive, ...trackedIds.filter((id) => existingIds.has(id))].slice(0, 50);
      writeTrackedJobIds(Array.from(new Set(keep)));
    }

    const merged = [...resolvedExtras, ...fromModels] as TrainingJob[];
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

  cancelJob: async (): Promise<void> => {
    throw new Error('Cancel job is not supported by the backend API.');
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
};

export { setTokens };

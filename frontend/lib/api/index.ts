import { apiClient, setTokens, clearTokens, getAccessToken } from './client';
import type { AxiosProgressEvent } from 'axios';
import {
  LoginCredentials,
  RegisterData,
  TokenResponse,
  User,
  Dataset,
  DatasetAnalysis,
  DatasetAnalyzeOverrides,
  TrainingJob,
  TrainingStartOptions,
  Model,
  Recommendation,
  RecommendationRequest,
  ScenarioPredictionRequest,
  ScenarioPredictionResponse,
  ActionCandidate,
  InferenceProfile,
  TrainingJobState,
  TrainingJobProgressStream,
  TrainingJobEpochStream,
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
  headers?: Record<string, string>;
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
      headers: presignResp.headers ?? {},
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

type EngineDatasetAnalyzeResponse = {
  dataset_id: string;
  columns?: string[] | null;
  detected_strategy?: string | null;
  task_type?: string | null;
  confidence?: number | null;
  warnings?: string[] | null;
  feasible_for_training?: boolean | null;
  num_rows_sampled?: number | null;
  mapping?: Record<string, unknown> | null;
  training_payload?: Record<string, unknown> | null;
};

type TrainedModelInfo = {
  job_id: string;
  status?: string | null;
  strategy?: string | null;
  experiment_name?: string | null;
  model_dir?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number | null;
  dataset_id?: string | null;
  uploader_user_id?: number | null;
  uploader_username?: string | null;
  original_filename?: string | null;
  model_s3_uri?: string | null;
  evaluation_metrics?: Record<string, unknown> | null;
  config?: Record<string, unknown> | null;
  dataset_metadata?: Record<string, unknown> | null;
  task_type?: string | null;
  inference_profile?: Record<string, unknown> | null;
};

type TrainedModelsResponse = {
  models: TrainedModelInfo[];
};

type AvailableModelInfo = {
  job_id: string;
  strategy?: string | null;
  experiment_name?: string | null;
  completed_at?: string | null;
  evaluation_metrics?: Record<string, unknown> | null;
  dataset_display_name?: string | null;
  dataset_id?: string | null;
  task_type?: string | null;
  inference_profile?: Record<string, unknown> | null;
};

type AvailableModelsResponse = {
  models: AvailableModelInfo[];
};

type JobDetailResponse = {
  job_id?: string;
  inference_profile?: Record<string, unknown> | null;
  summary?: {
    experiment_name?: string | null;
    strategy?: string | null;
    status?: string | null;
    completed_at?: string | null;
    dataset_id?: string | null;
    task_type?: string | null;
    evaluation_metrics?: Record<string, unknown> | null;
    inference_profile?: Record<string, unknown> | null;
  } | null;
  db?: {
    status?: string | null;
    completed_at?: string | null;
    dataset_id?: string | null;
  } | null;
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
    duration_seconds?: number | null;
    completed_at?: string | null;
  } | null;
};

type EngineRecommendResponse = {
  job_id?: string;
  recommendations?: Array<{
    item_id: number | string;
    movie_name?: string | null;
    score: number | string;
    rank?: number | null;
    strategy?: string | null;
    explanation?: Record<string, unknown> | null;
  }>;
};

type EnginePredictionResponse = {
  job_id: string;
  dataset_id: string;
  strategy: string;
  task_type?: string | null;
  required_fields?: string[] | null;
  input_sample?: Record<string, unknown> | null;
  recommended_action?: string | null;
  action_candidates?: Array<Record<string, unknown>> | null;
  effectiveness_estimate?: number | null;
  recommendations?: Array<{
    item_id: number | string;
    movie_name?: string | null;
    score: number | string;
    rank?: number | null;
    strategy?: string | null;
    explanation?: Record<string, unknown> | null;
  }> | null;
};

type ModelListScope = 'available' | 'admin';

type EngineJobProgressResponse = {
  job_id: string;
  latest?: Record<string, unknown> | null;
  events?: Array<Record<string, unknown>>;
  total_events?: number;
  eta_seconds?: number | null;
  estimated_completion_at?: string | null;
};

type EngineJobEpochsResponse = {
  job_id: string;
  status?: string | null;
  stage?: string | null;
  current_epoch?: number | null;
  total_epochs?: number | null;
  epoch_text?: string | null;
  progress_pct?: number | null;
  eta_seconds?: number | null;
  estimated_completion_at?: string | null;
  events?: Array<Record<string, unknown>>;
  total_events?: number;
};

type EngineJobStateResponse = {
  job_id: string;
  status?: string | null;
  progress_status?: string | null;
  stage?: string | null;
  epoch?: number | null;
  total_epochs?: number | null;
  epoch_text?: string | null;
  progress_pct?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number | null;
  eta_seconds?: number | null;
  estimated_completion_at?: string | null;
  is_terminal?: boolean;
  error?: string | null;
  latest?: Record<string, unknown> | null;
};

const normalizeJobState = (input: EngineJobStateResponse): TrainingJobState => ({
  job_id: String(input.job_id),
  status: stringOrUndefined(input.status) ?? stringOrUndefined(input.progress_status),
  progress_status: stringOrUndefined(input.progress_status),
  stage: stringOrUndefined(input.stage),
  epoch: numberOrUndefined(input.epoch),
  total_epochs: numberOrUndefined(input.total_epochs),
  epoch_text: stringOrUndefined(input.epoch_text),
  progress_pct: numberOrUndefined(input.progress_pct),
  started_at: stringOrUndefined(input.started_at),
  completed_at: stringOrUndefined(input.completed_at),
  duration_seconds: numberOrUndefined(input.duration_seconds),
  eta_seconds: numberOrUndefined(input.eta_seconds),
  estimated_completion_at: stringOrUndefined(input.estimated_completion_at),
  is_terminal: typeof input.is_terminal === 'boolean' ? input.is_terminal : undefined,
  error: stringOrUndefined(input.error),
  latest: input.latest && typeof input.latest === 'object' ? input.latest : null,
});

const normalizeJobProgressStream = (input: EngineJobProgressResponse): TrainingJobProgressStream => ({
  job_id: String(input.job_id),
  latest: input.latest && typeof input.latest === 'object' ? input.latest : null,
  events: Array.isArray(input.events) ? input.events.filter((v) => v && typeof v === 'object') as Array<Record<string, unknown>> : [],
  total_events: numberOrUndefined(input.total_events),
  eta_seconds: numberOrUndefined(input.eta_seconds),
  estimated_completion_at: stringOrUndefined(input.estimated_completion_at),
});

const normalizeJobEpochStream = (input: EngineJobEpochsResponse): TrainingJobEpochStream => ({
  job_id: String(input.job_id),
  status: stringOrUndefined(input.status),
  stage: stringOrUndefined(input.stage),
  current_epoch: numberOrUndefined(input.current_epoch),
  total_epochs: numberOrUndefined(input.total_epochs),
  epoch_text: stringOrUndefined(input.epoch_text),
  progress_pct: numberOrUndefined(input.progress_pct),
  eta_seconds: numberOrUndefined(input.eta_seconds),
  estimated_completion_at: stringOrUndefined(input.estimated_completion_at),
  events: Array.isArray(input.events) ? input.events.filter((v) => v && typeof v === 'object') as Array<Record<string, unknown>> : [],
  total_events: numberOrUndefined(input.total_events),
});

const TRAINING_JOB_IDS_STORAGE_KEY = 'rs_training_job_ids';

const normalizeJobStatus = (status: unknown): string => {
  const s = String(status ?? '').trim().toLowerCase();
  if (!s) return '';
  if (['queued', 'queue', 'pending', 'pended'].includes(s)) return 'pending';
  if (['running', 'in_progress', 'in-progress', 'started', 'processing'].includes(s)) return 'running';
  if (['completed', 'complete', 'done', 'succeeded', 'success', 'finished'].includes(s)) return 'completed';
  if (['canceled', 'cancelled', 'cancel'].includes(s)) return 'canceled';
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

const isEndpointUnavailable = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 404 || status === 405;
};

const getErrorStatus = (error: unknown): number | undefined => {
  return (error as { response?: { status?: number } })?.response?.status;
};

const isRedisUnavailable = (error: unknown): boolean => getErrorStatus(error) === 503;

const numberOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const stringOrUndefined = (value: unknown): string | undefined => {
  const v = String(value ?? '').trim();
  return v || undefined;
};

const arrayOfStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
};

const recordOrEmpty = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const normalizeInferenceProfile = (value: unknown): InferenceProfile | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const profile = value as Record<string, unknown>;
  const supportedPresets = arrayOfStrings(profile.supported_presets);
  const sampleFields = arrayOfStrings(profile.sample_fields);
  const requiredSampleFields = arrayOfStrings(profile.required_sample_fields);
  const datasetFamily = stringOrUndefined(profile.dataset_family);
  const recommendedPreset = stringOrUndefined(profile.recommended_preset);
  const taskType = stringOrUndefined(profile.task_type);
  const strategy = stringOrUndefined(profile.strategy);

  if (
    !datasetFamily &&
    !recommendedPreset &&
    !taskType &&
    !strategy &&
    supportedPresets.length === 0 &&
    sampleFields.length === 0 &&
    requiredSampleFields.length === 0
  ) {
    return undefined;
  }

  return {
    dataset_family: datasetFamily,
    recommended_preset: recommendedPreset,
    supported_presets: supportedPresets,
    task_type: taskType,
    strategy,
    sample_fields: sampleFields,
    required_sample_fields: requiredSampleFields,
  };
};

const normalizeRecommendation = (input: {
  item_id: string | number;
  movie_name?: string | null;
  score: string | number;
  rank?: number | null;
  strategy?: string | null;
  explanation?: Record<string, unknown> | null;
}): Recommendation => ({
  item_id: typeof input.item_id === 'number' ? input.item_id : String(input.item_id),
  movie_name: typeof input.movie_name === 'string' ? input.movie_name : input.movie_name ?? undefined,
  score: Number(input.score),
  rank: typeof input.rank === 'number' ? input.rank : undefined,
  strategy: input.strategy ? String(input.strategy) : undefined,
  explanation: input.explanation ?? undefined,
});

const normalizeActionCandidates = (value: unknown): ActionCandidate[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const row = recordOrEmpty(entry);
      const action = stringOrUndefined(row.action);
      const meanEffectiveness = numberOrUndefined(row.mean_effectiveness);
      const score = numberOrUndefined(row.score) ?? meanEffectiveness;
      const rank = numberOrUndefined(row.rank);
      if (!action || score === undefined || rank === undefined) return null;
      return {
        action,
        score,
        rank,
        support: numberOrUndefined(row.support),
        mean_effectiveness: meanEffectiveness,
      };
    })
    .filter(Boolean) as ActionCandidate[];
};

const normalizeDatasetAnalysis = (input: EngineDatasetAnalyzeResponse): DatasetAnalysis => ({
  dataset_id: String(input.dataset_id),
  columns: arrayOfStrings(input.columns),
  detected_strategy: String(input.detected_strategy || ''),
  task_type: String(input.task_type || ''),
  confidence: numberOrUndefined(input.confidence) ?? 0,
  warnings: arrayOfStrings(input.warnings),
  feasible_for_training: Boolean(input.feasible_for_training),
  num_rows_sampled: numberOrUndefined(input.num_rows_sampled) ?? 0,
  mapping: recordOrEmpty(input.mapping),
  training_payload: recordOrEmpty(input.training_payload),
});

const normalizeTrainingJob = (
  input: Partial<TrainingJob> & {
    id: string;
    status?: string;
  }
): TrainingJob => ({
  id: String(input.id),
  dataset_id: input.dataset_id ? String(input.dataset_id) : undefined,
  model_type: input.model_type ? String(input.model_type) : undefined,
  status: normalizeJobStatus(input.status || ''),
  created_at: input.created_at,
  started_at: input.started_at,
  completed_at: input.completed_at,
  estimated_completion_at: input.estimated_completion_at,
  duration_seconds: input.duration_seconds,
  eta_seconds: input.eta_seconds,
  progress: input.progress,
  error_message: input.error_message,
});

const mergeTrainingJob = (base: TrainingJob, patch: Partial<TrainingJob>): TrainingJob =>
  normalizeTrainingJob({
    ...base,
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
  });

const normalizeProgressPatch = (
  response: EngineJobProgressResponse | EngineJobEpochsResponse | EngineJobStateResponse
): Partial<TrainingJob> => {
  const source = response as Record<string, unknown>;
  const latest = (source.latest && typeof source.latest === 'object' ? source.latest : null) as Record<string, unknown> | null;

  return {
    status: stringOrUndefined(source.status) || stringOrUndefined(source.progress_status),
    progress:
      numberOrUndefined(source.progress_pct) ??
      numberOrUndefined(latest?.progress_pct) ??
      numberOrUndefined(latest?.progress) ??
      numberOrUndefined(latest?.percent),
    started_at: stringOrUndefined(source.started_at),
    completed_at: stringOrUndefined(source.completed_at),
    duration_seconds: numberOrUndefined(source.duration_seconds),
    eta_seconds: numberOrUndefined(source.eta_seconds) ?? numberOrUndefined(latest?.eta_seconds),
    estimated_completion_at:
      stringOrUndefined(source.estimated_completion_at) ?? stringOrUndefined(latest?.estimated_completion_at),
    error_message: stringOrUndefined(source.error),
  };
};

const fetchJobRuntimePatch = async (id: string): Promise<Partial<TrainingJob>> => {
  const patches: Array<Partial<TrainingJob>> = [];

  try {
    const response = await apiClient.get<EngineJobEpochsResponse>(`/engine/train/${encodeURIComponent(id)}/epochs`);
    patches.push(normalizeProgressPatch(response.data));
  } catch (error) {
    if (isRedisUnavailable(error)) {
      const state = await apiClient.get<EngineJobStateResponse>(`/engine/jobs/${encodeURIComponent(id)}/state`);
      return normalizeProgressPatch(state.data);
    }
    if (!isEndpointUnavailable(error)) throw error;
  }

  try {
    const response = await apiClient.get<EngineJobProgressResponse>(`/engine/jobs/${encodeURIComponent(id)}/progress`);
    patches.push(normalizeProgressPatch(response.data));
  } catch (error) {
    if (isRedisUnavailable(error)) {
      const state = await apiClient.get<EngineJobStateResponse>(`/engine/jobs/${encodeURIComponent(id)}/state`);
      return normalizeProgressPatch(state.data);
    }
    if (!isEndpointUnavailable(error)) throw error;
  }

  // State is the final source of truth for terminal status and self-heal reconciliation.
  const state = await apiClient.get<EngineJobStateResponse>(`/engine/jobs/${encodeURIComponent(id)}/state`);
  patches.push(normalizeProgressPatch(state.data));

  return patches.reduce<Partial<TrainingJob>>(
    (merged, patch) => ({
      ...merged,
      ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
    }),
    {}
  );
};

const fetchTrainingInventory = async (): Promise<TrainedModelInfo[]> => {
  try {
    const response = await apiClient.get<TrainedModelsResponse>('/admin/models');
    return response.data?.models || [];
  } catch (error) {
    if (!isEndpointUnavailable(error) && getErrorStatus(error) !== 403) throw error;
  }

  try {
    const response = await apiClient.get<TrainedModelsResponse>('/engine/models');
    return response.data?.models || [];
  } catch (error) {
    if (!isEndpointUnavailable(error) && getErrorStatus(error) !== 403) throw error;
  }

  const fallback = await apiClient.get<TrainedModelsResponse>('/engine/models/me');
  return fallback.data?.models || [];
};

const toModelName = (parts: Array<unknown>, fallback: string): string => {
  for (const part of parts) {
    const value = String(part ?? '').trim();
    if (value) return value;
  }
  return fallback;
};

const normalizeAvailableModel = (model: AvailableModelInfo): Model => ({
  id: String(model.job_id),
  name: toModelName([model.experiment_name, model.dataset_display_name, model.job_id], String(model.job_id)),
  model_type: String(model.strategy || 'engine'),
  status: 'completed',
  created_at: model.completed_at ? String(model.completed_at) : undefined,
  completed_at: model.completed_at ? String(model.completed_at) : undefined,
  dataset_id: model.dataset_id ? String(model.dataset_id) : undefined,
  dataset_display_name: model.dataset_display_name ? String(model.dataset_display_name) : undefined,
  task_type: stringOrUndefined(model.task_type),
  inference_profile: normalizeInferenceProfile(model.inference_profile),
  metrics: normalizeEvaluationMetrics(model.evaluation_metrics),
  is_available: true,
  can_delete: false,
});

const normalizeTrainedModel = (model: TrainedModelInfo, scope: ModelListScope): Model => {
  const status = normalizeJobStatus(model.status || '');
  const isAvailable = scope === 'available' ? status === 'completed' || !status : true;

  return {
    id: String(model.job_id),
    name: toModelName(
      [model.experiment_name, model.original_filename, model.dataset_metadata?.dataset_display_name, model.job_id],
      String(model.job_id)
    ),
    model_type: String(model.strategy || 'engine'),
    status,
    created_at: model.started_at ? String(model.started_at) : model.completed_at ? String(model.completed_at) : undefined,
    completed_at: model.completed_at ? String(model.completed_at) : undefined,
    dataset_id: model.dataset_id ? String(model.dataset_id) : undefined,
    dataset_display_name:
      typeof model.dataset_metadata?.dataset_display_name === 'string'
        ? model.dataset_metadata.dataset_display_name
        : model.original_filename
          ? String(model.original_filename)
          : undefined,
    uploader_username: model.uploader_username ? String(model.uploader_username) : undefined,
    original_filename: model.original_filename ? String(model.original_filename) : undefined,
    model_s3_uri: model.model_s3_uri ? String(model.model_s3_uri) : undefined,
    task_type: stringOrUndefined(model.task_type),
    inference_profile: normalizeInferenceProfile(model.inference_profile),
    metrics: normalizeEvaluationMetrics(model.evaluation_metrics),
    is_available: isAvailable,
    can_delete: scope === 'admin',
  };
};

const fetchAvailableModels = async (): Promise<Model[]> => {
  try {
    const response = await apiClient.get<AvailableModelsResponse>('/models/available');
    const models = response.data?.models || [];
    return models.map(normalizeAvailableModel);
  } catch (error) {
    if (!isEndpointUnavailable(error)) throw error;
    const fallback = await apiClient.get<TrainedModelsResponse>('/engine/models/me');
    const models = fallback.data?.models || [];
    return models
      .map((model) => normalizeTrainedModel(model, 'available'))
      .filter((model) => model.is_available);
  }
};

const fetchAdminModels = async (): Promise<Model[]> => {
  try {
    const response = await apiClient.get<TrainedModelsResponse>('/admin/models');
    const models = response.data?.models || [];
    return models.map((model) => normalizeTrainedModel(model, 'admin'));
  } catch (error) {
    if (!isEndpointUnavailable(error)) throw error;
  }

  try {
    const response = await apiClient.get<TrainedModelsResponse>('/engine/models');
    const models = response.data?.models || [];
    return models.map((model) => normalizeTrainedModel(model, 'admin'));
  } catch (error) {
    if (!isEndpointUnavailable(error)) throw error;
  }

  const fallback = await apiClient.get<TrainedModelsResponse>('/engine/models/me');
  const models = fallback.data?.models || [];
  return models.map((model) => normalizeTrainedModel(model, 'admin'));
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

  register: async (_data: RegisterData): Promise<User> => {
    void _data;
    throw new Error('Public registration is disabled. Only admins can create users.');
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  logout: async (): Promise<void> => {
    const token = getAccessToken();
    try {
      if (token) {
        await apiClient.post('/auth/logout', { token });
      }
    } finally {
      clearTokens();
    }
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

  analyze: async (datasetId: string, overrides: DatasetAnalyzeOverrides = {}): Promise<DatasetAnalysis> => {
    const id = String(datasetId).trim();
    if (!id) throw new Error('dataset_id is required');
    const response = await apiClient.post<EngineDatasetAnalyzeResponse>(
      `/engine/datasets/${encodeURIComponent(id)}/analyze`,
      overrides
    );
    return normalizeDatasetAnalysis(response.data);
  },

  download: async (datasetId: string, suggestedFilename?: string): Promise<void> => {
    const id = String(datasetId).trim();
    if (!id) throw new Error('dataset_id is required');

    const response = await apiClient.get(
      `/engine/datasets/download?dataset_id=${encodeURIComponent(id)}`,
      { responseType: 'blob' }
    );

    const blob = response.data as Blob;
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = suggestedFilename || `dataset-${id}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  },
};

// Training APIs
export const trainingApi = {
  trainAuto: async (
    datasetId: string,
    options: {
      persist_job_to_postgres?: boolean;
      persist_vectors_to_postgres?: boolean;
    } = {}
  ): Promise<TrainingJob> => {
    const response = await apiClient.post<EngineTrainResponse>('/engine/train/auto', {
      dataset_id: datasetId,
      persist_job_to_postgres: options.persist_job_to_postgres ?? undefined,
      persist_vectors_to_postgres: options.persist_vectors_to_postgres ?? undefined,
    });

    const r = response.data;
    if (r?.job_id) trackJobId(String(r.job_id));
    return normalizeTrainingJob({
      id: String(r.job_id),
      dataset_id: String(datasetId),
      status: normalizeJobStatus(r.result?.status || 'queued'),
      created_at: new Date().toISOString(),
      completed_at: r.result?.completed_at ? String(r.result.completed_at) : undefined,
      duration_seconds: numberOrUndefined(r.result?.duration_seconds),
    });
  },

  trainEngine: async (datasetId: string, numEpochs: number, options: TrainingStartOptions = {}): Promise<TrainingJob> => {
    const normalizedEpochs = Math.trunc(numEpochs);
    if (!Number.isFinite(normalizedEpochs) || normalizedEpochs < 1) throw new Error('num_epochs must be >= 1');
    const epochs = normalizedEpochs;

    const response = await apiClient.post<EngineTrainResponse>('/engine/train', {
      dataset_id: datasetId,
      num_epochs: epochs,
      strategy: stringOrUndefined(options.strategy),
      user_column: stringOrUndefined(options.user_column),
      item_column: stringOrUndefined(options.item_column),
      rating_column: stringOrUndefined(options.rating_column),
      temporal_columns: options.temporal_columns ?? [],
      spatial_columns: options.spatial_columns ?? [],
      environmental_columns: options.environmental_columns ?? [],
      max_rows: numberOrUndefined(options.max_rows),
    });

    const r = response.data;
    if (r?.job_id) trackJobId(String(r.job_id));
    return normalizeTrainingJob({
      id: String(r.job_id),
      dataset_id: String(datasetId),
      status: normalizeJobStatus(r.result?.status || 'queued'),
      created_at: new Date().toISOString(),
      completed_at: r.result?.completed_at ? String(r.result.completed_at) : undefined,
      duration_seconds: numberOrUndefined(r.result?.duration_seconds),
    });
  },

  // Backward-compatible alias (older UI called this with a modelType that backend ignores).
  startTraining: async (datasetId: string, _modelType: string, numEpochs = 10): Promise<TrainingJob> => {
    void _modelType;
    return trainingApi.trainEngine(datasetId, numEpochs);
  },

  getJobs: async (): Promise<TrainingJob[]> => {
    const models = await fetchTrainingInventory();
    const fromModels = models.map((m) => normalizeTrainingJob({
      id: String(m.job_id),
      dataset_id: m.dataset_id ? String(m.dataset_id) : undefined,
      model_type: m.strategy ? String(m.strategy) : undefined,
      status: normalizeJobStatus(m.status || ''),
      created_at: String(m.started_at || m.completed_at || ''),
      started_at: m.started_at ? String(m.started_at) : undefined,
      completed_at: m.completed_at ? String(m.completed_at) : undefined,
      duration_seconds: numberOrUndefined(m.duration_seconds),
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
    const hydrated = await Promise.all(
      merged.map(async (job) => {
        try {
          const patch = await fetchJobRuntimePatch(job.id);
          return mergeTrainingJob(job, patch);
        } catch {
          return job;
        }
      })
    );
    return hydrated;
  },

  getJobById: async (id: string): Promise<TrainingJob> => {
    const response = await apiClient.get(`/engine/jobs/${encodeURIComponent(id)}`);
    const db = response.data?.db || {};
    const base = normalizeTrainingJob({
      id: String(response.data?.job_id || id),
      status: normalizeJobStatus(db.status || ''),
      created_at: db.created_at ? String(db.created_at) : undefined,
      started_at: db.started_at ? String(db.started_at) : undefined,
      completed_at: db.completed_at ? String(db.completed_at) : undefined,
      duration_seconds: numberOrUndefined(db.duration_seconds),
      error_message: stringOrUndefined(db.error),
    });
    try {
      const patch = await fetchJobRuntimePatch(id);
      return mergeTrainingJob(base, patch);
    } catch {
      return base;
    }
  },

  getJobState: async (id: string): Promise<TrainingJobState> => {
    const response = await apiClient.get<EngineJobStateResponse>(`/engine/jobs/${encodeURIComponent(id)}/state`);
    return normalizeJobState(response.data);
  },

  getJobProgressStream: async (id: string, tail = 100): Promise<TrainingJobProgressStream> => {
    const response = await apiClient.get<EngineJobProgressResponse>(
      `/engine/jobs/${encodeURIComponent(id)}/progress`,
      { params: { tail } }
    );
    return normalizeJobProgressStream(response.data);
  },

  getJobEpochStream: async (id: string, tail = 100): Promise<TrainingJobEpochStream> => {
    const response = await apiClient.get<EngineJobEpochsResponse>(
      `/engine/train/${encodeURIComponent(id)}/epochs`,
      { params: { tail } }
    );
    return normalizeJobEpochStream(response.data);
  },

  cancelJob: async (jobId: string): Promise<void> => {
    const id = String(jobId).trim();
    if (!id) throw new Error('job_id is required');
    await apiClient.post(`/engine/jobs/${encodeURIComponent(id)}/cancel`, {});
  },
};

// Model APIs
export const modelApi = {
  getAll: async (scope: ModelListScope = 'available'): Promise<Model[]> => {
    return scope === 'admin' ? fetchAdminModels() : fetchAvailableModels();
  },

  getById: async (id: string): Promise<Model> => {
    const response = await apiClient.get<JobDetailResponse>(`/engine/jobs/${encodeURIComponent(id)}`);
    const summary = response.data?.summary || {};
    const db = response.data?.db || {};
    const inferenceProfile =
      normalizeInferenceProfile(response.data?.inference_profile) ??
      normalizeInferenceProfile(summary.inference_profile);
    return {
      id: String(response.data?.job_id || id),
      name: String(summary.experiment_name || id),
      model_type: String(summary.strategy || 'engine'),
      status: normalizeJobStatus(db.status || summary.status || ''),
      created_at: undefined,
      completed_at: stringOrUndefined(summary.completed_at) ?? stringOrUndefined(db.completed_at),
      dataset_id: stringOrUndefined(summary.dataset_id) ?? stringOrUndefined(db.dataset_id),
      task_type: stringOrUndefined(summary.task_type),
      inference_profile: inferenceProfile,
      metrics: normalizeEvaluationMetrics(summary.evaluation_metrics),
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
    return items.map(normalizeRecommendation);
  },

  predictScenario: async (request: ScenarioPredictionRequest): Promise<ScenarioPredictionResponse> => {
    const response = await apiClient.post<EnginePredictionResponse>(
      `/engine/jobs/${encodeURIComponent(request.job_id)}/prediction/scenario`,
      {
        sample: request.sample,
        top_k: request.top_k ?? 5,
        strategy: stringOrUndefined(request.strategy),
        temporal_features: request.temporal_features ?? undefined,
        spatial_features: request.spatial_features ?? undefined,
        environmental_features: request.environmental_features ?? undefined,
        item_features: request.item_features ?? undefined,
      }
    );

    return {
      job_id: String(response.data.job_id),
      dataset_id: String(response.data.dataset_id),
      strategy: String(response.data.strategy),
      task_type: stringOrUndefined(response.data.task_type),
      required_fields: arrayOfStrings(response.data.required_fields),
      input_sample: recordOrEmpty(response.data.input_sample),
      recommended_action: response.data.recommended_action ?? undefined,
      action_candidates: normalizeActionCandidates(response.data.action_candidates),
      effectiveness_estimate: numberOrUndefined(response.data.effectiveness_estimate),
      recommendations: (response.data.recommendations ?? []).map(normalizeRecommendation),
    };
  },

  predictSample: async (
    request: ScenarioPredictionRequest
  ): Promise<ScenarioPredictionResponse> => {
    const dynamicSample = Object.fromEntries(
      Object.entries(request.sample).filter(([key]) => String(key).trim())
    );

    const response = await apiClient.get<EnginePredictionResponse>(
      `/engine/jobs/${encodeURIComponent(request.job_id)}/prediction`,
      {
        params: {
          ...dynamicSample,
          n: request.top_k ?? 5,
          strategy: stringOrUndefined(request.strategy),
          temporalFeatures: request.temporal_features,
          spatialFeatures: request.spatial_features,
          environmentalFeatures: request.environmental_features,
          itemFeatures: request.item_features,
        },
      }
    );

    return {
      job_id: String(response.data.job_id),
      dataset_id: String(response.data.dataset_id),
      strategy: String(response.data.strategy),
      task_type: stringOrUndefined(response.data.task_type),
      required_fields: arrayOfStrings(response.data.required_fields),
      input_sample: recordOrEmpty(response.data.input_sample),
      recommended_action: response.data.recommended_action ?? undefined,
      action_candidates: normalizeActionCandidates(response.data.action_candidates),
      effectiveness_estimate: numberOrUndefined(response.data.effectiveness_estimate),
      recommendations: (response.data.recommendations ?? []).map(normalizeRecommendation),
    };
  },
};

export { setTokens };

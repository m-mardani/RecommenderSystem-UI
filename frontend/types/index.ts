export interface User {
  sub: string;
  username: string;
  token_type: string;
  jti: string;
  iat: number;
  exp: number;
  roles: string[];
  permissions: string[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  cellphone: string;
  password: string;
  role?: 'ADMIN' | 'USER';
}

export interface Dataset {
  id: string;
  name: string;
  description: string;
  upload_date: string;
  row_count?: number;
  column_count?: number;
}

export interface TrainingJob {
  id: string;
  dataset_id?: string;
  model_type?: string;
  status: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  progress?: number;
  error_message?: string;
}

export interface TrainingJobState {
  job_id: string;
  status: 'running' | 'succeeded' | 'failed' | 'canceled' | null | string;
  progress_status: 'queued' | 'running' | 'completed' | 'failed' | null | string;
  stage: string | null;
  epoch?: number;
  total_epochs?: number;
  progress_pct?: number;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  is_terminal: boolean;
  error: string | null;
}

export type TrainingProgressStatus = 'queued' | 'running' | 'completed' | 'failed';

// ─── Multi-Scenario Support ───────────────────────────────────────────────────

export type ScenarioType =
  | 'movie'
  | 'music'
  | 'book'
  | 'product'
  | 'news'
  | 'video'
  | 'restaurant'
  | 'poi'
  | 'ecommerce'
  | 'course'
  | 'job'
  | 'article'
  | 'threat_defense';

export interface ScenarioConfig {
  type: ScenarioType;
  /** Display label (English) */
  label: string;
  /** Persian display label */
  labelFa: string;
  /** Short description (English) */
  description: string;
  /** Persian description */
  descriptionFa: string;
  /** Unicode emoji icon */
  icon: string;
  /** Tailwind gradient classes for the card */
  gradient: string;
  /** Rating type: explicit (1-5 stars) or implicit (clicks/plays/views) */
  ratingType: 'explicit' | 'implicit';
  /** Implicit weight column name if applicable */
  implicitWeight?: string;
  /** Item feature columns */
  itemFeatureColumns: string[];
  /** Text columns used for content-based filtering */
  textColumns: string[];
  /** Category / genre column */
  categoryColumn?: string;
  /** Human-readable item type (singular) */
  itemTypeFa: string;
  /** Example use-case tag */
  useCaseFa: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface StartTrainingAsyncRequest {
  dataset_id: string;
  num_epochs: number;
  /** Optional scenario type for multi-scenario training */
  scenario?: ScenarioType;
}

export interface StartTrainingAsyncResponse {
  job_id: string;
  result?: {
    status?: string;
    [key: string]: unknown;
  } | null;
}

export interface TrainingEpochEvent {
  job_id: string;
  epoch: number;
  total_epochs: number | null;
  train_loss: number | null;
  val_loss: number | null;
  epoch_time: number | null;
  metrics: Record<string, unknown> | null;
  ts: number | null;
  epoch_text: string | null;
  progress_pct: number | null;
  error: string | null;
  message: string | null;
}

export interface TrainingEpochsQuery {
  tail?: number;
  fromEpoch?: number;
}

export interface TrainingEpochsResponse {
  job_id: string;
  status: TrainingProgressStatus | null;
  stage: string | null;
  current_epoch: number | null;
  total_epochs: number | null;
  epoch_text: string | null;
  progress_pct: number;
  events: TrainingEpochEvent[];
  total_events: number;
}

export interface Model {
  id: string;
  name: string;
  model_type: string;
  created_at?: string;
  dataset_id?: string;
  uploader_username?: string;
  original_filename?: string;
  model_s3_uri?: string;
  metrics?: Record<string, unknown>;
}

export interface Recommendation {
  item_id: number;
  score: number;
  item_name?: string;
}

export interface RecommendationRequest {
  user_id: number;
  job_id: string;
  top_k?: number;
}

export interface ApiError {
  detail: string;
  status?: number;
}

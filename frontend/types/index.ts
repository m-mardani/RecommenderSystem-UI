export interface User {
  sub: string;
  username: string | null;
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
  exp?: number;
  expires_in?: number;
  roles?: string[];
  permissions?: string[];
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

export interface DatasetColumnMapping {
  user?: string;
  item?: string;
  rating?: string;
  timestamp?: string;
  title?: string;
  description?: string;
  category_columns?: string[];
  temporal_columns?: string[];
  spatial_columns?: string[];
  environmental_columns?: string[];
  target?: string;
  auxiliary_target_columns?: string[];
  action?: string;
  effectiveness?: string;
}

export interface DatasetAnalyzeOverrides {
  strategy?: string;
  user_column?: string;
  item_column?: string;
  rating_column?: string;
  temporal_columns?: string[];
  spatial_columns?: string[];
  environmental_columns?: string[];
  sample_rows?: number;
}

export interface DatasetAnalysis {
  dataset_id: string;
  columns: string[];
  detected_strategy: string;
  task_type: string;
  confidence: number;
  warnings: string[];
  feasible_for_training: boolean;
  num_rows_sampled: number;
  mapping: DatasetColumnMapping;
  training_payload: Record<string, unknown>;
}

export interface TrainingJob {
  id: string;
  dataset_id?: string;
  model_type?: string;
  status: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  estimated_completion_at?: string;
  duration_seconds?: number;
  eta_seconds?: number;
  progress?: number;
  error_message?: string;
}

export interface TrainingJobEventRecord {
  [key: string]: unknown;
}

export interface TrainingJobState {
  job_id: string;
  status?: string;
  progress_status?: string;
  stage?: string;
  epoch?: number;
  total_epochs?: number;
  epoch_text?: string;
  progress_pct?: number;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  eta_seconds?: number;
  estimated_completion_at?: string;
  is_terminal?: boolean;
  error?: string;
  latest?: TrainingJobEventRecord | null;
}

export interface TrainingJobProgressStream {
  job_id: string;
  latest?: TrainingJobEventRecord | null;
  events: TrainingJobEventRecord[];
  total_events?: number;
  eta_seconds?: number;
  estimated_completion_at?: string;
}

export interface TrainingJobEpochStream {
  job_id: string;
  status?: string;
  stage?: string;
  current_epoch?: number;
  total_epochs?: number;
  epoch_text?: string;
  progress_pct?: number;
  eta_seconds?: number;
  estimated_completion_at?: string;
  events: TrainingJobEventRecord[];
  total_events?: number;
}

export interface InferenceProfile {
  dataset_family?: string;
  recommended_preset?: string;
  supported_presets: string[];
  task_type?: string;
  strategy?: string;
  sample_fields: string[];
  required_sample_fields: string[];
}

export interface Model {
  id: string;
  name: string;
  model_type: string;
  status?: string;
  created_at?: string;
  completed_at?: string;
  dataset_id?: string;
  dataset_display_name?: string;
  uploader_username?: string;
  original_filename?: string;
  model_s3_uri?: string;
  task_type?: string;
  inference_profile?: InferenceProfile;
  metrics?: Record<string, unknown>;
  is_available?: boolean;
  can_delete?: boolean;
}

export interface Recommendation {
  item_id: string | number;
  movie_name?: string | null;
  score: number;
  item_name?: string;
  rank?: number;
  strategy?: string;
  explanation?: Record<string, unknown>;
}

export interface RecommendationRequest {
  user_id: number;
  job_id: string;
  top_k?: number;
}

export interface ScenarioPredictionRequest {
  job_id: string;
  sample: Record<string, unknown>;
  top_k?: number;
  strategy?: string;
  temporal_features?: Record<string, unknown>;
  spatial_features?: Record<string, unknown>;
  environmental_features?: Record<string, unknown>;
  item_features?: Record<string, unknown>;
}

export interface ActionCandidate {
  action: string;
  score: number;
  rank: number;
  support?: number;
  mean_effectiveness?: number;
}

export interface ScenarioPredictionResponse {
  job_id: string;
  dataset_id: string;
  strategy: string;
  task_type?: string;
  required_fields: string[];
  input_sample: Record<string, unknown>;
  recommended_action?: string | null;
  action_candidates: ActionCandidate[];
  effectiveness_estimate?: number | null;
  recommendations: Recommendation[];
}

export interface TrainingStartOptions {
  strategy?: string;
  user_column?: string;
  item_column?: string;
  rating_column?: string;
  temporal_columns?: string[];
  spatial_columns?: string[];
  environmental_columns?: string[];
  max_rows?: number;
}

export interface TrainingAutoOptions {
  num_epochs?: number;
  persist_job_to_postgres?: boolean;
  persist_vectors_to_postgres?: boolean;
}

export interface ApiError {
  detail: string;
  status?: number;
}

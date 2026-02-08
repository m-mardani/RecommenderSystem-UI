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

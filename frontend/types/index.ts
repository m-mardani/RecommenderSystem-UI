export interface User {
  id: number;
  username: string;
  email: string;
  role: 'ADMIN' | 'USER';
  is_active: boolean;
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
  id: number;
  name: string;
  description: string;
  file_path: string;
  upload_date: string;
  uploaded_by: number;
  row_count?: number;
  column_count?: number;
}

export interface TrainingJob {
  id: number;
  dataset_id: number;
  model_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  created_by: number;
  progress?: number;
  error_message?: string;
}

export interface Model {
  id: number;
  name: string;
  model_type: string;
  file_path: string;
  training_job_id: number;
  created_at: string;
  metrics?: Record<string, number>;
}

export interface Recommendation {
  item_id: number;
  score: number;
  item_name?: string;
}

export interface RecommendationRequest {
  user_id: number;
  model_id: number;
  n_recommendations?: number;
}

export interface ApiError {
  detail: string;
  status?: number;
}

import { apiClient, setTokens, clearTokens } from './client';
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

// Authentication APIs
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<TokenResponse> => {
    const formData = new URLSearchParams();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);

    const response = await apiClient.post('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
  },

  register: async (data: RegisterData): Promise<User> => {
    const response = await apiClient.post('/auth/register', data);
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
    const response = await apiClient.get('/datasets');
    return response.data;
  },

  getById: async (id: number): Promise<Dataset> => {
    const response = await apiClient.get(`/datasets/${id}`);
    return response.data;
  },

  create: async (file: File, name: string, description: string): Promise<Dataset> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('description', description);

    const response = await apiClient.post('/datasets', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/datasets/${id}`);
  },
};

// Training APIs
export const trainingApi = {
  startTraining: async (datasetId: number, modelType: string): Promise<TrainingJob> => {
    const response = await apiClient.post('/training/start', {
      dataset_id: datasetId,
      model_type: modelType,
    });
    return response.data;
  },

  getJobs: async (): Promise<TrainingJob[]> => {
    const response = await apiClient.get('/training/jobs');
    return response.data;
  },

  getJobById: async (id: number): Promise<TrainingJob> => {
    const response = await apiClient.get(`/training/jobs/${id}`);
    return response.data;
  },

  cancelJob: async (id: number): Promise<void> => {
    await apiClient.post(`/training/jobs/${id}/cancel`);
  },
};

// Model APIs
export const modelApi = {
  getAll: async (): Promise<Model[]> => {
    const response = await apiClient.get('/models');
    return response.data;
  },

  getById: async (id: number): Promise<Model> => {
    const response = await apiClient.get(`/models/${id}`);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/models/${id}`);
  },
};

// Recommendation APIs
export const recommendationApi = {
  getRecommendations: async (request: RecommendationRequest): Promise<Recommendation[]> => {
    const response = await apiClient.post('/recommendations', request);
    return response.data;
  },
};

export { setTokens };

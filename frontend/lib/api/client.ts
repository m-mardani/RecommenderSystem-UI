import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { jwtDecode } from 'jwt-decode';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token management
const getAccessToken = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('access_token');
  }
  return null;
};

const getRefreshToken = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('refresh_token');
  }
  return null;
};

const setTokens = (accessToken: string, refreshToken: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
  }
};

const clearTokens = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }
};

const redirectToLoginIfNeeded = (): void => {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  if (path === '/login' || path === '/register') return;
  const w = window as unknown as { __redirectingToLogin?: boolean };
  if (w.__redirectingToLogin) return;
  w.__redirectingToLogin = true;
  window.location.assign('/login');
};

const isTokenExpired = (token: string): boolean => {
  try {
    const decoded = jwtDecode<{ exp?: number }>(token);
    const currentTime = Date.now() / 1000;
    if (typeof decoded.exp !== 'number') return true;
    return decoded.exp < currentTime;
  } catch {
    return true;
  }
};

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    let accessToken = getAccessToken();

    // Check if token is expired and refresh if needed
    if (accessToken && isTokenExpired(accessToken)) {
      const refreshToken = getRefreshToken();
      if (refreshToken && !isTokenExpired(refreshToken)) {
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { token: refreshToken });
          const { access_token, refresh_token: new_refresh_token } = response.data;
          setTokens(access_token, new_refresh_token);
          accessToken = access_token;
        } catch (error) {
          clearTokens();
          redirectToLoginIfNeeded();
          return Promise.reject(error);
        }
      } else {
        clearTokens();
        redirectToLoginIfNeeded();
        return Promise.reject(new Error('Token expired'));
      }
    }

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = getRefreshToken();
      if (refreshToken && !isTokenExpired(refreshToken)) {
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { token: refreshToken });
          const { access_token, refresh_token: new_refresh_token } = response.data;
          setTokens(access_token, new_refresh_token);

          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
          clearTokens();
          redirectToLoginIfNeeded();
          return Promise.reject(refreshError);
        }
      } else {
        clearTokens();
        redirectToLoginIfNeeded();
      }
    }

    return Promise.reject(error);
  }
);

export { apiClient, setTokens, clearTokens, getAccessToken, getRefreshToken };

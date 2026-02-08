import axios from 'axios';

export const getApiErrorDetail = (err: unknown): string | undefined => {
  if (axios.isAxiosError(err)) {
    const data: unknown = err.response?.data;

    if (data && typeof data === 'object' && 'detail' in data) {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === 'string') return detail;
    }

    if (typeof data === 'string') return data;

    if (typeof err.message === 'string' && err.message) return err.message;
    return undefined;
  }

  if (err instanceof Error) return err.message;

  return undefined;
};

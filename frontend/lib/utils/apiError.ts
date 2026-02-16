import axios from 'axios';

const formatFastApiDetail = (detail: unknown): string | undefined => {
  if (!detail) return undefined;
  if (typeof detail === 'string') return detail;

  // FastAPI/Pydantic validation errors are commonly:
  // { detail: [{ loc: ['body','field'], msg: '...', type: '...' }, ...] }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (!item || typeof item !== 'object') return undefined;
        const obj = item as Record<string, unknown>;
        const msg = typeof obj.msg === 'string' ? obj.msg : undefined;
        const loc = obj.loc;

        let field: string | undefined;
        if (Array.isArray(loc)) {
          // Try to find the last meaningful segment (e.g. ['body','email'] -> 'email')
          const locParts = loc.map((x) => String(x));
          field = locParts.filter((x) => x && x !== 'body' && x !== 'query' && x !== 'path').at(-1);
        }

        if (field && msg) return `${field}: ${msg}`;
        if (msg) return msg;
        return undefined;
      })
      .filter((x): x is string => Boolean(x));

    if (parts.length) return parts.join(' | ');
    return undefined;
  }

  if (typeof detail === 'object') {
    const obj = detail as Record<string, unknown>;
    const message = obj.message;
    if (typeof message === 'string' && message) return message;
    try {
      return JSON.stringify(detail);
    } catch {
      return undefined;
    }
  }

  return undefined;
};

export const getApiErrorDetail = (err: unknown): string | undefined => {
  if (axios.isAxiosError(err)) {
    const data: unknown = err.response?.data;

    if (data && typeof data === 'object' && 'detail' in data) {
      const detail = (data as { detail?: unknown }).detail;
      const formatted = formatFastApiDetail(detail);
      if (formatted) return formatted;
    }

    if (typeof data === 'string') return data;

    if (typeof err.message === 'string' && err.message) return err.message;
    return undefined;
  }

  if (err instanceof Error) return err.message;

  return undefined;
};

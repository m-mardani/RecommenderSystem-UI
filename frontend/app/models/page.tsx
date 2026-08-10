'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/common/AppShell';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { translations } from '@/lib/utils/translations';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { modelApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Model } from '@/types';

export default function ModelsPage() {
  const { isAdmin } = useAuth();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  type MetricSeries = {
    label: string;
    value: number;
    barClassName: string;
  };

  type MetricRow = {
    key: string;
    displayValue: string;
    series: MetricSeries[];
  };

  const toNumberIfFinite = (v: unknown): number | null => {
    if (typeof v === 'number') {
      return Number.isFinite(v) ? v : null;
    }

    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : null;
    }

    return null;
  };

  const formatMetricValue = (value: unknown): string => {
    if (typeof value === 'number') return value.toFixed(4);
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value === null) return 'null';
    if (value === undefined) return '-';

    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if ('val' in obj || 'test' in obj) {
        const parts: string[] = [];
        if ('val' in obj) parts.push(`val=${String(obj.val)}`);
        if ('test' in obj) parts.push(`test=${String(obj.test)}`);
        if (parts.length > 0) return parts.join(', ');
      }
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }

    return String(value);
  };

  const buildMetricRows = (metrics: Record<string, unknown> | undefined): MetricRow[] => {
    if (!metrics) return [];
    return Object.entries(metrics).map(([key, value]) => {
      const num = toNumberIfFinite(value);
      if (num !== null) {
        return {
          key,
          displayValue: num.toFixed(4),
          series: [{ label: 'value', value: num, barClassName: 'bg-blue-600' }],
        };
      }

      if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const valNum = toNumberIfFinite(obj.val);
        const testNum = toNumberIfFinite(obj.test);
        const series: MetricSeries[] = [];
        if (valNum !== null) series.push({ label: 'val', value: valNum, barClassName: 'bg-blue-600' });
        if (testNum !== null) series.push({ label: 'test', value: testNum, barClassName: 'bg-green-600' });
        if (series.length > 0) {
          const parts = series.map((s) => `${s.label}=${s.value.toFixed(4)}`).join(', ');
          return { key, displayValue: parts, series };
        }
      }

      return { key, displayValue: formatMetricValue(value), series: [] };
    });
  };

  const getMetricScaleMax = (rows: MetricRow[]): number => {
    const values = rows.flatMap((r) => r.series.map((s) => Math.abs(s.value)));
    const max = values.length > 0 ? Math.max(...values) : 0;
    return max > 0 ? max : 1;
  };

  const loadModels = useCallback(async () => {
    try {
      setLoading(true);
      const data = await modelApi.getAll(isAdmin ? 'admin' : 'available');
      setModels(data);
      setError('');
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) || translations.errors.generic);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const handleDelete = async (jobId: string) => {
    try {
      setError('');
      await modelApi.delete(jobId);
      setModels((prev) => prev.filter((m) => m.id !== jobId));
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) || translations.errors.generic);
    }
  };

  const handleUseModel = (modelId: string) => {
    router.push(`/recommendations?modelId=${encodeURIComponent(modelId)}`);
  };

  const emptyText = isAdmin ? translations.models.noModels : translations.models.noAvailableModels;

  return (
    <ProtectedRoute>
      <AppShell
        title={translations.nav.models}
        description="موجودی مدل‌های آماده برای استفاده یا مدیریت، همراه با متریک‌های خروجی."
        actions={
          <button onClick={() => void loadModels()} className="app-btn app-btn-primary">
            {translations.common.refresh}
          </button>
        }
      >
          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <ErrorMessage message={error} onRetry={loadModels} />
          ) : models.length === 0 ? (
            <div className="app-empty">
              <p>{emptyText}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {models.map((model) => (
                <div key={model.id} className="app-card p-6 transition-shadow hover:shadow-[0_26px_60px_rgba(15,23,42,0.12)]">
                  <div className="flex justify-between items-start mb-4 gap-3">
                    <h3 className="text-lg font-bold text-slate-900">{model.name}</h3>
                    <span className="app-badge bg-sky-100 text-sky-700">
                      {model.model_type}
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <p className="text-sm text-slate-600">
                      <strong>{translations.models.modelId}:</strong> {model.id}
                    </p>
                    {model.status && (
                      <p className="text-sm text-slate-600">
                        <strong>{translations.training.status}:</strong> {model.status}
                      </p>
                    )}
                    <p className="text-sm text-slate-600">
                      <strong>{translations.models.createdAt}:</strong>{' '}
                      {model.completed_at || model.created_at
                        ? new Date(model.completed_at || model.created_at || '').toLocaleString('fa-IR')
                        : '-'}
                    </p>
                    {model.dataset_display_name && (
                      <p className="text-sm text-slate-600">
                        <strong>{translations.datasets.name}:</strong> {model.dataset_display_name}
                      </p>
                    )}
                    {isAdmin && model.uploader_username && (
                      <p className="text-sm text-slate-600">
                        <strong>Uploader:</strong> {model.uploader_username}
                      </p>
                    )}
                  </div>

                  {model.metrics && Object.keys(model.metrics).length > 0 && (
                    <div className="mb-4">
                      <p className="mb-2 text-sm font-medium text-slate-700">{translations.models.metrics}:</p>
                      {(() => {
                        const rows = buildMetricRows(model.metrics);
                        const scaleMax = getMetricScaleMax(rows);
                        const hasNumeric = rows.some((r) => r.series.length > 0);

                        return (
                          <div className="app-table">
                            <table className="w-full">
                              <thead>
                                <tr>
                                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">
                                    {translations.models.metrics}
                                  </th>
                                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">
                                    {translations.common.value}
                                  </th>
                                  {hasNumeric && (
                                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">
                                      {translations.common.chart}
                                    </th>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row) => (
                                  <tr key={row.key}>
                                    <td className="px-3 py-2 text-xs font-medium text-slate-700 align-top">
                                      {row.key}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-700 align-top">
                                      {row.displayValue}
                                    </td>
                                    {hasNumeric && (
                                      <td className="px-3 py-2 align-top">
                                        {row.series.length === 0 ? (
                                          <span className="text-xs text-slate-400">-</span>
                                        ) : (
                                          <div className="space-y-1">
                                            {row.series.map((s) => {
                                              const pct = Math.min(100, (Math.abs(s.value) / scaleMax) * 100);
                                              return (
                                                <div key={s.label} className="flex items-center gap-2">
                                                  <span className="w-10 text-[11px] text-slate-500">{s.label}</span>
                                                  <div
                                                    className="h-2 flex-1 rounded bg-white/80"
                                                    aria-label={`${row.key} ${s.label} bar`}
                                                  >
                                                    <div
                                                      className={`${s.barClassName} h-full rounded-full`}
                                                      style={{ width: `${pct}%` }}
                                                    />
                                                  </div>
                                                  <span className="w-16 text-right text-[11px] text-slate-600 tabular-nums">
                                                    {Number.isFinite(s.value) ? s.value.toFixed(4) : '-'}
                                                  </span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      onClick={() => handleUseModel(model.id)}
                      className="app-btn app-btn-success min-w-28 px-4"
                    >
                      {translations.models.use}
                    </button>
                    {isAdmin && model.can_delete && (
                      <button
                        onClick={() => void handleDelete(model.id)}
                        className="app-btn app-btn-danger min-w-24 px-4"
                      >
                        {translations.common.delete}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
      </AppShell>
    </ProtectedRoute>
  );
}

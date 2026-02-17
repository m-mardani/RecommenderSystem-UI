'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Navbar } from '@/components/common/Navbar';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { modelApi, recommendationApi, type PredictionResponse } from '@/lib/api';
import type { Model } from '@/types';

type Strategy = 'collaborative' | 'content' | 'context';

type FormState = {
  jobId: string;
  n: string;
  userId: string;
  movieId: string;
  rating: string;
  timestamp: string;
  temporalFeatures: string;
  spatialFeatures: string;
  environmentalFeatures: string;
  itemFeatures: string;
};

type InputFieldKey = Exclude<keyof FormState, 'jobId'>;

const normalizeStrategy = (value: string): Strategy => {
  const lower = value.toLowerCase();
  if (lower.includes('content')) return 'content';
  if (lower.includes('context')) return 'context';
  return 'collaborative';
};

const parseJsonField = (value: string): { ok: true; value: string } | { ok: false; message: string } => {
  if (!value.trim()) return { ok: true, value: '' };
  try {
    const parsed = JSON.parse(value);
    return { ok: true, value: JSON.stringify(parsed) };
  } catch {
    return { ok: false, message: 'فرمت JSON نامعتبر است' };
  }
};

const getRawBackendError = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as unknown;
    if (data && typeof data === 'object' && 'detail' in (data as Record<string, unknown>)) {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === 'string') return detail;
      try {
        return JSON.stringify(detail);
      } catch {
        return String(detail);
      }
    }
    if (typeof data === 'string') return data;
    if (typeof err.message === 'string' && err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Unknown error';
};

export default function PredictionPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState<PredictionResponse | null>(null);

  const [form, setForm] = useState<FormState>({
    jobId: '',
    n: '',
    userId: '',
    movieId: '',
    rating: '',
    timestamp: '',
    temporalFeatures: '',
    spatialFeatures: '',
    environmentalFeatures: '',
    itemFeatures: '',
  });

  const loadModels = useCallback(async () => {
    try {
      setLoadingModels(true);
      const data = await modelApi.getAll();
      setModels(data);
      setModelsError('');
    } catch (err: unknown) {
      setModelsError(getRawBackendError(err));
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const selectedModel = useMemo(() => models.find((m) => m.id === form.jobId), [models, form.jobId]);
  const selectedStrategy = useMemo<Strategy | null>(() => {
    if (!selectedModel?.model_type) return null;
    return normalizeStrategy(selectedModel.model_type);
  }, [selectedModel]);

  const jsonValidation = useMemo(() => {
    const temporal = parseJsonField(form.temporalFeatures);
    const spatial = parseJsonField(form.spatialFeatures);
    const environmental = parseJsonField(form.environmentalFeatures);
    const item = parseJsonField(form.itemFeatures);
    return { temporal, spatial, environmental, item };
  }, [form.temporalFeatures, form.spatialFeatures, form.environmentalFeatures, form.itemFeatures]);

  const errors = useMemo(() => {
    const next: Record<string, string> = {};

    if (!form.jobId) next.jobId = 'انتخاب مدل الزامی است';

    const nValue = Number(form.n);
    if (!form.n.trim()) {
      next.n = 'این فیلد الزامی است';
    } else if (!Number.isInteger(nValue) || nValue < 1 || nValue > 1000) {
      next.n = 'n باید عدد صحیح بین 1 تا 1000 باشد';
    }

    if (!form.userId.trim()) next.userId = 'این فیلد الزامی است';

    if (!jsonValidation.temporal.ok) next.temporalFeatures = jsonValidation.temporal.message;
    if (!jsonValidation.spatial.ok) next.spatialFeatures = jsonValidation.spatial.message;
    if (!jsonValidation.environmental.ok) next.environmentalFeatures = jsonValidation.environmental.message;
    if (!jsonValidation.item.ok) next.itemFeatures = jsonValidation.item.message;

    if (selectedStrategy === 'content') {
      if (!form.movieId.trim() && !form.itemFeatures.trim()) {
        next.contentGroup = 'برای strategy=content حداقل یکی از movieId یا itemFeatures لازم است';
      }
    }

    if (selectedStrategy === 'context') {
      if (
        !form.timestamp.trim() &&
        !form.temporalFeatures.trim() &&
        !form.spatialFeatures.trim() &&
        !form.environmentalFeatures.trim()
      ) {
        next.contextGroup = 'برای strategy=context حداقل یکی از timestamp یا temporalFeatures یا spatialFeatures یا environmentalFeatures لازم است';
      }
    }

    return next;
  }, [form, jsonValidation, selectedStrategy]);

  const canSubmit = !loadingModels && Object.keys(errors).length === 0;

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit || !selectedStrategy) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const prediction = await recommendationApi.getPrediction({
        job_id: form.jobId,
        n: Number(form.n),
        userId: form.userId.trim(),
        movieId: form.movieId.trim() || undefined,
        rating: form.rating.trim() || undefined,
        timestamp: form.timestamp.trim() || undefined,
        temporalFeatures: jsonValidation.temporal.ok ? jsonValidation.temporal.value || undefined : undefined,
        spatialFeatures: jsonValidation.spatial.ok ? jsonValidation.spatial.value || undefined : undefined,
        environmentalFeatures: jsonValidation.environmental.ok
          ? jsonValidation.environmental.value || undefined
          : undefined,
        itemFeatures: jsonValidation.item.ok ? jsonValidation.item.value || undefined : undefined,
      });

      setResult(prediction);
    } catch (err: unknown) {
      setResult(null);
      setSubmitError(getRawBackendError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const recommendations = useMemo(() => {
    const items = result?.recommendations || [];
    return [...items].sort((a, b) => {
      const aRank = typeof a.rank === 'number' ? a.rank : Number.MAX_SAFE_INTEGER;
      const bRank = typeof b.rank === 'number' ? b.rank : Number.MAX_SAFE_INTEGER;
      return aRank - bRank;
    });
  }, [result]);

  const inputFields: Array<{
    key: InputFieldKey;
    label: string;
    type: 'text' | 'number';
    placeholder?: string;
    min?: number;
    max?: number;
  }> = [
    { key: 'n', label: 'n', type: 'number', min: 1, max: 1000 },
    { key: 'userId', label: 'userId', type: 'text' },
    { key: 'movieId', label: 'movieId', type: 'text' },
    { key: 'rating', label: 'rating', type: 'text' },
    { key: 'timestamp', label: 'timestamp', type: 'text' },
    { key: 'temporalFeatures', label: 'temporalFeatures', type: 'text', placeholder: '{"hour":20}' },
    { key: 'spatialFeatures', label: 'spatialFeatures', type: 'text', placeholder: '{"region":"north"}' },
    {
      key: 'environmentalFeatures',
      label: 'environmentalFeatures',
      type: 'text',
      placeholder: '{"weather":"sunny"}',
    },
    { key: 'itemFeatures', label: 'itemFeatures', type: 'text', placeholder: '{"genre":"drama"}' },
  ];

  const isRequiredField = (key: InputFieldKey): boolean => {
    if (key === 'n' || key === 'userId') return true;
    if (selectedStrategy === 'content' && (key === 'movieId' || key === 'itemFeatures')) return true;
    if (
      selectedStrategy === 'context' &&
      (key === 'timestamp' || key === 'temporalFeatures' || key === 'spatialFeatures' || key === 'environmentalFeatures')
    ) {
      return true;
    }
    return false;
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="container mx-auto px-4 py-8 space-y-6">
          <h1 className="text-3xl font-bold text-gray-800">پیش بینی</h1>

          {loadingModels ? (
            <LoadingSpinner />
          ) : modelsError ? (
            <ErrorMessage message={modelsError} onRetry={loadModels} />
          ) : (
            <>
              <section className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Prediction Form</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Trained Model <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.jobId}
                      onChange={(e) => updateField('jobId', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select trained model</option>
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} | job_id: {model.id} | strategy: {model.model_type || '-'}
                        </option>
                      ))}
                    </select>
                    {errors.jobId && <p className="mt-1 text-sm text-red-600">{errors.jobId}</p>}
                  </div>

                  {selectedModel && (
                    <p className="text-sm text-gray-600">
                      strategy: <span className="font-medium">{selectedStrategy}</span>
                    </p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {inputFields.map((field) => (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {field.label} {isRequiredField(field.key) ? <span className="text-red-500">*</span> : null}
                        </label>
                        <input
                          type={field.type}
                          min={field.min}
                          max={field.max}
                          value={form[field.key]}
                          onChange={(e) => updateField(field.key, e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder={field.placeholder}
                        />
                        {errors[field.key] && <p className="mt-1 text-sm text-red-600">{errors[field.key]}</p>}
                      </div>
                    ))}
                  </div>

                  {errors.contentGroup && <p className="text-sm text-red-600">{errors.contentGroup}</p>}
                  {errors.contextGroup && <p className="text-sm text-red-600">{errors.contextGroup}</p>}

                  <button
                    type="submit"
                    disabled={!canSubmit || submitting || !selectedStrategy}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                  >
                    {submitting ? 'در حال ارسال...' : 'ارسال پیش‌بینی'}
                  </button>
                </form>
              </section>

              <section className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Results</h2>

                {submitError ? (
                  <p className="text-red-600 whitespace-pre-wrap">{submitError}</p>
                ) : !result ? (
                  <p className="text-gray-600">هنوز نتیجه‌ای ثبت نشده است.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700">
                      <p>
                        <span className="font-medium">job_id:</span> {result.job_id}
                      </p>
                      <p>
                        <span className="font-medium">inferred strategy:</span> {selectedStrategy}
                      </p>
                      <p>
                        <span className="font-medium">n:</span> {form.n}
                      </p>
                    </div>

                    <div>
                      <h3 className="font-medium text-gray-800 mb-2">Input sample echo</h3>
                      <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs overflow-auto" dir="ltr">
                        {JSON.stringify(result.input_sample ?? {}, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <h3 className="font-medium text-gray-800 mb-2">Recommendations</h3>
                      {recommendations.length === 0 ? (
                        <p className="text-gray-600">No recommendations found.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">rank</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">item_id</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">score</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">strategy</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {recommendations.map((rec, index) => {
                                const rank = rec.rank ?? index + 1;
                                return (
                                  <tr key={`${rec.item_id}-${rank}`} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 text-sm text-gray-900">{rank}</td>
                                    <td className="px-4 py-2 text-sm text-gray-900">{rec.item_id}</td>
                                    <td className="px-4 py-2 text-sm text-gray-700">{Number(rec.score).toFixed(4)}</td>
                                    <td className="px-4 py-2 text-sm text-gray-700">{rec.strategy || '-'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

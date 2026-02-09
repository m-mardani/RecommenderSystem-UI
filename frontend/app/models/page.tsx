'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/common/Navbar';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { translations } from '@/lib/utils/translations';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { modelApi } from '@/lib/api';
import { Model } from '@/types';

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

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

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      setLoading(true);
      const data = await modelApi.getAll();
      setModels(data);
      setError('');
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) || translations.errors.generic);
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800">{translations.models.title}</h1>
            <button
              onClick={loadModels}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {translations.common.refresh}
            </button>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <ErrorMessage message={error} onRetry={loadModels} />
          ) : models.length === 0 ? (
            <div className="bg-white p-8 rounded-lg shadow-md text-center">
              <p className="text-gray-600">{translations.models.noModels}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {models.map((model) => (
                <div key={model.id} className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-gray-800">{model.name}</h3>
                    <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
                      {model.model_type}
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <p className="text-sm text-gray-600">
                      <strong>{translations.models.modelId}:</strong> {model.id}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>{translations.models.createdAt}:</strong>{' '}
                      {model.created_at ? new Date(model.created_at).toLocaleString('fa-IR') : '-'}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>{translations.models.trainingJob}:</strong> {model.id}
                    </p>
                  </div>

                  {model.metrics && Object.keys(model.metrics).length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">{translations.models.metrics}:</p>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        {Object.entries(model.metrics).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-sm text-gray-600">
                            <span>{key}:</span>
                            <span className="font-medium">{formatMetricValue(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex space-x-reverse space-x-2">
                    <button
                      onClick={() => handleUseModel(model.id)}
                      className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      {translations.models.use}
                    </button>
                    <button
                      onClick={() => handleDelete(model.id)}
                      className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
                    >
                      {translations.common.delete}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

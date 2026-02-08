'use client';

import { useEffect, useState } from 'react';
import { Navbar } from '@/components/common/Navbar';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { translations } from '@/lib/utils/translations';
import { datasetApi, trainingApi } from '@/lib/api';
import { Dataset } from '@/types';

export default function TrainingPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    datasetId: '',
    modelType: 'collaborative',
  });

  const modelTypes = [
    { value: 'collaborative', label: translations.training.modelTypes.collaborative },
    { value: 'content_based', label: translations.training.modelTypes.contentBased },
    { value: 'hybrid', label: translations.training.modelTypes.hybrid },
    { value: 'matrix_factorization', label: translations.training.modelTypes.matrix },
    { value: 'deep_learning', label: translations.training.modelTypes.deep },
  ];

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    try {
      setLoading(true);
      const data = await datasetApi.getAll();
      setDatasets(data);
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || translations.errors.generic);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await trainingApi.startTraining(parseInt(formData.datasetId), formData.modelType);
      alert(translations.training.startSuccess);
      setFormData({ datasetId: '', modelType: 'collaborative' });
    } catch (err: any) {
      alert(err?.response?.data?.detail || translations.training.startError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">{translations.training.title}</h1>

          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <ErrorMessage message={error} onRetry={loadDatasets} />
          ) : (
            <div className="bg-white p-8 rounded-lg shadow-md max-w-2xl">
              <h2 className="text-xl font-bold text-gray-800 mb-6">{translations.training.startNew}</h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {translations.training.selectDataset}
                  </label>
                  <select
                    value={formData.datasetId}
                    onChange={(e) => setFormData({ ...formData, datasetId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">{translations.training.selectDataset}</option>
                    {datasets.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>
                        {dataset.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {translations.training.selectModel}
                  </label>
                  <select
                    value={formData.modelType}
                    onChange={(e) => setFormData({ ...formData, modelType: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    {modelTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>توجه:</strong> فرآیند آموزش ممکن است بسته به حجم داده و نوع مدل، زمان قابل توجهی طول بکشد. می‌توانید پیشرفت آموزش را در صفحه پایش کارها مشاهده کنید.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-400"
                >
                  {submitting ? translations.common.loading : translations.training.startNew}
                </button>
              </form>

              {datasets.length === 0 && (
                <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    هیچ مجموعه داده‌ای موجود نیست. لطفاً ابتدا یک مجموعه داده بارگذاری کنید.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

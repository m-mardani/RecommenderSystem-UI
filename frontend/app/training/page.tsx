'use client';

import { useEffect, useState } from 'react';
import { Navbar } from '@/components/common/Navbar';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { translations } from '@/lib/utils/translations';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { datasetApi, trainingApi } from '@/lib/api';
import { Dataset } from '@/types';

export default function TrainingPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasActiveTraining, setHasActiveTraining] = useState(false);

  const [formData, setFormData] = useState({
    datasetId: '',
  });

  useEffect(() => {
    loadDatasets();
    void refreshActiveTrainingState();
  }, []);

  const refreshActiveTrainingState = async (): Promise<boolean> => {
    try {
      const jobs = await trainingApi.getJobs();
      const active = jobs.some((j) => j.status === 'pending' || j.status === 'running');
      setHasActiveTraining(active);
      return active;
    } catch {
      // If we can't load jobs, don't block the user from trying.
      setHasActiveTraining(false);
      return false;
    }
  };

  const loadDatasets = async () => {
    try {
      setLoading(true);
      const data = await datasetApi.getAll();
      setDatasets(data);
      setError('');
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) || translations.errors.generic);
    } finally {
      setLoading(false);
    }
  };

  const handleTrainAuto = async () => {
    if (!formData.datasetId) return;
    const active = await refreshActiveTrainingState();
    if (active) {
      alert(translations.training.oneAtATime);
      return;
    }
    setSubmitting(true);

    try {
      await trainingApi.trainAuto(formData.datasetId);
      alert(translations.training.startSuccess);
      setFormData({ datasetId: '' });
    } catch (err: unknown) {
      alert(getApiErrorDetail(err) || translations.training.startError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrainEngine = async () => {
    if (!formData.datasetId) return;
    const active = await refreshActiveTrainingState();
    if (active) {
      alert(translations.training.oneAtATime);
      return;
    }
    setSubmitting(true);

    try {
      await trainingApi.trainEngine(formData.datasetId);
      alert(translations.training.startSuccess);
      setFormData({ datasetId: '' });
    } catch (err: unknown) {
      alert(getApiErrorDetail(err) || translations.training.startError);
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

              <div className="space-y-6">
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

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>توجه:</strong> انتخاب نوع مدل لازم نیست؛ سیستم به صورت خودکار بهترین روش را تشخیص می‌دهد. فرآیند آموزش ممکن است بسته به حجم داده زمان قابل توجهی طول بکشد. می‌توانید پیشرفت آموزش را در صفحه پایش کارها مشاهده کنید.
                  </p>
                </div>

                {hasActiveTraining && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">{translations.training.oneAtATime}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleTrainAuto}
                    disabled={submitting || !formData.datasetId || hasActiveTraining}
                    className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-400"
                  >
                    {submitting ? translations.common.loading : translations.training.trainAuto}
                  </button>

                  <button
                    type="button"
                    onClick={handleTrainEngine}
                    disabled={submitting || !formData.datasetId || hasActiveTraining}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                  >
                    {submitting ? translations.common.loading : translations.training.trainEngine}
                  </button>
                </div>
              </div>

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

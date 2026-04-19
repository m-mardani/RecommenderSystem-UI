'use client';

import { useEffect, useState, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/common/Navbar';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { translations } from '@/lib/utils/translations';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { modelApi, recommendationApi } from '@/lib/api';
import { getScenarioConfig, SCENARIO_CONFIGS, ALL_SCENARIO_TYPES } from '@/lib/utils/scenarios';
import { Model, Recommendation, ScenarioType } from '@/types';

/** Naively try to infer a scenario from a model's type/name string. */
const inferScenarioFromModel = (model: Model): ScenarioType | null => {
  const text = `${model.model_type} ${model.name}`.toLowerCase();
  for (const type of ALL_SCENARIO_TYPES) {
    if (text.includes(type)) return type;
  }
  return null;
};

function RecommendationsContent() {
  const searchParams = useSearchParams();
  const [models, setModels] = useState<Model[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    userId: '',
    modelId: searchParams.get('modelId') || '',
    numRecommendations: '10',
    displayScenario: (searchParams.get('scenario') as ScenarioType | '') || '' as ScenarioType | '',
  });

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

  /** The selected model object (if any). */
  const selectedModel = useMemo(
    () => models.find((m) => m.id === formData.modelId) ?? null,
    [models, formData.modelId]
  );

  /** Inferred scenario: explicit selection > detected from model > null. */
  const activeScenario: ScenarioType | null = useMemo(() => {
    if (formData.displayScenario) return formData.displayScenario;
    if (selectedModel) return inferScenarioFromModel(selectedModel);
    return null;
  }, [formData.displayScenario, selectedModel]);

  const activeScenarioCfg = useMemo(
    () => (activeScenario ? getScenarioConfig(activeScenario) : null),
    [activeScenario]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const data = await recommendationApi.getRecommendations({
        user_id: parseInt(formData.userId),
        job_id: String(formData.modelId),
        top_k: parseInt(formData.numRecommendations),
      });
      setRecommendations(data);
    } catch (err: unknown) {
      alert(getApiErrorDetail(err) || translations.recommendations.error);
      setRecommendations([]);
    } finally {
      setSubmitting(false);
    }
  };

  const maxScore = useMemo(
    () => (recommendations.length > 0 ? Math.max(...recommendations.map((r) => r.score)) : 1),
    [recommendations]
  );

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 via-blue-50/30 to-purple-50/20">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">{translations.recommendations.title}</h1>

        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage message={error} onRetry={loadModels} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── Form ── */}
            <div className="lg:col-span-1">
              <div className="bg-white p-6 rounded-2xl shadow-md sticky top-4 space-y-4">
                <h2 className="text-xl font-bold text-gray-800">
                  {translations.recommendations.getRecommendations}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* User ID */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {translations.recommendations.userId}
                    </label>
                    <input
                      type="number"
                      value={formData.userId}
                      onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                      min="1"
                    />
                  </div>

                  {/* Model selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {translations.recommendations.selectModel}
                    </label>
                    <select
                      value={formData.modelId}
                      onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">{translations.recommendations.selectModel}</option>
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} ({model.model_type})
                        </option>
                      ))}
                    </select>

                    {/* Scenario badge inferred from model */}
                    {selectedModel && activeScenarioCfg && !formData.displayScenario && (
                      <p className="text-xs mt-1 text-gray-500">
                        سناریوی تشخیص داده شده:{' '}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs bg-linear-to-r ${activeScenarioCfg.gradient}`}
                        >
                          {activeScenarioCfg.icon} {activeScenarioCfg.labelFa}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Scenario override */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {translations.training.selectScenario}{' '}
                      <span className="text-gray-400 font-normal">(اختیاری)</span>
                    </label>
                    <select
                      value={formData.displayScenario}
                      onChange={(e) =>
                        setFormData({ ...formData, displayScenario: e.target.value as ScenarioType | '' })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="">{translations.training.noScenario}</option>
                      {ALL_SCENARIO_TYPES.map((type) => {
                        const cfg = SCENARIO_CONFIGS[type];
                        return (
                          <option key={type} value={type}>
                            {cfg.icon} {cfg.labelFa}
                          </option>
                        );
                      })}
                    </select>
                    <p className="text-xs text-gray-400 mt-0.5">
                      برای نمایش برچسب‌های مناسب انتخاب کنید
                    </p>
                  </div>

                  {/* Top-K */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {translations.recommendations.numberOfRecs}
                    </label>
                    <input
                      type="number"
                      value={formData.numRecommendations}
                      onChange={(e) =>
                        setFormData({ ...formData, numRecommendations: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                      min="1"
                      max="100"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                  >
                    {submitting
                      ? translations.common.loading
                      : translations.recommendations.getRecommendations}
                  </button>
                </form>

                {models.length === 0 && (
                  <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      هیچ مدلی موجود نیست. لطفاً ابتدا یک مدل آموزش دهید.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Results ── */}
            <div className="lg:col-span-2">
              {recommendations.length > 0 ? (
                <div className="bg-white p-6 rounded-2xl shadow-md">
                  {/* Results header */}
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h2 className="text-xl font-bold text-gray-800">
                      {translations.recommendations.results}
                    </h2>
                    <div className="flex items-center gap-2">
                      {activeScenarioCfg && (
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-white text-sm bg-linear-to-r ${activeScenarioCfg.gradient}`}
                        >
                          {activeScenarioCfg.icon} {activeScenarioCfg.labelFa}
                        </span>
                      )}
                      <span className="text-sm text-gray-500">
                        {recommendations.length} نتیجه
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                            {translations.recommendations.rank}
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                            {activeScenarioCfg
                              ? `شناسه ${activeScenarioCfg.itemTypeFa}`
                              : translations.recommendations.itemId}
                          </th>
                          {/* item_name column when backend provides it */}
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                            {activeScenarioCfg
                              ? `نام ${activeScenarioCfg.itemTypeFa}`
                              : translations.recommendations.itemName}
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                            {translations.recommendations.score}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {recommendations.map((rec, index) => {
                          const barWidth = maxScore > 0 ? (rec.score / maxScore) * 100 : 0;
                          return (
                            <tr key={index} className="hover:bg-gray-50 transition-colors">
                              {/* Rank */}
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                                  {index + 1}
                                </span>
                              </td>
                              {/* Item ID */}
                              <td className="px-4 py-3 font-mono text-sm text-gray-700">
                                {rec.item_id}
                              </td>
                              {/* Item name (may be undefined) */}
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {rec.item_name ? (
                                  <span className="font-medium">{rec.item_name}</span>
                                ) : (
                                  <span className="text-gray-300">–</span>
                                )}
                              </td>
                              {/* Score with visual bar */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 min-w-30">
                                  <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full bg-linear-to-r ${
                                        activeScenarioCfg?.gradient ?? 'from-blue-500 to-blue-400'
                                      }`}
                                      style={{ width: `${barWidth}%` }}
                                    />
                                  </div>
                                  <span className="text-sm text-gray-700 font-mono shrink-0">
                                    {rec.score.toFixed(4)}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-8 rounded-2xl shadow-md text-center">
                  <svg
                    className="w-16 h-16 text-gray-300 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                  <p className="text-gray-500">برای دریافت توصیه‌ها، فرم سمت راست را تکمیل کنید</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RecommendationsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<LoadingSpinner />}>
        <RecommendationsContent />
      </Suspense>
    </ProtectedRoute>
  );
}

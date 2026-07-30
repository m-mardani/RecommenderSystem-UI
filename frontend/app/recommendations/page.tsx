'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/common/Navbar';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { translations } from '@/lib/utils/translations';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { modelApi, recommendationApi } from '@/lib/api';
import { Model, Recommendation, ScenarioPredictionResponse } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

function RecommendationsContent() {
  const { isAdmin } = useAuth();
  const searchParams = useSearchParams();
  const [models, setModels] = useState<Model[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [scenarioResult, setScenarioResult] = useState<ScenarioPredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'classic' | 'scenario'>('classic');

  const [formData, setFormData] = useState({
    userId: '',
    modelId: searchParams.get('modelId') || '',
    numRecommendations: '10',
    strategy: '',
    scenarioSample: `{
  "Operator_ID": "OP-6",
  "Threat_ID": "BM-26",
  "DateTime": "2020-11-17 06:14:11",
  "Threat_Type": "Unknown",
  "Threat_Level": "Medium",
  "Speed": 649,
  "Altitude": 4585,
  "Heading": 99.01,
  "Position_X": 53.2384,
  "Position_Y": 37.6151,
  "Environment_Condition": "Cloudy",
  "Threat_Confidence": 0.74
}`,
  });

  useEffect(() => {
    void loadModels();
  }, [isAdmin]);

  const loadModels = async () => {
    try {
      setLoading(true);
      const data = await modelApi.getAll('available');
      setModels(data.filter((model) => model.is_available !== false));
      setError('');
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) || translations.errors.generic);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (mode === 'scenario') {
        let sample: Record<string, unknown>;
        try {
          const parsed = JSON.parse(formData.scenarioSample) as unknown;
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Scenario sample must be an object');
          }
          sample = parsed as Record<string, unknown>;
        } catch {
          alert(translations.recommendations.invalidScenarioJson);
          setScenarioResult(null);
          setRecommendations([]);
          return;
        }

        const data = await recommendationApi.predictScenario({
          job_id: String(formData.modelId),
          top_k: parseInt(formData.numRecommendations),
          strategy: formData.strategy || undefined,
          sample,
        });
        setScenarioResult(data);
        setRecommendations(data.recommendations);
      } else {
        const data = await recommendationApi.getRecommendations({
          user_id: parseInt(formData.userId),
          job_id: String(formData.modelId),
          top_k: parseInt(formData.numRecommendations),
        });
        setRecommendations(data);
        setScenarioResult(null);
      }
    } catch (err: unknown) {
      alert(getApiErrorDetail(err) || translations.recommendations.error);
      setRecommendations([]);
      setScenarioResult(null);
    } finally {
      setSubmitting(false);
    }
  };

  const showScenarioPrimary = scenarioResult?.task_type === 'action_recommendation';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">{translations.recommendations.title}</h1>

        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage message={error} onRetry={loadModels} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form */}
            <div className="lg:col-span-1">
              <div className="bg-white p-6 rounded-lg shadow-md sticky top-4">
                <h2 className="text-xl font-bold text-gray-800 mb-4">
                  {translations.recommendations.getRecommendations}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {translations.recommendations.mode}
                    </label>
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
                      <button
                        type="button"
                        onClick={() => setMode('classic')}
                        className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                          mode === 'classic' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                        }`}
                      >
                        {translations.recommendations.classicMode}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode('scenario')}
                        className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                          mode === 'scenario' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                        }`}
                      >
                        {translations.recommendations.scenarioMode}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">{translations.recommendations.scenarioHint}</p>
                  </div>

                  {mode === 'classic' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                          {model.name} ({model.model_type}){model.task_type ? ` - ${model.task_type}` : ''}{isAdmin && model.status ? ` - ${model.status}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {translations.recommendations.numberOfRecs}
                    </label>
                    <input
                      type="number"
                      value={formData.numRecommendations}
                      onChange={(e) => setFormData({ ...formData, numRecommendations: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                      min="1"
                      max="100"
                    />
                  </div>

                  {mode === 'scenario' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {translations.recommendations.strategyOverride}
                        </label>
                        <input
                          type="text"
                          value={formData.strategy}
                          onChange={(e) => setFormData({ ...formData, strategy: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder={translations.recommendations.strategyOptional}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {translations.recommendations.scenarioSample}
                        </label>
                        <textarea
                          value={formData.scenarioSample}
                          onChange={(e) => setFormData({ ...formData, scenarioSample: e.target.value })}
                          className="w-full min-h-[260px] px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                          required
                          dir="ltr"
                        />
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !formData.modelId || (mode === 'classic' && !formData.userId)}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                  >
                    {submitting ? translations.common.loading : translations.recommendations.getRecommendations}
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

            {/* Results */}
            <div className="lg:col-span-2">
              {recommendations.length > 0 || scenarioResult ? (
                <div className="space-y-6">
                  {scenarioResult && (
                    <div className="bg-white p-6 rounded-lg shadow-md">
                      <div className="flex flex-wrap gap-x-8 gap-y-2 mb-4 text-sm text-gray-700">
                        <p>
                          <strong>{translations.recommendations.taskType}:</strong> {scenarioResult.task_type || '-'}
                        </p>
                        <p>
                          <strong>{translations.recommendations.strategyOverride}:</strong> {scenarioResult.strategy}
                        </p>
                      </div>

                      {scenarioResult.required_fields.length > 0 && (
                        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <p className="text-sm font-medium text-gray-800 mb-2">{translations.recommendations.requiredFields}</p>
                          <div className="flex flex-wrap gap-2">
                            {scenarioResult.required_fields.map((field) => (
                              <span key={field} className="rounded-full bg-white px-3 py-1 text-xs text-gray-700 border border-gray-200">
                                {field}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {showScenarioPrimary && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                          <div className="rounded-xl border border-green-200 bg-green-50 p-5">
                            <p className="text-sm text-green-800 mb-2">{translations.recommendations.primaryAction}</p>
                            <p className="text-2xl font-bold text-green-900">{scenarioResult.recommended_action || '-'}</p>
                          </div>
                          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                            <p className="text-sm text-blue-800 mb-2">{translations.recommendations.effectivenessEstimate}</p>
                            <p className="text-2xl font-bold text-blue-900">
                              {typeof scenarioResult.effectiveness_estimate === 'number'
                                ? scenarioResult.effectiveness_estimate.toFixed(4)
                                : '-'}
                            </p>
                          </div>
                        </div>
                      )}

                      {showScenarioPrimary && scenarioResult.action_candidates.length > 0 && (
                        <div className="mb-6">
                          <h2 className="text-xl font-bold text-gray-800 mb-4">
                            {translations.recommendations.actionCandidates}
                          </h2>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">رتبه</th>
                                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{translations.recommendations.score}</th>
                                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Support</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {scenarioResult.action_candidates.map((candidate) => (
                                  <tr key={`${candidate.action}-${candidate.rank}`} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{candidate.rank}</td>
                                    <td className="px-6 py-4 text-sm text-gray-900">{candidate.action}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{candidate.score.toFixed(4)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{candidate.support ?? '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">
                      {scenarioResult && showScenarioPrimary
                        ? translations.recommendations.secondaryRecommendations
                        : translations.recommendations.results}
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                              رتبه
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                              {translations.recommendations.itemId}
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                              {translations.recommendations.score}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {recommendations.map((rec, index) => (
                            <tr key={`${rec.item_id}-${rec.rank ?? index}`} className="hover:bg-gray-50">
                              <td className="px-6 py-4 text-sm font-medium text-gray-900">{rec.rank ?? index + 1}</td>
                              <td className="px-6 py-4 text-sm text-gray-900">{String(rec.item_id)}</td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {rec.score.toFixed(4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-8 rounded-lg shadow-md text-center">
                  <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <p className="text-gray-600">
                    برای دریافت توصیه‌ها، فرم سمت راست را تکمیل کنید
                  </p>
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

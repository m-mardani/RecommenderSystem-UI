'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/common/AppShell';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { translations } from '@/lib/utils/translations';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { modelApi, recommendationApi } from '@/lib/api';
import {
  ActionCandidate,
  InferenceProfile,
  Model,
  Recommendation,
  ScenarioPredictionResponse,
} from '@/types';
import { useAuth } from '@/contexts/AuthContext';

type RecommendationMode = 'classic' | 'scenario';
type RecommendationTaskType =
  | 'action_recommendation'
  | 'item_recommendation'
  | 'content_recommendation'
  | 'context_recommendation'
  | string;

type SampleFieldRow = {
  id: string;
  key: string;
  value: string;
};

const createSampleRow = (key = '', value = '', idPrefix = 'row'): SampleFieldRow => ({
  id: `${idPrefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  key,
  value,
});

const createEmptySampleRow = (): SampleFieldRow => createSampleRow();

const getRecommendationDisplayTitle = (recommendation: Recommendation): string =>
  recommendation.movie_name?.trim() || recommendation.item_name?.trim() || String(recommendation.item_id);

const hasDedicatedDisplayTitle = (recommendation: Recommendation): boolean =>
  Boolean(recommendation.movie_name?.trim() || recommendation.item_name?.trim());

const parseStructuredValue = (value: string): string | number | boolean => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return value;
};

const sampleRowsToObject = (rows: SampleFieldRow[]): Record<string, unknown> => {
  const entries = rows
    .map((row) => [row.key.trim(), parseStructuredValue(row.value)] as const)
    .filter(([key]) => key.length > 0);
  return Object.fromEntries(entries);
};

const objectToSampleRows = (input: Record<string, unknown>): SampleFieldRow[] => {
  const rows = Object.entries(input).map(([key, value], index) => ({
    id: `parsed-${index}-${key}`,
    key,
    value:
      typeof value === 'string'
        ? value
        : value === null || value === undefined
          ? ''
          : String(value),
  }));
  return rows.length > 0 ? rows : [createEmptySampleRow()];
};

const buildProfileSampleRows = (profile?: InferenceProfile | null): SampleFieldRow[] => {
  const fields = profile?.sample_fields ?? [];
  if (fields.length === 0) return [createEmptySampleRow()];
  return fields.map((field, index) => ({
    id: `profile-${index}-${field}`,
    key: field,
    value: '',
  }));
};

const getProfilePresetSelection = (profile?: InferenceProfile | null): string => {
  if (!profile) return '';
  const supportedPresets = profile.supported_presets ?? [];
  if (profile.recommended_preset && supportedPresets.includes(profile.recommended_preset)) {
    return profile.recommended_preset;
  }
  if (!profile.recommended_preset && supportedPresets.length === 1) {
    return supportedPresets[0];
  }
  return '';
};

const getInferenceProfileSignature = (profile?: InferenceProfile | null): string => {
  if (!profile) return '';
  return JSON.stringify({
    dataset_family: profile.dataset_family ?? null,
    recommended_preset: profile.recommended_preset ?? null,
    supported_presets: profile.supported_presets,
    task_type: profile.task_type ?? null,
    strategy: profile.strategy ?? null,
    sample_fields: profile.sample_fields,
    required_sample_fields: profile.required_sample_fields,
  });
};

const formatActionEstimate = (candidate: ActionCandidate): string => {
  if (typeof candidate.mean_effectiveness === 'number') return candidate.mean_effectiveness.toFixed(4);
  return candidate.score.toFixed(4);
};

function RecommendationsContent() {
  const { isAdmin } = useAuth();
  const searchParams = useSearchParams();
  const [models, setModels] = useState<Model[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [scenarioResult, setScenarioResult] = useState<ScenarioPredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<RecommendationMode>('scenario');
  const [useRawJsonEditor, setUseRawJsonEditor] = useState(false);
  const [sampleRows, setSampleRows] = useState<SampleFieldRow[]>([createEmptySampleRow()]);
  const [rawScenarioJson, setRawScenarioJson] = useState(
    JSON.stringify(sampleRowsToObject([createEmptySampleRow()]), null, 2)
  );
  const [inferenceProfile, setInferenceProfile] = useState<InferenceProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');

  const [formData, setFormData] = useState({
    userId: '',
    modelId: searchParams.get('modelId') || '',
    numRecommendations: '5',
  });

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

  useEffect(() => {
    void loadModels();
  }, [isAdmin]);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === formData.modelId) ?? null,
    [models, formData.modelId]
  );

  useEffect(() => {
    let cancelled = false;

    const syncProfile = async () => {
      const modelId = String(formData.modelId || '').trim();
      if (!modelId || !selectedModel) {
        setInferenceProfile(null);
        setSelectedPreset('');
        setProfileError('');
        setProfileLoading(false);
        setSampleRows([createEmptySampleRow()]);
        setRawScenarioJson(JSON.stringify(sampleRowsToObject([createEmptySampleRow()]), null, 2));
        return;
      }

      setRecommendations([]);
      setScenarioResult(null);
      setProfileError('');
      setSelectedPreset('');
      setInferenceProfile(null);
      setSampleRows([createEmptySampleRow()]);
      setRawScenarioJson(JSON.stringify(sampleRowsToObject([createEmptySampleRow()]), null, 2));

      const immediateProfile = selectedModel.inference_profile ?? null;
      const immediateSignature = getInferenceProfileSignature(immediateProfile);

      if (immediateProfile) {
        setInferenceProfile(immediateProfile);
        setSelectedPreset(getProfilePresetSelection(immediateProfile));
        const initialRows = buildProfileSampleRows(immediateProfile);
        setSampleRows(initialRows);
        setRawScenarioJson(JSON.stringify(sampleRowsToObject(initialRows), null, 2));
      }

      setProfileLoading(true);
      try {
        const hydratedModel = await modelApi.getById(modelId);
        if (cancelled) return;

        const hydratedProfile = hydratedModel.inference_profile ?? null;
        const hydratedSignature = getInferenceProfileSignature(hydratedProfile);
        if (hydratedProfile) {
          setInferenceProfile(hydratedProfile);
          setSelectedPreset(getProfilePresetSelection(hydratedProfile));
          if (hydratedSignature !== immediateSignature) {
            const hydratedRows = buildProfileSampleRows(hydratedProfile);
            setSampleRows(hydratedRows);
            setRawScenarioJson(JSON.stringify(sampleRowsToObject(hydratedRows), null, 2));
          }
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setProfileError(getApiErrorDetail(err) || translations.recommendations.profileLoadError);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };

    void syncProfile();

    return () => {
      cancelled = true;
    };
  }, [selectedModel, formData.modelId]);

  const supportedPresets = inferenceProfile?.supported_presets ?? [];
  const requiredSampleFields = useMemo(
    () => new Set(inferenceProfile?.required_sample_fields ?? []),
    [inferenceProfile]
  );
  const structuredSamplePreview = useMemo(
    () => JSON.stringify(sampleRowsToObject(sampleRows), null, 2),
    [sampleRows]
  );
  const activeTaskType = scenarioResult?.task_type ?? inferenceProfile?.task_type ?? '-';
  const isActionRecommendation = scenarioResult?.task_type === 'action_recommendation';
  const primaryAction =
    scenarioResult?.recommended_action?.trim() || scenarioResult?.action_candidates[0]?.action || null;
  const resultHeading =
    scenarioResult && isActionRecommendation
      ? translations.recommendations.secondaryRecommendations
      : translations.recommendations.results;

  const updateSampleRow = (id: string, field: 'key' | 'value', nextValue: string) => {
    setSampleRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: nextValue } : row))
    );
  };

  const addSampleRow = () => {
    setSampleRows((prev) => [...prev, createEmptySampleRow()]);
  };

  const removeSampleRow = (id: string) => {
    setSampleRows((prev) => {
      const target = prev.find((row) => row.id === id);
      if (target && requiredSampleFields.has(target.key.trim())) {
        return prev;
      }
      if (prev.length === 1) return [{ ...prev[0], key: '', value: '' }];
      return prev.filter((row) => row.id !== id);
    });
  };

  const applyProfilePreset = (preset: string) => {
    if (!inferenceProfile || !supportedPresets.includes(preset)) return;
    const nextRows = buildProfileSampleRows(inferenceProfile);
    setSelectedPreset(preset);
    setMode('scenario');
    setSampleRows(nextRows);
    setRawScenarioJson(JSON.stringify(sampleRowsToObject(nextRows), null, 2));
    setUseRawJsonEditor(false);
  };

  const toggleRawJsonEditor = () => {
    if (!useRawJsonEditor) {
      setRawScenarioJson(structuredSamplePreview);
      setUseRawJsonEditor(true);
      return;
    }

    try {
      const parsed = JSON.parse(rawScenarioJson) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Scenario sample must be an object');
      }
      setSampleRows(objectToSampleRows(parsed as Record<string, unknown>));
      setUseRawJsonEditor(false);
    } catch {
      alert(translations.recommendations.invalidScenarioJson);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (mode === 'scenario') {
        let sample: Record<string, unknown>;

        if (useRawJsonEditor) {
          try {
            const parsed = JSON.parse(rawScenarioJson) as unknown;
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
        } else {
          sample = sampleRowsToObject(sampleRows);
          if (Object.keys(sample).length === 0) {
            alert('حداقل یک فیلد برای sample لازم است.');
            setScenarioResult(null);
            setRecommendations([]);
            return;
          }
        }

        const data = await recommendationApi.predictScenario({
          job_id: String(formData.modelId),
          top_k: parseInt(formData.numRecommendations),
          strategy: inferenceProfile?.strategy || undefined,
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

  return (
    <AppShell
      title={translations.nav.recommendations}
      description="این صفحه برای inference عمومی طراحی شده است؛ در صورت وجود inference_profile، presetها و فیلدهای نمونه از همان metadata مدل گرفته می‌شوند."
    >
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} onRetry={loadModels} />
      ) : (
        <div className="space-y-6">
          <div className="app-card overflow-hidden p-0">
            <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  {translations.recommendations.getRecommendations}
                </h2>
                <p className="mt-1 text-sm leading-7 text-slate-500">
                  {translations.recommendations.scenarioHint}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs leading-6 text-slate-600">
                {mode === 'scenario'
                  ? translations.recommendations.scenarioMode
                  : translations.recommendations.classicMode}
              </div>
            </div>

            <div className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <div className="space-y-4 xl:order-1">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        {translations.recommendations.mode}
                      </label>
                      <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
                        <button
                          type="button"
                          onClick={() => setMode('scenario')}
                          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                            mode === 'scenario' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                          }`}
                        >
                          {translations.recommendations.scenarioMode}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode('classic')}
                          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                            mode === 'classic' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                          }`}
                        >
                          {translations.recommendations.classicMode}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        {mode === 'scenario'
                          ? translations.recommendations.scenarioHint
                          : translations.recommendations.classicHint}
                      </p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        {translations.recommendations.selectModel}
                      </label>
                      <select
                        value={formData.modelId}
                        onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="">{translations.recommendations.selectModel}</option>
                        {models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name} ({model.model_type})
                            {model.task_type ? ` - ${model.task_type}` : ''}
                            {isAdmin && model.status ? ` - ${model.status}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedModel && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                        <p className="mb-2 font-semibold text-slate-900">
                          {translations.recommendations.modelContext}
                        </p>
                        <div className="space-y-1">
                          <p>
                            <strong>{translations.recommendations.datasetId}:</strong> {selectedModel.dataset_id || '-'}
                          </p>
                          <p>
                            <strong>{translations.recommendations.modelTaskType}:</strong>{' '}
                            {inferenceProfile?.task_type || '-'}
                          </p>
                          <p>
                            <strong>{translations.recommendations.datasetFamily}:</strong>{' '}
                            {inferenceProfile?.dataset_family || '-'}
                          </p>
                          <p>
                            <strong>{translations.recommendations.profileStrategy}:</strong>{' '}
                            {inferenceProfile?.strategy || '-'}
                          </p>
                          <p>
                            <strong>{translations.recommendations.availablePresetCount}:</strong>{' '}
                            {supportedPresets.length}
                          </p>
                        </div>
                        {profileLoading && (
                          <p className="mt-3 text-xs text-slate-500">
                            {translations.recommendations.profileLoading}
                          </p>
                        )}
                        {profileError && (
                          <p className="mt-3 text-xs text-amber-700">{profileError}</p>
                        )}
                        {!profileLoading && !profileError && !inferenceProfile && (
                          <p className="mt-3 text-xs text-slate-500">
                            {translations.recommendations.profileMissing}
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        {translations.recommendations.numberOfRecs}
                      </label>
                      <input
                        type="number"
                        value={formData.numRecommendations}
                        onChange={(e) => setFormData({ ...formData, numRecommendations: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500"
                        required
                        min="1"
                        max="100"
                      />
                    </div>

                    {mode === 'classic' ? (
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          {translations.recommendations.userId}
                        </label>
                        <input
                          type="number"
                          value={formData.userId}
                          onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500"
                          required
                          min="1"
                        />
                      </div>
                    ) : (
                      <>
                        {inferenceProfile?.strategy && (
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              {translations.recommendations.strategyOverride}
                            </label>
                            <input
                              type="text"
                              value={inferenceProfile.strategy}
                              readOnly
                              className="w-full rounded-lg border border-gray-300 bg-slate-50 px-4 py-2 text-slate-600"
                              placeholder={translations.recommendations.strategyOptional}
                            />
                          </div>
                        )}

                        {supportedPresets.length > 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4">
                            <p className="text-sm font-semibold text-slate-900">
                              {translations.recommendations.genericPresetTitle}
                            </p>
                            <p className="mt-1 text-xs leading-6 text-slate-500">
                              {translations.recommendations.genericPresetHint}
                            </p>
                            <div className="mt-3 flex flex-col gap-3">
                              <select
                                value={selectedPreset}
                                onChange={(e) => applyProfilePreset(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">{translations.recommendations.selectPreset}</option>
                                {supportedPresets.map((preset) => (
                                  <option key={preset} value={preset}>
                                    {preset}
                                  </option>
                                ))}
                              </select>
                              {selectedPreset && (
                                <button
                                  type="button"
                                  onClick={() => applyProfilePreset(selectedPreset)}
                                  className="app-btn app-btn-secondary"
                                >
                                  {translations.recommendations.applyPreset}: {selectedPreset}
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          selectedModel && (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-xs leading-6 text-slate-500">
                              {translations.recommendations.noPresetAvailable}
                            </div>
                          )
                        )}
                      </>
                    )}
                  </div>

                  <div className="space-y-4 xl:order-2">
                    {mode === 'scenario' && (
                      <div className="app-panel p-4">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {translations.recommendations.sampleEditorTitle}
                            </p>
                            <p className="mt-1 text-xs leading-6 text-slate-500">
                              {translations.recommendations.sampleEditorHint}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={toggleRawJsonEditor}
                            className="app-btn app-btn-secondary"
                          >
                            {useRawJsonEditor
                              ? translations.recommendations.backToForm
                              : translations.recommendations.advancedJson}
                          </button>
                        </div>

                        {useRawJsonEditor ? (
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              {translations.recommendations.scenarioSample}
                            </label>
                            <textarea
                              value={rawScenarioJson}
                              onChange={(e) => setRawScenarioJson(e.target.value)}
                              className="min-h-[280px] w-full rounded-lg border border-gray-300 px-4 py-3 font-mono text-sm focus:ring-2 focus:ring-blue-500"
                              required
                              dir="ltr"
                            />
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {sampleRows.map((row) => {
                              const isRequired = requiredSampleFields.has(row.key.trim());
                              return (
                                <div key={row.id} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                                  <div>
                                    <input
                                      type="text"
                                      value={row.key}
                                      onChange={(e) => updateSampleRow(row.id, 'key', e.target.value)}
                                      placeholder={translations.recommendations.sampleFieldKey}
                                      dir="ltr"
                                    />
                                    {isRequired && (
                                      <p className="mt-1 text-xs text-rose-600">
                                        {translations.recommendations.sampleFieldRequired}
                                      </p>
                                    )}
                                  </div>
                                  <input
                                    type="text"
                                    value={row.value}
                                    onChange={(e) => updateSampleRow(row.id, 'value', e.target.value)}
                                    placeholder={translations.recommendations.sampleFieldValue}
                                    dir="ltr"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeSampleRow(row.id)}
                                    disabled={isRequired}
                                    className="app-btn app-btn-ghost text-rose-600 disabled:cursor-not-allowed disabled:text-slate-400"
                                  >
                                    حذف
                                  </button>
                                </div>
                              );
                            })}

                            <div className="flex flex-wrap gap-3">
                              <button type="button" onClick={addSampleRow} className="app-btn app-btn-secondary">
                                {translations.recommendations.addField}
                              </button>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                {translations.recommendations.samplePreview}
                              </p>
                              <pre className="text-xs leading-6 text-slate-700" dir="ltr">
                                {structuredSamplePreview}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting || !formData.modelId || (mode === 'classic' && !formData.userId)}
                      className="app-btn app-btn-primary w-full"
                    >
                      {submitting ? translations.common.loading : translations.recommendations.getRecommendations}
                    </button>
                  </div>
                </div>
              </form>

              {models.length === 0 && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-yellow-800">
                    هیچ مدلی موجود نیست. لطفاً ابتدا یک مدل آموزش دهید.
                  </p>
                </div>
              )}
            </div>
          </div>

          {recommendations.length > 0 || scenarioResult ? (
            <div className="space-y-6">
              {scenarioResult && (
                <div className="app-card p-6">
                  <div className="space-y-4">
                    <div className="space-y-3 text-sm leading-7 text-gray-700">
                      <p>
                        <strong>{translations.recommendations.taskType}:</strong>{' '}
                        {(scenarioResult.task_type as RecommendationTaskType) || '-'}
                      </p>
                      <p>
                        <strong>{translations.recommendations.strategyOverride}:</strong>{' '}
                        {inferenceProfile?.strategy || scenarioResult.strategy}
                      </p>
                      <p>
                        <strong>Job ID:</strong> {scenarioResult.job_id}
                      </p>
                      <p>
                        <strong>{translations.recommendations.datasetId}:</strong> {scenarioResult.dataset_id}
                      </p>
                    </div>

                    {scenarioResult.required_fields.length > 0 && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <p className="mb-3 text-sm font-medium text-gray-800">
                          {translations.recommendations.requiredFields}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {scenarioResult.required_fields.map((field) => (
                            <span
                              key={field}
                              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700"
                            >
                              {field}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {isActionRecommendation && (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
                          <p className="mb-2 text-sm text-green-800">{translations.recommendations.primaryAction}</p>
                          <p className="text-2xl font-bold text-green-900">{primaryAction || '-'}</p>
                        </div>

                        {typeof scenarioResult.effectiveness_estimate === 'number' && (
                          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                            <p className="mb-2 text-sm text-blue-800">
                              {translations.recommendations.effectivenessEstimate}
                            </p>
                            <p className="text-2xl font-bold text-blue-900">
                              {scenarioResult.effectiveness_estimate.toFixed(4)}
                            </p>
                            <p className="mt-2 text-xs leading-6 text-blue-800">
                              {translations.recommendations.estimateNotice}
                            </p>
                          </div>
                        )}

                        {scenarioResult.action_candidates.length > 0 && (
                          <div>
                            <h2 className="mb-4 text-xl font-bold text-gray-800">
                              {translations.recommendations.actionCandidates}
                            </h2>
                            <div className="overflow-x-auto">
                              <table className="w-full">
                                <thead className="border-b border-gray-200 bg-gray-50">
                                  <tr>
                                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">
                                      {translations.recommendations.rank}
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">
                                      {translations.recommendations.primaryAction}
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">
                                      {translations.recommendations.effectivenessEstimate}
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">
                                      Support
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {scenarioResult.action_candidates.map((candidate) => (
                                    <tr key={`${candidate.action}-${candidate.rank}`} className="hover:bg-gray-50">
                                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                        {candidate.rank}
                                      </td>
                                      <td className="px-6 py-4 text-sm text-gray-900">{candidate.action}</td>
                                      <td className="px-6 py-4 text-sm text-gray-600">
                                        {formatActionEstimate(candidate)}
                                      </td>
                                      <td className="px-6 py-4 text-sm text-gray-600">
                                        {candidate.support ?? '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="app-card p-6">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">{resultHeading}</h2>
                    <p className="mt-1 text-xs leading-6 text-slate-500">
                      {translations.recommendations.resultIdFallback}
                    </p>
                  </div>
                  {mode === 'scenario' && (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                      {translations.recommendations.taskType}: {activeTaskType}
                    </span>
                  )}
                </div>

                {recommendations.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                    {translations.recommendations.noResults}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b border-gray-200 bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">
                            {translations.recommendations.rank}
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">
                            {translations.recommendations.displayTitle}
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">
                            {translations.recommendations.score}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {recommendations.map((rec, index) => (
                          <tr key={`${rec.item_id}-${rec.rank ?? index}`} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              {rec.rank ?? index + 1}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <div className="flex flex-col gap-1">
                                <span className="font-medium text-gray-900">
                                  {getRecommendationDisplayTitle(rec)}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {translations.recommendations.itemId}: {String(rec.item_id)}
                                </span>
                                {!hasDedicatedDisplayTitle(rec) && (
                                  <span className="text-xs text-slate-400">
                                    {translations.recommendations.displayTitle}: -
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {rec.score.toFixed(4)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="app-empty flex-col">
              <svg
                className="mx-auto mb-4 h-16 w-16 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              <p className="text-gray-600">{translations.recommendations.genericEmptyState}</p>
            </div>
          )}
        </div>
      )}
    </AppShell>
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

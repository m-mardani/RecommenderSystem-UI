'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/common/AppShell';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { translations } from '@/lib/utils/translations';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { datasetApi, trainingApi } from '@/lib/api';
import { Dataset, DatasetAnalysis, TrainingJob, TrainingStartOptions } from '@/types';

export default function TrainingPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasActiveTraining, setHasActiveTraining] = useState(false);
  const [activeJob, setActiveJob] = useState<TrainingJob | null>(null);
  const [analysis, setAnalysis] = useState<DatasetAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  const [formData, setFormData] = useState({
    datasetId: '',
    numEpochs: '10',
    maxRows: '',
    smokeMaxRows: '100',
  });

  useEffect(() => {
    loadDatasets();
    void refreshActiveTrainingState();
  }, []);

  const refreshActiveTrainingState = async (): Promise<boolean> => {
    try {
      const jobs = await trainingApi.getJobs();
      const currentActiveJob = jobs.find((j) => j.status === 'running') || jobs.find((j) => j.status === 'pending') || null;
      const active = currentActiveJob !== null;
      setActiveJob(currentActiveJob);
      setHasActiveTraining(active);
      return active;
    } catch {
      // If we can't load jobs, don't block the user from trying.
      setHasActiveTraining(false);
      setActiveJob(null);
      return false;
    }
  };

  const formatEta = (seconds?: number) => {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '-';
    if (seconds < 60) return `${Math.round(seconds)} ثانیه`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} دقیقه`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return minutes > 0 ? `${hours} ساعت و ${minutes} دقیقه` : `${hours} ساعت`;
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

  const buildTrainingOptionsFromAnalysis = (input: DatasetAnalysis | null): TrainingStartOptions => {
    if (!input) return {};
    const payload = input.training_payload;
    return {
      strategy: typeof payload.strategy === 'string' ? payload.strategy : undefined,
      user_column: typeof payload.user_column === 'string' ? payload.user_column : undefined,
      item_column: typeof payload.item_column === 'string' ? payload.item_column : undefined,
      rating_column: typeof payload.rating_column === 'string' ? payload.rating_column : undefined,
      temporal_columns: Array.isArray(payload.temporal_columns)
        ? payload.temporal_columns.map((v) => String(v))
        : undefined,
      spatial_columns: Array.isArray(payload.spatial_columns)
        ? payload.spatial_columns.map((v) => String(v))
        : undefined,
      environmental_columns: Array.isArray(payload.environmental_columns)
        ? payload.environmental_columns.map((v) => String(v))
        : undefined,
    };
  };

  const runAnalysis = async (datasetId: string): Promise<DatasetAnalysis> => {
    const id = String(datasetId).trim();
    if (!id) throw new Error('dataset_id is required');
    setAnalysisLoading(true);
    setAnalysisError('');
    try {
      const result = await datasetApi.analyze(id, {});
      setAnalysis(result);
      return result;
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err) || translations.datasets.analyzeError;
      setAnalysisError(detail);
      setAnalysis(null);
      throw err;
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleAnalyzeDataset = async () => {
    if (!formData.datasetId) return;
    try {
      await runAnalysis(formData.datasetId);
    } catch {
      // state already updated
    }
  };

  const handleTrainAuto = async () => {
    if (!formData.datasetId) return;
    const parsedEpochs = Number(formData.numEpochs);
    if (!Number.isInteger(parsedEpochs) || parsedEpochs < 1) {
      alert(translations.training.invalidEpochs);
      return;
    }
    const active = await refreshActiveTrainingState();
    if (active) {
      alert(translations.training.oneAtATime);
      return;
    }
    setSubmitting(true);

    try {
      await trainingApi.trainAuto(formData.datasetId, parsedEpochs);
      alert(translations.training.startSuccess);
      setFormData({ datasetId: '', numEpochs: '10', maxRows: '', smokeMaxRows: '100' });
      setAnalysis(null);
      setAnalysisError('');
    } catch (err: unknown) {
      alert(getApiErrorDetail(err) || translations.training.startError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrainEngine = async () => {
    if (!formData.datasetId) return;
    const parsedEpochs = Number(formData.numEpochs);
    if (!Number.isInteger(parsedEpochs) || parsedEpochs < 1) {
      alert(translations.training.invalidEpochs);
      return;
    }
    const parsedMaxRows = formData.maxRows.trim() ? Number(formData.maxRows) : undefined;
    if (
      parsedMaxRows !== undefined &&
      (!Number.isInteger(parsedMaxRows) || parsedMaxRows < 10)
    ) {
      alert(translations.training.invalidMaxRows);
      return;
    }
    const active = await refreshActiveTrainingState();
    if (active) {
      alert(translations.training.oneAtATime);
      return;
    }
    setSubmitting(true);

    try {
      const resolvedAnalysis = analysis && analysis.dataset_id === formData.datasetId
        ? analysis
        : await runAnalysis(formData.datasetId);
      const options: TrainingStartOptions = {
        ...buildTrainingOptionsFromAnalysis(resolvedAnalysis),
        max_rows: parsedMaxRows,
      };
      await trainingApi.trainEngine(formData.datasetId, parsedEpochs, options);
      alert(translations.training.startSuccess);
      setFormData({ datasetId: '', numEpochs: '10', maxRows: '', smokeMaxRows: '100' });
      setAnalysis(null);
      setAnalysisError('');
    } catch (err: unknown) {
      alert(getApiErrorDetail(err) || translations.training.startError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSmokeTrain = async () => {
    if (!formData.datasetId) return;
    const parsedMaxRows = formData.smokeMaxRows.trim() ? Number(formData.smokeMaxRows) : 100;
    if (!Number.isInteger(parsedMaxRows) || parsedMaxRows < 10) {
      alert(translations.training.invalidMaxRows);
      return;
    }
    const active = await refreshActiveTrainingState();
    if (active) {
      alert(translations.training.oneAtATime);
      return;
    }
    setSubmitting(true);

    try {
      const resolvedAnalysis = analysis && analysis.dataset_id === formData.datasetId
        ? analysis
        : await runAnalysis(formData.datasetId);
      const options: TrainingStartOptions = {
        ...buildTrainingOptionsFromAnalysis(resolvedAnalysis),
        max_rows: parsedMaxRows,
      };
      await trainingApi.trainEngine(formData.datasetId, 1, options);
      alert(translations.training.startSuccess);
      setFormData({ datasetId: '', numEpochs: '10', maxRows: '', smokeMaxRows: '100' });
      setAnalysis(null);
      setAnalysisError('');
    } catch (err: unknown) {
      alert(getApiErrorDetail(err) || translations.training.startError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute adminOnly>
      <AppShell
        title={translations.nav.training}
        description="شروع آموزش‌های جدید، بررسی تحلیل dataset و مرور payload پیشنهادی backend."
      >
          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <ErrorMessage message={error} onRetry={loadDatasets} />
          ) : (
            <div className="app-card overflow-hidden p-0">
              <div className="border-b border-slate-200 bg-slate-50 px-8 py-5">
                <h2 className="text-xl font-bold text-gray-800">{translations.training.startNew}</h2>
              </div>

              <div className="p-8">
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <div className="space-y-6 xl:order-1">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {translations.training.selectDataset}
                      </label>
                      <select
                        value={formData.datasetId}
                        onChange={(e) => {
                          setFormData({ ...formData, datasetId: e.target.value });
                          setAnalysis(null);
                          setAnalysisError('');
                        }}
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

                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
                      <p className="text-sm font-semibold text-emerald-900">
                        {translations.training.autoTrainTitle}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-emerald-800">
                        {translations.training.autoTrainDescription}
                      </p>
                      <p className="mt-2 text-xs leading-6 text-emerald-700">
                        {translations.training.autoTrainSystemEpochs}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-blue-900">
                          {translations.training.manualTrainTitle}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-blue-800">
                          {translations.training.manualTrainDescription}
                        </p>
                      </div>

                      <div>
                        <label htmlFor="num-epochs" className="block text-sm font-medium text-gray-700 mb-2">
                          {translations.training.numberOfEpochs}
                        </label>
                        <input
                          id="num-epochs"
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={formData.numEpochs}
                          onChange={(e) => setFormData({ ...formData, numEpochs: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          required
                        />
                        <p className="mt-2 text-sm text-gray-500">{translations.training.epochsHint}</p>
                      </div>

                      <div>
                        <label htmlFor="max-rows" className="block text-sm font-medium text-gray-700 mb-2">
                          {translations.training.maxRows}
                        </label>
                        <input
                          id="max-rows"
                          type="number"
                          min={10}
                          step={1}
                          inputMode="numeric"
                          value={formData.maxRows}
                          onChange={(e) => setFormData({ ...formData, maxRows: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="200"
                        />
                        <p className="mt-2 text-sm text-gray-500">{translations.training.maxRowsHint}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-amber-900">
                          {translations.training.smokeTrainTitle}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-amber-800">
                          {translations.training.smokeTrainDescription}
                        </p>
                        <p className="mt-2 text-xs leading-6 text-amber-700">
                          {translations.training.smokeTrainDefaults}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs text-amber-800">
                            {translations.training.pipelineValidationOnly}
                          </span>
                          <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs text-amber-800">
                            {translations.training.notQualityValidated}
                          </span>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="smoke-max-rows" className="block text-sm font-medium text-gray-700 mb-2">
                          {translations.training.smokeTrainRows}
                        </label>
                        <input
                          id="smoke-max-rows"
                          type="number"
                          min={10}
                          step={1}
                          inputMode="numeric"
                          value={formData.smokeMaxRows}
                          onChange={(e) => setFormData({ ...formData, smokeMaxRows: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="100"
                        />
                        <p className="mt-2 text-sm text-gray-500">{translations.training.smokeTrainRowsHint}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6 xl:order-2">
                    <div className="app-panel p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{translations.training.reviewMapping}</p>
                          <p className="text-xs text-gray-500">{translations.training.analysisRequired}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleAnalyzeDataset()}
                          disabled={!formData.datasetId || analysisLoading}
                          className="app-btn app-btn-primary"
                        >
                          {analysisLoading ? translations.training.analysisLoading : translations.training.analyzeDataset}
                        </button>
                      </div>

                      {analysisError && (
                        <div className="mt-4">
                          <ErrorMessage message={analysisError} onRetry={() => void handleAnalyzeDataset()} />
                        </div>
                      )}

                      {analysis && (
                        <div className="mt-4 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <p className="text-gray-700">
                              <strong>{translations.datasets.detectedStrategy}:</strong> {analysis.detected_strategy || '-'}
                            </p>
                            <p className="text-gray-700">
                              <strong>{translations.datasets.taskType}:</strong> {analysis.task_type || '-'}
                            </p>
                            <p className="text-gray-700">
                              <strong>{translations.datasets.confidence}:</strong> {analysis.confidence.toFixed(2)}
                            </p>
                            <p className="text-gray-700">
                              <strong>{translations.datasets.feasibleForTraining}:</strong>{' '}
                              {analysis.feasible_for_training ? 'بله' : 'خیر'}
                            </p>
                          </div>

                          {analysis.warnings.length > 0 ? (
                            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                              <p className="text-sm font-medium text-yellow-900 mb-2">{translations.datasets.warnings}</p>
                              <ul className="list-disc pr-5 text-sm text-yellow-800 space-y-1">
                                {analysis.warnings.map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">{translations.datasets.noWarnings}</p>
                          )}

                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">{translations.datasets.mapping}</p>
                            <pre className="text-xs bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(analysis.mapping, null, 2)}
                            </pre>
                          </div>

                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">{translations.datasets.trainingPayload}</p>
                            <pre className="text-xs bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(
                                {
                                  ...analysis.training_payload,
                                  ...(formData.maxRows.trim() ? { max_rows: Number(formData.maxRows) } : {}),
                                  num_epochs: Number(formData.numEpochs),
                                },
                                null,
                                2
                              )}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
                      <p className="text-sm text-blue-800">
                        <strong>توجه:</strong> تحلیل dataset فقط mapping، feasibility و training payload را برمی‌گرداند و به‌تنهایی train انجام نمی‌دهد. مقدار 1 epoch فقط برای smoke/validation مناسب است و معیار کیفیت مدل نهایی نیست.
                      </p>
                    </div>

                    {hasActiveTraining && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm text-yellow-800">{translations.training.oneAtATime}</p>
                        {activeJob && (
                          <div className="mt-2 text-sm text-yellow-900 space-y-1">
                            <p>
                              <strong>{translations.jobs.jobId}:</strong> {activeJob.id}
                            </p>
                            <p>
                              <strong>{translations.training.status}:</strong>{' '}
                              {activeJob.status === 'running'
                                ? typeof activeJob.eta_seconds === 'number'
                                  ? `${translations.jobs.statuses.running} · ${formatEta(activeJob.eta_seconds)}`
                                  : activeJob.estimated_completion_at
                                    ? `${translations.jobs.statuses.running} · تا ${new Date(activeJob.estimated_completion_at).toLocaleTimeString('fa-IR')}`
                                    : translations.jobs.statuses.running
                                : translations.jobs.statuses.pending}
                            </p>
                            {activeJob.progress !== undefined && (
                              <p>
                                <strong>{translations.training.progress}:</strong> {Math.round(activeJob.progress)}%
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={handleTrainAuto}
                        disabled={submitting || !formData.datasetId || hasActiveTraining}
                        className="app-btn app-btn-success w-full"
                      >
                        {submitting ? translations.common.loading : translations.training.trainAuto}
                      </button>

                      <button
                        type="button"
                        onClick={handleTrainEngine}
                        disabled={submitting || !formData.datasetId || hasActiveTraining}
                        className="app-btn app-btn-primary w-full"
                      >
                        {submitting ? translations.common.loading : translations.training.trainEngine}
                      </button>

                      <button
                        type="button"
                        onClick={handleSmokeTrain}
                        disabled={submitting || !formData.datasetId || hasActiveTraining}
                        className="app-btn w-full border border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200"
                      >
                        {submitting ? translations.common.loading : translations.training.smokeTrain}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {datasets.length === 0 && (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-yellow-800">
                    هیچ مجموعه داده‌ای موجود نیست. لطفاً ابتدا یک مجموعه داده بارگذاری کنید.
                  </p>
                </div>
              )}
            </div>
          )}
      </AppShell>
    </ProtectedRoute>
  );
}

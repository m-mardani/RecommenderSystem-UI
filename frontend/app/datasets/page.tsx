'use client';

import { useEffect, useRef, useState } from 'react';
import { Navbar } from '@/components/common/Navbar';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { translations } from '@/lib/utils/translations';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { datasetApi, multipartUploadDataset } from '@/lib/api';
import { getAccessToken } from '@/lib/api/client';
import { Dataset } from '@/types';

export default function DatasetsPage() {
  type DatasetRow = Dataset & { optimistic?: boolean };

  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const uploadAbortRef = useRef<AbortController | null>(null);

  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [preview, setPreview] = useState<{
    dataset_id: string;
    columns: string[];
    rows: Array<Record<string, unknown>>;
    num_rows_returned: number;
  } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    file: null as File | null,
  });

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    try {
      setLoading(true);
      const data = await datasetApi.getAll();
      setDatasets((prev) => {
        const serverIds = new Set(data.map((d) => d.id));
        const optimisticOnly = prev.filter((d) => d.optimistic && !serverIds.has(d.id));
        const prevById = new Map(prev.map((d) => [d.id, d] as const));
        const mergedServer = data.map((d) => {
          const existing = prevById.get(d.id);
          // If it existed as optimistic, replace with server copy.
          if (existing?.optimistic) return { ...d, optimistic: false };
          return d;
        });

        return [...optimisticOnly, ...mergedServer];
      });
      setError('');
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) || translations.errors.generic);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({ ...formData, file: e.target.files[0] });
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file) return;

    setUploadLoading(true);
    setUploadProgress(0);
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = new AbortController();
    try {
      const token = getAccessToken();
      if (!token) throw new Error(translations.errors.unauthorized);

      const result = await multipartUploadDataset(formData.file, token, {
        signal: uploadAbortRef.current.signal,
        onProgressBytes: (uploadedBytes) => {
          const pct = formData.file?.size ? Math.round((uploadedBytes / formData.file.size) * 100) : 0;
          setUploadProgress(pct);
        },
      });

      const created = {
        id: String(result.dataset_id),
        name: formData.file.name,
        description: '-',
        upload_date: new Date().toISOString(),
      };

      const optimistic = { ...created, optimistic: true };
      setDatasets((prev) => [optimistic, ...prev.filter((d) => d.id !== created.id)]);
      setShowUploadForm(false);
      setFormData({ name: '', description: '', file: null });
      await loadDatasets();
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err);
      // Ignore abort errors (user cancelled).
      if (detail && /abort|canceled|cancelled/i.test(detail)) return;
      alert(detail || translations.datasets.uploadError);
    } finally {
      setUploadLoading(false);
      setUploadProgress(0);
      uploadAbortRef.current = null;
    }
  };

  const handleCancelUpload = () => {
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    setUploadLoading(false);
    setUploadProgress(0);
  };

  const handleDelete = async (datasetId: string) => {
    try {
      setError('');
      await datasetApi.delete(datasetId);
      setDatasets((prev) => prev.filter((d) => d.id !== datasetId));

      if (selectedDatasetId === datasetId) {
        setSelectedDatasetId(null);
        setPreview(null);
        setPreviewError('');
      }
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) || translations.errors.generic);
    }
  };

  const handleSelectDataset = async (datasetId: string) => {
    const id = String(datasetId);
    if (selectedDatasetId === id) {
      setSelectedDatasetId(null);
      setPreview(null);
      setPreviewError('');
      return;
    }

    setSelectedDatasetId(id);
    setPreview(null);
    setPreviewError('');
    try {
      setPreviewLoading(true);
      const data = await datasetApi.getPreview(id);
      setPreview(data);
    } catch (err: unknown) {
      setPreviewError(getApiErrorDetail(err) || translations.errors.generic);
    } finally {
      setPreviewLoading(false);
    }
  };

  const getSelectedDataset = (): Dataset | null => {
    if (!selectedDatasetId) return null;
    return datasets.find((d) => d.id === selectedDatasetId) ?? null;
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {uploadLoading && (
          <div className="fixed inset-0 z-50 bg-gray-900/40 backdrop-blur-[1px] flex items-center justify-center px-4">
            <div className="w-full max-w-lg bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <p className="text-sm font-semibold text-gray-800">{translations.datasets.uploadNew}</p>
                <p className="text-xs text-gray-500">{translations.common.loading}</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{translations.common.progress ?? 'Progress'}</span>
                  <span className="text-sm text-gray-700 tabular-nums">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded">
                  <div
                    className="h-2 bg-blue-600 rounded transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, uploadProgress))}%` }}
                    aria-label="Upload progress"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancelUpload}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    {translations.common.cancel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800">{translations.datasets.title}</h1>
            <button
              onClick={() => setShowUploadForm(!showUploadForm)}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {showUploadForm ? translations.common.cancel : translations.datasets.uploadNew}
            </button>
          </div>

          {/* Upload Form */}
          {showUploadForm && (
            <div className="bg-white p-6 rounded-lg shadow-md mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">{translations.datasets.uploadNew}</h2>
              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {translations.datasets.name}
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {translations.datasets.description}
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {translations.datasets.file}
                  </label>
                  <input
                    type="file"
                    onChange={handleFileChange}
                    accept=".csv,.json"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={uploadLoading}
                  className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400"
                >
                  {uploadLoading ? translations.common.loading : translations.common.submit}
                </button>
              </form>
            </div>
          )}

          {/* Datasets List */}
          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <ErrorMessage message={error} onRetry={loadDatasets} />
          ) : datasets.length === 0 ? (
            <div className="bg-white p-8 rounded-lg shadow-md text-center">
              <p className="text-gray-600">{translations.datasets.noDatasets}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      {translations.datasets.name}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      {translations.datasets.description}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      {translations.datasets.uploadDate}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      {translations.datasets.rows}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      {translations.datasets.actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {datasets.map((dataset) => (
                    <tr
                      key={dataset.id}
                      className={
                        'hover:bg-gray-50 cursor-pointer ' +
                        (selectedDatasetId === dataset.id ? 'bg-blue-50/40' : '')
                      }
                      onClick={() => handleSelectDataset(dataset.id)}
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{dataset.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{dataset.description}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(dataset.upload_date).toLocaleDateString('fa-IR')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{dataset.row_count || '-'}</td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(dataset.id);
                          }}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          {translations.common.delete}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

              {selectedDatasetId && (
                <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">
                        {translations.datasets.preview}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {getSelectedDataset()?.name || selectedDatasetId}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedDatasetId(null);
                        setPreview(null);
                        setPreviewError('');
                      }}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      {translations.common.close}
                    </button>
                  </div>

                  <div className="p-5">
                    {previewLoading ? (
                      <LoadingSpinner />
                    ) : previewError ? (
                      <ErrorMessage
                        message={previewError}
                        onRetry={() => {
                          void handleSelectDataset(selectedDatasetId);
                        }}
                      />
                    ) : !preview ? (
                      <p className="text-sm text-gray-600">{translations.common.loading}</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-x-8 gap-y-2 mb-4">
                          <p className="text-sm text-gray-700">
                            <strong>Dataset ID:</strong> {preview.dataset_id}
                          </p>
                          <p className="text-sm text-gray-700">
                            <strong>{translations.datasets.columns}:</strong> {preview.columns.length}
                          </p>
                          <p className="text-sm text-gray-700">
                            <strong>{translations.datasets.rows}:</strong> {preview.num_rows_returned}
                          </p>
                        </div>

                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <div className="max-h-[420px] overflow-auto">
                            <table className="min-w-full text-sm">
                              <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
                                <tr>
                                  {preview.columns.map((c) => (
                                    <th
                                      key={c}
                                      className="px-4 py-2 text-right text-xs font-semibold text-gray-600 whitespace-nowrap"
                                    >
                                      {c}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {preview.rows.map((r, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    {preview.columns.map((c) => (
                                      <td
                                        key={c}
                                        className="px-4 py-2 text-right text-xs text-gray-700 whitespace-nowrap"
                                      >
                                        {r?.[c] === null || r?.[c] === undefined ? '-' : String(r[c])}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

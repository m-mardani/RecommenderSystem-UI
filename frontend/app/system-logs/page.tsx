'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Navbar } from '@/components/common/Navbar';
import { AdminOnlyRoute } from '@/components/common/AdminOnlyRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { fetchSystemLogs, FetchSystemLogsParams, SystemLogEvent, SystemLogsResponse } from '@/lib/api';
import { getApiErrorDetail } from '@/lib/utils/apiError';
import { useAuth } from '@/contexts/AuthContext';

const ACTION_OPTIONS = [
  '',
  'AUTH_LOGIN',
  'AUTH_LOGOUT',
  'DATASET_UPLOAD_COMPLETED',
  'DATASET_UPLOAD_INIT_MULTIPART',
  'DATASET_UPLOAD_COMPLETED_MULTIPART',
  'ENGINE_TRAIN_STARTED',
  'ENGINE_TRAIN_COMPLETED',
  'ENGINE_TRAIN_FAILED',
  'ENGINE_TRAIN_AUTO_STARTED',
  'ENGINE_TRAIN_AUTO_COMPLETED',
  'ENGINE_TRAIN_AUTO_FAILED',
] as const;

const safeJson = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const formatIso = (iso: string | null | undefined): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('fa-IR');
};

export default function SystemLogsPage() {
  const { loading: authLoading, isAdmin } = useAuth();
  const [limit, setLimit] = useState(200);
  const [offset] = useState(0);
  const [sinceLocal, setSinceLocal] = useState('');
  const [action, setAction] = useState<string>('');
  const [actorUserId, setActorUserId] = useState<string>('');
  const [includeSnapshot, setIncludeSnapshot] = useState(true);
  const [onlineWindowSeconds, setOnlineWindowSeconds] = useState(1800);
  const [snapshotLimit] = useState(200);

  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<SystemLogsResponse | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const sinceIso = useMemo(() => {
    const raw = sinceLocal.trim();
    if (!raw) return undefined;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
  }, [sinceLocal]);

  const params = useMemo(() => {
    const p: FetchSystemLogsParams = {
      limit: Math.max(1, Math.min(2000, Number(limit) || 200)),
      offset,
      include_snapshot: includeSnapshot,
      online_window_seconds: Math.max(1, Number(onlineWindowSeconds) || 1800),
      snapshot_limit: snapshotLimit,
    };

    if (sinceIso) p.since = sinceIso;
    if (action) p.action = action;

    const actor = actorUserId.trim();
    if (actor) {
      const n = Number(actor);
      if (Number.isFinite(n)) p.actor_user_id = n;
    }

    return p;
  }, [limit, offset, includeSnapshot, onlineWindowSeconds, snapshotLimit, sinceIso, action, actorUserId]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    if (blocked) return;
    try {
      setLoading(true);
      setError('');
      const res = await fetchSystemLogs(params);
      setData(res);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 401 || status === 403) {
          setBlocked(true);
          setError('Not authorized');
          return;
        }
      } else {
        // fallthrough
      }

      setError(getApiErrorDetail(err) || 'Server error');
    } finally {
      setLoading(false);
    }
  }, [params, blocked, isAdmin]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) return;
    void load();
  }, [load, authLoading, isAdmin]);

  const toggleExpanded = (eventId: string) => {
    setExpanded((prev) => ({ ...prev, [eventId]: !prev[eventId] }));
  };

  const events = data?.events ?? [];
  const snapshot = includeSnapshot ? data?.snapshot ?? null : null;

  const renderEventDetails = (ev: SystemLogEvent) => {
    const requestCtx = {
      ip: ev.ip,
      user_agent: ev.user_agent,
      request_method: ev.request_method,
      request_path: ev.request_path,
      request_id: ev.request_id,
    };

    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Metadata</p>
            <pre className="text-[11px] leading-5 bg-white border border-gray-200 rounded p-3 overflow-auto max-h-64">
              {safeJson(ev.metadata ?? {})}
            </pre>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Request</p>
            <pre className="text-[11px] leading-5 bg-white border border-gray-200 rounded p-3 overflow-auto max-h-64">
              {safeJson(requestCtx)}
            </pre>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AdminOnlyRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />

        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-800">System Logs</h1>
            <button
              onClick={load}
              disabled={loading || blocked}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            >
              Refresh
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">limit</label>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">since</label>
                <input
                  type="datetime-local"
                  value={sinceLocal}
                  onChange={(e) => setSinceLocal(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">action</label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                >
                  {ACTION_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a || '(any)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">actor_user_id</label>
                <input
                  type="number"
                  value={actorUserId}
                  onChange={(e) => setActorUserId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="flex items-center gap-3 mt-7">
                <input
                  id="include_snapshot"
                  type="checkbox"
                  checked={includeSnapshot}
                  onChange={(e) => setIncludeSnapshot(e.target.checked)}
                  className="h-4 w-4"
                />
                <label htmlFor="include_snapshot" className="text-sm text-gray-700">
                  include_snapshot
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">online_window_seconds</label>
                <input
                  type="number"
                  min={1}
                  value={onlineWindowSeconds}
                  onChange={(e) => setOnlineWindowSeconds(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div className="mt-4 text-xs text-gray-500">
              offset is fixed at 0, snapshot_limit is fixed at 200.
            </div>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <ErrorMessage message={error} onRetry={blocked ? undefined : load} />
          ) : (
            <>
              <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-lg font-bold text-gray-800">Events</h2>
                </div>

                {events.length === 0 ? (
                  <div className="p-8 text-center text-gray-600">No events</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-white border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">created_at</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">action</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">actor</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">entity</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">message</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {events.map((ev) => {
                          const actor = `${ev.actor_username ?? '-'} (${ev.actor_user_id ?? '-'})`;
                          const entity = `${ev.entity_type ?? '-'} / ${ev.entity_id ?? '-'}`;
                          const isOpen = !!expanded[ev.event_id];
                          return (
                            <Fragment key={ev.event_id}>
                              <tr className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{formatIso(ev.created_at)}</td>
                                <td className="px-4 py-3 text-xs font-medium text-gray-800 whitespace-nowrap">{ev.action}</td>
                                <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{actor}</td>
                                <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{entity}</td>
                                <td className="px-4 py-3 text-xs text-gray-700">{ev.message ?? '-'}</td>
                                <td className="px-4 py-3 text-xs">
                                  <button
                                    onClick={() => toggleExpanded(ev.event_id)}
                                    className="text-blue-600 hover:text-blue-800 font-medium"
                                  >
                                    {isOpen ? 'Hide' : 'Show'}
                                  </button>
                                </td>
                              </tr>
                              {isOpen && (
                                <tr className="bg-white">
                                  <td colSpan={6} className="px-4 py-4">
                                    {renderEventDetails(ev)}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {includeSnapshot && snapshot && (
                <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-lg font-bold text-gray-800">Snapshot</h2>
                      <p className="text-xs text-gray-500">
                        generated_at: {formatIso(snapshot.generated_at)} | online_window_seconds: {snapshot.online_window_seconds}
                      </p>
                    </div>
                  </div>

                  <div className="p-5 space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 mb-3">Presence</h3>
                      {!(snapshot.presence && snapshot.presence.length > 0) ? (
                        <p className="text-sm text-gray-600">No presence data yet</p>
                      ) : (
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                          <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">user</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">status</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">last_seen_at</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">last_ip</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {snapshot.presence.map((p) => (
                                <tr key={p.user_id} className="hover:bg-gray-50">
                                  <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">
                                    {p.username ?? '-'} ({p.user_id})
                                  </td>
                                  <td className="px-4 py-2 text-xs whitespace-nowrap">
                                    <span
                                      className={
                                        'px-2 py-1 rounded-full text-[11px] font-medium ' +
                                        (p.is_online
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-gray-100 text-gray-700')
                                      }
                                    >
                                      {p.is_online ? 'online' : 'offline'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">{formatIso(p.last_seen_at)}</td>
                                  <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">{p.last_ip ?? '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 mb-3">Uploading datasets</h3>
                      {!(snapshot.uploading_datasets && snapshot.uploading_datasets.length > 0) ? (
                        <p className="text-sm text-gray-600">No active uploads</p>
                      ) : (
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                          <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">dataset_id</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">user</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">filename</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">upload_state</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">upload_id</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {snapshot.uploading_datasets.map((u) => (
                                <tr key={`${u.dataset_id}-${u.upload_id || ''}`} className="hover:bg-gray-50">
                                  <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">{u.dataset_id}</td>
                                  <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">
                                    {u.username ?? '-'} ({u.user_id})
                                  </td>
                                  <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">{u.original_filename ?? '-'}</td>
                                  <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">{u.upload_state ?? '-'}</td>
                                  <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">{u.upload_id ?? '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 mb-3">Active trainings</h3>
                      {!(snapshot.active_trainings && snapshot.active_trainings.length > 0) ? (
                        <p className="text-sm text-gray-600">No active trainings</p>
                      ) : (
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                          <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">job_id</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">strategy</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">dataset_id</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">uploader</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">status</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">text</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {snapshot.active_trainings.map((t) => {
                                const lp = t.latest_progress || null;
                                const epoch =
                                  lp && typeof (lp as Record<string, unknown>).epoch === 'number'
                                    ? ((lp as Record<string, unknown>).epoch as number)
                                    : null;
                                const totalEpochs =
                                  lp && typeof (lp as Record<string, unknown>).total_epochs === 'number'
                                    ? ((lp as Record<string, unknown>).total_epochs as number)
                                    : null;
                                const hasProgress = epoch !== null && totalEpochs !== null;
                                const text = hasProgress
                                  ? `User ${t.uploader_username ?? '-'} training dataset ${t.dataset_id ?? '-'} epoch ${epoch}/${totalEpochs}`
                                  : 'running (no progress yet)';

                                return (
                                  <tr key={t.job_id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">{t.job_id}</td>
                                    <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">{t.strategy ?? '-'}</td>
                                    <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">{t.dataset_id ?? '-'}</td>
                                    <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">
                                      {t.uploader_username ?? '-'} ({t.uploader_user_id ?? '-'})
                                    </td>
                                    <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">{t.status ?? '-'}</td>
                                    <td className="px-4 py-2 text-xs text-gray-700">{text}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminOnlyRoute>
  );
}

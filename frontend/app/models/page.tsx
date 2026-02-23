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

type MetricSeries = {
  label: string;
  value: number;
  barClassName: string;
};

type MetricRow = {
  key: string;
  displayValue: string;
  series: MetricSeries[];
};

type FlatMetric = {
  label: string;
  value: number;
};

type Point = {
  x: number;
  y: number;
};

type PieSlice = {
  label: string;
  value: number;
  fillClassName: string;
};

const PIE_COLORS = [
  'fill-blue-500',
  'fill-green-500',
  'fill-purple-500',
  'fill-amber-500',
  'fill-rose-500',
  'fill-cyan-500',
  'fill-indigo-500',
];

const toNumberIfFinite = (v: unknown): number | null => {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    return v;
  }

  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  return null;
};

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

const buildMetricRows = (metrics: Record<string, unknown> | undefined): MetricRow[] => {
  if (!metrics) return [];

  const rows: MetricRow[] = [];

  const appendMetricRow = (key: string, value: unknown) => {
    const num = toNumberIfFinite(value);
    if (num !== null) {
      rows.push({
        key,
        displayValue: num.toFixed(4),
        series: [{ label: 'value', value: num, barClassName: 'bg-blue-600' }],
      });
      return;
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;

      const valNum = toNumberIfFinite(obj.val);
      const testNum = toNumberIfFinite(obj.test);
      const series: MetricSeries[] = [];
      if (valNum !== null) series.push({ label: 'val', value: valNum, barClassName: 'bg-blue-600' });
      if (testNum !== null) series.push({ label: 'test', value: testNum, barClassName: 'bg-green-600' });
      if (series.length > 0) {
        const parts = series.map((s) => `${s.label}=${s.value.toFixed(4)}`).join(', ');
        rows.push({ key, displayValue: parts, series });
        return;
      }

      if (!Array.isArray(value)) {
        const entries = Object.entries(obj);
        const hasSimpleChildren = entries.some(([, child]) => child === null || ['number', 'string', 'boolean'].includes(typeof child));

        if (hasSimpleChildren) {
          for (const [childKey, childValue] of entries) {
            appendMetricRow(`${key}.${childKey}`, childValue);
          }
          return;
        }
      }
    }

    rows.push({ key, displayValue: formatMetricValue(value), series: [] });
  };

  for (const [key, value] of Object.entries(metrics)) {
    appendMetricRow(key, value);
  }

  return rows;
};

const getMetricScaleMax = (rows: MetricRow[]): number => {
  const values = rows.flatMap((r) => r.series.map((s) => Math.abs(s.value)));
  const max = values.length > 0 ? Math.max(...values) : 0;
  return max > 0 ? max : 1;
};

const flattenMetricSeries = (rows: MetricRow[]): FlatMetric[] => {
  return rows.flatMap((row) =>
    row.series.map((series) => ({
      label: row.series.length > 1 ? `${row.key} (${series.label})` : row.key,
      value: series.value,
    }))
  );
};

const getNumericArray = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) return null;
  const arr = value
    .map((item) => toNumberIfFinite(item))
    .filter((item): item is number => item !== null);
  return arr.length > 1 ? arr : null;
};

const buildPieSlices = (flatMetrics: FlatMetric[]): PieSlice[] => {
  const positive = flatMetrics
    .map((m) => ({ label: m.label, value: Math.abs(m.value) }))
    .filter((m) => m.value > 0)
    .sort((a, b) => b.value - a.value);

  if (positive.length === 0) return [];

  const top = positive.slice(0, 6);
  const othersValue = positive.slice(6).reduce((sum, m) => sum + m.value, 0);
  const limited = othersValue > 0 ? [...top, { label: 'other', value: othersValue }] : top;

  return limited.map((slice, index) => ({
    ...slice,
    fillClassName: PIE_COLORS[index % PIE_COLORS.length],
  }));
};

const buildPrecisionRecallCurve = (
  metrics: Record<string, unknown> | undefined,
  flatMetrics: FlatMetric[]
): Point[] => {
  if (!metrics) return [];

  const candidateKeys = [
    'precision_recall_curve',
    'precision_recall',
    'pr_curve',
    'pr_points',
    'curve',
  ];

  for (const key of candidateKeys) {
    const raw = metrics[key];
    if (!raw || typeof raw !== 'object') continue;

    if (Array.isArray(raw)) {
      const points = raw
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const record = item as Record<string, unknown>;
          const recall = toNumberIfFinite(record.recall ?? record.x);
          const precision = toNumberIfFinite(record.precision ?? record.y);
          if (recall === null || precision === null) return null;
          return {
            x: Math.max(0, Math.min(1, recall)),
            y: Math.max(0, Math.min(1, precision)),
          };
        })
        .filter((item): item is Point => item !== null)
        .sort((a, b) => a.x - b.x);
      if (points.length > 1) return points;
    }

    const record = raw as Record<string, unknown>;
    const precisionValues = getNumericArray(record.precision);
    const recallValues = getNumericArray(record.recall);
    if (precisionValues && recallValues) {
      const points = precisionValues
        .slice(0, recallValues.length)
        .map((precision, index) => ({
          x: Math.max(0, Math.min(1, recallValues[index])),
          y: Math.max(0, Math.min(1, precision)),
        }))
        .sort((a, b) => a.x - b.x);
      if (points.length > 1) return points;
    }
  }

  const topPrecision = toNumberIfFinite(metrics.precision);
  const topRecall = toNumberIfFinite(metrics.recall);
  if (topPrecision !== null && topRecall !== null) {
    const recall = Math.max(0, Math.min(1, topRecall));
    const precision = Math.max(0, Math.min(1, topPrecision));
    return [
      { x: 0, y: precision },
      { x: recall, y: precision },
      { x: 1, y: 0 },
    ];
  }

  const precisionFromFlat = flatMetrics.find((m) => m.label.toLowerCase().includes('precision'));
  const recallFromFlat = flatMetrics.find((m) => m.label.toLowerCase().includes('recall'));
  if (precisionFromFlat && recallFromFlat) {
    const recall = Math.max(0, Math.min(1, recallFromFlat.value));
    const precision = Math.max(0, Math.min(1, precisionFromFlat.value));
    return [
      { x: 0, y: precision },
      { x: recall, y: precision },
      { x: 1, y: 0 },
    ];
  }

  return [];
};

const buildLineSeries = (
  metrics: Record<string, unknown> | undefined,
  flatMetrics: FlatMetric[]
): { points: Point[]; labels: string[]; title: string; isFallback: boolean } => {
  if (metrics) {
    const entries = Object.entries(metrics);
    for (const [key, value] of entries) {
      const arrayValues = getNumericArray(value);
      if (arrayValues) {
        return {
          points: arrayValues.map((item, index) => ({ x: index, y: item })),
          labels: arrayValues.map((_, index) => String(index + 1)),
          title: key,
          isFallback: false,
        };
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        const valSeries = getNumericArray(obj.val);
        if (valSeries) {
          return {
            points: valSeries.map((item, index) => ({ x: index, y: item })),
            labels: valSeries.map((_, index) => String(index + 1)),
            title: `${key} (val)`,
            isFallback: false,
          };
        }

        const testSeries = getNumericArray(obj.test);
        if (testSeries) {
          return {
            points: testSeries.map((item, index) => ({ x: index, y: item })),
            labels: testSeries.map((_, index) => String(index + 1)),
            title: `${key} (test)`,
            isFallback: false,
          };
        }
      }
    }
  }

  const fallback = flatMetrics.slice(0, 12);
  return {
    points: fallback.map((item, index) => ({ x: index, y: item.value })),
    labels: fallback.map((item) => item.label),
    title: 'criteria trend',
    isFallback: true,
  };
};

const polarToCartesian = (cx: number, cy: number, radius: number, angleDeg: number) => {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
};

const describeArcSlice = (cx: number, cy: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
};

const PieChart = ({ slices }: { slices: PieSlice[] }) => {
  if (slices.length === 0) {
    return <p className="text-xs text-gray-500">No numeric criteria available for pie chart.</p>;
  }

  const size = 184;
  const radius = 68;
  const center = size / 2;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  const arcs = slices.reduce<Array<PieSlice & { path: string; startAngle: number; endAngle: number }>>(
    (acc, slice) => {
      const previousEnd = acc.length > 0 ? acc[acc.length - 1].endAngle : 0;
      const sweep = (slice.value / total) * 360;
      const endAngle = previousEnd + sweep;
      const path = describeArcSlice(center, center, radius, previousEnd, endAngle);
      acc.push({ ...slice, path, startAngle: previousEnd, endAngle });
      return acc;
    },
    []
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Criteria pie chart">
          {arcs.map((arc) => (
            <path key={arc.label} d={arc.path} className={arc.fillClassName} />
          ))}
          <circle cx={center} cy={center} r={34} className="fill-white" />
        </svg>
      </div>
      <div className="space-y-1">
        {arcs.map((arc) => (
          <div key={`legend-${arc.label}`} className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`h-2.5 w-2.5 rounded-full ${arc.fillClassName}`} />
              <span className="text-gray-700 truncate">{arc.label}</span>
            </div>
            <span className="text-gray-600 tabular-nums">{arc.value.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const PrecisionRecallChart = ({ points }: { points: Point[] }) => {
  if (points.length < 2) {
    return <p className="text-xs text-gray-500">Precision–Recall data is not available for this model.</p>;
  }

  const width = 300;
  const height = 190;
  const margin = { top: 18, right: 16, bottom: 30, left: 40 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const toSvgX = (value: number) => margin.left + value * plotWidth;
  const toSvgY = (value: number) => margin.top + (1 - value) * plotHeight;

  const linePoints = points.map((point) => `${toSvgX(point.x)},${toSvgY(point.y)}`).join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Precision-Recall curve">
      <rect x={0} y={0} width={width} height={height} className="fill-white" />
      <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} className="stroke-gray-300" />
      <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} className="stroke-gray-300" />
      <polyline points={linePoints} className="fill-none stroke-blue-600" strokeWidth={2.5} />
      {points.map((point, index) => (
        <circle key={`pr-point-${index}`} cx={toSvgX(point.x)} cy={toSvgY(point.y)} r={3} className="fill-blue-600" />
      ))}
      <text x={width / 2} y={height - 7} textAnchor="middle" className="fill-gray-500 text-[11px]">Recall</text>
      <text x={13} y={height / 2} textAnchor="middle" className="fill-gray-500 text-[11px]" transform={`rotate(-90 13 ${height / 2})`}>
        Precision
      </text>
    </svg>
  );
};

const LineChart = ({ points, labels, title }: { points: Point[]; labels: string[]; title: string }) => {
  if (points.length < 2) {
    return <p className="text-xs text-gray-500">Line graph data is not available for this model.</p>;
  }

  const width = 300;
  const height = 190;
  const margin = { top: 18, right: 16, bottom: 34, left: 40 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const yValues = points.map((point) => point.y);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const rangeY = maxY - minY || 1;

  const toSvgX = (index: number) => {
    if (points.length === 1) return margin.left;
    return margin.left + (index / (points.length - 1)) * plotWidth;
  };

  const toSvgY = (value: number) => margin.top + ((maxY - value) / rangeY) * plotHeight;

  const linePoints = points.map((point, index) => `${toSvgX(index)},${toSvgY(point.y)}`).join(' ');

  const showLabels = labels.length <= 8;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500">{title}</p>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Criteria line graph">
        <rect x={0} y={0} width={width} height={height} className="fill-white" />
        <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} className="stroke-gray-300" />
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} className="stroke-gray-300" />
        <polyline points={linePoints} className="fill-none stroke-emerald-600" strokeWidth={2.5} />
        {points.map((point, index) => (
          <circle key={`line-point-${index}`} cx={toSvgX(index)} cy={toSvgY(point.y)} r={2.6} className="fill-emerald-600" />
        ))}
        {showLabels &&
          labels.map((label, index) => (
            <text
              key={`line-label-${index}`}
              x={toSvgX(index)}
              y={height - 12}
              textAnchor="middle"
              className="fill-gray-400 text-[9px]"
            >
              {label.length > 12 ? `${label.slice(0, 12)}…` : label}
            </text>
          ))}
      </svg>
    </div>
  );
};

const MetricBarChart = ({ metrics }: { metrics: FlatMetric[] }) => {
  const values = metrics.slice(0, 8);
  if (values.length === 0) {
    return <p className="text-xs text-gray-500">No numeric metrics available for fallback chart.</p>;
  }

  const width = 300;
  const height = 190;
  const margin = { top: 16, right: 16, bottom: 28, left: 34 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(...values.map((m) => Math.abs(m.value)), 1);
  const barWidth = plotWidth / values.length;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Fallback metric bar chart">
      <rect x={0} y={0} width={width} height={height} className="fill-white" />
      <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} className="stroke-gray-300" />
      {values.map((metric, index) => {
        const normalized = Math.abs(metric.value) / maxValue;
        const barHeight = normalized * (plotHeight - 8);
        const x = margin.left + index * barWidth + 5;
        const y = height - margin.bottom - barHeight;
        return (
          <g key={`fallback-bar-${metric.label}`}>
            <rect x={x} y={y} width={Math.max(8, barWidth - 10)} height={barHeight} className="fill-violet-500" rx={3} />
            <text x={x + Math.max(8, barWidth - 10) / 2} y={height - 12} textAnchor="middle" className="fill-gray-400 text-[9px]">
              {metric.label.length > 10 ? `${metric.label.slice(0, 10)}…` : metric.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const MetricScatterChart = ({ metrics }: { metrics: FlatMetric[] }) => {
  const values = metrics.slice(0, 16);
  if (values.length < 2) {
    return <p className="text-xs text-gray-500">Not enough metrics for scatter chart fallback.</p>;
  }

  const width = 300;
  const height = 190;
  const margin = { top: 16, right: 18, bottom: 30, left: 36 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const absValues = values.map((m) => Math.abs(m.value));
  const maxValue = Math.max(...absValues, 1);

  const toX = (index: number) => margin.left + (index / Math.max(values.length - 1, 1)) * plotWidth;
  const toY = (value: number) => margin.top + (1 - Math.abs(value) / maxValue) * plotHeight;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Fallback metric scatter chart">
      <rect x={0} y={0} width={width} height={height} className="fill-white" />
      <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} className="stroke-gray-300" />
      <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} className="stroke-gray-300" />
      {values.map((metric, index) => (
        <circle key={`scatter-${metric.label}`} cx={toX(index)} cy={toY(metric.value)} r={4} className="fill-orange-500" />
      ))}
      <text x={width / 2} y={height - 8} textAnchor="middle" className="fill-gray-500 text-[11px]">Metric Index</text>
      <text x={13} y={height / 2} textAnchor="middle" className="fill-gray-500 text-[11px]" transform={`rotate(-90 13 ${height / 2})`}>
        Value
      </text>
    </svg>
  );
};

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {models.map((model) => {
                const rows = buildMetricRows(model.metrics);
                const scaleMax = getMetricScaleMax(rows);
                const hasNumeric = rows.some((r) => r.series.length > 0);
                const flatMetrics = flattenMetricSeries(rows);
                const pieSlices = buildPieSlices(flatMetrics);
                const prPoints = buildPrecisionRecallCurve(model.metrics, flatMetrics);
                const lineSeries = buildLineSeries(model.metrics, flatMetrics);
                const shouldFallbackPR = prPoints.length < 2;
                const shouldFallbackLine = lineSeries.points.length < 2 || lineSeries.isFallback;

                return (
                  <div
                    key={model.id}
                    className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow border border-gray-100"
                  >
                    <div className="p-6 border-b border-gray-100">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-bold text-gray-800 leading-7">{model.name}</h3>
                        <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
                          {model.model_type}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <p className="text-gray-600">
                          <strong>{translations.models.modelId}:</strong> {model.id}
                        </p>
                        <p className="text-gray-600">
                          <strong>{translations.models.createdAt}:</strong>{' '}
                          {model.created_at ? new Date(model.created_at).toLocaleString('fa-IR') : '-'}
                        </p>
                        <p className="text-gray-600">
                          <strong>{translations.models.trainingJob}:</strong> {model.id}
                        </p>
                      </div>
                    </div>

                    <div className="p-6 space-y-5">
                      {model.metrics && Object.keys(model.metrics).length > 0 ? (
                        <>
                          <div>
                            <p className="text-sm font-semibold text-gray-700 mb-2">{translations.models.metrics} (Numeric Criteria)</p>
                            <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                              <table className="w-full">
                                <thead className="bg-white border-b border-gray-200">
                                  <tr>
                                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">
                                      {translations.models.metrics}
                                    </th>
                                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">
                                      {translations.common.value ?? 'Value'}
                                    </th>
                                    {hasNumeric && (
                                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Bar</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {rows.map((row) => (
                                    <tr key={row.key} className="bg-gray-50">
                                      <td className="px-3 py-2 text-xs font-medium text-gray-700 align-top">{row.key}</td>
                                      <td className="px-3 py-2 text-xs text-gray-700 align-top">{row.displayValue}</td>
                                      {hasNumeric && (
                                        <td className="px-3 py-2 align-top">
                                          {row.series.length === 0 ? (
                                            <span className="text-xs text-gray-400">-</span>
                                          ) : (
                                            <div className="space-y-1">
                                              {row.series.map((series) => {
                                                const pct = Math.min(100, (Math.abs(series.value) / scaleMax) * 100);
                                                return (
                                                  <div key={series.label} className="flex items-center gap-2">
                                                    <span className="w-10 text-[11px] text-gray-500">{series.label}</span>
                                                    <div
                                                      className="flex-1 h-2 bg-white border border-gray-200 rounded"
                                                      aria-label={`${row.key} ${series.label} bar`}
                                                    >
                                                      <div
                                                        className={`${series.barClassName} h-full rounded`}
                                                        style={{ width: `${pct}%` }}
                                                      />
                                                    </div>
                                                    <span className="w-16 text-right text-[11px] text-gray-600 tabular-nums">
                                                      {Number.isFinite(series.value) ? series.value.toFixed(4) : '-'}
                                                    </span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                              <h4 className="text-sm font-semibold text-gray-700 mb-3">Pie Chart</h4>
                              <PieChart slices={pieSlices} />
                            </div>

                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                              <h4 className="text-sm font-semibold text-gray-700 mb-3">Precision–Recall Curve</h4>
                              {shouldFallbackPR ? (
                                <div className="space-y-2">
                                  <p className="text-xs text-gray-500">PR curve is unavailable; showing metric bar chart instead.</p>
                                  <MetricBarChart metrics={flatMetrics} />
                                </div>
                              ) : (
                                <PrecisionRecallChart points={prPoints} />
                              )}
                            </div>

                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                              <h4 className="text-sm font-semibold text-gray-700 mb-3">Line Graph</h4>
                              {shouldFallbackLine ? (
                                <div className="space-y-2">
                                  <p className="text-xs text-gray-500">Line-series is incomplete; showing metric scatter chart instead.</p>
                                  <MetricScatterChart metrics={flatMetrics} />
                                </div>
                              ) : (
                                <LineChart points={lineSeries.points} labels={lineSeries.labels} title={lineSeries.title} />
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
                          No criteria available for this model.
                        </div>
                      )}

                      <div className="flex space-x-reverse space-x-2 pt-1">
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

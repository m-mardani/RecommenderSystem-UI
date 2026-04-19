'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/common/Navbar';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { translations } from '@/lib/utils/translations';
import { ALL_SCENARIO_TYPES, SCENARIO_CONFIGS } from '@/lib/utils/scenarios';
import type { ScenarioConfig, ScenarioType } from '@/types';

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function ScenarioDetailPanel({
  config,
  onClose,
}: {
  config: ScenarioConfig;
  onClose: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className={`bg-linear-to-r ${config.gradient} p-6 text-white`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{config.icon}</span>
            <div>
              <h2 className="text-2xl font-bold">{config.labelFa}</h2>
              <p className="text-white/80 text-sm">{config.label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors text-sm underline"
          >
            {translations.scenarios.backToList}
          </button>
        </div>
        <p className="mt-3 text-white/90 text-sm leading-relaxed">{config.descriptionFa}</p>
      </div>

      {/* Body */}
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Rating type */}
        <InfoBlock title={translations.scenarios.ratingType}>
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              config.ratingType === 'explicit'
                ? 'bg-green-100 text-green-800'
                : 'bg-blue-100 text-blue-800'
            }`}
          >
            {config.ratingType === 'explicit'
              ? translations.scenarios.explicit
              : translations.scenarios.implicit}
          </span>
          {config.implicitWeight && (
            <span className="ml-2 text-xs text-gray-500 font-mono">
              ({translations.scenarios.implicitWeight}: {config.implicitWeight})
            </span>
          )}
        </InfoBlock>

        {/* Item type */}
        <InfoBlock title={translations.scenarios.itemType}>
          <span className="text-gray-800 font-medium">{config.itemTypeFa}</span>
        </InfoBlock>

        {/* Use case */}
        <InfoBlock title={translations.scenarios.useCase}>
          <span className="text-gray-700 text-sm">{config.useCaseFa}</span>
        </InfoBlock>

        {/* Category column */}
        {config.categoryColumn && (
          <InfoBlock title={translations.scenarios.categoryColumn}>
            <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-700">
              {config.categoryColumn}
            </code>
          </InfoBlock>
        )}

        {/* Item features */}
        <InfoBlock title={translations.scenarios.itemFeatures} className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {config.itemFeatureColumns.map((col) => (
              <code
                key={col}
                className="text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-700"
              >
                {col}
              </code>
            ))}
          </div>
        </InfoBlock>

        {/* Text features */}
        <InfoBlock title={translations.scenarios.textFeatures} className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {config.textColumns.map((col) => (
              <code
                key={col}
                className="text-xs bg-blue-50 border border-blue-100 px-2 py-1 rounded font-mono text-blue-700"
              >
                {col}
              </code>
            ))}
          </div>
        </InfoBlock>
      </div>

      {/* CTA */}
      <div className="px-6 pb-6">
        <Link
          href={`/training?scenario=${config.type}`}
          className={`inline-flex items-center gap-2 bg-linear-to-r ${config.gradient} text-white px-5 py-2.5 rounded-lg font-medium hover:opacity-90 transition-opacity text-sm shadow-md`}
        >
          {translations.scenarios.startTrainingWith} {config.icon}
        </Link>
      </div>
    </div>
  );
}

function InfoBlock({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{title}</p>
      {children}
    </div>
  );
}

// ─── Scenario Card ────────────────────────────────────────────────────────────

function ScenarioCard({
  config,
  onSelect,
}: {
  config: ScenarioConfig;
  onSelect: (type: ScenarioType) => void;
}) {
  return (
    <button
      onClick={() => onSelect(config.type)}
      className="group text-right w-full bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden hover:-translate-y-0.5"
    >
      {/* Gradient top bar */}
      <div className={`h-1.5 bg-linear-to-r ${config.gradient}`} />

      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none shrink-0 mt-0.5">{config.icon}</span>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-gray-800 text-base">{config.labelFa}</h3>
            <p className="text-gray-400 text-xs">{config.label}</p>
          </div>
        </div>

        <p className="text-xs text-gray-600 mt-2 leading-relaxed line-clamp-2">
          {config.descriptionFa}
        </p>

        <div className="flex flex-wrap gap-1.5 mt-3">
          <span
            className={`text-xs px-2 py-0.5 rounded-full text-white bg-linear-to-r ${config.gradient}`}
          >
            {config.itemTypeFa}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border ${
              config.ratingType === 'explicit'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-blue-50 border-blue-200 text-blue-700'
            }`}
          >
            {config.ratingType === 'explicit'
              ? translations.scenarios.explicit
              : translations.scenarios.implicit}
          </span>
        </div>
      </div>

      <div className="border-t border-gray-50 px-5 py-2.5 flex items-center justify-between">
        <span className="text-xs text-gray-400">{config.useCaseFa}</span>
        <span className="text-xs text-blue-600 group-hover:text-blue-800 transition-colors">
          {translations.scenarios.viewDetails} ›
        </span>
      </div>
    </button>
  );
}

// ─── Feature Matrix Table ─────────────────────────────────────────────────────

const MATRIX_FEATURES = ['رتبه‌بندی صریح', 'بازخورد ضمنی', 'فیلتر محتوایی', 'فیلتر مشارکتی', 'پشتیبانی متن', 'دسته‌بندی'];

const SCENARIO_MATRIX: Record<ScenarioType, boolean[]> = {
  movie:          [true,  false, true,  true,  true,  true],
  music:          [false, true,  true,  true,  true,  true],
  book:           [true,  false, true,  true,  true,  true],
  product:        [true,  false, true,  true,  true,  true],
  news:           [false, true,  true,  true,  true,  true],
  video:          [false, true,  true,  true,  true,  true],
  restaurant:     [true,  false, true,  true,  true,  true],
  poi:            [true,  false, true,  true,  true,  true],
  ecommerce:      [true,  false, true,  true,  true,  true],
  course:         [true,  false, true,  true,  true,  true],
  job:            [false, true,  true,  true,  true,  true],
  article:        [false, true,  true,  true,  true,  true],
  threat_defense: [true,  false, true,  true,  true,  true],
};

function FeatureMatrix() {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="min-w-full text-sm bg-white">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-3 text-right font-semibold text-gray-700 whitespace-nowrap">
              سناریو
            </th>
            {MATRIX_FEATURES.map((f) => (
              <th
                key={f}
                className="px-3 py-3 text-center font-semibold text-gray-700 whitespace-nowrap text-xs"
              >
                {f}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALL_SCENARIO_TYPES.map((type, idx) => {
            const cfg = SCENARIO_CONFIGS[type];
            const features = SCENARIO_MATRIX[type];
            return (
              <tr
                key={type}
                className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
              >
                <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                  <span className="mr-1">{cfg.icon}</span> {cfg.labelFa}
                </td>
                {features.map((supported, fi) => (
                  <td key={fi} className="px-3 py-2.5 text-center">
                    {supported ? (
                      <span className="text-green-500 text-base">✓</span>
                    ) : (
                      <span className="text-gray-300 text-base">–</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ScenariosPage() {
  const [selectedType, setSelectedType] = useState<ScenarioType | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);

  const selectedConfig = selectedType ? SCENARIO_CONFIGS[selectedType] : null;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-linear-to-br from-gray-50 via-blue-50/30 to-purple-50/20">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800">{translations.scenarios.title}</h1>
            <p className="text-gray-500 mt-1">{translations.scenarios.subtitle}</p>
          </div>

          {/* Detail panel (when a scenario is selected) */}
          {selectedConfig && (
            <div className="mb-8">
              <ScenarioDetailPanel
                config={selectedConfig}
                onClose={() => setSelectedType(null)}
              />
            </div>
          )}

          {/* Cards grid */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">
              {translations.scenarios.supportedScenarios}
              <span className="ml-2 text-sm text-gray-400 font-normal">
                ({ALL_SCENARIO_TYPES.length})
              </span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {ALL_SCENARIO_TYPES.map((type) => (
                <ScenarioCard
                  key={type}
                  config={SCENARIO_CONFIGS[type]}
                  onSelect={setSelectedType}
                />
              ))}
            </div>
          </div>

          {/* Feature matrix toggle */}
          <div className="mt-8">
            <button
              onClick={() => setShowMatrix((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              <span>{showMatrix ? '▲' : '▼'}</span>
              {translations.scenarios.featureMatrix}
            </button>

            {showMatrix && (
              <div className="mt-4">
                <FeatureMatrix />
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

'use client';

import { useMemo } from 'react';
import { ALL_SCENARIO_TYPES, SCENARIO_CONFIGS } from '@/lib/utils/scenarios';
import { translations } from '@/lib/utils/translations';
import type { ScenarioType } from '@/types';

interface ScenarioSelectorProps {
  value: ScenarioType | '';
  onChange: (value: ScenarioType | '') => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Dropdown for selecting one of the 12+ supported recommendation scenarios.
 * Renders a compact card preview of the selected scenario below the select element.
 */
export const ScenarioSelector = ({ value, onChange, disabled, className = '' }: ScenarioSelectorProps) => {
  const selectedConfig = useMemo(() => (value ? SCENARIO_CONFIGS[value] : null), [value]);

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-sm font-medium text-gray-700">
        {translations.training.selectScenario}
      </label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ScenarioType | '')}
        disabled={disabled}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
      >
        <option value="">{translations.training.noScenario}</option>
        {ALL_SCENARIO_TYPES.map((type) => {
          const cfg = SCENARIO_CONFIGS[type];
          return (
            <option key={type} value={type}>
              {cfg.icon} {cfg.labelFa} — {cfg.label}
            </option>
          );
        })}
      </select>

      {selectedConfig && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-start gap-3">
          <span className="text-2xl leading-none mt-0.5 shrink-0" aria-hidden>
            {selectedConfig.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800">
              {selectedConfig.labelFa}
              <span className="ml-1 text-gray-400 font-normal">({selectedConfig.label})</span>
            </p>
            <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{selectedConfig.descriptionFa}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span
                className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full text-white bg-linear-to-r ${selectedConfig.gradient}`}
              >
                {selectedConfig.itemTypeFa}
              </span>
              <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600">
                {selectedConfig.ratingType === 'explicit'
                  ? translations.scenarios.explicit
                  : translations.scenarios.implicit}
              </span>
              {selectedConfig.implicitWeight && (
                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600 font-mono">
                  {selectedConfig.implicitWeight}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500">{translations.training.scenarioHint}</p>
    </div>
  );
};

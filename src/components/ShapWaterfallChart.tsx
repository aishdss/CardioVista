/**
 * Explainable AI: exact SHAP feature attribution (Burgundy Theme)
 * For a linear (logistic) model with independent features, SHAP values are exact:
 *   phi_i = coef_i * (x_i - mean_i) / scale_i, expressed in log-odds.
 * base value + sum(phi_i) = the model's log-odds output for this patient.
 */

import React, { useState } from 'react';
import { FEATURE_CATEGORIES, TARGETS, TargetName } from '../types/cardiac';
import { ShapResult, targetTitle } from '../ml/modelPipeline';
import { sigmoid } from '../ml/logistic';
import { HelpCircle, Sliders, TrendingUp, TrendingDown } from 'lucide-react';

interface ShapWaterfallChartProps {
  shap: ShapResult;
  target: TargetName;
  onTargetChange: (t: TargetName) => void;
  predictedRisk: number;
}

const TOP_N = 15;

export const ShapWaterfallChart: React.FC<ShapWaterfallChartProps> = ({
  shap,
  target,
  onTargetChange,
  predictedRisk,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const attributions = shap.contributions;
  const baseRisk = sigmoid(shap.baseValue);

  const categories = ['All', ...FEATURE_CATEGORIES.filter((c) => attributions.some((a) => a.category === c))];

  const filtered =
    selectedCategory === 'All' ? attributions : attributions.filter((a) => a.category === selectedCategory);
  const visible = showAll ? filtered : filtered.slice(0, TOP_N);

  const maxAbsContrib = Math.max(...attributions.map((a) => Math.abs(a.contribution)), 0.1);

  return (
    <div className="bg-[#180612]/90 border border-[#3f1025] rounded-xl p-5 shadow-xl space-y-4 backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#350d1e]">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-rose-400" />
            <h3 className="text-base font-bold text-rose-50">Explainable AI (exact SHAP values)</h3>
          </div>
          <p className="text-xs text-rose-300/70 mt-0.5">
            Why the model predicts this risk for {targetTitle(target)} (units: log-odds)
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs bg-[#0f030a] px-3 py-1.5 rounded-lg border border-[#2e0b19]">
          <div>
            <span className="text-rose-400/60 block text-[10px] uppercase font-semibold">Average patient</span>
            <span className="font-mono text-rose-200 font-bold tabular-nums">{(baseRisk * 100).toFixed(1)}%</span>
          </div>
          <span className="text-rose-400/40 font-bold">→</span>
          <div>
            <span className="text-rose-400/60 block text-[10px] uppercase font-semibold">This patient</span>
            <span
              className={`font-mono font-bold tabular-nums ${
                predictedRisk >= 0.5 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {(predictedRisk * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Target selector */}
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-rose-400/60 shrink-0">Explain:</span>
        {TARGETS.map((t) => (
          <button
            key={t}
            onClick={() => onTargetChange(t)}
            className={`px-2.5 py-1 rounded font-semibold transition-colors ${
              target === t
                ? 'bg-[#881337] text-rose-100 border border-rose-500/60 shadow-sm'
                : 'text-rose-300/70 hover:text-rose-100 hover:bg-[#250818]'
            }`}
          >
            {t === 'CAD' ? 'Overall CAD' : t}
          </button>
        ))}
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-2.5 py-1 rounded font-medium whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? 'bg-[#881337] text-rose-100 border border-rose-500/50 shadow-sm'
                : 'text-rose-300/70 hover:text-rose-100 hover:bg-[#250818]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-[11px] text-rose-300/70 px-1">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
          <span>Positive SHAP (+): raises risk</span>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
          <span>Negative SHAP (−): lowers risk</span>
        </div>
      </div>

      {/* Waterfall Attribution List */}
      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
        {visible.map((attr) => {
          const isPositive = attr.contribution >= 0;
          const absVal = Math.abs(attr.contribution);
          const barWidth = Math.min(100, Math.max(4, (absVal / maxAbsContrib) * 100));
          const isExpanded = expandedFeature === attr.featureName;

          return (
            <div
              key={attr.featureName}
              className={`p-2.5 rounded-lg border transition-colors ${
                isExpanded ? 'bg-[#290a1c] border-rose-500/50' : 'bg-[#12040d]/80 border-[#310c1c] hover:bg-[#200717]'
              }`}
            >
              <div
                className="flex items-center justify-between gap-3 cursor-pointer"
                onClick={() => setExpandedFeature(isExpanded ? null : attr.featureName)}
              >
                <div className="w-48 shrink-0">
                  <span className="text-xs font-semibold text-rose-100 truncate block" title={attr.displayName}>
                    {attr.displayName}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] font-mono text-rose-300/80 truncate">Val: {String(attr.value)}</span>
                    <span className="text-[10px] text-rose-400/50">·</span>
                    <span className="text-[10px] text-rose-300/60 truncate">{attr.category}</span>
                  </div>
                </div>

                <div className="flex-1 flex items-center justify-center relative h-5">
                  <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-[#4c1228]" />
                  <div className="w-1/2 h-full flex justify-end items-center pr-1">
                    {!isPositive && (
                      <div
                        className="h-3 rounded-l bg-emerald-500/80 transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                      />
                    )}
                  </div>
                  <div className="w-1/2 h-full flex justify-start items-center pl-1">
                    {isPositive && (
                      <div
                        className="h-3 rounded-r bg-rose-500/90 shadow-sm shadow-rose-500/40 transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                      />
                    )}
                  </div>
                </div>

                <div className="w-20 text-right shrink-0">
                  <span
                    className={`text-xs font-mono font-bold tabular-nums ${
                      isPositive ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {isPositive ? '+' : ''}
                    {attr.contribution.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-rose-400/50 block">{attr.percentageImpact}% of total</span>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-2.5 pt-2 border-t border-[#3f1025] text-xs text-rose-200 flex items-start gap-2 bg-[#180512] p-2 rounded">
                  <HelpCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-rose-200 leading-relaxed text-[11px]">{attr.clinicalInterpretation}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1 text-[11px] text-rose-400/60">
        <span>
          Base {shap.baseValue.toFixed(2)} + Σ SHAP = {shap.logit.toFixed(2)} log-odds ({(sigmoid(shap.logit) * 100).toFixed(1)}%)
        </span>
        {filtered.length > TOP_N && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-rose-300 hover:text-rose-100 underline"
          >
            {showAll ? `Show top ${TOP_N}` : `Show all ${filtered.length}`}
          </button>
        )}
      </div>
    </div>
  );
};

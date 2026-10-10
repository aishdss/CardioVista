/**
 * Executive Cardiac Prediction Summary Card (Deep Burgundy Workstation Theme)
 * Displays Overall CAD Status, Vessel Stenosis Probabilities, and Multi-Vessel Burden
 */

import React from 'react';
import { ModelPredictionResult, VesselName } from '../types/cardiac';
import {
  ShieldAlert,
  ShieldCheck,
  AlertOctagon,
  ChevronRight,
  Lock,
  Heart,
} from 'lucide-react';

interface PredictionSummaryCardProps {
  prediction: ModelPredictionResult;
  selectedVessel: VesselName | null;
  onSelectVessel: (vessel: VesselName) => void;
}

export const PredictionSummaryCard: React.FC<PredictionSummaryCardProps> = ({
  prediction,
  selectedVessel,
  onSelectVessel,
}) => {
  const isHighRisk = prediction.cadProbability >= 0.60;
  const isModRisk = prediction.cadProbability >= 0.35 && prediction.cadProbability < 0.60;

  const vesselCards: Array<{
    name: VesselName;
    label: string;
    description: string;
  }> = [
    { name: 'LAD', label: 'LAD Artery', description: 'Anterior & Septum' },
    { name: 'LCX', label: 'LCX Artery', description: 'Lateral & Posterior' },
    { name: 'RCA', label: 'RCA Artery', description: 'Inferior & RV' },
  ];

  return (
    <div className="bg-[#180612]/90 border border-[#3f1025] rounded-xl p-5 shadow-xl space-y-4 backdrop-blur-md">
      {/* Top Header: Overall CAD Prediction */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#350d1e]">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-300/70 block">
            Predicted Overall CAD Status
          </span>
          <div className="flex items-center gap-2 mt-1">
            <h2 className="text-xl font-bold text-rose-50">
              {prediction.cadStatusPredicted === 'CAD' ? 'CAD Positive (>=50% Stenosis)' : 'No Obstructive CAD'}
            </h2>
            <span
              className={`text-xs px-2.5 py-0.5 rounded font-semibold ${
                isHighRisk
                  ? 'bg-rose-950/80 text-rose-200 border border-rose-600/80'
                  : isModRisk
                  ? 'bg-amber-950/80 text-amber-200 border border-amber-600/80'
                  : 'bg-emerald-950/80 text-emerald-200 border border-emerald-600/80'
              }`}
            >
              {prediction.cadRiskCategory}
            </span>
          </div>
        </div>

        {/* Global Probability Readout */}
        <div className="text-left sm:text-right">
          <span className="text-xs text-rose-300/70 block">Overall CAD Probability</span>
          <span
            className={`text-3xl font-mono font-extrabold tabular-nums ${
              isHighRisk ? 'text-rose-400' : isModRisk ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {(prediction.cadProbability * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Disease Extent & Vessel Burden Strip */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0f030a]/80 rounded-lg border border-[#2e0b19] text-xs">
        <div className="flex items-center gap-2">
          {prediction.stenosisCount >= 2 ? (
            <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
          ) : prediction.stenosisCount === 1 ? (
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="text-rose-200/80 font-medium">Anatomical Burden:</span>
          <span className="font-semibold text-rose-100">{prediction.diseaseClassification}</span>
        </div>

        <div className="flex items-center gap-1.5 text-rose-300/70">
          <span className="font-mono text-rose-100 font-bold">{prediction.stenosisCount}</span>
          <span>of 3 vessels &ge;50% stenosis</span>
        </div>
      </div>

      {/* Tri-Vessel Stenosis Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {vesselCards.map(({ name, label, description }) => {
          const vData = prediction.vessels[name];
          const isSelected = selectedVessel === name;
          const probPct = (vData.probability * 100).toFixed(1);
          const isVesselHigh = vData.probability >= 0.60;
          const isVesselMod = vData.probability >= 0.30 && vData.probability < 0.60;

          return (
            <button
              key={name}
              type="button"
              onClick={() => onSelectVessel(name)}
              className={`text-left p-3.5 rounded-lg border transition-all cursor-pointer relative overflow-hidden ${
                isSelected
                  ? 'bg-[#3b0f23] border-rose-400 shadow-lg shadow-rose-950/60 ring-1 ring-rose-400/60'
                  : 'bg-[#12040d]/80 border-[#310c1c] hover:border-[#52142f] hover:bg-[#200717]'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-rose-100 text-sm flex items-center gap-1.5">
                  {label}
                </span>
                <ChevronRight className="w-4 h-4 text-rose-400/60" />
              </div>

              <span className="text-[11px] text-rose-300/60 block mb-2">{description}</span>

              {/* Probability & Status */}
              <div className="flex items-baseline justify-between mb-1.5">
                <span
                  className={`text-xl font-mono font-bold tabular-nums ${
                    isVesselHigh
                      ? 'text-rose-400'
                      : isVesselMod
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {probPct}%
                </span>
                <span
                  className={`text-[11px] font-semibold ${
                    isVesselHigh
                      ? 'text-rose-400'
                      : isVesselMod
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {vData.riskCategory}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-[#250817] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isVesselHigh ? 'bg-rose-500 shadow-sm shadow-rose-500/50' : isVesselMod ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(5, vData.probability * 100))}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-rose-300/60 mt-1.5">
                <span>Cohort prevalence:</span>
                <span className="font-mono text-rose-200 tabular-nums font-semibold">{(vData.cohortPrevalence * 100).toFixed(0)}%</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Target Leakage Audit Indicator */}
      <div className="flex items-center justify-between pt-1 text-[11px] text-rose-300/70">
        <div className="flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-rose-400" />
          <span>Anti-Leakage Safeguard:</span>
          <span className="font-mono text-rose-200">{prediction.leakageExcludedFeatures.join(', ')} excluded</span>
        </div>
        <span className="text-rose-400/60">Click any vessel card to focus 3D camera</span>
      </div>
    </div>
  );
};

/**
 * Coronary Vessel Anatomical Deep-Dive Inspector (Burgundy Theme)
 * Localized risk analysis for LAD, LCX, and RCA
 */

import React from 'react';
import { VesselName, VesselPrediction, ModelPredictionResult } from '../types/cardiac';
import { AlertTriangle, X, ShieldCheck, HeartPulse } from 'lucide-react';

interface VesselDetailModalProps {
  vessel: VesselName | null;
  onClose: () => void;
  prediction: ModelPredictionResult;
}

export const VesselDetailModal: React.FC<VesselDetailModalProps> = ({
  vessel,
  onClose,
  prediction,
}) => {
  if (!vessel) return null;

  const data: VesselPrediction = prediction.vessels[vessel];

  const fullNames: Record<VesselName, string> = {
    LAD: 'Left Anterior Descending Artery (LAD)',
    LCX: 'Left Circumflex Artery (LCX)',
    RCA: 'Right Coronary Artery (RCA)',
  };

  const anatomicalTerritories: Record<VesselName, string> = {
    LAD: 'Anterior 2/3 of Interventricular Septum, Anterior Myocardial Free Wall, Cardiac Apex, and Anterolateral Papillary Muscle base.',
    LCX: 'Lateral and Posterolateral Walls of the Left Ventricle, Left Atrium, and in 15% (left-dominant) the Posterior Descending Artery.',
    RCA: 'Right Ventricular Myocardium, Right Atrium, Sinoatrial (SA) Node (60%), Atrioventricular (AV) Node (90%), and Inferior/Diaphragmatic LV Wall.',
  };

  const clinicalConsequences: Record<VesselName, string> = {
    LAD: 'Critical occlusion leads to extensive anterior myocardial infarction ("widow-maker"), cardiogenic shock, ventricular septal rupture, and severe congestive heart failure.',
    LCX: 'Occlusion causes lateral or true posterior STEMI, mitral regurgitation from papillary muscle ischemia, and lateral wall hypokinesis.',
    RCA: 'Occlusion causes inferior STEMI, complete heart block (AV node ischemia), sinus bradycardia, right ventricular infarction, and systemic hypotension.',
  };

  const isSevere = data.probability >= 0.60;
  const isModerate = data.probability >= 0.30 && data.probability < 0.60;

  return (
    <div className="fixed inset-0 z-50 bg-[#090206]/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#1b0614] border border-[#4c1228] rounded-xl max-w-xl w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#350d1e]">
          <div>
            <div className="flex items-center gap-2">
              <HeartPulse className="w-5 h-5 text-rose-500" />
              <h3 className="text-lg font-bold text-rose-50">{fullNames[vessel]}</h3>
            </div>
            <p className="text-xs text-rose-300/70 mt-0.5">Localized Vessel Stenosis & Perfusion Analysis</p>
          </div>
          <button
            onClick={onClose}
            className="text-rose-400 hover:text-rose-100 p-1 rounded-lg hover:bg-[#2c091d] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Risk Status Grid */}
        <div className="grid grid-cols-2 gap-3 my-4">
          <div className="p-3 bg-[#0f030a] rounded-lg border border-[#310c1c]">
            <span className="text-xs text-rose-300/70 block">Predicted Stenosis Probability</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-2xl font-mono font-bold tabular-nums ${
                isSevere ? 'text-rose-400' : isModerate ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {(data.probability * 100).toFixed(1)}%
              </span>
              <span className="text-xs font-semibold text-rose-200">
                {data.riskCategory} Risk
              </span>
            </div>
          </div>

          <div className="p-3 bg-[#0f030a] rounded-lg border border-[#310c1c]">
            <span className="text-xs text-rose-300/70 block">Model decision (threshold 0.5)</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-mono font-bold text-rose-100 tabular-nums">
                {data.stenosisPredicted ? '≥50%' : '<50%'}
              </span>
              <span className="text-xs text-rose-400/60">
                {data.stenosisPredicted ? 'Significant stenosis predicted' : 'Non-obstructive predicted'}
              </span>
            </div>
            <span className="text-[11px] text-rose-400/60 block mt-1">
              Cohort prevalence {(data.cohortPrevalence * 100).toFixed(0)}% · cross-validated AUC {data.cvAuc.toFixed(3)}
            </span>
          </div>
        </div>

        {/* Key Model Attribution Drivers for this Vessel */}
        <div className="mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-300/70 mb-1.5 block">
            Top factors raising this vessel's risk (SHAP)
          </span>
          <div className="flex flex-wrap gap-1.5">
            {data.keyDrivers.map((driver, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 text-xs bg-[#2b0c1e] text-rose-200 rounded border border-[#4c1228]"
              >
                {driver}
              </span>
            ))}
          </div>
        </div>

        {/* Anatomical Perfusion Supply */}
        <div className="space-y-3 text-xs text-rose-200">
          <div className="p-3 bg-[#14040e] rounded-lg border border-[#310c1c]">
            <span className="font-semibold text-rose-100 block mb-0.5">Myocardial Supply Territory:</span>
            <p className="text-rose-300/70 leading-relaxed">{anatomicalTerritories[vessel]}</p>
          </div>

          <div className="p-3 bg-[#14040e] rounded-lg border border-[#310c1c]">
            <span className="font-semibold text-rose-100 block mb-0.5">Clinical Occlusion Impact:</span>
            <p className="text-rose-300/70 leading-relaxed">{clinicalConsequences[vessel]}</p>
          </div>
        </div>

        {/* Recommendation Footer */}
        <div className="mt-5 pt-3 border-t border-[#350d1e] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-rose-300/70">
            {isSevere ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>
              {isSevere
                ? 'Suggest formal diagnostic evaluation (CCTA / Invasive Cath).'
                : 'Routine clinical monitoring recommended.'}
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold bg-[#881337] text-rose-100 rounded-lg hover:bg-[#9f1239] transition-colors shadow-sm"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};

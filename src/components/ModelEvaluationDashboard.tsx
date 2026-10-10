/**
 * Model Evaluation Dashboard (Burgundy Theme)
 * Every number is computed at runtime from out-of-fold predictions of a nested,
 * stratified 5-fold cross-validation on the real dataset.
 */

import React, { useState } from 'react';
import { TARGETS, TargetName } from '../types/cardiac';
import { DECISION_THRESHOLD, OUTER_FOLDS, targetTitle, verifyTargetLeakageSafety } from '../ml/modelPipeline';
import { useBundle } from '../ml/ModelContext';
import { Award, ShieldCheck, Lock } from 'lucide-react';

export const ModelEvaluationDashboard: React.FC = () => {
  const bundle = useBundle();
  const [selectedTarget, setSelectedTarget] = useState<TargetName>('CAD');
  const leakage = verifyTargetLeakageSafety(bundle);

  const current = bundle.models[selectedTarget].metrics;
  const currentModel = bundle.models[selectedTarget];
  const n = bundle.dataset.n;

  const aucs = TARGETS.map((t) => bundle.models[t].metrics.rocAuc);
  const aucRange = `${Math.min(...aucs).toFixed(3)} – ${Math.max(...aucs).toFixed(3)}`;

  return (
    <div className="bg-[#180612]/90 border border-[#3f1025] rounded-xl p-5 shadow-xl space-y-6 backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#350d1e]">
        <div>
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-rose-400" />
            <h3 className="text-base font-bold text-rose-50">Model Performance & Validation</h3>
          </div>
          <p className="text-xs text-rose-300/70 mt-0.5">
            Stratified {OUTER_FOLDS}-fold cross-validation on {n} patients (out-of-fold predictions, threshold{' '}
            {DECISION_THRESHOLD})
          </p>
        </div>

        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm border ${
            leakage.safe
              ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-300'
              : 'bg-rose-950/70 border-rose-700/80 text-rose-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{leakage.safe ? 'Leakage audit passed' : 'Leakage detected'}</span>
        </div>
      </div>

      {/* Target Metric Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TARGETS.map((t) => {
          const m = bundle.models[t].metrics;
          const isSelected = selectedTarget === t;
          return (
            <button
              key={t}
              onClick={() => setSelectedTarget(t)}
              className={`text-left p-3.5 rounded-lg border transition-all ${
                isSelected
                  ? 'bg-[#881337] border-rose-400 text-rose-50 shadow-md ring-1 ring-rose-400/50'
                  : 'bg-[#12040d]/80 border-[#310c1c] hover:border-[#52142f] hover:bg-[#200717]'
              }`}
            >
              <span className="text-xs font-bold text-rose-100 block truncate">{targetTitle(t)}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-xs text-rose-300/70">ROC-AUC</span>
                <span className="text-lg font-mono font-bold text-rose-200 tabular-nums">{m.rocAuc.toFixed(3)}</span>
              </div>
              <div className="flex items-baseline justify-between mt-1 text-xs text-rose-300/70">
                <span>Accuracy</span>
                <span className="font-mono text-rose-100 tabular-nums">{(m.accuracy * 100).toFixed(1)}%</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPIs */}
        <div className="space-y-3 bg-[#12040d]/80 p-4 rounded-lg border border-[#310c1c]">
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-300/70 block mb-2">
            Metrics: {current.targetName}
          </span>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              ['Accuracy', `${(current.accuracy * 100).toFixed(1)}%`, 'text-rose-100'],
              ['F1-Score', current.f1Score.toFixed(3), 'text-emerald-400'],
              ['Precision (PPV)', `${(current.precision * 100).toFixed(1)}%`, 'text-rose-300'],
              ['Recall (Sensitivity)', `${(current.recall * 100).toFixed(1)}%`, 'text-amber-400'],
              ['Specificity', `${(current.specificity * 100).toFixed(1)}%`, 'text-rose-200'],
              ['ROC-AUC (out-of-fold)', current.rocAuc.toFixed(3), 'text-rose-400'],
            ].map(([label, value, color]) => (
              <div key={label} className="p-2.5 bg-[#1b0614] rounded border border-[#350d1e]">
                <span className="text-rose-300/70 block">{label}</span>
                <span className={`text-xl font-mono font-bold tabular-nums ${color}`}>{value}</span>
              </div>
            ))}
          </div>

          <div className="text-[11px] text-rose-300/70 space-y-0.5 pt-1">
            <div>
              AUC per fold: {current.rocAucFoldMean.toFixed(3)} ± {current.rocAucFoldStd.toFixed(3)} (mean ± SD over{' '}
              {OUTER_FOLDS} folds)
            </div>
            <div>
              Classes: {current.positives} positive / {current.negatives} negative
            </div>
            <div>Regularisation λ (inner CV): {currentModel.lambda}</div>
          </div>
        </div>

        {/* Confusion Matrix */}
        <div className="bg-[#12040d]/80 p-4 rounded-lg border border-[#310c1c] flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-300/70 block mb-2">
              Confusion Matrix (N = {n} patients)
            </span>
            <p className="text-[11px] text-rose-400/50 mb-3">
              Catheterization ground truth vs. cross-validated model prediction
            </p>

            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-lg">
                <span className="text-[10px] text-emerald-400 uppercase font-semibold block">True Positive (TP)</span>
                <span className="text-2xl font-mono font-bold text-emerald-300 tabular-nums">
                  {current.confusionMatrix.tp}
                </span>
              </div>
              <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg">
                <span className="text-[10px] text-rose-400 uppercase font-semibold block">False Positive (FP)</span>
                <span className="text-2xl font-mono font-bold text-rose-300 tabular-nums">
                  {current.confusionMatrix.fp}
                </span>
              </div>
              <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg">
                <span className="text-[10px] text-amber-400 uppercase font-semibold block">False Negative (FN)</span>
                <span className="text-2xl font-mono font-bold text-amber-300 tabular-nums">
                  {current.confusionMatrix.fn}
                </span>
              </div>
              <div className="p-3 bg-[#240818] border border-[#4c1228] rounded-lg">
                <span className="text-[10px] text-rose-300 uppercase font-semibold block">True Negative (TN)</span>
                <span className="text-2xl font-mono font-bold text-rose-200 tabular-nums">
                  {current.confusionMatrix.tn}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 text-[11px] text-rose-300/70 text-center">
            Sensitivity {(current.recall * 100).toFixed(1)}% · Specificity {(current.specificity * 100).toFixed(1)}%
          </div>
        </div>

        {/* ROC Curve */}
        <div className="bg-[#12040d]/80 p-4 rounded-lg border border-[#310c1c] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-300/70">ROC curve</span>
              <span className="text-xs font-mono font-bold text-rose-400">AUC: {current.rocAuc.toFixed(3)}</span>
            </div>

            <div className="relative w-full aspect-square max-h-[190px] mx-auto border border-[#350d1e] bg-[#0c0307] rounded p-2">
              <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" role="img" aria-label="ROC curve">
                <line x1="0" y1="100" x2="100" y2="0" stroke="#4c1228" strokeDasharray="3,3" strokeWidth="1" />
                <polygon
                  fill="rgba(225, 29, 72, 0.15)"
                  points={`0,100 ${current.rocCurve.map((pt) => `${pt.fpr * 100},${100 - pt.tpr * 100}`).join(' ')} 100,100`}
                />
                <polyline
                  fill="none"
                  stroke="#e11d48"
                  strokeWidth="2.5"
                  points={current.rocCurve.map((pt) => `${pt.fpr * 100},${100 - pt.tpr * 100}`).join(' ')}
                />
              </svg>
              <div className="absolute bottom-1 left-2 text-[9px] text-rose-400/50">FPR (1 − Specificity)</div>
              <div className="absolute top-1 left-2 text-[9px] text-rose-400/50 rotate-90 origin-top-left">
                TPR (Sensitivity)
              </div>
            </div>
          </div>

          <div className="pt-2 text-[11px] text-rose-300/70 text-center">
            Out-of-fold ROC-AUC across the 4 targets: {aucRange}
          </div>
        </div>
      </div>

      {/* Leakage audit */}
      <div className="p-4 bg-[#0f030a] rounded-lg border border-[#310c1c]">
        <div className="flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-rose-100">Target-leakage audit (computed from the loaded file)</h4>
            <p className="text-xs text-rose-300/80 leading-relaxed">
              These columns exist in the dataset and were removed from every model input:{' '}
              <span className="font-mono text-rose-300">{leakage.excludedColumns.join(', ')}</span>. The models only see
              demographic, clinical, ECG, laboratory and echocardiographic features.
            </p>
            <div className="pt-1.5 flex flex-wrap gap-1 text-[10px] text-rose-300/60">
              <span className="font-semibold text-rose-200">Model inputs ({leakage.inputFeatures.length}):</span>
              {leakage.inputFeatures.map((k) => (
                <span key={k} className="bg-[#1f0614] px-1.5 py-0.5 rounded font-mono text-rose-200">
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

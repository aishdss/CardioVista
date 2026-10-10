/**
 * Technical documentation (Burgundy Theme).
 * Every statement describes what the code actually does; dataset facts and settings are
 * read from the trained bundle so the text cannot drift from the implementation.
 */

import React, { useState } from 'react';
import { BookOpen, Activity, Database, Cpu, Shield, FileText } from 'lucide-react';
import { useBundle } from '../ml/ModelContext';
import { LAMBDA_GRID } from '../ml/logistic';
import { DECISION_THRESHOLD, OUTER_FOLDS, RANDOM_SEED } from '../ml/modelPipeline';
import { TARGETS } from '../types/cardiac';

type SectionId = 'sec1' | 'sec2' | 'sec3' | 'sec4' | 'sec5' | 'sec6';

export const DocumentationView: React.FC = () => {
  const bundle = useBundle();
  const [activeSection, setActiveSection] = useState<SectionId>('sec1');
  const { dataset } = bundle;

  const sections: Array<{ id: SectionId; label: string }> = [
    { id: 'sec1', label: '1. Overview' },
    { id: 'sec2', label: '2. Dataset & Preprocessing' },
    { id: 'sec3', label: '3. Models & Validation' },
    { id: 'sec4', label: '4. Explainability (SHAP)' },
    { id: 'sec5', label: '5. 3D Visualization' },
    { id: 'sec6', label: '6. Limitations & Citation' },
  ];

  const Heading: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
    <h4 className="text-sm font-bold text-rose-100 flex items-center gap-2">
      {icon}
      {children}
    </h4>
  );

  return (
    <div className="bg-[#180612]/90 border border-[#3f1025] rounded-xl p-5 shadow-xl space-y-6 backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#350d1e]">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-rose-400" />
            <h3 className="text-base font-bold text-rose-50">Technical Documentation</h3>
          </div>
          <p className="text-xs text-rose-300/70 mt-0.5">
            What the system does, how the numbers are produced, and what it cannot do
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-[#0f030a] rounded-lg border border-[#2e0b19] text-xs font-mono text-rose-300/80">
          <span>{dataset.n} patients</span>
          <span>·</span>
          <span>{bundle.features.length} features</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`px-3 py-1.5 rounded font-medium whitespace-nowrap transition-colors ${
              activeSection === s.id
                ? 'bg-[#881337] text-rose-100 border border-rose-500/60 shadow-sm'
                : 'text-rose-300/70 hover:text-rose-100 hover:bg-[#200717]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="text-xs text-rose-200/90 leading-relaxed space-y-4 bg-[#10030b]/80 p-5 rounded-lg border border-[#310c1c]">
        {activeSection === 'sec1' && (
          <div className="space-y-3">
            <Heading icon={<Activity className="w-4 h-4 text-rose-400" />}>1. Overview</Heading>
            <p>
              CardioVista estimates the probability of coronary artery disease (CAD) and of significant stenosis
              (≥50% narrowing) in the three main coronary arteries — LAD (left anterior descending), LCX (left
              circumflex) and RCA (right coronary artery) — from non-invasive clinical data. Predictions are drawn on
              an interactive 3D heart, and every prediction is explained with SHAP values.
            </p>
            <p>
              The four models are trained in the browser from the dataset file when the app starts. The 3D heart,
              the predictions, the validation dashboard and the cohort table all read from those same trained models.
            </p>
            <p className="text-rose-300/80">
              This is an educational decision-support prototype. It is not a diagnostic device and does not replace
              invasive or CT angiography.
            </p>
          </div>
        )}

        {activeSection === 'sec2' && (
          <div className="space-y-3">
            <Heading icon={<Database className="w-4 h-4 text-rose-400" />}>2. Dataset & Preprocessing</Heading>
            <p>
              <span className="font-semibold text-rose-100">Source:</span> {dataset.sourceName} — the Extension of the
              Z-Alizadeh Sani dataset from the UCI Machine Learning Repository (CC BY 4.0). {dataset.n} patients were
              loaded.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-semibold text-rose-100">Targets:</span> overall CAD from column “
                {dataset.targetSources.CAD}”, and stenosis from “{dataset.targetSources.LAD}”, “
                {dataset.targetSources.LCX}” and “{dataset.targetSources.RCA}”.
              </li>
              <li>
                <span className="font-semibold text-rose-100">Leakage prevention:</span> the columns{' '}
                <span className="font-mono">{dataset.excludedColumns.join(', ')}</span> are removed from all model
                inputs.
              </li>
              <li>
                <span className="font-semibold text-rose-100">Encoding:</span> numeric columns stay numeric; Y/N and
                Male/Female columns become 0/1; valvular disease is ordinal (normal→severe); other text columns are
                one-hot encoded. Missing values (if any) are filled with the column median and constant columns are
                dropped
                {dataset.constantColumns.length > 0 && ` (${dataset.constantColumns.join(', ')})`}.
              </li>
              <li>
                <span className="font-semibold text-rose-100">Scaling:</span> z-score standardisation. During
                cross-validation the scaler is fitted on the training folds only.
              </li>
              <li>
                <span className="font-semibold text-rose-100">Result:</span> {bundle.features.length} input features.
              </li>
            </ul>
          </div>
        )}

        {activeSection === 'sec3' && (
          <div className="space-y-3">
            <Heading icon={<Cpu className="w-4 h-4 text-rose-400" />}>3. Models & Validation</Heading>
            <p>
              One L2-regularised logistic regression is trained per target ({TARGETS.join(', ')}), implemented from
              scratch in TypeScript with Newton–Raphson (IRLS). The objective is the same as scikit-learn’s
              LogisticRegression with C = 1/λ, and the intercept is not penalised.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-semibold text-rose-100">Regularisation:</span> λ is chosen from{' '}
                {LAMBDA_GRID.join(', ')} by inner 5-fold cross-validation (mean ROC-AUC) using only training data.
              </li>
              <li>
                <span className="font-semibold text-rose-100">Evaluation:</span> nested, stratified {OUTER_FOLDS}-fold
                cross-validation (seed {RANDOM_SEED}). Every patient is predicted by a model that never saw them.
              </li>
              <li>
                <span className="font-semibold text-rose-100">Metrics:</span> accuracy, precision, recall,
                specificity, F1 at threshold {DECISION_THRESHOLD}, ROC-AUC computed from the out-of-fold scores (also
                reported per fold as mean ± SD), confusion matrices and ROC curves.
              </li>
              <li>
                <span className="font-semibold text-rose-100">Final models:</span> refitted on all {dataset.n} patients
                for live predictions in the simulator.
              </li>
            </ul>
            <p>Open the Model Validation tab to see the metrics produced by this exact run.</p>
          </div>
        )}

        {activeSection === 'sec4' && (
          <div className="space-y-3">
            <Heading icon={<Shield className="w-4 h-4 text-rose-400" />}>4. Explainability (SHAP)</Heading>
            <p>
              For a linear model with independent features, SHAP values have a closed form. For feature i of a
              patient:
            </p>
            <p className="font-mono text-rose-100 bg-[#1b0614] border border-[#350d1e] rounded px-3 py-2">
              φᵢ = coefᵢ · (xᵢ − meanᵢ) / scaleᵢ, base value = intercept
            </p>
            <p>
              The values are in log-odds, and base value + Σφᵢ equals the model output exactly. The app can show the
              explanation for any of the four targets. Positive values raise the predicted risk; negative values
              lower it. SHAP describes the model’s behaviour, not causal effects in the patient.
            </p>
          </div>
        )}

        {activeSection === 'sec5' && (
          <div className="space-y-3">
            <Heading icon={<FileText className="w-4 h-4 text-rose-400" />}>5. 3D Visualization</Heading>
            <p>
              The heart is rendered with Three.js (WebGL). The chambers, great vessels and the LAD, LCX and RCA with
              their branches are built procedurally from tube geometries along curves; no external mesh files are
              used. Each coronary artery’s colour is driven by that vessel’s predicted stenosis probability from the
              models above, so the picture always matches the numbers in the dashboard.
            </p>
            <p>
              You can rotate, zoom, pick camera presets and click a vessel to focus it and open the vessel inspector.
              The heart-rate animation uses the patient’s pulse rate when the dataset provides it.
            </p>
            <p className="text-rose-300/80">
              The vessel geometry is a schematic illustration of anatomy, not a patient-specific reconstruction. The
              dataset does not contain lesion locations.
            </p>
          </div>
        )}

        {activeSection === 'sec6' && (
          <div className="space-y-3">
            <Heading icon={<Shield className="w-4 h-4 text-rose-400" />}>6. Limitations & Citation</Heading>
            <ul className="list-disc pl-5 space-y-1">
              <li>Only {dataset.n} patients from a single centre; cross-validation is not external validation.</li>
              <li>Linear models cannot capture interactions between features; performance may differ from other model families.</li>
              <li>The models predict probabilities of ≥50% stenosis, not the degree of narrowing or its exact position.</li>
              <li>The dataset has no information on lesion location within a vessel.</li>
              <li>Not validated for clinical use. Educational decision-support prototype only.</li>
            </ul>
            <p className="pt-2">
              <span className="font-semibold text-rose-100">Dataset citation:</span> Alizadehsani, R., Roshanzamir, M.,
              &amp; Sani, Z. (2013). Extention of Z-Alizadeh sani dataset [Dataset]. UCI Machine Learning Repository.
              https://doi.org/10.24432/C5461K (CC BY 4.0).
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

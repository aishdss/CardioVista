/**
 * Patient Simulator (Burgundy Theme)
 * The form is generated from the real dataset's feature list: binary findings become toggles,
 * measurements become sliders bounded by the values observed in the cohort.
 */

import React, { useMemo } from 'react';
import { CohortPatient, FEATURE_CATEGORIES, FeatureMeta, Patient } from '../types/cardiac';
import { TrainedBundle, formatValue } from '../ml/modelPipeline';
import { Sliders, RotateCcw } from 'lucide-react';

interface PatientInputFormProps {
  bundle: TrainedBundle;
  patient: Patient;
  onChange: (patient: Patient) => void;
  onSelectPatient: (patient: CohortPatient) => void;
}

const editedId = (id: string) => (id.endsWith(' (edited)') ? id : `${id} (edited)`);

function stepFor(f: FeatureMeta): number {
  if (f.kind === 'integer') return 1;
  const range = f.max - f.min;
  if (range <= 5) return 0.05;
  if (range <= 50) return 0.1;
  return 1;
}

export const PatientInputForm: React.FC<PatientInputFormProps> = ({
  bundle,
  patient,
  onChange,
  onSelectPatient,
}) => {
  const grouped = useMemo(
    () =>
      FEATURE_CATEGORIES.map((category) => ({
        category,
        features: bundle.features.filter((f) => f.category === category),
      })).filter((g) => g.features.length > 0),
    [bundle],
  );

  const setValue = (name: string, value: number) =>
    onChange({ id: editedId(patient.id), values: { ...patient.values, [name]: value } });

  const resetToMedian = () => {
    const values: Record<string, number> = {};
    bundle.features.forEach((f) => {
      values[f.name] = f.median;
    });
    onChange({ id: 'Median patient', values });
  };

  const baseId = patient.id.replace(/ \(edited\)$/, '');

  return (
    <div className="bg-[#180612]/90 border border-[#3f1025] rounded-xl p-5 shadow-xl space-y-5 backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#350d1e]">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-rose-400" />
            <h3 className="text-base font-bold text-rose-50">Patient Simulator</h3>
          </div>
          <p className="text-xs text-rose-300/70 mt-0.5">
            {bundle.features.length} input features from the dataset. Predictions update instantly as you edit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="load-patient">
            Load a real patient
          </label>
          <select
            id="load-patient"
            value={bundle.cohort.some((c) => c.id === baseId) ? baseId : ''}
            onChange={(e) => {
              const found = bundle.cohort.find((c) => c.id === e.target.value);
              if (found) onSelectPatient(found);
            }}
            className="bg-[#0f030a] border border-[#310c1c] rounded-lg px-2.5 py-1.5 text-xs text-rose-100 focus:outline-none focus:border-rose-400"
          >
            <option value="" disabled>
              Load a real patient…
            </option>
            {bundle.cohort.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} — CAD {c.truth.CAD ? '+' : '−'}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={resetToMedian}
            className="px-2.5 py-1.5 text-xs font-semibold rounded bg-[#2c091d] hover:bg-[#481132] text-rose-200 border border-[#4c1228] transition-colors inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Median patient</span>
          </button>
        </div>
      </div>

      {grouped.map(({ category, features }, gi) => (
        <details key={category} open={gi < 3} className="group">
          <summary className="cursor-pointer list-none flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-rose-300/80 pb-2">
            <span>
              {category} <span className="text-rose-400/50 normal-case font-normal">({features.length})</span>
            </span>
            <span className="text-rose-400/50 group-open:rotate-90 transition-transform" aria-hidden="true">
              ›
            </span>
          </summary>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {features.map((f) => {
              const value = patient.values[f.name] ?? f.median;
              const id = `feat-${f.name.replace(/[^a-z0-9]/gi, '_')}`;
              return (
                <div key={f.name} className="p-2.5 rounded-lg bg-[#12040d]/80 border border-[#310c1c]">
                  {f.kind === 'binary' ? (
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor={id} className="text-xs text-rose-100">
                        {f.label}
                      </label>
                      <button
                        id={id}
                        type="button"
                        role="switch"
                        aria-checked={value >= 0.5}
                        onClick={() => setValue(f.name, value >= 0.5 ? 0 : 1)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded border transition-colors min-w-[3.5rem] ${
                          value >= 0.5
                            ? 'bg-[#881337] text-rose-50 border-rose-500/60'
                            : 'bg-[#0f030a] text-rose-300/70 border-[#310c1c]'
                        }`}
                      >
                        {formatValue(f, value)}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor={id} className="text-xs text-rose-100">
                          {f.label}
                        </label>
                        <span className="font-mono text-xs text-rose-300 tabular-nums">{formatValue(f, value)}</span>
                      </div>
                      <input
                        id={id}
                        type="range"
                        min={f.min}
                        max={f.max}
                        step={stepFor(f)}
                        value={value}
                        onChange={(e) => setValue(f.name, Number(e.target.value))}
                        className="w-full accent-rose-500"
                      />
                      <div className="flex justify-between text-[10px] text-rose-400/50 font-mono">
                        <span>{formatValue(f, f.min)}</span>
                        <span>cohort avg {f.mean.toFixed(1)}</span>
                        <span>{formatValue(f, f.max)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
};

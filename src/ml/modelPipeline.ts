/**
 * Cardiovascular Risk & Multi-Vessel Stenosis Predictive Modeling Engine
 *
 * Everything here is computed at runtime from the dataset file:
 *  - 4 logistic-regression models (CAD, LAD, LCX, RCA) trained on the real records
 *  - nested stratified 5-fold cross-validation for honest performance metrics
 *  - exact SHAP values (for a linear model: phi_i = coef_i * (x_i - mean_i) / scale_i)
 *
 * Target-leakage safeguard: LAD, LCX, RCA, Cath and CAD columns are removed from the
 * inputs in dataset.ts before any feature reaches a model.
 */

import {
  CohortPatient,
  FeatureCategory,
  FeatureContribution,
  FeatureMeta,
  ModelMetrics,
  ModelPredictionResult,
  Patient,
  PatientValues,
  TARGETS,
  TargetName,
  VesselName,
  VesselPrediction,
} from '../types/cardiac';
import { Dataset } from './dataset';
import {
  applyScaler,
  crossValidate,
  fitLogistic,
  fitScaler,
  Scaler,
  predictProba,
  rocAuc,
  rocCurve,
  selectLambda,
  mulberry32,
  sigmoid,
  thresholdMetrics,
} from './logistic';

export const RANDOM_SEED = 42;
export const OUTER_FOLDS = 5;
export const DECISION_THRESHOLD = 0.5;

export interface TargetModel {
  target: TargetName;
  intercept: number;
  coef: number[]; // on standardised features
  lambda: number; // regularisation chosen by inner CV on the full data
  prevalence: number;
  metrics: ModelMetrics;
  foldLambdas: number[];
}

export interface TrainedBundle {
  dataset: Dataset;
  features: FeatureMeta[];
  scaler: Scaler;
  models: Record<TargetName, TargetModel>;
  cohort: CohortPatient[];
}

export interface TrainingProgress {
  target: TargetName;
  targetIndex: number;
  fold: number;
  folds: number;
  fraction: number;
}

const TARGET_TITLES: Record<TargetName, string> = {
  CAD: 'Overall CAD Status',
  LAD: 'LAD Stenosis',
  LCX: 'LCX Stenosis',
  RCA: 'RCA Stenosis',
};

export const targetTitle = (t: TargetName) => TARGET_TITLES[t];

// ------------------------------------------------------------------ training

export async function trainAll(
  dataset: Dataset,
  onProgress?: (p: TrainingProgress) => void,
): Promise<TrainedBundle> {
  const scaler = fitScaler(dataset.X);
  const Zall = applyScaler(dataset.X, scaler);
  const models = {} as Record<TargetName, TargetModel>;
  const oofByTarget = {} as Record<TargetName, number[]>;

  for (let t = 0; t < TARGETS.length; t++) {
    const target = TARGETS[t];
    const y = dataset.labels[target];

    const cv = await crossValidate(dataset.X, y, RANDOM_SEED + t, OUTER_FOLDS, (done, total) =>
      onProgress?.({
        target,
        targetIndex: t,
        fold: done,
        folds: total,
        fraction: (t + done / total) / TARGETS.length,
      }),
    );

    const lambda = selectLambda(dataset.X, y, mulberry32(RANDOM_SEED + 100 + t));
    const fit = fitLogistic(Zall, y, lambda);

    const tm = thresholdMetrics(y, cv.oof, DECISION_THRESHOLD);
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const foldMean = mean(cv.foldAucs);
    const foldStd = Math.sqrt(mean(cv.foldAucs.map((v) => (v - foldMean) ** 2)));
    const positives = y.reduce((s, v) => s + v, 0);

    models[target] = {
      target,
      intercept: fit.b,
      coef: fit.w,
      lambda,
      prevalence: positives / y.length,
      foldLambdas: cv.lambdas,
      metrics: {
        targetName: TARGET_TITLES[target],
        accuracy: tm.accuracy,
        precision: tm.precision,
        recall: tm.recall,
        specificity: tm.specificity,
        f1Score: tm.f1,
        rocAuc: rocAuc(y, cv.oof),
        rocAucFoldMean: foldMean,
        rocAucFoldStd: foldStd,
        confusionMatrix: { tp: tm.tp, fp: tm.fp, tn: tm.tn, fn: tm.fn },
        rocCurve: rocCurve(y, cv.oof),
        positives,
        negatives: y.length - positives,
      },
    };
    oofByTarget[target] = cv.oof;
  }

  const cohort: CohortPatient[] = dataset.X.map((row, i) => {
    const values: PatientValues = {};
    dataset.features.forEach((f, j) => {
      values[f.name] = row[j];
    });
    return {
      id: dataset.ids[i],
      values,
      truth: {
        CAD: dataset.labels.CAD[i] as 0 | 1,
        LAD: dataset.labels.LAD[i] as 0 | 1,
        LCX: dataset.labels.LCX[i] as 0 | 1,
        RCA: dataset.labels.RCA[i] as 0 | 1,
      },
      oofProbability: {
        CAD: oofByTarget.CAD[i],
        LAD: oofByTarget.LAD[i],
        LCX: oofByTarget.LCX[i],
        RCA: oofByTarget.RCA[i],
      },
    };
  });

  return { dataset, features: dataset.features, scaler, models, cohort };
}

// ----------------------------------------------------------------- inference

function standardise(bundle: TrainedBundle, values: PatientValues): number[] {
  return bundle.features.map((f, j) => {
    const v = Number.isFinite(values[f.name]) ? values[f.name] : f.median;
    return (v - bundle.scaler.mean[j]) / bundle.scaler.scale[j];
  });
}

export function logitFor(bundle: TrainedBundle, target: TargetName, values: PatientValues): number {
  const z = standardise(bundle, values);
  const m = bundle.models[target];
  let eta = m.intercept;
  for (let j = 0; j < z.length; j++) eta += m.coef[j] * z[j];
  return eta;
}

export function formatValue(f: FeatureMeta, v: number): string {
  if (f.kind === 'binary') {
    if (/^sex/i.test(f.label)) return v >= 0.5 ? 'Male' : 'Female';
    return v >= 0.5 ? 'Yes' : 'No';
  }
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

const riskCategory = (p: number): 'Low' | 'Moderate' | 'High' | 'Severe' => {
  if (p < 0.3) return 'Low';
  if (p < 0.6) return 'Moderate';
  if (p < 0.8) return 'High';
  return 'Severe';
};

export function predictCardiovascularRisk(bundle: TrainedBundle, patient: Patient): ModelPredictionResult {
  const prob = {} as Record<TargetName, number>;
  for (const t of TARGETS) prob[t] = sigmoid(logitFor(bundle, t, patient.values));

  const makeVessel = (vessel: VesselName): VesselPrediction => {
    const p = prob[vessel];
    const drivers = computeShapAttributions(bundle, patient, vessel)
      .contributions.filter((c) => c.contribution > 0)
      .slice(0, 3)
      .map((c) => `${c.displayName}: ${c.value}`);
    return {
      vessel,
      probability: p,
      stenosisPredicted: p >= DECISION_THRESHOLD,
      riskCategory: riskCategory(p),
      cohortPrevalence: bundle.models[vessel].prevalence,
      cvAuc: bundle.models[vessel].metrics.rocAuc,
      keyDrivers: drivers.length ? drivers : ['No feature raises this vessel above the average patient'],
    };
  };

  const vessels = { LAD: makeVessel('LAD'), LCX: makeVessel('LCX'), RCA: makeVessel('RCA') };
  const stenosisCount = Number(vessels.LAD.stenosisPredicted) + Number(vessels.LCX.stenosisPredicted) + Number(vessels.RCA.stenosisPredicted);
  const classification = (['No Significant CAD', 'Single-Vessel Disease', 'Double-Vessel Disease', 'Triple-Vessel Disease'] as const)[stenosisCount];

  const cadProb = prob.CAD;
  const cadRiskCategory = cadProb >= 0.8 ? 'Critical High Risk' : cadProb >= 0.6 ? 'High Risk' : cadProb >= 0.35 ? 'Moderate Risk' : 'Low Risk';

  return {
    cadProbability: cadProb,
    cadStatusPredicted: cadProb >= DECISION_THRESHOLD ? 'CAD' : 'Normal',
    cadRiskCategory,
    vessels,
    stenosisCount,
    diseaseClassification: classification,
    timestamp: new Date().toISOString(),
    leakageExcludedFeatures: bundle.dataset.excludedColumns,
  };
}

// ---------------------------------------------------------------------- SHAP

export interface ShapResult {
  baseValue: number; // log-odds of the average patient (the model intercept)
  logit: number; // baseValue + sum(contributions)
  contributions: FeatureContribution[];
}

/**
 * Exact SHAP values for a linear model with independent features:
 *   phi_i = coef_i * (x_i - mean_i) / scale_i,  base value = intercept.
 * Sum of phi_i + base value equals the model's log-odds output exactly.
 */
export function computeShapAttributions(bundle: TrainedBundle, patient: Patient, target: TargetName): ShapResult {
  const m = bundle.models[target];
  const z = standardise(bundle, patient.values);
  const phi = z.map((zj, j) => m.coef[j] * zj);
  const totalAbs = phi.reduce((s, v) => s + Math.abs(v), 0) || 1;

  const contributions: FeatureContribution[] = bundle.features
    .map((f, j) => {
      const v = Number.isFinite(patient.values[f.name]) ? patient.values[f.name] : f.median;
      const direction = phi[j] >= 0 ? 'raises' : 'lowers';
      return {
        featureName: f.name,
        displayName: f.label,
        value: formatValue(f, v),
        contribution: phi[j],
        percentageImpact: Math.round((Math.abs(phi[j]) / totalAbs) * 100),
        category: f.category as FeatureCategory,
        clinicalInterpretation:
          `Value ${formatValue(f, v)} compared with a cohort average of ${f.kind === 'binary' ? `${Math.round(f.mean * 100)}% yes` : f.mean.toFixed(1)}. ` +
          `In this model it ${direction} the predicted ${TARGET_TITLES[target]} log-odds by ${Math.abs(phi[j]).toFixed(2)}.`,
      };
    })
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return { baseValue: m.intercept, logit: m.intercept + phi.reduce((s, v) => s + v, 0), contributions };
}

// ------------------------------------------------------------------- helpers

/** Finds a feature by trying several normalised column names (e.g. ["pr", "heartrate"]). */
export function findFeature(features: FeatureMeta[], keys: string[]): FeatureMeta | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const key of keys) {
    const hit = features.find((f) => norm(f.name) === key);
    if (hit) return hit;
  }
  return undefined;
}

export interface PatientHeadline {
  age?: string;
  sex?: string;
  bloodPressure?: string;
  ejectionFraction?: string;
  rwma?: string;
  heartRate: number;
}

export function patientHeadline(bundle: TrainedBundle, patient: Patient): PatientHeadline {
  const get = (keys: string[]) => {
    const f = findFeature(bundle.features, keys);
    return f ? { f, v: patient.values[f.name] ?? f.median } : undefined;
  };
  const age = get(['age']);
  const sex = get(['sex']);
  const bp = get(['bp']);
  const ef = get(['eftte', 'ef']);
  const rwma = get(['regionrwma']);
  const pr = get(['pr', 'heartrate']);
  return {
    age: age ? `${formatValue(age.f, age.v)}y` : undefined,
    sex: sex ? formatValue(sex.f, sex.v) : undefined,
    bloodPressure: bp ? `${formatValue(bp.f, bp.v)} mmHg` : undefined,
    ejectionFraction: ef ? `${formatValue(ef.f, ef.v)}%` : undefined,
    rwma: rwma ? `${formatValue(rwma.f, rwma.v)} region(s)` : undefined,
    heartRate: pr ? Math.max(40, Math.min(160, Math.round(pr.v))) : 72,
  };
}

/** Verifies the leakage rule against the actual feature list used by the models. */
export function verifyTargetLeakageSafety(bundle: TrainedBundle) {
  const banned = ['lad', 'lcx', 'rca', 'cath', 'cad', 'cadstatus', 'leftmain', 'lmain'];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const offenders = bundle.features.filter((f) => banned.includes(norm(f.name.split(' = ')[0])));
  return {
    safe: offenders.length === 0,
    excludedColumns: bundle.dataset.excludedColumns,
    inputFeatures: bundle.features.map((f) => f.name),
  };
}

/**
 * Cardiovascular Risk & Multi-Vessel Stenosis Intelligence
 * Types and Data Contracts
 */

export type VesselName = 'LAD' | 'LCX' | 'RCA';

export type TargetName = 'CAD' | 'LAD' | 'LCX' | 'RCA';

export const TARGETS: TargetName[] = ['CAD', 'LAD', 'LCX', 'RCA'];

export type FeatureCategory =
  | 'Demographics'
  | 'Hemodynamics'
  | 'Clinical History'
  | 'Symptoms & Signs'
  | 'Ischemia & ECG'
  | 'Echocardiogram'
  | 'Biomarkers & Labs'
  | 'Other';

export const FEATURE_CATEGORIES: FeatureCategory[] = [
  'Demographics',
  'Hemodynamics',
  'Clinical History',
  'Symptoms & Signs',
  'Ischemia & ECG',
  'Echocardiogram',
  'Biomarkers & Labs',
  'Other',
];

/** One model input column, derived from the real dataset. */
export interface FeatureMeta {
  name: string; // column name (after encoding)
  label: string; // human-readable label
  category: FeatureCategory;
  kind: 'binary' | 'integer' | 'numeric';
  min: number;
  max: number;
  mean: number;
  median: number;
}

/** Feature values for one patient, keyed by FeatureMeta.name. */
export type PatientValues = Record<string, number>;

/** An active patient in the app (either a real cohort record or an edited copy). */
export interface Patient {
  id: string;
  values: PatientValues;
}

/** A real patient from the dataset together with ground truth and out-of-fold predictions. */
export interface CohortPatient extends Patient {
  truth: Record<TargetName, 0 | 1>;
  /** Predicted probabilities from models that did NOT see this patient (cross-validation). */
  oofProbability: Record<TargetName, number>;
}

export interface VesselPrediction {
  vessel: VesselName;
  probability: number; // 0 to 1
  stenosisPredicted: boolean; // probability >= 0.5
  riskCategory: 'Low' | 'Moderate' | 'High' | 'Severe';
  cohortPrevalence: number; // share of patients in the dataset with >=50% stenosis in this vessel
  cvAuc: number; // cross-validated ROC-AUC of this vessel's model
  keyDrivers: string[]; // top features pushing this vessel's prediction up (from SHAP)
}

export interface ModelPredictionResult {
  cadProbability: number; // 0 to 1
  cadStatusPredicted: 'CAD' | 'Normal';
  cadRiskCategory: 'Low Risk' | 'Moderate Risk' | 'High Risk' | 'Critical High Risk';
  vessels: {
    LAD: VesselPrediction;
    LCX: VesselPrediction;
    RCA: VesselPrediction;
  };
  stenosisCount: number; // number of predicted diseased vessels (0, 1, 2, or 3)
  diseaseClassification: 'No Significant CAD' | 'Single-Vessel Disease' | 'Double-Vessel Disease' | 'Triple-Vessel Disease';
  timestamp: string;
  leakageExcludedFeatures: string[]; // columns removed from the inputs
}

export interface FeatureContribution {
  featureName: string;
  displayName: string;
  value: string | number;
  contribution: number; // exact SHAP value in log-odds (positive raises risk)
  percentageImpact: number; // share of the total absolute attribution
  category: FeatureCategory;
  clinicalInterpretation: string;
}

export interface ModelMetrics {
  targetName: string;
  accuracy: number;
  precision: number;
  recall: number;
  specificity: number;
  f1Score: number;
  rocAuc: number; // computed on out-of-fold predictions
  rocAucFoldMean: number;
  rocAucFoldStd: number;
  confusionMatrix: {
    tp: number;
    fp: number;
    tn: number;
    fn: number;
  };
  rocCurve: Array<{ fpr: number; tpr: number }>;
  positives: number;
  negatives: number;
}

export interface CameraPreset {
  name: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  description: string;
}

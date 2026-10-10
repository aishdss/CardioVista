/**
 * L2-regularised logistic regression, written from scratch (no ML library),
 * plus the evaluation tools used by the dashboard: stratified folds, nested
 * cross-validation, ROC-AUC, ROC curve and threshold metrics.
 *
 * Objective (intercept b is NOT penalised):
 *   sum_i [ log(1 + exp(eta_i)) - y_i * eta_i ] + (lambda / 2) * ||w||^2,   eta_i = b + w . z_i
 * This is the same objective as scikit-learn's LogisticRegression with C = 1 / lambda.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Returns the fold index (0..k-1) of every sample, keeping the class ratio in each fold. */
export function stratifiedFolds(y: number[], k: number, rng: () => number): number[] {
  const folds = new Array<number>(y.length).fill(0);
  for (const cls of [0, 1]) {
    const idx = shuffle(
      y.map((v, i) => (v === cls ? i : -1)).filter((i) => i >= 0),
      rng,
    );
    idx.forEach((sampleIndex, pos) => {
      folds[sampleIndex] = pos % k;
    });
  }
  return folds;
}

// ------------------------------------------------------------------ scaling

export interface Scaler {
  mean: number[];
  scale: number[];
}

export function fitScaler(X: number[][]): Scaler {
  const n = X.length;
  const p = X[0].length;
  const mean = new Array<number>(p).fill(0);
  for (const row of X) for (let j = 0; j < p; j++) mean[j] += row[j] / n;
  const scale = new Array<number>(p).fill(0);
  for (const row of X) for (let j = 0; j < p; j++) scale[j] += (row[j] - mean[j]) ** 2 / n;
  return { mean, scale: scale.map((v) => (Math.sqrt(v) > 1e-12 ? Math.sqrt(v) : 1)) };
}

export function applyScaler(X: number[][], s: Scaler): number[][] {
  return X.map((row) => row.map((v, j) => (v - s.mean[j]) / s.scale[j]));
}

// ------------------------------------------------------------------- model

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));

export interface LogisticFit {
  w: number[];
  b: number;
}

/** Solves A x = rhs for symmetric positive-definite A (flat d x d) via Cholesky. */
function choleskySolve(A: Float64Array, rhs: Float64Array, d: number): Float64Array {
  const L = new Float64Array(d * d);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * d + j];
      for (let k = 0; k < j; k++) sum -= L[i * d + k] * L[j * d + k];
      if (i === j) {
        L[i * d + i] = Math.sqrt(Math.max(sum, 1e-12));
      } else {
        L[i * d + j] = sum / L[j * d + j];
      }
    }
  }
  const y = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    let sum = rhs[i];
    for (let k = 0; k < i; k++) sum -= L[i * d + k] * y[k];
    y[i] = sum / L[i * d + i];
  }
  const x = new Float64Array(d);
  for (let i = d - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < d; k++) sum -= L[k * d + i] * x[k];
    x[i] = sum / L[i * d + i];
  }
  return x;
}

function penalisedLoss(Z: number[][], y: number[], beta: Float64Array, lambda: number): number {
  const p = Z[0].length;
  let loss = 0;
  for (let i = 0; i < Z.length; i++) {
    let eta = beta[p];
    const zi = Z[i];
    for (let j = 0; j < p; j++) eta += beta[j] * zi[j];
    loss += (eta > 0 ? eta + Math.log1p(Math.exp(-eta)) : Math.log1p(Math.exp(eta))) - y[i] * eta;
  }
  let pen = 0;
  for (let j = 0; j < p; j++) pen += beta[j] * beta[j];
  return loss + 0.5 * lambda * pen;
}

/** Newton-Raphson (IRLS) with backtracking. Z must already be standardised. */
export function fitLogistic(Z: number[][], y: number[], lambda: number, maxIter = 40): LogisticFit {
  const n = Z.length;
  const p = Z[0].length;
  const d = p + 1;
  const beta = new Float64Array(d);
  let loss = penalisedLoss(Z, y, beta, lambda);

  for (let iter = 0; iter < maxIter; iter++) {
    const grad = new Float64Array(d);
    const H = new Float64Array(d * d);
    for (let i = 0; i < n; i++) {
      const zi = Z[i];
      let eta = beta[p];
      for (let j = 0; j < p; j++) eta += beta[j] * zi[j];
      const mu = sigmoid(eta);
      const r = mu - y[i];
      const s = mu * (1 - mu);
      for (let a = 0; a < p; a++) {
        const za = zi[a];
        grad[a] += r * za;
        const sa = s * za;
        const rowBase = a * d;
        for (let c = 0; c <= a; c++) H[rowBase + c] += sa * zi[c];
        H[rowBase + p] = 0; // filled below by symmetry
      }
      grad[p] += r;
      // intercept row: H[p][c] = sum s * z_c ; H[p][p] = sum s
      const pBase = p * d;
      for (let c = 0; c < p; c++) H[pBase + c] += s * zi[c];
      H[pBase + p] += s;
    }
    for (let a = 0; a < p; a++) {
      grad[a] += lambda * beta[a];
      H[a * d + a] += lambda;
    }
    for (let a = 0; a < d; a++) H[a * d + a] += 1e-8;
    // Cholesky reads only the lower triangle (j <= i), which is what we filled.
    const step = choleskySolve(H, grad, d);

    let t = 1;
    let accepted = false;
    for (let ls = 0; ls < 12; ls++) {
      const trial = new Float64Array(d);
      for (let a = 0; a < d; a++) trial[a] = beta[a] - t * step[a];
      const trialLoss = penalisedLoss(Z, y, trial, lambda);
      if (trialLoss <= loss + 1e-12) {
        beta.set(trial);
        loss = trialLoss;
        accepted = true;
        break;
      }
      t /= 2;
    }
    if (!accepted) break;
    let maxStep = 0;
    for (let a = 0; a < d; a++) maxStep = Math.max(maxStep, Math.abs(t * step[a]));
    if (maxStep < 1e-7) break;
  }
  return { w: Array.from(beta.slice(0, p)), b: beta[p] };
}

export function logit(fit: LogisticFit, z: number[]): number {
  let eta = fit.b;
  for (let j = 0; j < z.length; j++) eta += fit.w[j] * z[j];
  return eta;
}

export function predictProba(fit: LogisticFit, Z: number[][]): number[] {
  return Z.map((z) => sigmoid(logit(fit, z)));
}

export { sigmoid };

// -------------------------------------------------------------- evaluation

/** ROC-AUC via the rank-sum (Mann-Whitney) formulation, with tied scores averaged. */
export function rocAuc(y: number[], scores: number[]): number {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const ranks = new Array<number>(scores.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]] = avg;
    i = j + 1;
  }
  let nPos = 0;
  let rankSum = 0;
  for (let k = 0; k < y.length; k++) {
    if (y[k] === 1) {
      nPos++;
      rankSum += ranks[k];
    }
  }
  const nNeg = y.length - nPos;
  if (nPos === 0 || nNeg === 0) return 0.5;
  return (rankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

export function rocCurve(y: number[], scores: number[], gridSize = 41): Array<{ fpr: number; tpr: number }> {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const nPos = y.reduce((a, b) => a + b, 0);
  const nNeg = y.length - nPos;
  const pts: Array<{ fpr: number; tpr: number }> = [{ fpr: 0, tpr: 0 }];
  let tp = 0;
  let fp = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    for (let k = i; k <= j; k++) {
      if (y[idx[k]] === 1) tp++;
      else fp++;
    }
    pts.push({ fpr: fp / nNeg, tpr: tp / nPos });
    i = j + 1;
  }
  const grid: Array<{ fpr: number; tpr: number }> = [];
  for (let g = 0; g < gridSize; g++) {
    const x = g / (gridSize - 1);
    let k = 0;
    while (k < pts.length - 1 && pts[k + 1].fpr < x) k++;
    const a = pts[k];
    const b = pts[Math.min(k + 1, pts.length - 1)];
    const t = b.fpr === a.fpr ? 0 : (x - a.fpr) / (b.fpr - a.fpr);
    grid.push({ fpr: x, tpr: a.tpr + Math.max(0, Math.min(1, t)) * (b.tpr - a.tpr) });
  }
  return grid;
}

export interface ThresholdMetrics {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  accuracy: number;
  precision: number;
  recall: number;
  specificity: number;
  f1: number;
}

export function thresholdMetrics(y: number[], prob: number[], threshold = 0.5): ThresholdMetrics {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (let i = 0; i < y.length; i++) {
    const pred = prob[i] >= threshold ? 1 : 0;
    if (y[i] === 1 && pred === 1) tp++;
    else if (y[i] === 0 && pred === 1) fp++;
    else if (y[i] === 0 && pred === 0) tn++;
    else fn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return {
    tp,
    fp,
    tn,
    fn,
    accuracy: (tp + tn) / y.length,
    precision,
    recall,
    specificity: tn + fp ? tn / (tn + fp) : 0,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
  };
}

// ------------------------------------------------------ cross-validation

export const LAMBDA_GRID = [0.1, 1, 10, 100];

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function subset<T>(arr: T[], idx: number[]): T[] {
  return idx.map((i) => arr[i]);
}

/** Picks lambda by inner k-fold CV (mean ROC-AUC). Ties go to the stronger penalty. */
export function selectLambda(X: number[][], y: number[], rng: () => number, k = 5, grid = LAMBDA_GRID): number {
  const folds = stratifiedFolds(y, k, rng);
  let best = grid[grid.length - 1];
  let bestAuc = -1;
  for (const lambda of [...grid].reverse()) {
    const aucs: number[] = [];
    for (let f = 0; f < k; f++) {
      const trainIdx = folds.map((v, i) => (v !== f ? i : -1)).filter((i) => i >= 0);
      const valIdx = folds.map((v, i) => (v === f ? i : -1)).filter((i) => i >= 0);
      const Xtr = subset(X, trainIdx);
      const scaler = fitScaler(Xtr);
      const fit = fitLogistic(applyScaler(Xtr, scaler), subset(y, trainIdx), lambda);
      const proba = predictProba(fit, applyScaler(subset(X, valIdx), scaler));
      aucs.push(rocAuc(subset(y, valIdx), proba));
    }
    const mean = aucs.reduce((a, b) => a + b, 0) / aucs.length;
    if (mean > bestAuc + 1e-9) {
      bestAuc = mean;
      best = lambda;
    }
  }
  return best;
}

export interface CrossValidationResult {
  oof: number[];
  foldAucs: number[];
  lambdas: number[];
}

/**
 * Nested cross-validation: every patient is predicted by a model that never saw them, and
 * lambda is chosen only from the training part of each outer fold.
 */
export async function crossValidate(
  X: number[][],
  y: number[],
  seed: number,
  outerFolds = 5,
  onFold?: (done: number, total: number) => void,
): Promise<CrossValidationResult> {
  const rng = mulberry32(seed);
  const folds = stratifiedFolds(y, outerFolds, rng);
  const oof = new Array<number>(y.length).fill(0);
  const foldAucs: number[] = [];
  const lambdas: number[] = [];

  for (let f = 0; f < outerFolds; f++) {
    const trainIdx = folds.map((v, i) => (v !== f ? i : -1)).filter((i) => i >= 0);
    const testIdx = folds.map((v, i) => (v === f ? i : -1)).filter((i) => i >= 0);
    const Xtr = subset(X, trainIdx);
    const ytr = subset(y, trainIdx);
    const lambda = selectLambda(Xtr, ytr, rng);
    const scaler = fitScaler(Xtr);
    const fit = fitLogistic(applyScaler(Xtr, scaler), ytr, lambda);
    const proba = predictProba(fit, applyScaler(subset(X, testIdx), scaler));
    testIdx.forEach((sampleIndex, k) => {
      oof[sampleIndex] = proba[k];
    });
    foldAucs.push(rocAuc(subset(y, testIdx), proba));
    lambdas.push(lambda);
    onFold?.(f + 1, outerFolds);
    await tick();
  }
  return { oof, foldAucs, lambdas };
}

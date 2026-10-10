/**
 * Reproducible check of the whole ML pipeline outside the browser.
 *
 *   npx tsx scripts/selfcheck.ts path/to/dataset.xlsx   (or .csv)
 *
 * Prints the dataset summary, cross-validated metrics for every target, and verifies that
 * SHAP values add up exactly to the model output.
 */
import { readFileSync } from 'node:fs';
import { datasetFromText, datasetFromXlsx } from '../src/ml/dataset';
import { computeShapAttributions, logitFor, trainAll, verifyTargetLeakageSafety } from '../src/ml/modelPipeline';
import { TARGETS } from '../src/types/cardiac';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npx tsx scripts/selfcheck.ts <dataset.csv|xlsx>');
  const buf = readFileSync(file);
  const dataset = file.toLowerCase().endsWith('.xlsx')
    ? datasetFromXlsx(new Uint8Array(buf), file)
    : datasetFromText(buf.toString('utf8'), file);

  console.log(`Patients: ${dataset.n}   Input features: ${dataset.features.length}`);
  console.log('Excluded (leakage) columns:', dataset.excludedColumns.join(', '));
  if (dataset.constantColumns.length) console.log('Constant columns removed:', dataset.constantColumns.join(', '));
  console.log('Target sources:', JSON.stringify(dataset.targetSources));
  for (const t of TARGETS) {
    const pos = dataset.labels[t].reduce((a, b) => a + b, 0);
    console.log(`  ${t}: ${pos} positive / ${dataset.n - pos} negative`);
  }

  const started = Date.now();
  const bundle = await trainAll(dataset);
  console.log(`\nTrained + cross-validated in ${((Date.now() - started) / 1000).toFixed(1)} s\n`);

  console.table(
    TARGETS.map((t) => {
      const m = bundle.models[t].metrics;
      return {
        target: t,
        accuracy: +m.accuracy.toFixed(3),
        precision: +m.precision.toFixed(3),
        recall: +m.recall.toFixed(3),
        f1: +m.f1Score.toFixed(3),
        aucOOF: +m.rocAuc.toFixed(3),
        aucFoldMean: +m.rocAucFoldMean.toFixed(3),
        aucFoldSD: +m.rocAucFoldStd.toFixed(3),
        lambda: bundle.models[t].lambda,
      };
    }),
  );

  // SHAP additivity check on every patient and target
  let worst = 0;
  for (const p of bundle.cohort) {
    for (const t of TARGETS) {
      const shap = computeShapAttributions(bundle, p, t);
      const sum = shap.baseValue + shap.contributions.reduce((s, c) => s + c.contribution, 0);
      worst = Math.max(worst, Math.abs(sum - logitFor(bundle, t, p.values)));
    }
  }
  console.log(`SHAP additivity: max |base + sum(phi) - logit| = ${worst.toExponential(2)}`);
  if (worst > 1e-9) throw new Error('SHAP values do not add up to the model output.');

  const leak = verifyTargetLeakageSafety(bundle);
  console.log('Leakage audit passed:', leak.safe);
  if (!leak.safe) throw new Error('A target column is present in the model inputs.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

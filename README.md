# CardioVista

Interactive 3D cardiovascular risk visualization. Four logistic-regression models (overall CAD, LAD, LCX, RCA) are
**trained in the browser on the real Extension of the Z-Alizadeh Sani dataset** and drive the colours of a 3D
coronary-artery model. Every prediction is explained with exact SHAP values.

> Educational decision-support prototype. Not a diagnostic tool and not a substitute for formal diagnostic imaging.

## 1. Add the dataset (required)

The app never invents patient data. Download the dataset and either upload it in the app or place it in `src/data/`.

1. Download **Extension of Z-Alizadeh Sani Dataset** from the UCI Machine Learning Repository
   (https://doi.org/10.24432/C5461K, CC BY 4.0). The file is `extention of Z-Alizadeh sani dataset.xlsx`.
2. Copy the `.xlsx` (or a `.csv` export) into `src/data/`. It is picked up automatically.
   If no file is present, the app shows an "Upload dataset" screen.

## 2. Run

```bash
npm install
npm run dev        # http://localhost:3000
```

On start the app parses the file, removes the leakage columns and trains + cross-validates the four models
(a few seconds). Progress is shown on screen; a summary table is also printed to the browser console.

## 3. Reproduce the numbers outside the browser

```bash
npm run selfcheck -- src/data/"extention of Z-Alizadeh sani dataset.xlsx"
```

This prints the dataset summary, the cross-validated metrics for every target, checks that SHAP values add up
exactly to the model output, and runs the leakage audit. Results are deterministic (seed 42).

## What is computed, and how

| Item | Method |
|------|--------|
| Targets | `CAD` (overall), `LAD`, `LCX`, `RCA` columns of the dataset |
| Leakage prevention | `LAD`, `LCX`, `RCA`, `Cath`, `CAD` removed from all inputs (`src/ml/dataset.ts`) |
| Preprocessing | numeric kept; Y/N and Male/Female → 0/1; VHD ordinal; other text one-hot; median fill; constants dropped; z-score scaling fitted on training folds only |
| Model | L2 logistic regression, Newton–Raphson (IRLS), intercept unpenalised (`src/ml/logistic.ts`). Same objective as scikit-learn `LogisticRegression(C=1/λ)` |
| Hyper-parameter | λ ∈ {0.1, 1, 10, 100} chosen by inner 5-fold CV on training data only |
| Validation | nested stratified 5-fold CV; metrics on out-of-fold predictions (accuracy, precision, recall, specificity, F1, ROC-AUC, confusion matrix, ROC curve) |
| Explainability | exact SHAP for a linear model: φᵢ = coefᵢ·(xᵢ − meanᵢ)/scaleᵢ, in log-odds |
| 3D heart | Three.js procedural geometry; artery colour = predicted stenosis probability |

The logistic-regression implementation was checked against scikit-learn on identical standardised data
(coefficients agree to ~1e-7).

## Project layout

```
src/ml/dataset.ts         CSV/XLSX parsing, leakage removal, encoding
src/ml/logistic.ts        logistic regression, nested CV, ROC-AUC, metrics
src/ml/modelPipeline.ts   training orchestration, prediction, SHAP
src/ml/ModelContext.tsx   loads data, trains, shares results with the UI
src/components/           3D heart, summary, SHAP chart, simulator, cohort, validation, docs
scripts/selfcheck.ts      reproducible command-line verification
```

## Limitations

- 303 patients from a single centre; cross-validation is not external validation.
- Linear models; no feature interactions.
- Probabilities of ≥50% stenosis only, not the degree or position of narrowing.
- The 3D artery geometry is schematic, not patient-specific.

## Data and citation

Alizadehsani, R., Roshanzamir, M., & Sani, Z. (2013). Extention of Z-Alizadeh sani dataset [Dataset].
UCI Machine Learning Repository. https://doi.org/10.24432/C5461K — licensed CC BY 4.0.

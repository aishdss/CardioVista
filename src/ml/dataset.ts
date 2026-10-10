/**
 * Dataset loading and preprocessing.
 *
 * Reads the real Z-Alizadeh Sani (extension) dataset from CSV or XLSX, removes the
 * target-leakage columns (LAD, LCX, RCA, Cath, CAD ...) from the inputs, and encodes
 * everything else as numbers. Nothing in here is generated or simulated.
 *
 * This file has no browser-only dependencies so it can also run under Node (see
 * scripts/selfcheck.ts).
 */

import { strFromU8, unzipSync } from 'fflate';
import { FeatureCategory, FeatureMeta, TargetName } from '../types/cardiac';

export interface Dataset {
  n: number;
  ids: string[];
  features: FeatureMeta[];
  /** rows x features, raw (unscaled) numeric values */
  X: number[][];
  labels: Record<TargetName, number[]>;
  /** Columns found in the file and removed from the inputs to prevent target leakage. */
  excludedColumns: string[];
  /** Columns removed because every patient had the same value. */
  constantColumns: string[];
  /** Which source column was used for each target. */
  targetSources: Record<TargetName, string>;
  sourceName: string;
}

// ------------------------------------------------------------------ parsing

/** Minimal RFC-4180 style CSV parser (handles quotes, commas and newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === ';' || ch === '\t') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

function xmlDecode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function columnIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, '');
  let idx = 0;
  for (const ch of letters) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1;
}

/** Reads the first worksheet of an .xlsx file (the format UCI distributes). */
export function parseXlsx(buffer: ArrayBuffer | Uint8Array): string[][] {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const files = unzipSync(bytes);

  const sharedStrings: string[] = [];
  const sstFile = files['xl/sharedStrings.xml'];
  if (sstFile) {
    const xml = strFromU8(sstFile);
    const siRe = /<si>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = siRe.exec(xml))) {
      const parts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlDecode(t[1]));
      sharedStrings.push(parts.join(''));
    }
  }

  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (!files[sheetPath]) {
    const candidate = Object.keys(files)
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
      .sort()[0];
    if (!candidate) throw new Error('No worksheet found in the .xlsx file.');
    sheetPath = candidate;
  }
  const sheetXml = strFromU8(files[sheetPath]);

  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(sheetXml))) {
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1];
      const inner = cm[2] ?? '';
      const ref = /r="([A-Z]+)\d+"/.exec(attrs);
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      let value = '';
      if (type === 'inlineStr') {
        value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlDecode(t[1])).join('');
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
        if (type === 's') value = sharedStrings[Number(v)] ?? '';
        else if (type === 'b') value = v === '1' ? '1' : '0';
        else value = xmlDecode(v);
      }
      const col = ref ? columnIndex(ref[1]) : cells.length;
      while (cells.length < col) cells.push('');
      cells[col] = value;
    }
    if (cells.some((c) => c.trim() !== '')) rows.push(cells);
  }
  return rows;
}

// ------------------------------------------------------------------ helpers

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Columns that reveal the answer. They are never model inputs. */
const LEAKAGE_KEYS = new Set(['lad', 'lcx', 'rca', 'cath', 'cad', 'cadstatus', 'leftmain', 'lmain']);

const POSITIVE = new Set(['cad', 'stenotic', 'stenosis', 'yes', 'y', 'true', 'abnormal', 'present', 'positive', '1']);
const NEGATIVE = new Set(['normal', 'no', 'n', 'false', 'absent', 'negative', 'notstenotic', '0']);

function toLabel(values: string[], what: string): number[] {
  const numeric = values.every((v) => v.trim() !== '' && !Number.isNaN(Number(v)));
  if (numeric) {
    const nums = values.map(Number);
    const threshold = Math.max(...nums) > 1 ? 50 : 0.5;
    return nums.map((v) => (v >= threshold ? 1 : 0));
  }
  return values.map((v) => {
    const k = v.trim().toLowerCase();
    if (POSITIVE.has(k)) return 1;
    if (NEGATIVE.has(k)) return 0;
    throw new Error(`Unrecognised value "${v}" in label column ${what}.`);
  });
}

type Encoded = { name: string; values: number[] };

function encodeColumn(name: string, raw: string[]): Encoded[] {
  const numeric = raw.every((v) => v.trim() === '' || !Number.isNaN(Number(v)));
  if (numeric) {
    return [{ name, values: raw.map((v) => (v.trim() === '' ? NaN : Number(v))) }];
  }
  const lowered = raw.map((v) => v.trim().toLowerCase());
  const uniq = new Set(lowered.filter((v) => v !== ''));
  const subset = (allowed: string[]) => [...uniq].every((u) => allowed.includes(u));

  if (
    subset(['y', 'n']) ||
    subset(['yes', 'no']) ||
    subset(['male', 'fmale', 'female']) ||
    subset(['true', 'false'])
  ) {
    const pos = new Set(['y', 'yes', 'male', 'true']);
    return [{ name, values: lowered.map((v) => (v === '' ? NaN : pos.has(v) ? 1 : 0)) }];
  }
  if (subset(['n', 'normal', 'mild', 'moderate', 'severe'])) {
    const order: Record<string, number> = { n: 0, normal: 0, mild: 1, moderate: 2, severe: 3 };
    return [{ name, values: lowered.map((v) => (v === '' ? NaN : order[v])) }];
  }
  return [...uniq].sort().map((u) => ({
    name: `${name} = ${u}`,
    values: lowered.map((v) => (v === u ? 1 : 0)),
  }));
}

const LABELS: Record<string, string> = {
  age: 'Age (years)',
  weight: 'Weight (kg)',
  length: 'Height (cm)',
  sex: 'Sex',
  bmi: 'Body mass index',
  dm: 'Diabetes mellitus',
  htn: 'Hypertension',
  currentsmoker: 'Current smoker',
  exsmoker: 'Ex-smoker',
  fh: 'Family history of CAD',
  obesity: 'Obesity',
  crf: 'Chronic renal failure',
  cva: 'Cerebrovascular accident',
  airwaydisease: 'Airway disease',
  thyroiddisease: 'Thyroid disease',
  chf: 'Congestive heart failure',
  dlp: 'Dyslipidemia',
  bp: 'Blood pressure (systolic, mmHg)',
  pr: 'Pulse rate (bpm)',
  edema: 'Edema',
  weakperipheralpulse: 'Weak peripheral pulse',
  lungrales: 'Lung rales',
  systolicmurmur: 'Systolic murmur',
  diastolicmurmur: 'Diastolic murmur',
  typicalchestpain: 'Typical chest pain',
  dyspnea: 'Dyspnea',
  functionclass: 'Functional class',
  atypical: 'Atypical chest pain',
  nonanginal: 'Non-anginal chest pain',
  exertionalcp: 'Exertional chest pain',
  lowthang: 'Low-threshold angina',
  qwave: 'Q wave',
  stelevation: 'ST elevation',
  stdepression: 'ST depression',
  tinversion: 'T-wave inversion',
  lvh: 'Left ventricular hypertrophy',
  poorrprogression: 'Poor R-wave progression',
  bbb: 'Bundle branch block',
  fbs: 'Fasting blood sugar (mg/dL)',
  cr: 'Creatinine (mg/dL)',
  tg: 'Triglycerides (mg/dL)',
  ldl: 'LDL cholesterol (mg/dL)',
  hdl: 'HDL cholesterol (mg/dL)',
  bun: 'Blood urea nitrogen (mg/dL)',
  esr: 'Erythrocyte sedimentation rate',
  hb: 'Hemoglobin (g/dL)',
  k: 'Potassium (mEq/L)',
  na: 'Sodium (mEq/L)',
  wbc: 'White blood cells (/mL)',
  lymph: 'Lymphocytes (%)',
  neut: 'Neutrophils (%)',
  plt: 'Platelets (1000/mL)',
  eftte: 'Ejection fraction, TTE (%)',
  regionrwma: 'Regional wall motion abnormality (regions)',
  vhd: 'Valvular heart disease',
};

const CATEGORY_BY_KEY: Record<string, FeatureCategory> = {};
const assign = (cat: FeatureCategory, keys: string[]) => keys.forEach((k) => (CATEGORY_BY_KEY[k] = cat));
assign('Demographics', ['age', 'weight', 'length', 'sex', 'bmi']);
assign('Hemodynamics', ['bp', 'pr', 'edema', 'weakperipheralpulse']);
assign('Clinical History', ['dm', 'htn', 'currentsmoker', 'exsmoker', 'fh', 'obesity', 'crf', 'cva', 'airwaydisease', 'thyroiddisease', 'chf', 'dlp']);
assign('Symptoms & Signs', ['lungrales', 'systolicmurmur', 'diastolicmurmur', 'typicalchestpain', 'dyspnea', 'functionclass', 'atypical', 'nonanginal', 'exertionalcp', 'lowthang']);
assign('Ischemia & ECG', ['qwave', 'stelevation', 'stdepression', 'tinversion', 'lvh', 'poorrprogression', 'bbb']);
assign('Echocardiogram', ['eftte', 'ef', 'regionrwma', 'vhd']);
assign('Biomarkers & Labs', ['fbs', 'cr', 'tg', 'ldl', 'hdl', 'bun', 'esr', 'hb', 'k', 'na', 'wbc', 'lymph', 'neut', 'plt']);

function baseKey(columnName: string): string {
  return norm(columnName.split(' = ')[0]);
}

export function labelFor(columnName: string): string {
  const key = baseKey(columnName);
  const suffix = columnName.includes(' = ') ? ` (${columnName.split(' = ')[1]})` : '';
  const known = LABELS[key];
  if (known) return known + suffix;
  return columnName.replace(/[_]+/g, ' ').trim();
}

export function categoryFor(columnName: string): FeatureCategory {
  return CATEGORY_BY_KEY[baseKey(columnName)] ?? 'Other';
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ---------------------------------------------------------------- main entry

export function buildDataset(rows: string[][], sourceName = 'dataset'): Dataset {
  if (rows.length < 20) throw new Error('The file has too few rows to be the Z-Alizadeh Sani dataset.');
  const header = rows[0].map((h) => String(h).trim());
  const body = rows.slice(1).map((r) => header.map((_, i) => String(r[i] ?? '').trim()));
  const columns = header.map((h, i) => ({ name: h, key: norm(h), values: body.map((r) => r[i]) }));
  const byKey = new Map(columns.map((c) => [c.key, c]));

  const need = (key: string) => {
    const c = byKey.get(key);
    if (!c) {
      throw new Error(`Column "${key.toUpperCase()}" was not found. Columns in the file: ${header.join(', ')}`);
    }
    return c;
  };
  const lad = need('lad');
  const lcx = need('lcx');
  const rca = need('rca');
  const cad = byKey.get('cad') ?? byKey.get('cath');
  if (!cad) {
    throw new Error(`Neither "CAD" nor "Cath" was found. Columns in the file: ${header.join(', ')}`);
  }

  const labels: Record<TargetName, number[]> = {
    CAD: toLabel(cad.values, cad.name),
    LAD: toLabel(lad.values, lad.name),
    LCX: toLabel(lcx.values, lcx.name),
    RCA: toLabel(rca.values, rca.name),
  };

  const excludedColumns = columns.filter((c) => LEAKAGE_KEYS.has(c.key)).map((c) => c.name);
  const candidates = columns.filter((c) => !LEAKAGE_KEYS.has(c.key) && c.name !== '');

  const encoded: Encoded[] = [];
  for (const c of candidates) encoded.push(...encodeColumn(c.name, c.values));

  const constantColumns: string[] = [];
  const kept: Encoded[] = [];
  for (const col of encoded) {
    const finite = col.values.filter((v) => Number.isFinite(v));
    if (finite.length === 0 || new Set(finite).size <= 1) {
      constantColumns.push(col.name);
      continue;
    }
    const med = median(finite);
    kept.push({ name: col.name, values: col.values.map((v) => (Number.isFinite(v) ? v : med)) });
  }

  const n = body.length;
  const features: FeatureMeta[] = kept.map((col) => {
    const vals = col.values;
    const uniq = new Set(vals);
    const isBinary = [...uniq].every((v) => v === 0 || v === 1);
    const isInteger = vals.every((v) => Number.isInteger(v));
    return {
      name: col.name,
      label: labelFor(col.name),
      category: categoryFor(col.name),
      kind: isBinary ? 'binary' : isInteger ? 'integer' : 'numeric',
      min: Math.min(...vals),
      max: Math.max(...vals),
      mean: vals.reduce((a, b) => a + b, 0) / n,
      median: median(vals),
    };
  });

  const X = Array.from({ length: n }, (_, i) => kept.map((col) => col.values[i]));

  return {
    n,
    ids: Array.from({ length: n }, (_, i) => `P${String(i + 1).padStart(3, '0')}`),
    features,
    X,
    labels,
    excludedColumns,
    constantColumns,
    targetSources: { CAD: cad.name, LAD: lad.name, LCX: lcx.name, RCA: rca.name },
    sourceName,
  };
}

export function datasetFromText(text: string, sourceName: string): Dataset {
  return buildDataset(parseCsv(text), sourceName);
}

export function datasetFromXlsx(buffer: ArrayBuffer | Uint8Array, sourceName: string): Dataset {
  return buildDataset(parseXlsx(buffer), sourceName);
}

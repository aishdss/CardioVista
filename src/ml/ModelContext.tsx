/**
 * Loads the dataset (bundled file or user upload), trains the models in the browser and
 * shares the result with the whole app. Nothing is hardcoded: if there is no data, the
 * app asks for it instead of inventing any.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Dataset, datasetFromText, datasetFromXlsx } from './dataset';
import { TrainedBundle, trainAll } from './modelPipeline';
import { TARGETS } from '../types/cardiac';

// Any .csv / .xlsx placed in src/data is picked up automatically.
const bundledFiles = import.meta.glob('../data/*.{csv,xlsx}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export type ModelStatus = 'loading' | 'training' | 'ready' | 'needs-data' | 'error';

interface ModelContextValue {
  status: ModelStatus;
  progress: number; // 0..1
  progressLabel: string;
  bundle: TrainedBundle | null;
  error: string | null;
  loadFile: (file: File) => void;
}

export const ModelContext = createContext<ModelContextValue | null>(null);

export function useModel(): ModelContextValue {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error('useModel must be used inside <ModelProvider>');
  return ctx;
}

/** Returns the trained bundle; only call inside components rendered when status === "ready". */
export function useBundle(): TrainedBundle {
  const { bundle } = useModel();
  if (!bundle) throw new Error('Model is not ready yet');
  return bundle;
}

async function datasetFromBuffer(name: string, buffer: ArrayBuffer): Promise<Dataset> {
  if (name.toLowerCase().endsWith('.xlsx')) return datasetFromXlsx(buffer, name);
  return datasetFromText(new TextDecoder('utf-8').decode(buffer), name);
}

export const ModelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<ModelStatus>('loading');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Loading dataset...');
  const [bundle, setBundle] = useState<TrainedBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(async (name: string, getBuffer: () => Promise<ArrayBuffer>) => {
    try {
      setError(null);
      setStatus('loading');
      setProgress(0);
      setProgressLabel(`Reading ${name}...`);
      const dataset = await datasetFromBuffer(name, await getBuffer());
      setStatus('training');
      setProgressLabel(`Training on ${dataset.n} real patients...`);
      const trained = await trainAll(dataset, (p) => {
        setProgress(p.fraction);
        setProgressLabel(
          `Cross-validating ${p.target} model (fold ${p.fold}/${p.folds}) — target ${p.targetIndex + 1} of ${TARGETS.length}`,
        );
      });
      // Visible audit trail for anyone checking the numbers.
      console.info(`[CardioVista] ${dataset.n} patients, ${dataset.features.length} input features`);
      console.info('[CardioVista] Excluded (leakage) columns:', dataset.excludedColumns);
      console.table(
        TARGETS.map((t) => ({
          target: t,
          positives: trained.models[t].metrics.positives,
          negatives: trained.models[t].metrics.negatives,
          accuracy: +trained.models[t].metrics.accuracy.toFixed(3),
          f1: +trained.models[t].metrics.f1Score.toFixed(3),
          rocAucOOF: +trained.models[t].metrics.rocAuc.toFixed(3),
        })),
      );
      setBundle(trained);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const entries = Object.entries(bundledFiles);
    if (entries.length === 0) {
      setStatus('needs-data');
      return;
    }
    const [path, url] =
      entries.find(([p]) => /alizadeh|sani/i.test(p)) ?? entries[0];
    const name = path.split('/').pop() ?? 'dataset';
    void run(name, async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not load ${name} (HTTP ${res.status}).`);
      return res.arrayBuffer();
    });
  }, [run]);

  const loadFile = useCallback(
    (file: File) => {
      void run(file.name, () => file.arrayBuffer());
    },
    [run],
  );

  return (
    <ModelContext.Provider value={{ status, progress, progressLabel, bundle, error, loadFile }}>
      {children}
    </ModelContext.Provider>
  );
};

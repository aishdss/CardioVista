/**
 * Shown until the models are trained: progress, errors, or a request for the dataset file.
 */

import React, { useRef } from 'react';
import { Database, Loader2, Upload, AlertTriangle } from 'lucide-react';
import { useModel } from '../ml/ModelContext';
import { CardioVistaLogo } from './CardioVistaLogo';

export const DataGate: React.FC = () => {
  const { status, progress, progressLabel, error, loadFile } = useModel();
  const inputRef = useRef<HTMLInputElement>(null);

  const showUpload = status === 'needs-data' || status === 'error';

  return (
    <div className="min-h-screen bg-[#0c0307] text-[#fff1f2] flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-[#180612]/90 border border-[#3f1025] rounded-xl p-6 shadow-xl space-y-5">
        <CardioVistaLogo size="md" />

        {(status === 'loading' || status === 'training') && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-rose-100">
              <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
              <span>{progressLabel}</span>
            </div>
            <div className="w-full h-2 bg-[#250817] rounded-full overflow-hidden">
              <div
                className="h-full bg-rose-500 transition-all duration-300"
                style={{ width: `${Math.max(4, progress * 100)}%` }}
              />
            </div>
            <p className="text-xs text-rose-300/70">
              The four models (CAD, LAD, LCX, RCA) are trained here in your browser with nested 5-fold
              cross-validation. Nothing is precomputed or hardcoded.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-950/60 border border-rose-700/60 text-xs text-rose-100">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        )}

        {showUpload && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-rose-100">
              <Database className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                {status === 'needs-data'
                  ? 'No dataset found. This app trains on the real Extension of the Z-Alizadeh Sani dataset (UCI, 303 patients). It never invents patient data.'
                  : 'Please check the file and try again.'}
              </p>
            </div>
            <ol className="text-xs text-rose-300/80 list-decimal pl-5 space-y-1">
              <li>
                Download it from the UCI Machine Learning Repository (search “Extension of Z-Alizadeh Sani Dataset”, CC BY 4.0).
              </li>
              <li>
                Either upload the <span className="font-mono">.xlsx</span> or <span className="font-mono">.csv</span> here,
                or copy it into <span className="font-mono">src/data/</span> so it loads automatically.
              </li>
            </ol>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) loadFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-4 py-2 text-sm font-bold text-rose-50 bg-[#881337] hover:bg-[#9f1239] border border-rose-500/50 rounded-lg transition-all flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Upload dataset (.xlsx or .csv)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

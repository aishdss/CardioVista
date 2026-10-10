/**
 * Patient Cohort Explorer (Burgundy Theme)
 * The real records from the dataset, with catheterization ground truth and the
 * out-of-fold model prediction (made by a model that never saw that patient).
 */

import React, { useMemo, useState } from 'react';
import { CohortPatient, TargetName } from '../types/cardiac';
import { patientHeadline } from '../ml/modelPipeline';
import { useBundle } from '../ml/ModelContext';
import { Search, ExternalLink, Database } from 'lucide-react';

interface PatientCohortTableProps {
  onLoadPatient: (patient: CohortPatient) => void;
  activePatientId: string;
}

const VESSELS: Array<'LAD' | 'LCX' | 'RCA'> = ['LAD', 'LCX', 'RCA'];

export const PatientCohortTable: React.FC<PatientCohortTableProps> = ({ onLoadPatient, activePatientId }) => {
  const bundle = useBundle();
  const [searchTerm, setSearchTerm] = useState('');
  const [cadFilter, setCadFilter] = useState<'ALL' | 'CAD' | 'Normal'>('ALL');
  const [vesselFilter, setVesselFilter] = useState<'ALL' | 'LAD' | 'LCX' | 'RCA'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const rows = useMemo(
    () => bundle.cohort.map((p) => ({ p, head: patientHeadline(bundle, p) })),
    [bundle],
  );

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return rows.filter(({ p, head }) => {
      if (term && !(p.id.toLowerCase().includes(term) || (head.age ?? '').toLowerCase().includes(term))) return false;
      if (cadFilter === 'CAD' && !p.truth.CAD) return false;
      if (cadFilter === 'Normal' && p.truth.CAD) return false;
      if (vesselFilter !== 'ALL' && !p.truth[vesselFilter]) return false;
      return true;
    });
  }, [rows, searchTerm, cadFilter, vesselFilter]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const page = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const count = (t: TargetName) => bundle.models[t].metrics.positives;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="bg-[#180612]/90 border border-[#3f1025] rounded-xl p-5 shadow-xl space-y-4 backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#350d1e]">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-rose-400" />
            <h3 className="text-base font-bold text-rose-50">Patient Cohort ({bundle.dataset.sourceName})</h3>
          </div>
          <p className="text-xs text-rose-300/70 mt-0.5">
            {bundle.dataset.n} real records with catheterization ground truth. Predicted % are cross-validated (out-of-fold).
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs bg-[#0f030a] px-3 py-1.5 rounded-lg border border-[#2e0b19]">
          {[
            ['TOTAL', bundle.dataset.n],
            ['CAD+', count('CAD')],
            ['LAD+', count('LAD')],
            ['LCX+', count('LCX')],
            ['RCA+', count('RCA')],
          ].map(([label, value], i) => (
            <React.Fragment key={label as string}>
              {i > 0 && <span className="text-[#350d1e]">|</span>}
              <div>
                <span className="text-rose-400/60 block text-[10px]">{label}</span>
                <span className="font-mono text-rose-100 font-bold">{value}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-rose-400/60 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search patient ID or age..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-[#0f030a] border border-[#310c1c] rounded-lg pl-9 pr-3 py-1.5 text-xs text-rose-100 placeholder-rose-400/40 focus:outline-none focus:border-rose-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-rose-400/60 shrink-0">CAD:</span>
          {(['ALL', 'CAD', 'Normal'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => {
                setCadFilter(filter);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                cadFilter === filter
                  ? 'bg-[#881337] text-rose-100 border border-rose-500/60 shadow-sm'
                  : 'text-rose-300/70 hover:text-rose-100 hover:bg-[#200717]'
              }`}
            >
              {filter}
            </button>
          ))}

          <span className="text-xs text-rose-400/60 ml-2 shrink-0">Stenosed vessel:</span>
          {(['ALL', 'LAD', 'LCX', 'RCA'] as const).map((v) => (
            <button
              key={v}
              onClick={() => {
                setVesselFilter(v);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                vesselFilter === v
                  ? 'bg-[#881337] text-rose-100 border border-rose-500/60 shadow-sm'
                  : 'text-rose-300/70 hover:text-rose-100 hover:bg-[#200717]'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#310c1c]">
        <table className="w-full text-left text-xs text-rose-100">
          <thead className="bg-[#10030b] text-[11px] uppercase tracking-wider text-rose-400/70 border-b border-[#310c1c]">
            <tr>
              <th className="py-2.5 px-3">Patient</th>
              <th className="py-2.5 px-3">Demographics</th>
              <th className="py-2.5 px-3">Truth: CAD</th>
              {VESSELS.map((v) => (
                <th key={v} className="py-2.5 px-3">
                  {v} truth / pred.
                </th>
              ))}
              <th className="py-2.5 px-3">Pred. CAD</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#260817] font-mono">
            {paginated.map(({ p, head }) => {
              const isActive = p.id === activePatientId;
              return (
                <tr key={p.id} className={`transition-colors ${isActive ? 'bg-[#3b0f24]' : 'hover:bg-[#200717]'}`}>
                  <td className="py-2.5 px-3 font-bold text-rose-100">
                    {p.id}
                    {isActive && (
                      <span className="ml-1.5 text-[10px] text-rose-400 font-sans font-semibold">(Active)</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-rose-200/90 font-sans">
                    {[head.age, head.sex].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="py-2.5 px-3 font-sans">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                        p.truth.CAD
                          ? 'bg-rose-950/90 text-rose-200 border border-rose-700/80'
                          : 'bg-emerald-950/90 text-emerald-200 border border-emerald-700/80'
                      }`}
                    >
                      {p.truth.CAD ? 'CAD' : 'Normal'}
                    </span>
                  </td>
                  {VESSELS.map((v) => (
                    <td key={v} className="py-2.5 px-3 font-sans">
                      <span className={p.truth[v] ? 'text-rose-400 font-bold' : 'text-rose-400/40'}>
                        {p.truth[v] ? 'Stenosed' : 'Normal'}
                      </span>
                      <span className="text-rose-500/50"> · </span>
                      <span className="text-rose-300/80">{pct(p.oofProbability[v])}</span>
                    </td>
                  ))}
                  <td className="py-2.5 px-3 text-rose-300/90">{pct(p.oofProbability.CAD)}</td>
                  <td className="py-2.5 px-3 text-right font-sans">
                    <button
                      type="button"
                      onClick={() => onLoadPatient(p)}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-[#2c091d] hover:bg-[#481132] text-rose-200 border border-[#4c1228] transition-colors inline-flex items-center gap-1 shadow-sm"
                    >
                      <span>Simulate</span>
                      <ExternalLink className="w-3 h-3 text-rose-400" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-rose-300/70 pt-1">
        <span>
          Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, filtered.length)} of{' '}
          {filtered.length} records
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-2.5 py-1 rounded bg-[#0f030a] border border-[#310c1c] text-rose-200 disabled:opacity-40 hover:bg-[#200717] transition-colors"
          >
            Prev
          </button>
          <span className="px-2 font-mono text-rose-100 font-bold">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-2.5 py-1 rounded bg-[#0f030a] border border-[#310c1c] text-rose-200 disabled:opacity-40 hover:bg-[#200717] transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

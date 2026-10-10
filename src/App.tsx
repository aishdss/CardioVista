/**
 * CardioVista - Cardiovascular Risk & Multi-Vessel Stenosis Intelligence
 * Deep Burgundy Clinical Workstation Theme
 */

import React, { useMemo, useState } from 'react';
import { Patient, TargetName, VesselName } from './types/cardiac';
import {
  computeShapAttributions,
  patientHeadline,
  predictCardiovascularRisk,
} from './ml/modelPipeline';
import { useBundle, useModel } from './ml/ModelContext';
import { Heart3DCanvas } from './components/Heart3DCanvas';
import { PredictionSummaryCard } from './components/PredictionSummaryCard';
import { ShapWaterfallChart } from './components/ShapWaterfallChart';
import { PatientInputForm } from './components/PatientInputForm';
import { PatientCohortTable } from './components/PatientCohortTable';
import { ModelEvaluationDashboard } from './components/ModelEvaluationDashboard';
import { DocumentationView } from './components/DocumentationView';
import { VesselDetailModal } from './components/VesselDetailModal';
import { DataGate } from './components/DataGate';
import {
  ClinicalDisclaimerModal,
  DisclaimerBannerStrip,
} from './components/ClinicalDisclaimerModal';
import { Sparkles, Sliders } from 'lucide-react';
import { CardioVistaLogo } from './components/CardioVistaLogo';

type Tab = 'visualizer' | 'simulator' | 'cohort' | 'metrics' | 'docs';

export default function App() {
  const { status } = useModel();
  if (status !== 'ready') return <DataGate />;
  return <Workstation />;
}

function Workstation() {
  const bundle = useBundle();
  const n = bundle.dataset.n;

  const [activeTab, setActiveTab] = useState<Tab>('visualizer');

  // Default patient: the first real record with disease in at least two vessels (rich visual state).
  const defaultPatient = useMemo<Patient>(() => {
    const pick =
      bundle.cohort.find((p) => p.truth.LAD + p.truth.LCX + p.truth.RCA >= 2) ?? bundle.cohort[0];
    return { id: pick.id, values: pick.values };
  }, [bundle]);
  const [patientOverride, setPatientOverride] = useState<Patient | null>(null);
  const patient = patientOverride ?? defaultPatient;

  const [selectedVessel, setSelectedVessel] = useState<VesselName | null>(null);
  const [shapTarget, setShapTarget] = useState<TargetName>('CAD');
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);

  const prediction = useMemo(() => predictCardiovascularRisk(bundle, patient), [bundle, patient]);
  const shap = useMemo(
    () => computeShapAttributions(bundle, patient, shapTarget),
    [bundle, patient, shapTarget],
  );
  const headline = useMemo(() => patientHeadline(bundle, patient), [bundle, patient]);

  const baseId = patient.id.replace(/ \(edited\)$/, '');

  const handleLoadPatient = (p: Patient) => {
    setPatientOverride(p);
    setSelectedVessel(null);
  };

  const probabilityForTarget =
    shapTarget === 'CAD' ? prediction.cadProbability : prediction.vessels[shapTarget].probability;

  const tabs: Array<{ id: Tab; label: string; short: string }> = [
    { id: 'visualizer', label: '3D Visualizer', short: '3D Visualizer' },
    { id: 'simulator', label: 'Patient Simulator', short: 'Simulator' },
    { id: 'cohort', label: `Cohort (${n} Records)`, short: `Cohort (${n})` },
    { id: 'metrics', label: 'Model Validation', short: 'Validation' },
    { id: 'docs', label: 'Documentation', short: 'Documentation' },
  ];

  const headlineParts = [
    headline.age && headline.sex ? `${headline.age} ${headline.sex}` : headline.age ?? headline.sex,
    headline.bloodPressure && `BP ${headline.bloodPressure}`,
    headline.ejectionFraction && `EF ${headline.ejectionFraction}`,
    headline.rwma && `RWMA: ${headline.rwma}`,
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-[#0c0307] text-[#fff1f2] flex flex-col font-sans selection:bg-rose-500/30 selection:text-rose-200">
      {/* 1. Clinical Safety Disclaimer Persistent Top Strip */}
      <DisclaimerBannerStrip onOpenModal={() => setIsDisclaimerOpen(true)} />

      {/* 2. Top Bar Navigation */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-[#350d1e] bg-[#14040e]/95 backdrop-blur-md sticky top-0 z-40 shadow-xl">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('visualizer');
          }}
          className="shrink-0"
        >
          <CardioVistaLogo size="md" />
        </a>

        <nav className="hidden lg:flex items-center gap-7 text-xs font-semibold tracking-wide uppercase text-rose-300/70">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap transition-colors hover:text-rose-100 cursor-pointer ${
                activeTab === tab.id ? 'text-rose-400 font-bold border-b-2 border-rose-500 pb-0.5' : ''
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              const currentIndex = bundle.cohort.findIndex((c) => c.id === baseId);
              const next = bundle.cohort[(currentIndex + 1) % bundle.cohort.length];
              handleLoadPatient({ id: next.id, values: next.values });
            }}
            className="px-3.5 py-1.5 text-xs font-bold text-rose-50 bg-[#881337] hover:bg-[#9f1239] border border-rose-500/50 rounded-lg transition-all whitespace-nowrap shadow-md shadow-rose-950/70 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-rose-300" />
            <span>Next Real Patient ({patient.id})</span>
          </button>
        </div>
      </header>

      {/* Mobile Nav Tabs Bar */}
      <div className="lg:hidden flex items-center gap-1 overflow-x-auto px-4 py-2 bg-[#14040e]/95 border-b border-[#350d1e] text-xs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-2.5 py-1 rounded font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id ? 'bg-[#881337] text-rose-100' : 'text-rose-300/70'
            }`}
          >
            {tab.short}
          </button>
        ))}
      </div>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-[1560px] w-full mx-auto p-4 sm:p-6 space-y-6">
        {activeTab === 'visualizer' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#180612]/90 rounded-lg border border-[#3f1025] text-xs text-rose-300/70 shadow-lg backdrop-blur-md">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-rose-100">Active Patient:</span>
                <span className="font-mono text-rose-400 font-bold">{patient.id}</span>
                {headlineParts.map((part) => (
                  <React.Fragment key={part}>
                    <span aria-hidden="true" className="text-rose-500/40">·</span>
                    <span>{part}</span>
                  </React.Fragment>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('simulator')}
                  className="text-rose-400 hover:text-rose-200 font-semibold underline flex items-center gap-1 transition-colors"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Adjust Physiological Parameters</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 h-[700px] flex flex-col">
                <Heart3DCanvas
                  prediction={prediction}
                  selectedVessel={selectedVessel}
                  onSelectVessel={(v) => setSelectedVessel(v)}
                  heartRate={headline.heartRate}
                />
              </div>

              <div className="lg:col-span-5 space-y-6">
                <PredictionSummaryCard
                  prediction={prediction}
                  selectedVessel={selectedVessel}
                  onSelectVessel={(v) => setSelectedVessel(v)}
                />

                <ShapWaterfallChart
                  shap={shap}
                  target={shapTarget}
                  onTargetChange={setShapTarget}
                  predictedRisk={probabilityForTarget}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'simulator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-6">
              <PatientInputForm
                bundle={bundle}
                patient={patient}
                onChange={(updated) => setPatientOverride(updated)}
                onSelectPatient={(p) => handleLoadPatient({ id: p.id, values: p.values })}
              />
            </div>

            <div className="lg:col-span-5 space-y-6">
              <div className="h-[380px]">
                <Heart3DCanvas
                  prediction={prediction}
                  selectedVessel={selectedVessel}
                  onSelectVessel={(v) => setSelectedVessel(v)}
                  heartRate={headline.heartRate}
                />
              </div>

              <PredictionSummaryCard
                prediction={prediction}
                selectedVessel={selectedVessel}
                onSelectVessel={(v) => setSelectedVessel(v)}
              />
            </div>
          </div>
        )}

        {activeTab === 'cohort' && (
          <div className="space-y-6">
            <PatientCohortTable
              onLoadPatient={(p) => {
                handleLoadPatient({ id: p.id, values: p.values });
                setActiveTab('visualizer');
              }}
              activePatientId={baseId}
            />
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="space-y-6">
            <ModelEvaluationDashboard />
          </div>
        )}

        {activeTab === 'docs' && (
          <div className="space-y-6">
            <DocumentationView />
          </div>
        )}
      </main>

      <VesselDetailModal
        vessel={selectedVessel}
        onClose={() => setSelectedVessel(null)}
        prediction={prediction}
      />

      <ClinicalDisclaimerModal
        isOpen={isDisclaimerOpen}
        onClose={() => setIsDisclaimerOpen(false)}
      />

      <footer className="mt-auto border-t border-[#350d1e] bg-[#0c0307] py-4 px-6 text-xs text-rose-400/50 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CardioVistaLogo size="sm" showWordmark={false} />
          <span className="text-rose-300/80 font-medium tracking-wide">CardioVista Cardiovascular Intelligence</span>
          <span aria-hidden="true" className="text-rose-500/40">·</span>
          <span>UCI Z-Alizadeh Sani (extension), {n} patients</span>
          <span aria-hidden="true" className="text-rose-500/40">·</span>
          <span>Educational decision-support prototype</span>
        </div>

        <div className="flex items-center gap-4 text-rose-300/70">
          <button
            onClick={() => setIsDisclaimerOpen(true)}
            className="hover:text-rose-100 transition-colors"
          >
            Clinical Disclaimer
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className="hover:text-rose-100 transition-colors"
          >
            Documentation
          </button>
        </div>
      </footer>
    </div>
  );
}

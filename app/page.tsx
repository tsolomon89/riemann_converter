"use client";

import { useEffect, useState, useRef } from "react";
import {
  Microscope,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Activity,
  GitBranch,
  Scale,
} from "lucide-react";
import { clsx } from "clsx";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from "recharts";
import RiemannResearchChart from "../components/RiemannResearchChart";
import Exp4Chart from "../components/Exp4Chart";
import Exp5Chart from "../components/Exp5Chart";
import Exp6Chart from "../components/Exp6Chart";
import Exp7Chart from "../components/Exp7Chart";
import Exp8Chart from "../components/Exp8Chart";
import ProofProgramMap from "../components/ProofProgramMap";
import IntroPanel from "../components/IntroPanel";
import OpenGapsPanel from "../components/OpenGapsPanel";
import { FunctionOutcomeBadge, InferenceRailsCallout } from "../components/VerdictBadges";
import VerdictHistoryPanel from "../components/VerdictHistoryPanel";
import RerunButton from "../components/RerunButton";
import { ExperimentsData, ExperimentVerdict } from "../lib/types";
import ExperimentSidebar, { ExperimentConfig } from "../components/ExperimentSidebar";

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

const EXPERIMENT_IDS = [
  "EXP1",
  "EXP1B",
  "EXP1C",
  "EXP2",
  "EXP2B",
  "EXP3",
  "EXP4",
  "EXP5",
  "EXP6",
  "EXP7",
  "EXP8",
] as const;

type ActiveExperiment = (typeof EXPERIMENT_IDS)[number];
type ChartRow = { X: number; [key: string]: number | undefined };
type TabColor =
  | "blue"
  | "purple"
  | "emerald"
  | "red"
  | "pink"
  | "orange"
  | "cyan"
  | "yellow"
  | "indigo";
type TabProgram = "PROGRAM_1" | "PROGRAM_2";
type ExperimentTab = {
  id: ActiveExperiment;
  label: string;
  sub: string;
  color: TabColor;
  program: TabProgram;
};

const TAB_ACTIVE_CLASS: Record<TabColor, string> = {
  blue: "bg-blue-900/20 border-blue-500/50 text-blue-200 shadow-[0_0_10px_rgba(37,99,235,0.35)]",
  purple: "bg-purple-900/20 border-purple-500/50 text-purple-200 shadow-[0_0_10px_rgba(126,34,206,0.35)]",
  emerald: "bg-emerald-900/20 border-emerald-500/50 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.35)]",
  red: "bg-red-900/20 border-red-500/50 text-red-200 shadow-[0_0_10px_rgba(239,68,68,0.35)]",
  pink: "bg-pink-900/20 border-pink-500/50 text-pink-200 shadow-[0_0_10px_rgba(236,72,153,0.35)]",
  orange: "bg-orange-900/20 border-orange-500/50 text-orange-200 shadow-[0_0_10px_rgba(249,115,22,0.35)]",
  cyan: "bg-cyan-900/20 border-cyan-500/50 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.35)]",
  yellow: "bg-yellow-900/20 border-yellow-500/50 text-yellow-200 shadow-[0_0_10px_rgba(234,179,8,0.35)]",
  indigo: "bg-indigo-900/20 border-indigo-500/50 text-indigo-200 shadow-[0_0_10px_rgba(99,102,241,0.35)]",
};

const EXPERIMENT_TABS: ExperimentTab[] = [
  { id: "EXP1", label: "EXP 1", sub: "Equivariance", color: "blue", program: "PROGRAM_1" },
  { id: "EXP1B", label: "EXP 1B", sub: "Op Gauge", color: "purple", program: "PROGRAM_1" },
  { id: "EXP1C", label: "EXP 1C", sub: "Zero Scaling", color: "emerald", program: "PROGRAM_1" },
  { id: "EXP3", label: "EXP 3", sub: "Falsification", color: "pink", program: "PROGRAM_1" },
  { id: "EXP4", label: "EXP 4", sub: "Dilation", color: "orange", program: "PROGRAM_1" },
  { id: "EXP5", label: "EXP 5", sub: "Corresp", color: "cyan", program: "PROGRAM_1" },
  { id: "EXP6", label: "EXP 6", sub: "Crit Drift", color: "yellow", program: "PROGRAM_1" },
  { id: "EXP8", label: "EXP 8", sub: "Scaled-Zeta", color: "emerald", program: "PROGRAM_1" },
  { id: "EXP2", label: "EXP 2", sub: "Centrifuge", color: "red", program: "PROGRAM_2" },
  { id: "EXP2B", label: "EXP 2B", sub: "Isolation", color: "emerald", program: "PROGRAM_2" },
  { id: "EXP7", label: "EXP 7", sub: "Centrifuge Fix", color: "indigo", program: "PROGRAM_2" },
];

const isActiveExperiment = (value: string): value is ActiveExperiment =>
  (EXPERIMENT_IDS as readonly string[]).includes(value);

export default function Home() {
  const [data, setData] = useState<ExperimentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeExp, setActiveExp] = useState<ActiveExperiment>("EXP1");
  const runAuthToken = process.env.NEXT_PUBLIC_RESEARCH_RUN_TOKEN?.trim();
  
  const [viewMode, setViewMode] = useState<"lattice" | "overlay">("lattice");
  
  const [activeK, setActiveK] = useState<number[]>([0, 1]);
  const [variant1B, setVariant1B] = useState<"gamma" | "rho">("gamma");
  
  // Experiment Runner State
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const fetchData = async () => {
      try {
        const res = await fetch("/experiments.json");
        const jsonData = await res.json();
        setData(jsonData);
        setLoading(false);
      } catch (err) {
        console.error("Failed to load experiments.json", err);
        setLoading(false);
      }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const runExperiment = async (config: ExperimentConfig) => {
      setIsRunning(true);
      setLogs(["Initializing Experiment Execution Pipeline...\n"]);

      setLogs([]);
      const firstExp = config.selectedExperiments[0];
      if (firstExp) {
          const nextExp = `EXP${firstExp.toUpperCase()}`;
          if (isActiveExperiment(nextExp)) {
            setActiveExp(nextExp);
          }
      }

      try {
          const queue = [...config.selectedExperiments];
          let failed = false;
          
          for (const expId of queue) {
              setLogs(prev => [...prev, `\n>>> STARTING EXPERIMENT ${expId.toUpperCase()} <<<\n`]);

              let url = `/api/run-experiment?run=${expId}&zero_source=${encodeURIComponent(config.zeroSource)}`;
              
              if (config.zeroCount) url += `&zero_count=${config.zeroCount}`;
              if (config.dps) url += `&dps=${config.dps}`;
              if (config.resolution) url += `&resolution=${config.resolution}`;
              if (config.xStart) url += `&x_start=${config.xStart}`;
              if (config.xEnd) url += `&x_end=${config.xEnd}`;
              if (config.betaOffset !== undefined) url += `&beta_offset=${config.betaOffset}`;
              if (config.kPower !== undefined) url += `&k_power=${config.kPower}`;

              const headers: HeadersInit = {};
              if (runAuthToken) headers.Authorization = `Bearer ${runAuthToken}`;
              const response = await fetch(url, { headers });
              if (!response.ok) {
                  const body = (await response.json().catch(() => ({}))) as { error?: string };
                  failed = true;
                  setLogs(prev => [
                      ...prev,
                      `\n> Exp ${expId} request failed (${response.status}): ${body.error ?? "run request failed"}\n`,
                  ]);
                  break;
              }
              const reader = response.body?.getReader();
              const decoder = new TextDecoder();

              if (reader) {
                  while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      const text = decoder.decode(value);
                      setLogs(prev => [...prev, text]);
                  }
              }
              
              setLogs(prev => [...prev, `\n> Exp ${expId} Complete. Syncing Data...\n`]);
              
              // Refresh Data
              await fetchData();
          }

          if (failed) {
              setLogs(prev => [...prev, "\nRUN SEQUENCE ABORTED.\n"]);
          } else {
              setLogs(prev => [...prev, "\nALL TASKS COMPLETED SUCCESSFULLY.\n"]);
          }

      } catch (err) {
          console.error("Experiment Execution Failed", err);
          setLogs(prev => [...prev, `\nFATAL ERROR: ${err}\n`]);
      } finally {
          setIsRunning(false); 
      }
  };
  
  const prepareChartData1B = (
    variants: ExperimentsData["experiment_1b"]["variants"],
    variant: "gamma" | "rho",
    activeKValues: number[]
  ): ChartRow[] => {
       const currentData = variant === "gamma" ? variants.gamma_scaled : variants.rho_scaled;
       const dataMap = new Map<string, ChartRow>();
        activeKValues.forEach(k => {
            const series = currentData?.[k.toString()];
            if (series) {
                series.forEach((pt) => {
                    const xKey = pt.x.toFixed(6);
                    if (!dataMap.has(xKey)) dataMap.set(xKey, { X: parseFloat(xKey) });
                    const entry = dataMap.get(xKey);
                    if (!entry) return;
                    entry[`K${k}_Rec`] = pt.y_rec;
                    entry[`K${k}_True`] = pt.y_true;
                });
            }
        });
       return Array.from(dataMap.values()).sort((a, b) => a.X - b.X);
  };



  // Per-experiment verdict badge now delegates to FunctionOutcomeBadge, which
  // renders function + outcome (PROOF_PROGRAM_SPEC.md §5/§8). The legacy
  // SUPPORTS/REFUTES/CANDIDATE mapping is retired; for artifacts predating
  // Sprint 2a (no verdict.function) FunctionOutcomeBadge defaults to an
  // EXPLORATORY + INCONCLUSIVE pair, which reads correctly as "not graded".
  const getVerdictBadge = (verdict: ExperimentVerdict | undefined) => (
    <FunctionOutcomeBadge verdict={verdict} />
  );

  // Returns the full verdict record; null when artifact predates the summary schema.
  const getExperimentVerdict = (expId: string): ExperimentVerdict | undefined => {
      if (!data) return undefined;
      if (data.summary?.experiments?.[expId]) {
          return data.summary.experiments[expId];
      }
      const legacy = data.meta.verdicts?.[expId];
      if (legacy) {
          return {
              type: "LEGACY",
              status: legacy,
              interpretation: "",
              metrics: {},
          };
      }
      return undefined;
  };

  const renderExperiment1 = () => {
    if (!data) return null;
    const exp1Data = data.experiment_1;
    
    let chartData: ChartRow[] = [];
    const dataMap = new Map<string, ChartRow>();

    activeK.forEach(k => {
        const series = exp1Data[k.toString()];
        if (series) {
            series.forEach(pt => {
                const xVal = viewMode === "lattice" ? pt.x : pt.eff_x;

                if (xVal === undefined || xVal === null) return;
                
                const xKey = xVal.toFixed(6); 
                
                if (!dataMap.has(xKey)) {
                   dataMap.set(xKey, { X: parseFloat(xKey) });
                }
                const entry = dataMap.get(xKey);
                if (!entry) return;
                entry[`K${k}_Reconstruction`] = pt.y_rec;
                entry[`K${k}_TruePi`] = pt.y_true;
            });
        }
    });

    chartData = Array.from(dataMap.values()).sort((a, b) => a.X - b.X);

    const scaleFactors: Record<number, string> = {};
    if (data.meta.tau) {
         [-2, -1, 0, 1, 2].forEach(k => {
             scaleFactors[k] = Math.pow(data.meta.tau, k).toFixed(2);
         });
    }

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-4 bg-white/5 p-2 rounded-xl border border-white/10">
            <div className="text-xs font-mono text-blue-400 font-bold tracking-widest pl-2">
                VIEW CONFIGURATION
            </div>
            <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
                <button 
                    onClick={() => setViewMode("lattice")}
                    className={clsx("px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2", 
                        viewMode==="lattice" ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                    )}
                >
                    <span>LATTICE</span>
                    <span className="opacity-50 font-normal">(LOG)</span>
                </button>
                <div className="w-[1px] bg-white/10 mx-1"></div>
                <button 
                    onClick={() => setViewMode("overlay")}
                    className={clsx("px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2", 
                        viewMode==="overlay" ? "bg-emerald-600 text-white shadow-[0_0_15px_rgba(5,150,105,0.5)]" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                    )}
                >
                    <span>OVERLAY</span>
                    <span className="opacity-50 font-normal">(LINEAR)</span>
                </button>
            </div>
        </div>

        <RiemannResearchChart 
            data={chartData}
            activeK={activeK}
            scaleFactors={scaleFactors}
            xAxisDataKey="X"
            xScale={viewMode === "lattice" ? "log" : "linear"}
        />
        
        <div className={clsx("border p-4 rounded text-sm transition-colors", 
            viewMode==="lattice" ? "bg-blue-900/10 border-blue-500/20 text-blue-200" : "bg-emerald-900/10 border-emerald-500/20 text-emerald-200"
        )}>
           {viewMode === "lattice" ? (
               <>
                   <strong>Log-Gauge Visualizer:</strong>
                   Plotting on a <strong>Logarithmic X-Axis</strong> against the <strong>Physical Coordinate</strong>.
                   <br/><br/>
                   Because X<sub>phys</sub> = X<sub>eff</sub> · τ<sup>k</sup>, the identical reconstruction staircases appear separated by constant horizontal shifts.
                   This view witnesses <strong>coordinate-gauge coherence</strong>: scaling the coordinate system does not change the object, only its representation.
               </>
           ) : (
               <>
                   <strong>Equivariance Overlay:</strong>
                   Plotting against the <strong>Effective Coordinate</strong> (X<sub>eff</sub> = X<sub>phys</sub> / τ<sup>k</sup>).
                   <br/><br/>
                   If the reconstruction is covariant under X ↦ X/τ<sup>k</sup>, all curves should <strong>collapse onto a single trajectory</strong>.
                   This tests <strong>coordinate equivariance only</strong>. It does <em>not</em> assume or test the zero-scaling hypothesis — that is EXP_1C&apos;s job.
               </>
           )}
        </div>
      </div>
    );
  };

  const renderExperiment1B = () => {
    if (!data) return null;
    const variants = data.experiment_1b?.variants;
    if (!variants) return <div className="text-gray-500">No Data for Exp 1B</div>;

    return (
        <div className="space-y-4">
             <div className="flex justify-between items-center mb-4 bg-white/5 p-2 rounded-xl border border-white/10">
                <div className="text-xs font-mono text-purple-400 font-bold tracking-widest pl-2">
                    OPERATOR GAUGE VARIANT
                </div>
                <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
                    <button 
                        onClick={() => setVariant1B("gamma")}
                        className={clsx("px-4 py-1.5 rounded-md text-xs font-bold transition-all", 
                            variant1B==="gamma" ? "bg-purple-600 text-white" : "text-gray-500 hover:text-gray-300"
                        )}
                    >
                        GAMMA SCALING
                    </button>
                    <div className="w-[1px] bg-white/10 mx-1"></div>
                    <button 
                        onClick={() => setVariant1B("rho")}
                        className={clsx("px-4 py-1.5 rounded-md text-xs font-bold transition-all", 
                            variant1B==="rho" ? "bg-amber-600 text-white" : "text-gray-500 hover:text-gray-300"
                        )}
                    >
                        RHO SCALING (DOC)
                    </button>
                </div>
            </div>

            <div className="h-[500px] w-full bg-black/20 rounded-xl border border-white/10 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={prepareChartData1B(variants, variant1B, activeK)} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="X" stroke="#666" />
                  <YAxis stroke="#666" domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} />
                  <Legend />
                  
                  {activeK.map(k => (
                      <Line 
                        key={k} 
                        type="monotone" 
                        dataKey={`K${k}_Rec`} 
                        stroke={`hsl(${((k+2)*60)%360}, 70%, 50%)`} 
                        strokeWidth={2} 
                        dot={false}
                        name={`K=${k} Reconstruction`} 
                      />
                  ))}
                  {/* Just show one TruePi reference if K lines are active */}
                  {activeK.length > 0 && <Line type="stepAfter" dataKey={`K${activeK[0]}_True`} stroke="#ffffff" strokeOpacity={0.3} dot={false} name="True Pi (Base)" />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            <div className="bg-purple-900/10 border border-purple-500/20 p-4 rounded text-sm text-purple-200">
                {variant1B === "gamma" ? (
                    <>
                        <strong>Gamma Scaling (Frequency) — Control:</strong> We scale deviations γ → γ·τ<sup>k</sup> while leaving the coordinate fixed. Wave frequencies shift; the reconstruction should drift significantly because this is the <em>wrong</em> group action. The control passes (implementation OK / falsifier armed) precisely when this naive operator scaling visibly breaks — arming the coordinate-gauge coherence claim. A passing control is not evidence for the theorem candidate.
                    </>
                ) : (
                    <>
                         <strong>Rho Scaling (Full) — Control:</strong> We scale ρ → ρ·τ<sup>k</sup>, which drags β → β·τ<sup>k</sup>. At k=1 the amplitude term x<sup>β</sup> with β ≈ 3 grows explosively compared to x<sup>0.5</sup>. Visible divergence here means the engine can tell the difference between the right and wrong group action — it <em>arms</em> the falsifier, nothing more. This control&apos;s pass is a precondition for trusting EXP_1&apos;s coherence witness, not itself theorem-directed evidence.
                    </>
                )}
            </div>
        </div>
    );
  };

  const renderExperiment1C = () => {
      if (!data) return null;
      const exp1cData = data.experiment_1c;
      if (!exp1cData) return <div className="text-gray-500">No Data for Exp 1C</div>;

      const dataMap = new Map<string, ChartRow>();
      
      activeK.forEach(k => {
          const series = exp1cData[k.toString()];
          if (series) {
              series.forEach(pt => {
                  const xVal = viewMode === "lattice" ? pt.x_phys : pt.x_eff;
                  if (xVal === undefined) return;
                  
                  const xKey = xVal.toFixed(6);
                  if (!dataMap.has(xKey)) dataMap.set(xKey, { X: parseFloat(xKey) });
                  const entry = dataMap.get(xKey);
                  if (!entry) return;
                  entry[`K${k}_Coord`] = pt.y_coord;
                  entry[`K${k}_Op`] = pt.y_op;
                  entry[`K${k}_True`] = pt.y_true;
              });
          }
      });
      
      const chartData = Array.from(dataMap.values()).sort((a, b) => a.X - b.X);

      return (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-4 bg-white/5 p-2 rounded-xl border border-white/10">
              <div className="text-xs font-mono text-emerald-400 font-bold tracking-widest pl-2">
                  VIEW CONFIGURATION
              </div>
              <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
                  <button 
                      onClick={() => setViewMode("lattice")}
                      className={clsx("px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2", 
                          viewMode==="lattice" ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                      )}
                  >
                      <span>LATTICE</span>
                      <span className="opacity-50 font-normal">(PHYSICAL X)</span>
                  </button>
                  <div className="w-[1px] bg-white/10 mx-1"></div>
                  <button 
                      onClick={() => setViewMode("overlay")}
                      className={clsx("px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2", 
                          viewMode==="overlay" ? "bg-emerald-600 text-white shadow-[0_0_15px_rgba(5,150,105,0.5)]" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                      )}
                  >
                      <span>OVERLAY</span>
                      <span className="opacity-50 font-normal">(EFFECTIVE X)</span>
                  </button>
              </div>
          </div>

          <div className="h-[500px] w-full bg-black/20 rounded-xl border border-white/10 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis 
                    dataKey="X" 
                    stroke="#666" 
                    scale={viewMode === "lattice" ? "log" : "linear"} 
                    domain={['auto', 'auto']}
                    type="number"
                />
                <YAxis stroke="#666" domain={['auto', 'auto']} /> 
                <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} />
                <Legend />
                
                {activeK.map(k => (
                    [
                        <Line 
                          key={`K${k}_Coord`}
                          type="monotone" 
                          dataKey={`K${k}_Coord`} 
                          stroke="#3b82f6" 
                          strokeWidth={2} 
                          strokeDasharray="5 5"
                          dot={false} 
                          name={`K=${k} Baseline (Coord)`} 
                        />,
                        <Line 
                          key={`K${k}_Op`}
                          type="monotone" 
                          dataKey={`K${k}_Op`} 
                          stroke="#10b981" 
                          strokeWidth={2} 
                          dot={false} 
                          name={`K=${k} Hypothesis (Op)`} 
                        />,
                        <Line 
                           key={`K${k}_True`}
                           type="stepAfter"
                           dataKey={`K${k}_True`}
                           stroke="#ffffff"
                           strokeOpacity={0.2}
                           dot={false}
                           name={`K=${k} True Pi`}
                        />
                    ]
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-emerald-900/10 border border-emerald-500/20 p-4 rounded text-sm text-emerald-200">
             <strong>Zero-scaling coherence witness:</strong> The green line (Operator) uses scaled zeros γ·τ<sup>k</sup> at physical coordinates; the blue dashed line (Baseline) uses standard zeros at effective coordinates.
             <br/>
             Overlay to within documented drift/ratio tolerances witnesses that <em>on the tested k-range, at the declared fidelity,</em> scaling zeros by τ<sup>k</sup> is numerically isometric to scaling the lattice by τ<sup>k</sup>. This is a <em>coherence witness</em> bearing on <code>OBL_ZERO_SCALING_EQUIVALENCE</code>; it does not prove the obligation, and it does not, by itself, support the theorem candidate.
          </div>
        </div>
      );
  };

  const renderExperiment2 = () => {
    if (!data) return null;
    const ds2A = data.experiment_2["2A"]; // Clean
    const ds2B = data.experiment_2["2B"]; // Rogue
    
    // Merge
    const chartData = ds2A.map((pt, i) => ({
        x: pt.x,
        err_clean: pt.error,
        err_rogue: ds2B[i]?.error
    }));

    return (
      <div className="space-y-4">
        <div className="h-[500px] w-full bg-black/20 rounded-xl border border-white/10 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="x" stroke="#666" label={{ value: 'Visual x (Centrifuge)', position: 'bottom', fill: '#666' }} />
              <YAxis stroke="#666" scale="log" domain={['auto', 'auto']} /> 
              <Tooltip 
                contentStyle={{ backgroundColor: '#111', borderColor: '#333' }}
              />
              <Legend />
              
              <Line 
                type="monotone" 
                dataKey="err_clean" 
                stroke="#3b82f6" 
                strokeWidth={2} 
                dot={false} 
                name="Control Error (β=0.5)" 
              />
              
              <Line 
                type="monotone" 
                dataKey="err_rogue" 
                stroke="#ef4444" 
                strokeWidth={2} 
                dot={false} 
                name="Rogue Error (β=0.5001)" 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-red-900/10 border border-red-500/20 p-4 rounded text-sm text-red-200">
           <strong>Centrifuge — Program 2 exploratory.</strong> At k=-20 (effective scale ~10<sup>16</sup>), a planted β=0.5001 perturbation produces visible error amplification relative to the clean control. Under the canonical Program 1 posture this experiment is <em>not</em> on the proof-critical path; it is retained as diagnostic tooling and calibrates the Program 2 contradiction-by-detectability route, which lacks a formal non-hiding theorem (see <code>GAP_PROGRAM2_FORMALIZATION</code>). A consistent result here does not support the theorem candidate.
        </div>
      </div>
    );
  };

  const renderExperiment2B = () => {
      if (!data) return null;
      const data2b = data.experiment_2b;
      if (!data2b) return <div className="text-gray-500">No Data for Exp 2B</div>;
      
      return (
        <div className="space-y-4">
            <div className="h-[500px] w-full bg-black/20 rounded-xl border border-white/10 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data2b} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="x" stroke="#666" />
                  <YAxis yAxisId="left" stroke="#8884d8" label={{ value: 'Diff / Obs Ratio', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" label={{ value: 'Residual', angle: 90, position: 'insideRight' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} />
                  <Legend />
                  
                  <Line yAxisId="left" type="monotone" dataKey="obs_ratio" stroke="#8884d8" name="Observed Deviation Ratio" dot={false} />
                  <Line yAxisId="left" type="monotone" dataKey="pred_ratio" stroke="#8884d8" strokeDasharray="5 5" name="Predicted Ratio (Theory)" dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="residual" stroke="#82ca9d" name="Residual (Obs/Pred)" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
             <div className="bg-emerald-900/10 border border-emerald-500/20 p-4 rounded text-sm text-emerald-200">
                <strong>Rogue Isolation — Program 2 exploratory.</strong> The green line (Residual = Observed / Predicted) stays near 1.0 when the deviation behaves as the single-perturbed-zero model predicts — i.e. the error scales like x<sup>(0.5+δ)</sup>. This is consistent with the rogue-isolation model <em>on this run&apos;s settings</em>; it does not formalize Program 2&apos;s non-hiding theorem and does not support the theorem candidate.
            </div>
        </div>
      );
  };

  const renderExperiment3 = () => {
    if (!data) return null;
    const ds3A = data.experiment_3["3A"];
    const ds3B = data.experiment_3["3B"];
    const dsTrue = data.experiment_3["TruePi"];

    const chartData = ds3A.map((pt, i) => ({
        x: pt.x,
        y_true: dsTrue[i]?.y,
        y_control: pt.y,
        y_pi: ds3B[i]?.y
    }));

    return (
      <div className="space-y-4">
        <div className="h-[500px] w-full bg-black/20 rounded-xl border border-white/10 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="x" stroke="#666" />
              <YAxis stroke="#666" domain={['dataMin', 'dataMax']} />
              <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} />
              <Legend />
              
              <Line type="stepAfter" dataKey="y_true" stroke="#10b981" strokeWidth={2} dot={false} name="True π(X)" />
              <Line type="monotone" dataKey="y_control" stroke="#3b82f6" strokeWidth={2} dot={false} name="Control (β=0.5)" />
              <Line type="monotone" dataKey="y_pi" stroke="#ec4899" strokeWidth={2} dot={false} name="Hypothesis (β=π)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-purple-900/10 border border-purple-500/20 p-4 rounded text-sm text-purple-200">
           <strong>β=π counterfactual — Control.</strong> Known-bad input: the pink line substitutes β=π for the critical-line value. Visible divergence from the true π(X) steps means the engine detects the counterfactual — i.e. the control passes, arming <code>OBL_BETA_INVARIANCE</code>&apos;s falsifier. A passing control is a precondition for trusting EXP_6&apos;s β-invariance witness, not itself theorem-directed evidence.
        </div>
      </div>
    );
  };

  const renderExperiment4 = () => {
    if (!data?.experiment_4) return <div className="text-gray-500 p-8">No Data for Exp 4</div>;
    return <Exp4Chart data={data.experiment_4} />;
  };

  const renderExperiment5 = () => {
    if (!data?.experiment_5) return <div className="text-gray-500 p-8">No Data for Exp 5</div>;
    return <Exp5Chart data={data.experiment_5} />;
  };

  const renderExperiment6 = () => {
    if (!data?.experiment_6) return <div className="text-gray-500 p-8">No Data for Exp 6</div>;
    return <Exp6Chart data={data.experiment_6} />;
  };

  const renderExperiment7 = () => {
    if (!data?.experiment_7) return <div className="text-gray-500 p-8">No Data for Exp 7</div>;
    return <Exp7Chart data={data.experiment_7} />;
  };

  const renderExperiment8 = () => {
    if (!data?.experiment_8) return <div className="text-gray-500 p-8">No Data for Exp 8</div>;
    // Tolerances are recomputed by the verifier; surface them when present in the summary metrics.
    const exp8Summary = data.summary?.experiments?.["EXP_8"];
    const metrics = (exp8Summary?.metrics ?? {}) as Record<string, unknown>;
    const tolZero = typeof metrics.tol_zero === "number" ? metrics.tol_zero : undefined;
    const tolResidual = typeof metrics.tol_residual === "number" ? metrics.tol_residual : undefined;
    return <Exp8Chart data={data.experiment_8} tolZero={tolZero} tolResidual={tolResidual} />;
  };

  // --------------------------------------------------------------------------
  // MAIN UI
  // --------------------------------------------------------------------------

  // Experiment Config State
  const [expConfig, setExpConfig] = useState<ExperimentConfig>({
      selectedExperiments: ["1"],
      zeroSource: "generated",
      dps: 50,
      resolution: 500,
      xStart: 2,
      xEnd: 50,
      betaOffset: 0.0001,
      kPower: -20
  });
  const program1Tabs = EXPERIMENT_TABS.filter((tab) => tab.program === "PROGRAM_1");
  const program2Tabs = EXPERIMENT_TABS.filter((tab) => tab.program === "PROGRAM_2");

  const renderTab = (exp: ExperimentTab) => {
    const isActive = activeExp === exp.id;
    const activeClass =
      exp.program === "PROGRAM_2"
        ? "bg-purple-900/30 border-purple-400/50 text-purple-100 shadow-[0_0_10px_rgba(88,28,135,0.35)]"
        : TAB_ACTIVE_CLASS[exp.color];
    const inactiveClass =
      exp.program === "PROGRAM_2"
        ? "border-purple-500/10 text-purple-300/60 hover:border-purple-400/40 hover:text-purple-200 hover:bg-purple-900/10"
        : "border-transparent hover:bg-white/5 text-gray-500 hover:text-gray-300";
    return (
      <button
        key={exp.id}
        onClick={() => setActiveExp(exp.id)}
        className={clsx(
          "px-3 py-1.5 rounded text-xs font-mono transition-all border flex flex-col items-start min-w-[80px]",
          isActive ? activeClass : inactiveClass
        )}
      >
        <span className="font-bold leading-none">{exp.label}</span>
        <span className="text-[8px] opacity-60 leading-none mt-0.5">{exp.sub}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-[#020408] text-gray-300 font-sans selection:bg-blue-500/30 selection:text-blue-200 overflow-hidden">
      
      {/* Top Navigation Bar */}
      <header className="h-16 border-b border-white/5 bg-[#05080f]/80 backdrop-blur-md flex items-center px-6 shrink-0 z-20 justify-between">
          <div className="flex items-center gap-6">
              <div className="shrink-0">
                  <h1 className="font-gauss text-xl italic tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-emerald-200 leading-none">
                      RIEMANN
                      <span className="block text-[8px] not-italic font-mono text-blue-400 tracking-[0.3em] mt-0.5">INTERFEROMETER</span>
                  </h1>
              </div>

              <div className="h-8 w-px bg-white/10 mx-2"></div>

              {/* Navigation Tabs */}
              <nav className="flex items-center gap-2 overflow-x-auto scrollbar-none mask-fade-right">
                  <div className="flex items-center gap-1.5">
                      <span className="text-[9px] uppercase tracking-wider font-mono text-blue-300/80 px-2 py-1 rounded border border-blue-500/20 bg-blue-900/10 whitespace-nowrap">
                          Program 1
                      </span>
                      {program1Tabs.map(renderTab)}
                  </div>
                  <div className="h-6 w-px bg-white/10 shrink-0" />
                  <div className="flex items-center gap-1.5">
                      <span className="text-[9px] uppercase tracking-wider font-mono text-purple-300/80 px-2 py-1 rounded border border-purple-500/20 bg-purple-900/10 whitespace-nowrap">
                          Program 2 exploratory
                      </span>
                      {program2Tabs.map(renderTab)}
                  </div>
              </nav>
          </div>

           {/* Status Indicators (Right Side of Header) */}
           <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500 bg-black/40 px-3 py-1 rounded-full border border-white/5">
                  <Activity size={12} className={clsx(isRunning ? "text-green-400 animate-pulse" : "text-gray-600")} />
                  <span>{isRunning ? "ENGINE ACTIVE" : "SYSTEM IDLE"}</span>
              </div>
          </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
          
          <main className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-black">
              {/* Error / Status Messages */}
              {loading && (
                  <div className="flex items-center justify-center p-12 text-blue-400 font-mono animate-pulse">
                      <Microscope className="animate-bounce mr-2" />
                      LOADING EXPERIMENT DATA...
                  </div>
              )}

              {/* Experiment Views */}
              {!loading && (
                  <div className="max-w-[1600px] mx-auto space-y-6">

                      {/* Onboarding framing: research instrument, not theory-verdict dashboard. */}
                      <IntroPanel />

                      {/* Proof Program Map: theorem candidate + obligations + open gaps.
                         Replaces the retired StageBanner per PROOF_PROGRAM_SPEC.md §8. */}
                      <ProofProgramMap
                          proofProgram={data?.summary?.proof_program}
                          implementationHealth={data?.summary?.implementation_health}
                          schemaVersion={data?.meta?.schema_version}
                          fidelityTier={data?.summary?.fidelity_tier}
                          fidelityZeros={data?.summary?.fidelity_zeros}
                          fidelityDps={data?.summary?.fidelity_dps}
                          onJumpToGaps={() =>
                              document
                                  .getElementById("open-gaps-panel")
                                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
                          }
                      />

                      {/* Named open-gaps surface (PROOF_PROGRAM_SPEC.md §11). */}
                      <OpenGapsPanel
                          id="open-gaps-panel"
                          openGaps={data?.summary?.proof_program?.open_gaps}
                      />

                      {/* Re-grade / re-run controls: verify-only, quick, or full. */}
                      <div className="flex items-center justify-between gap-4 px-1">
                          <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
                              Re-run controls
                          </div>
                          <RerunButton onFinished={() => fetchData()} />
                      </div>

                      {/* Canonical trail: obligation + implementation-health flips. */}
                      <VerdictHistoryPanel />

                      {/* Header for Active View */}
                      {(() => {
                        const activeVerdict = getExperimentVerdict(activeExp.replace("EXP", "EXP_"));
                        return (
                          <div className="space-y-3 border-b border-white/5 pb-4 mb-6">
                            <div className="flex items-center justify-between">
                              <div>
                                <h2 className="text-2xl font-light text-white flex items-center gap-3">
                                  {activeExp === "EXP1" && <><Scale className="text-blue-500" /> EQUIVARIANCE C-01</>}
                                  {activeExp === "EXP1B" && <><GitBranch className="text-purple-500" /> OPERATOR GAUGE</>}
                                  {activeExp === "EXP1C" && <><RotateCcw className="text-emerald-500" /> ZERO SCALING</>}
                                  {activeExp === "EXP2" && <><Activity className="text-red-500" /> CENTRIFUGE PROBE</>}
                                  {activeExp === "EXP2B" && <><Microscope className="text-emerald-500" /> ISOLATION TEST</>}
                                  {activeExp === "EXP3" && <><AlertTriangle className="text-pink-500" /> FALSIFICATION TEST</>}
                                  {activeExp === "EXP4" && <><RotateCcw className="text-orange-500" /> TRANSLATION / DILATION</>}
                                  {activeExp === "EXP5" && <><CheckCircle2 className="text-cyan-500" /> ZERO CORRESPONDENCE</>}
                                  {activeExp === "EXP6" && <><Activity className="text-yellow-500" /> CRITICAL DRIFT</>}
                                  {activeExp === "EXP7" && <><Scale className="text-indigo-500" /> RELATIVE AMPLIFICATION</>}
                                  {activeExp === "EXP8" && <><RotateCcw className="text-emerald-500" /> SCALED-ZETA EQUIVALENCE</>}
                                </h2>
                                <div className="flex gap-2 mt-2">
                                  {getVerdictBadge(activeVerdict)}
                                </div>
                              </div>

                              {/* Active K Toggles embedded in header for Exp 1/1B/1C */}
                              {["EXP1", "EXP1B", "EXP1C"].includes(activeExp) && (
                                  <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
                                      {[-2, -1, 0, 1, 2].map(k => (
                                          <button
                                              key={k}
                                              onClick={() => {
                                                  if (activeK.includes(k)) setActiveK(prev => prev.filter(x => x !== k));
                                                  else setActiveK(prev => [...prev, k].sort((a,b)=>a-b));
                                              }}
                                              className={clsx(
                                                  "w-8 h-8 flex items-center justify-center rounded text-xs font-bold transition-all",
                                                  activeK.includes(k)
                                                      ? "bg-blue-600 text-white"
                                                      : "text-gray-500 hover:bg-white/5"
                                              )}
                                          >
                                              {k}
                                          </button>
                                      ))}
                                  </div>
                              )}
                            </div>

                            {/* Mandatory inference rails — surfaces what MAY and MUST NOT be
                               inferred from this experiment's current outcome. Required
                               under PROOF_PROGRAM_SPEC.md §5/§8. */}
                            <InferenceRailsCallout rails={activeVerdict?.inference} />
                          </div>
                        );
                      })()}

                      {activeExp === "EXP1" && renderExperiment1()}
                      {activeExp === "EXP1B" && renderExperiment1B()}
                      {activeExp === "EXP1C" && renderExperiment1C()}
                      {activeExp === "EXP2" && renderExperiment2()}
                      {activeExp === "EXP2B" && renderExperiment2B()}
                      {activeExp === "EXP3" && renderExperiment3()}
                      {activeExp === "EXP4" && renderExperiment4()}
                      {activeExp === "EXP5" && renderExperiment5()}
                      {activeExp === "EXP6" && renderExperiment6()}
                      {activeExp === "EXP7" && renderExperiment7()}
                      {activeExp === "EXP8" && renderExperiment8()}

                      {/* Log Console (Bottom of View) */}
                      <div className="mt-12 border-t border-white/10 pt-6">
                          <h3 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-2">
                              <Activity size={12} /> Execution Logs
                          </h3>
                          <div className="bg-black/50 rounded-lg border border-white/10 p-4 font-mono text-[10px] h-48 overflow-y-auto text-gray-400">
                              {logs.length === 0 && <span className="opacity-30 italic">System Ready. Awaiting Command.</span>}
                              {logs.map((line, i) => (
                                  <div key={i} className="whitespace-pre-wrap">{line}</div>
                              ))}
                              <div ref={logEndRef} />
                          </div>
                      </div>

                  </div>
              )}
          </main>

          {/* Right Sidebar (Config) - Included in the Flex Row */}
          <ExperimentSidebar
            config={expConfig}
            onConfigChange={setExpConfig}
            onRun={() => runExperiment(expConfig)}
            isRunning={isRunning}
            implementationHealth={data?.summary?.implementation_health}
            experimentStatuses={
                data?.summary?.experiments
                    ? Object.fromEntries(
                          Object.entries(data.summary.experiments).map(([k, v]) => [
                              k,
                              // Prefer canonical outcome over deprecated theory_fit
                              v.outcome ?? v.theory_fit ?? v.status,
                          ])
                      )
                    : undefined
            }
            fidelityTier={data?.summary?.fidelity_tier}
            provisionalExperiments={
                data?.summary?.experiments
                    ? new Set(
                          Object.entries(data.summary.experiments)
                              .filter(([, v]) => v.provisional)
                              .map(([k]) => k)
                      )
                    : undefined
            }
            experimentClassification={data?.meta?.experiment_classification}
          />
      
      </div>
    </div>
  );
}

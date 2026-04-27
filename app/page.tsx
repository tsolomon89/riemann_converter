"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import {
  Microscope,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Activity,
  GitBranch,
  Scale,
  Lightbulb,
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
import ErrorAnalysisChart from "../components/ErrorAnalysisChart";
import ZetaPolarChart from "../components/ZetaPolarChart";
import ZetaTransportChart from "../components/ZetaTransportChart";
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
import { ExperimentsData, ExperimentVerdict } from "../lib/types";
import type { RunEvent, RunLogsPayload, RunStatusPayload } from "../lib/research-types";
import {
  appendUniqueRunEvents,
  deriveRunActive,
  isActiveRunStatus,
  shouldAttachToActiveRun,
  shouldPollApiLogs,
  TERMINAL_RUN_STATUSES,
  type RunLogSource,
} from "../lib/run-feedback";
import ExperimentSidebar, { ExperimentConfig, type SidebarLiveTelemetry } from "../components/ExperimentSidebar";

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

const EXPERIMENT_IDS = [
  "EXP0",
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
  "EXP9",
  "EXP10",
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
type PageViewMode = "PROGRAM_1_OVERVIEW" | "EXPERIMENT";
type DeploymentCapabilities = {
  read_only_deployment: boolean;
  run_controls_enabled: boolean;
  read_only_reason?: "HOSTED_READ_ONLY" | "ENABLED";
};
type ResearchManifestResponse = {
  capabilities?: Partial<DeploymentCapabilities>;
};
type Envelope<T> = {
  data: T;
};
type RunEventsPage = {
  events: RunEvent[];
  next: number;
};
type RunLogsPage = RunLogsPayload;
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
  { id: "EXP1", label: "CORE-1", sub: "Harmonic", color: "blue", program: "PROGRAM_1" },
  { id: "EXP1B", label: "CTRL-1", sub: "Operator", color: "purple", program: "PROGRAM_1" },
  { id: "EXP1C", label: "NOTE-1", sub: "Zero-Reuse", color: "emerald", program: "PROGRAM_1" },
  { id: "EXP3", label: "CTRL-2", sub: "Beta Ctrl", color: "pink", program: "PROGRAM_1" },
  { id: "EXP4", label: "PATH-1", sub: "Dilation", color: "orange", program: "PROGRAM_1" },
  { id: "EXP5", label: "PATH-2", sub: "Correspond", color: "cyan", program: "PROGRAM_1" },
  { id: "EXP6", label: "VAL-1", sub: "Beta Stable", color: "yellow", program: "PROGRAM_1" },
  { id: "EXP8", label: "REG-1", sub: "Scaled-Zeta", color: "emerald", program: "PROGRAM_1" },
  { id: "EXP9", label: "DEMO-1", sub: "Bounded", color: "purple", program: "PROGRAM_1" },
  { id: "EXP2", label: "P2-1", sub: "Centrifuge", color: "red", program: "PROGRAM_2" },
  { id: "EXP2B", label: "P2-2", sub: "Isolation", color: "emerald", program: "PROGRAM_2" },
  { id: "EXP7", label: "P2-3", sub: "Amplify", color: "indigo", program: "PROGRAM_2" },
];

const isActiveExperiment = (value: string): value is ActiveExperiment =>
  (EXPERIMENT_IDS as readonly string[]).includes(value);

const DEFAULT_DEPLOYMENT_CAPABILITIES: DeploymentCapabilities = {
  read_only_deployment: false,
  run_controls_enabled: true,
  read_only_reason: "ENABLED",
};

export default function Home() {
  const [data, setData] = useState<ExperimentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeExp, setActiveExp] = useState<ActiveExperiment>("EXP1");
  const [pageViewMode, setPageViewMode] = useState<PageViewMode>("PROGRAM_1_OVERVIEW");
  const runAuthToken = process.env.NEXT_PUBLIC_RESEARCH_RUN_TOKEN?.trim();
  
  const [viewMode, setViewMode] = useState<"lattice" | "overlay">("lattice");
  const [exp1Branch, setExp1Branch] = useState<"main" | "stress">("main");
  const [exp1Curve, setExp1Curve] = useState<"harmonic" | "mobius">("mobius");
  const [exp1N, setExp1N] = useState(200);
  
  const [activeK, setActiveK] = useState<number[]>([0, 1]);
  const [variant1B, setVariant1B] = useState<"gamma" | "rho">("gamma");
  
  // Experiment Runner State
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [liveRunStatus, setLiveRunStatus] = useState<RunStatusPayload | null>(null);
  const [liveRunEvents, setLiveRunEvents] = useState<RunEvent[]>([]);
  const [deploymentCapabilities, setDeploymentCapabilities] = useState<DeploymentCapabilities>(
    DEFAULT_DEPLOYMENT_CAPABILITIES,
  );
  const logEndRef = useRef<HTMLDivElement>(null);
  const telemetryPollTimerRef = useRef<number | null>(null);
  const telemetryPollInFlightRef = useRef(false);
  const telemetryEventsOffsetRef = useRef(0);
  const telemetryLogsOffsetRef = useRef(0);
  const seenTelemetryEventIdsRef = useRef<Set<string>>(new Set());
  const runLogSourceRef = useRef<RunLogSource>(null);
  const lastTerminalFetchRunIdRef = useRef<string | null>(null);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const fetchData = useCallback(async () => {
      try {
        const res = await fetch(`/experiments.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const jsonData = await res.json();
        setData(jsonData);
      } catch (err) {
        console.error("Failed to load experiments.json", err);
      } finally {
        setLoading(false);
      }
  }, []);

  const fetchDeploymentCapabilities = useCallback(async () => {
      try {
        const res = await fetch("/api/research/manifest", { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as ResearchManifestResponse;
        const caps = payload.capabilities;
        if (!caps) return;
        setDeploymentCapabilities({
          read_only_deployment: Boolean(caps.read_only_deployment),
          run_controls_enabled:
            typeof caps.run_controls_enabled === "boolean"
              ? caps.run_controls_enabled
              : true,
          read_only_reason: caps.read_only_reason ?? "ENABLED",
        });
      } catch (err) {
        console.error("Failed to load deployment capabilities", err);
      }
  }, []);

  useEffect(() => {
    void fetchData();
    void fetchDeploymentCapabilities();
  }, [fetchData, fetchDeploymentCapabilities]);

  const stopTelemetryPolling = useCallback(() => {
    if (telemetryPollTimerRef.current !== null) {
      window.clearInterval(telemetryPollTimerRef.current);
      telemetryPollTimerRef.current = null;
    }
  }, []);

  const resetLiveTelemetry = () => {
    stopTelemetryPolling();
    telemetryEventsOffsetRef.current = 0;
    telemetryLogsOffsetRef.current = 0;
    seenTelemetryEventIdsRef.current = new Set();
    runLogSourceRef.current = null;
    lastTerminalFetchRunIdRef.current = null;
    setActiveRunId(null);
    setLiveRunStatus(null);
    setLiveRunEvents([]);
  };

  const asFiniteNumber = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

  const getAuthHeaders = useCallback(
    (): HeadersInit | undefined =>
      runAuthToken ? { Authorization: `Bearer ${runAuthToken}` } : undefined,
    [runAuthToken],
  );

  useEffect(() => {
    let cancelled = false;
    if (activeRunId || isRunning) return;

    const attachToActiveRun = async () => {
      try {
        const response = await fetch("/api/research/run", {
          headers: getAuthHeaders(),
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as Envelope<RunStatusPayload>;
        const status = payload.data;
        if (!shouldAttachToActiveRun(status) || cancelled) return;

        stopTelemetryPolling();
        telemetryEventsOffsetRef.current = 0;
        telemetryLogsOffsetRef.current = 0;
        seenTelemetryEventIdsRef.current = new Set();
        runLogSourceRef.current = "api";
        lastTerminalFetchRunIdRef.current = null;
        setActiveRunId(status.run_id);
        setLiveRunStatus(status);
        setLiveRunEvents([]);
        setIsRunning(false);
        setLogs([`[ui] reattached to active run ${status.run_id} (${status.status.toLowerCase()})\n`]);
      } catch (err) {
        console.error("Failed to reattach active run", err);
      }
    };

    void attachToActiveRun();
    return () => {
      cancelled = true;
    };
  }, [activeRunId, getAuthHeaders, isRunning, stopTelemetryPolling]);

  useEffect(() => {
    let cancelled = false;
    const shouldPoll =
      !!activeRunId &&
      (isRunning || isActiveRunStatus(liveRunStatus?.status));
    if (!activeRunId || !shouldPoll) return;

    const pollLiveRunTelemetry = async () => {
      if (telemetryPollInFlightRef.current) return;
      telemetryPollInFlightRef.current = true;
      try {
        const statusRes = await fetch(`/api/research/run?run_id=${encodeURIComponent(activeRunId)}`, {
          headers: getAuthHeaders(),
          cache: "no-store",
        });
        if (statusRes.ok && !cancelled) {
          const statusPayload = (await statusRes.json()) as Envelope<RunStatusPayload>;
          const status = statusPayload.data;
          setLiveRunStatus(status);
          if (TERMINAL_RUN_STATUSES.has(status.status)) {
            stopTelemetryPolling();
            setIsRunning(false);
            if (
              shouldPollApiLogs(runLogSourceRef.current) &&
              lastTerminalFetchRunIdRef.current !== activeRunId
            ) {
              lastTerminalFetchRunIdRef.current = activeRunId;
              void fetchData();
            }
          }
        }

        if (shouldPollApiLogs(runLogSourceRef.current)) {
          const logsRes = await fetch(
            `/api/research/run/logs?run_id=${encodeURIComponent(activeRunId)}&from=${telemetryLogsOffsetRef.current}`,
            {
              headers: getAuthHeaders(),
              cache: "no-store",
            },
          );
          if (logsRes.ok && !cancelled) {
            const logsPayload = (await logsRes.json()) as Envelope<RunLogsPage>;
            const page = logsPayload.data;
            if (page.chunk) {
              setLogs((prev) => [...prev, page.chunk]);
            }
            telemetryLogsOffsetRef.current = page.next;
          }
        }

        const eventsRes = await fetch(
          `/api/research/run/events?run_id=${encodeURIComponent(activeRunId)}&from=${telemetryEventsOffsetRef.current}`,
          {
            headers: getAuthHeaders(),
            cache: "no-store",
          },
        );
        if (eventsRes.ok && !cancelled) {
          const eventsPayload = (await eventsRes.json()) as Envelope<RunEventsPage>;
          const page = eventsPayload.data;
          if (Array.isArray(page.events) && page.events.length > 0) {
            const unique = appendUniqueRunEvents(page.events, seenTelemetryEventIdsRef.current);
            if (unique.length > 0) {
              setLiveRunEvents((prev) => [...prev, ...unique].slice(-8));
            }
          }
          telemetryEventsOffsetRef.current = page.next;
        }
      } catch (err) {
        console.error("Failed to poll live run telemetry", err);
      } finally {
        telemetryPollInFlightRef.current = false;
      }
    };

    stopTelemetryPolling();
    void pollLiveRunTelemetry();
    telemetryPollTimerRef.current = window.setInterval(() => {
      void pollLiveRunTelemetry();
    }, 2000);
    return () => {
      cancelled = true;
      stopTelemetryPolling();
    };
  }, [activeRunId, fetchData, getAuthHeaders, isRunning, liveRunStatus?.status, stopTelemetryPolling]);

  useEffect(() => {
    return () => {
      if (telemetryPollTimerRef.current !== null) {
        window.clearInterval(telemetryPollTimerRef.current);
        telemetryPollTimerRef.current = null;
      }
    };
  }, []);

  const runExperiment = async (config: ExperimentConfig) => {
      if (!deploymentCapabilities.run_controls_enabled) {
          setLogs([
              "[ui] Hosted deployment is read-only. Fork/download from GitHub to run experiments locally.\n",
          ]);
          return;
      }

      resetLiveTelemetry();
      runLogSourceRef.current = "api";
      setIsRunning(true);
      setLogs([]);
      const normalizedSelection = (config.selectedExperiments ?? [])
          .map((item) => item.trim().toLowerCase())
          .filter((item) => Boolean(item) && item !== "all");

      if (normalizedSelection.length === 0) {
          setLogs([
              "[ui] Select at least one experiment checkbox before running.\n",
          ]);
          setIsRunning(false);
          return;
      }

      const runScope = Array.from(new Set(normalizedSelection)).join(",");

      const firstExp = normalizedSelection[0];
      if (firstExp) {
          const nextExp = `EXP${firstExp.toUpperCase()}`;
          if (isActiveExperiment(nextExp)) {
            setActiveExp(nextExp);
            setPageViewMode("EXPERIMENT");
          }
      }

      try {
          const customRunConfig: Record<string, string | number | undefined> = {
              run: runScope,
              zero_source: config.zeroSource,
          };

          const appendNumber = (key: string, value: number | undefined) => {
              if (value === undefined || value === null) return;
              if (!Number.isFinite(value)) return;
              customRunConfig[key] = value;
          };

          appendNumber("zero_count", config.zeroCount);
          appendNumber("dps", config.dps);
          appendNumber("resolution", config.resolution);
          appendNumber("x_start", config.xStart);
          appendNumber("x_end", config.xEnd);
          appendNumber("beta_offset", config.betaOffset);
          appendNumber("k_power", config.kPower);
          appendNumber("workers", config.workers);
          appendNumber("prime_min_count", config.primeMinCount);
          appendNumber("prime_target_count", config.primeTargetCount);

          const headers: HeadersInit = {
              "Content-Type": "application/json",
              ...(getAuthHeaders() ?? {}),
          };

          setLogs((prev) => [
              ...prev,
              `\n>>> STARTING CUSTOM RUN (${runScope}) <<<\n`,
          ]);

          const response = await fetch("/api/research/run", {
              method: "POST",
              headers,
              body: JSON.stringify({
                  kind: "custom",
                  custom: customRunConfig,
              }),
          });
          if (!response.ok) {
              const body = (await response.json().catch(() => ({}))) as { error?: string };
              setLogs((prev) => [
                  ...prev,
                  `\n> Run request failed (${response.status}): ${body.error ?? "run request failed"}\n`,
                  "\nRUN ABORTED.\n",
              ]);
              setIsRunning(false);
              return;
          }

          const payload = (await response.json()) as Envelope<RunStatusPayload>;
          const started = payload.data;
          if (!started.run_id) throw new Error("Run manager returned an invalid run identifier.");
          setActiveRunId(started.run_id);
          setLiveRunStatus(started);
          lastTerminalFetchRunIdRef.current = null;
          setLogs((prev) => [
              ...prev,
              `[ui] custom run started: ${started.run_id}\n`,
              "[ui] streaming logs through /api/research/run/logs\n",
          ]);

      } catch (err) {
          console.error("Experiment Execution Failed", err);
          setLogs(prev => [...prev, `\nFATAL ERROR: ${err}\n`]);
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

  const renderExperiment0 = () => {
    const exp0 = data?.experiment_0;
    if (!exp0) {
      return (
        <div className="text-gray-500 p-8">
          No data for ZETA-0. Run <code className="font-mono text-emerald-400">ZETA-0</code> via the experiment runner.
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-4 text-sm text-emerald-100">
          <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-300 mb-2">
            ζ-Direct visualization · descriptive only · does not vote
          </div>
          <p className="leading-relaxed">
            <strong>Polar trace:</strong> ζ(½ + it) plotted as a parametric curve. Each near-origin loop corresponds to a non-trivial zero. Loaded zeros within the t-range are marked in rose. This is the only chart in the dashboard that operates on ζ itself; every other experiment operates on the explicit-formula reconstruction π_N(x) built from ζ&apos;s zeros.
          </p>
          <p className="leading-relaxed mt-2">
            <strong>Dual-window:</strong> overlays ζ on an uncompressed t-window vs the same ζ evaluated on a τ-scaled (compressed) window. If the user&apos;s gauge thesis held at the level of ζ itself, the two curves would superimpose. They do not in general — and the visual deviation is the point.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-mono uppercase tracking-widest text-emerald-300">Polar trace · ζ(½ + it)</div>
            {exp0.polar_trace?.config && (
              <div className="text-[10px] text-gray-500 font-mono">
                t ∈ [{exp0.polar_trace.config.t_start}, {exp0.polar_trace.config.t_end}] · {exp0.polar_trace.config.point_count} pts · dps={exp0.polar_trace.config.dps}
              </div>
            )}
          </div>
          <ZetaPolarChart mode="polar" polarTrace={exp0.polar_trace as Parameters<typeof ZetaPolarChart>[0]["polarTrace"]} />
        </div>

        <div className="rounded-lg border border-white/10 bg-black/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-mono uppercase tracking-widest text-amber-300">Dual-window overlay</div>
            {exp0.dual_window?.config && (
              <div className="text-[10px] text-gray-500 font-mono">
                T={exp0.dual_window.config.T} L={exp0.dual_window.config.L} · {exp0.dual_window.config.base_name}^{exp0.dual_window.config.k} ≈ {exp0.dual_window.config.scale?.toFixed(4)}
              </div>
            )}
          </div>
          <ZetaPolarChart mode="dual" dualWindow={exp0.dual_window as Parameters<typeof ZetaPolarChart>[0]["dualWindow"]} />
        </div>
      </div>
    );
  };

  const renderExperiment1 = () => {
    if (!data) return null;
    const exp1Data = data.experiment_1;
    const mainByK = exp1Data.main?.by_k ?? {};
    const stressByK = exp1Data.support?.scaled_coordinate_stress?.by_k ?? {};
    const schoenfeldByK = exp1Data.support?.schoenfeld_bound?.by_k ?? {};
    const schoenfeldDomainMin = exp1Data.support?.schoenfeld_bound?.domain?.x_eff_min ?? 2657;
    const selectedSchoenfeldK = activeK[0] ?? 0;
    const selectedSchoenfeldRows = schoenfeldByK[selectedSchoenfeldK.toString()] ?? [];
    const applicableSchoenfeldRows = selectedSchoenfeldRows.filter((row) => row.SchoenfeldApplicable).length;
    const availableNs = exp1Data.main?.config?.n_values?.length
      ? exp1Data.main.config.n_values
      : [0, 1, 3, 10, 50, 200];
    const selectedN = availableNs.includes(exp1N)
      ? exp1N
      : availableNs[availableNs.length - 1] ?? 0;
    const curveKey = `${exp1Curve}_N_${selectedN}`;

    let chartData: ChartRow[] = [];
    const dataMap = new Map<string, ChartRow>();

    activeK.forEach(k => {
        const kKey = k.toString();
        const series = exp1Branch === "stress" ? stressByK[kKey] : mainByK[kKey];
        if (series) {
            series.forEach(pt => {
                const xVal = exp1Branch === "stress"
                  ? (viewMode === "lattice" ? pt.x : pt.eff_x)
                  : (viewMode === "lattice" ? pt.X : pt.x_eff);

                if (xVal === undefined || xVal === null) return;
                
                const xKey = xVal.toFixed(6); 
                
                if (!dataMap.has(xKey)) {
                   dataMap.set(xKey, { X: parseFloat(xKey) });
                }
                const entry = dataMap.get(xKey);
                if (!entry) return;
                entry[`K${k}_Reconstruction`] = exp1Branch === "stress" ? pt.y_rec : pt[curveKey];
                entry[`K${k}_TruePi`] = pt.y_true;
                if (exp1Branch === "main" && pt.li !== undefined) entry.Li = pt.li;
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
        <div className="flex flex-wrap justify-between items-center gap-2 mb-4 bg-white/5 p-2 rounded-xl border border-white/10">
            <div className="text-xs font-mono text-blue-400 font-bold tracking-widest pl-2">
                {exp1Branch === "main" ? "MAIN CALCULATION" : "SUPPORTING STRESS"}
            </div>
            <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
                <button
                    onClick={() => setExp1Branch("main")}
                    className={clsx("px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                        exp1Branch==="main" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                    )}
                >
                    MAIN
                </button>
                <button
                    onClick={() => setExp1Branch("stress")}
                    className={clsx("px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                        exp1Branch==="stress" ? "bg-slate-600 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                    )}
                >
                    STRESS
                </button>
            </div>
            {exp1Branch === "main" && (
                <>
                    <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
                        <button
                            onClick={() => setExp1Curve("mobius")}
                            title="Möbius-inverted explicit formula. Steps land on primes."
                            className={clsx("px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2",
                                exp1Curve==="mobius" ? "bg-amber-600 text-white shadow-[0_0_15px_rgba(217,119,6,0.5)]" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                            )}
                        >
                            <span>π(x) STEPS</span>
                            <span className="opacity-50 font-normal">(MOBIUS)</span>
                        </button>
                        <div className="w-[1px] bg-white/10 mx-1"></div>
                        <button
                            onClick={() => setExp1Curve("harmonic")}
                            title="Riemann J(x): raw harmonic sum. Steps land on prime powers, not primes."
                            className={clsx("px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2",
                                exp1Curve==="harmonic" ? "bg-emerald-600 text-white shadow-[0_0_15px_rgba(5,150,105,0.5)]" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                            )}
                        >
                            <span>J(x) RAW</span>
                            <span className="opacity-50 font-normal">(HARMONIC)</span>
                        </button>
                    </div>
                    <select
                        value={selectedN}
                        onChange={(event) => setExp1N(Number(event.target.value))}
                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200"
                    >
                        {availableNs.map((n) => (
                            <option key={n} value={n}>N={n}</option>
                        ))}
                    </select>
                </>
            )}
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

        {exp1Branch === "main" && selectedSchoenfeldRows.length > 0 && (
          <div className="rounded-xl border border-red-500/15 bg-red-950/10 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-red-300">
                Schoenfeld Support Lens · k={selectedSchoenfeldK}
              </div>
              <div className="text-[10px] font-mono text-red-200/70">
                applicable points: {applicableSchoenfeldRows}/{selectedSchoenfeldRows.length} · domain x_eff ≥ {schoenfeldDomainMin}
              </div>
            </div>
            <ErrorAnalysisChart data={selectedSchoenfeldRows} k={selectedSchoenfeldK} />
            <p className="text-xs leading-relaxed text-red-100/80">
              This support view compares |π(x_eff) - Li(x_eff)| with sqrt(x_eff)·log(x_eff)/(8π), then plots it in X units under x_eff = X/τ^k. It is a bound-substitution diagnostic, not a theorem verdict.
            </p>
          </div>
        )}
        
        <div className={clsx("border p-4 rounded text-sm transition-colors",
            exp1Branch==="main" ? "bg-blue-900/10 border-blue-500/20 text-blue-200" : "bg-slate-900/20 border-slate-500/30 text-slate-200"
        )}>
           {exp1Branch === "main" ? (
               exp1Curve === "mobius" ? (
                   <>
                       <strong>π(x) STEPS (Möbius-inverted):</strong> π_N(x) = Σ μ(n)/n · J(x^(1/n)) with J(x) = Li(x) − Σ<sub>j≤N</sub> 2·Re(Ei((½+iγ<sub>j</sub>)·log x)). This is the Möbius-inverted prime-step reconstruction: as N grows, the curve sharpens onto the integer staircase at each prime. Plotted in X units with x_eff = X/τ^k, so prime-step markers land at X = p·τ^k.
                       <br/><br/>
                       Other experiments validate, control, or explain this main calculation. This view does not claim an RH proof, zero-scaling proof, or extended verified coverage.
                   </>
               ) : (
                   <>
                       <strong>J(x) RAW (raw harmonic sum):</strong> J_N(x) = Li(x) − Σ<sub>j≤N</sub> 2·Re(Ei((½+iγ<sub>j</sub>)·log x)). This is Riemann&apos;s J function — the direct point→wave converter applied to N zeros. By design J(x) ≈ π(x) + ½·π(√x) + ⅓·π(∛x) + …, so its steps land at <em>prime powers</em>, not primes. The curve will not lock onto the integer staircase no matter how many zeros you add. Switch to π(x) STEPS to see prime emergence.
                       <br/><br/>
                       Other experiments validate, control, or explain this main calculation. This view does not claim an RH proof, zero-scaling proof, or extended verified coverage.
                   </>
               )
           ) : (
               <>
                   <strong>Supporting stress:</strong>
                    This preserves the previous scaled-coordinate CORE-1 support calculation: MobiusPi_equal_beta(x_eff tau^k) versus TruePi(x_eff tau^k).
                   <br/><br/>
                   It is validation and diagnostic work, not the main theory-facing calculation.
               </>
           )}
        </div>

        <div className={clsx("hidden border p-4 rounded text-sm transition-colors", 
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
                    This tests <strong>coordinate equivariance only</strong>. It does <em>not</em> assume or test the zero-scaling hypothesis — that is NOTE-1&apos;s job.
               </>
           )}
        </div>
      </div>
    );
  };

  const renderExperiment1B = () => {
    if (!data) return null;
    const variants = data.experiment_1b?.variants;
    if (!variants) return <div className="text-gray-500">No data for CTRL-1</div>;

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
                        <strong>Gamma Scaling (Frequency) — Control:</strong> We scale deviations γ → γ·τ<sup>k</sup> while leaving the coordinate fixed. Wave frequencies shift; the reconstruction should drift significantly because this is the <em>wrong</em> group action. The control passes (implementation OK / falsifier armed) precisely when this naive operator scaling visibly breaks — arming the coordinate-gauge coherence claim.
                    </>
                ) : (
                    <>
                         <strong>Rho Scaling (Full) — Control:</strong> We scale ρ → ρ·τ<sup>k</sup>, which drags β → β·τ<sup>k</sup>. At k=1 the amplitude term x<sup>β</sup> with β ≈ 3 grows explosively compared to x<sup>0.5</sup>. Visible divergence here means the engine can tell the difference between the right and wrong group action — it <em>arms</em> the falsifier, nothing more.
                    </>
                )}
            </div>
        </div>
    );
  };

  const renderExperiment1C = () => {
      if (!data) return null;
      const exp1cData = data.experiment_1c;
      if (!exp1cData) return <div className="text-gray-500">No data for NOTE-1</div>;

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
             Overlay to within documented drift/ratio tolerances witnesses that <em>on the tested k-range, at the declared fidelity,</em> scaling zeros by τ<sup>k</sup> is numerically isometric to scaling the lattice by τ<sup>k</sup>. This is a <em>coherence witness</em> bearing on <code>OBL_ZERO_SCALING_EQUIVALENCE</code>.
          </div>
        </div>
      );
  };

  const renderExperiment2 = () => {
    if (!data) return null;
    const exp2 = data.experiment_2;
    const ds2A = exp2?.["2A"]; // Clean
    const ds2B = exp2?.["2B"]; // Rogue
    if (!Array.isArray(ds2A) || ds2A.length === 0) {
      return <div className="text-gray-500">No data for P2-1</div>;
    }
    const rogueSeries = Array.isArray(ds2B) ? ds2B : [];
    
    // Merge
    const chartData = ds2A.map((pt, i) => ({
        x: pt.x,
        err_clean: pt.error,
        err_rogue: rogueSeries[i]?.error
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
           <strong>Centrifuge — Program 2 exploratory.</strong> At k=-20 (effective scale ~10<sup>16</sup>), a planted β=0.5001 perturbation produces visible error amplification relative to the clean control. Retained as diagnostic tooling for the Program 2 contradiction-by-detectability route, which lacks a formal non-hiding theorem (see <code>GAP_PROGRAM2_FORMALIZATION</code>).
        </div>
      </div>
    );
  };

  const renderExperiment2B = () => {
      if (!data) return null;
      const data2b = data.experiment_2b;
      if (!data2b) return <div className="text-gray-500">No data for P2-2</div>;
      
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
                <strong>Rogue Isolation — Program 2 exploratory.</strong> The green line (Residual = Observed / Predicted) stays near 1.0 when the deviation behaves as the single-perturbed-zero model predicts — i.e. the error scales like x<sup>(0.5+δ)</sup>. This is consistent with the rogue-isolation model <em>on this run&apos;s settings</em>.
            </div>
        </div>
      );
  };

  const renderExperiment3 = () => {
    if (!data) return null;
    const exp3 = data.experiment_3;
    const ds3A = Array.isArray(exp3?.["3A"]) ? exp3["3A"] : [];
    const ds3B = Array.isArray(exp3?.["3B"]) ? exp3["3B"] : [];
    const dsTrue = Array.isArray(exp3?.["TruePi"]) ? exp3["TruePi"] : [];
    if (ds3A.length === 0) {
      return <div className="text-gray-500">No data for CTRL-2</div>;
    }

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
           <strong>β=π counterfactual — Control.</strong> Known-bad input: the pink line substitutes β=π for the critical-line value. Visible divergence from the true π(X) steps means the engine detects the counterfactual — i.e. the control passes, arming <code>OBL_BETA_INVARIANCE</code>&apos;s falsifier.
        </div>
      </div>
    );
  };

  const renderExperiment4 = () => {
    if (!data?.experiment_4) return <div className="text-gray-500 p-8">No data for PATH-1</div>;
    return <Exp4Chart data={data.experiment_4} />;
  };

  const renderExperiment5 = () => {
    if (!data?.experiment_5) return <div className="text-gray-500 p-8">No data for PATH-2</div>;
    return <Exp5Chart data={data.experiment_5} />;
  };

  const renderExperiment6 = () => {
    if (!data?.experiment_6) return <div className="text-gray-500 p-8">No data for VAL-1</div>;
    return <Exp6Chart data={data.experiment_6} />;
  };

  const renderExperiment7 = () => {
    if (!data?.experiment_7) return <div className="text-gray-500 p-8">No data for P2-3</div>;
    return <Exp7Chart data={data.experiment_7} />;
  };

  const renderExperiment8 = () => {
    if (!data?.experiment_8) return <div className="text-gray-500 p-8">No data for REG-1</div>;
    // Tolerances are recomputed by the verifier; surface them when present in the summary metrics.
    const exp8Summary = data.summary?.experiments?.["EXP_8"];
    const metrics = (exp8Summary?.metrics ?? {}) as Record<string, unknown>;
    const tolZero = typeof metrics.tol_zero === "number" ? metrics.tol_zero : undefined;
    const tolResidual = typeof metrics.tol_residual === "number" ? metrics.tol_residual : undefined;
    return <Exp8Chart data={data.experiment_8} tolZero={tolZero} tolResidual={tolResidual} />;
  };

  const renderExperiment10 = () => {
    const exp10 = data?.experiment_10;
    if (!exp10) {
      return (
        <div className="text-gray-500 p-8">
          No data for TRANS-1. Run <code className="font-mono text-amber-400">TRANS-1</code> via the experiment runner.
        </div>
      );
    }
    const summaryS = exp10.summary || {};
    const config = exp10.config;
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-4 text-sm text-amber-100">
          <div className="text-[10px] font-mono uppercase tracking-widest text-amber-300 mb-2">
            ζ-Direct experiment · Level-4 informational witness · does not vote
          </div>
          <p className="leading-relaxed">
            For each multiplicative base c (τ, √2, e, φ, plus a 1.0001 sanity baseline) and each k, this measures
            <span className="font-mono mx-1">|ζ(½+it) − ζ(½+i·c<sup>k</sup>·t)|</span>
            on a t-grid. If your gauge thesis held at the level of ζ itself, residuals would be 0. They are not — the value here is in <strong>quantifying</strong> the deviation, comparing bases, and confirming the experiment plumbing via the c=1.0001 baseline.
          </p>
          <p className="leading-relaxed mt-2 text-amber-200/80">
            <strong>Allowed:</strong> reading the residual statistics as a quantification of how far ζ is from gauge-invariance under each candidate transport. <strong>Disallowed:</strong> claiming any base is uniquely privileged, or that small residuals imply transport-invariance of the RH predicate.
          </p>
        </div>

        {config && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] font-mono text-gray-400 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>T₀ = <span className="text-amber-300">{config.T0}</span></div>
            <div>L = <span className="text-amber-300">{config.L}</span></div>
            <div>M = <span className="text-amber-300">{config.M}</span></div>
            <div>dps = <span className="text-amber-300">{config.dps}</span></div>
            <div className="col-span-2 md:col-span-2">bases: <span className="text-amber-300">{(config.bases ?? []).join(", ")}</span></div>
            <div className="col-span-2 md:col-span-2">k: <span className="text-amber-300">{(config.k_values ?? []).join(", ")}</span></div>
            {summaryS.tau_max_k1 !== undefined && (
              <div className="col-span-2">τ max@k=1: <span className="text-emerald-400">{summaryS.tau_max_k1.toExponential(3)}</span></div>
            )}
            {summaryS.sanity_baseline_max_k1 !== undefined && (
              <div className="col-span-2">baseline max@k=1: <span className="text-slate-300">{summaryS.sanity_baseline_max_k1.toExponential(3)}</span></div>
            )}
            {summaryS.sanity_baseline_ratio !== undefined && (
              <div className="col-span-2 md:col-span-4">baseline / τ ratio: <span className="text-slate-300">{summaryS.sanity_baseline_ratio.toExponential(2)}</span> (small ratio = baseline working as expected; large ratio = experiment plumbing issue)</div>
            )}
          </div>
        )}

        <ZetaTransportChart data={exp10} />
      </div>
    );
  };

  const renderExperiment9 = () => {
    const exp9 = data?.experiment_9;
    const samples = exp9?.samples ?? [];
    if (!exp9 || samples.length === 0) {
      return <div className="text-gray-500 p-8">No data for DEMO-1</div>;
    }
    const windowLo = exp9.target_window?.lo ?? 10;
    const windowHi = exp9.target_window?.hi ?? 1000;
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-violet-500/20 bg-violet-950/20 p-4 text-sm text-violet-100">
          <div className="text-[10px] font-mono uppercase tracking-widest text-violet-300 mb-2">
            Demonstration only
          </div>
          <p className="leading-relaxed">
            EXP 9 shows the integer scale shift that would move sampled zero heights into the bounded
            window [{windowLo}, {windowHi}] if exact transport holds. It is not a witness for transport.
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 text-gray-400 uppercase font-mono">
              <tr>
                <th className="px-3 py-2">Index</th>
                <th className="px-3 py-2">Gamma</th>
                <th className="px-3 py-2">k required</th>
                <th className="px-3 py-2">Image height</th>
                <th className="px-3 py-2">In window</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((sample) => (
                <tr key={sample.index} className="border-t border-white/5 text-gray-200">
                  <td className="px-3 py-2 font-mono">{sample.index}</td>
                  <td className="px-3 py-2 font-mono">{sample.gamma.toExponential(6)}</td>
                  <td className="px-3 py-2 font-mono">{sample.k_required}</td>
                  <td className="px-3 py-2 font-mono">{sample.gamma_image.toFixed(6)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={clsx(
                        "rounded border px-2 py-0.5 font-mono text-[10px]",
                        sample.in_window
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-300",
                      )}
                    >
                      {sample.in_window ? "yes" : "no"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // MAIN UI
  // --------------------------------------------------------------------------

  // Experiment Config State
  const [expConfig, setExpConfig] = useState<ExperimentConfig>({
      runPreset: "custom",
      selectedExperiments: [],
      zeroSource: "generated",
      dps: 50,
      resolution: 500,
      xStart: 2,
      xEnd: 50,
      betaOffset: 0.0001,
      kPower: -20,
      primeMinCount: 0,
      primeTargetCount: 0,
  });
  const program1Tabs = EXPERIMENT_TABS.filter((tab) => tab.program === "PROGRAM_1");
  const program2Tabs = EXPERIMENT_TABS.filter((tab) => tab.program === "PROGRAM_2");
  const isProgram1Overview = pageViewMode === "PROGRAM_1_OVERVIEW";
  const isExperimentView = pageViewMode === "EXPERIMENT";
  const runControlsEnabled = deploymentCapabilities.run_controls_enabled;
  const isReadOnlyDeployment = deploymentCapabilities.read_only_deployment;
  const runActive = deriveRunActive({
    localStreamRunning: isRunning,
    attachedStatus: liveRunStatus,
  });
  const readOnlyMessage =
    "This hosted deployment is read-only. Fork/download from GitHub to run and verify experiments locally.";
  const heartbeatAgeSec = liveRunStatus?.progress?.heartbeat_at
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(liveRunStatus.progress.heartbeat_at).getTime()) / 1000),
      )
    : undefined;
  const sidebarLiveTelemetry: SidebarLiveTelemetry | null = activeRunId
    ? {
        runId: activeRunId,
        status: liveRunStatus?.status ?? (runActive ? "RUNNING" : "QUEUED"),
        phase: liveRunStatus?.progress?.phase,
        percent: liveRunStatus?.progress?.percent,
        elapsedSeconds: liveRunStatus?.progress?.elapsed_seconds,
        etaSeconds: liveRunStatus?.progress?.eta_seconds,
        heartbeatAgeSec,
        currentExperiment: liveRunStatus?.progress?.current_experiment,
        workers: asFiniteNumber(liveRunStatus?.run_config?.workers),
        primeMinCount: asFiniteNumber(liveRunStatus?.run_config?.prime_min_count),
        primeTargetCount: asFiniteNumber(liveRunStatus?.run_config?.prime_target_count),
        primeSource: liveRunStatus?.prime_source_info
          ? {
              sourceKind:
                typeof liveRunStatus.prime_source_info.source_kind === "string"
                  ? liveRunStatus.prime_source_info.source_kind
                  : undefined,
              loadedCount: asFiniteNumber(liveRunStatus.prime_source_info.loaded_count),
              maxPrime: asFiniteNumber(liveRunStatus.prime_source_info.max_prime),
              badRows: asFiniteNumber(liveRunStatus.prime_source_info.bad_rows),
            }
          : undefined,
        recentEvents: liveRunEvents.slice(-6).map((event) => ({
          id: `${event.run_id}:${event.index}`,
          phase: event.phase,
          state: event.state,
          message: event.message,
          percent: event.percent,
        })),
      }
    : null;

  const selectProgram1Overview = () => {
    setPageViewMode("PROGRAM_1_OVERVIEW");
  };

  const selectExperiment = (experimentId: ActiveExperiment) => {
    setActiveExp(experimentId);
    setPageViewMode("EXPERIMENT");
  };

  const renderTab = (exp: ExperimentTab) => {
    const isActive = isExperimentView && activeExp === exp.id;
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
        id={`nav-tab-${exp.id.toLowerCase()}`}
        data-exp-id={exp.id}
        data-program={exp.program}
        onClick={() => selectExperiment(exp.id)}
        className={clsx(
          "ui-nav-tab px-3 py-1.5 rounded text-xs font-mono transition-all border flex flex-col items-start min-w-[80px]",
          isActive ? activeClass : inactiveClass
        )}
      >
        <span className="font-bold leading-none">{exp.label}</span>
        <span className="text-[8px] opacity-60 leading-none mt-0.5">{exp.sub}</span>
      </button>
    );
  };

  return (
    <div id="app-shell" className="ui-app-shell flex flex-col h-screen bg-[#020408] text-gray-300 font-sans selection:bg-blue-500/30 selection:text-blue-200 overflow-hidden">
      
      {/* Top Navigation Bar */}
      <header id="top-header" className="ui-top-header h-16 border-b border-white/5 bg-[#05080f]/80 backdrop-blur-md flex items-center px-6 shrink-0 z-20 justify-between">
          <div id="header-left-group" className="ui-header-left flex items-center gap-6">
              <div id="header-brand" className="ui-header-brand shrink-0">
                  <h1 id="header-brand-title" className="font-gauss text-xl italic tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-emerald-200 leading-none">
                      RIEMANN
                      <span className="block text-[8px] not-italic font-mono text-blue-400 tracking-[0.3em] mt-0.5">INTERFEROMETER</span>
                  </h1>
              </div>

              <div id="header-brand-divider" className="h-8 w-px bg-white/10 mx-2"></div>

              {/* Navigation Tabs */}
              <nav id="header-experiment-nav" className="ui-header-nav flex items-center gap-2 overflow-x-auto scrollbar-none mask-fade-right">
                  <div id="header-program-1-group" className="ui-nav-program-group ui-nav-program-1 flex items-center gap-1.5">
                      <button
                          type="button"
                          id="header-program-1-label"
                          onClick={selectProgram1Overview}
                          aria-pressed={isProgram1Overview}
                          className={clsx(
                              "ui-nav-program-label text-[9px] uppercase tracking-wider font-mono px-2 py-1 rounded border whitespace-nowrap transition-colors",
                              isProgram1Overview
                                  ? "ui-nav-program-label-active text-blue-100 border-blue-400/50 bg-blue-900/40"
                                  : "text-blue-300/80 border-blue-500/20 bg-blue-900/10 hover:bg-blue-900/20 hover:text-blue-200"
                          )}
                      >
                          Program 1
                      </button>
                      {program1Tabs.map(renderTab)}
                  </div>
                  <div id="header-program-divider" className="h-6 w-px bg-white/10 shrink-0" />
                  <div id="header-program-2-group" className="ui-nav-program-group ui-nav-program-2 flex items-center gap-1.5">
                      <span id="header-program-2-label" className="ui-nav-program-label text-[9px] uppercase tracking-wider font-mono text-purple-300/80 px-2 py-1 rounded border border-purple-500/20 bg-purple-900/10 whitespace-nowrap">
                          Program 2 exploratory
                      </span>
                      {program2Tabs.map(renderTab)}
                  </div>
              </nav>
          </div>

           {/* Status Indicators (Right Side of Header) */}
           <div id="header-right-group" className="ui-header-right flex items-center gap-4">
              <div id="header-run-status" className="ui-header-run-status flex items-center gap-2 text-[10px] font-mono text-gray-500 bg-black/40 px-3 py-1 rounded-full border border-white/5">
                  <Activity size={12} className={clsx(runActive ? "text-green-400 animate-pulse" : "text-gray-600")} />
                  <span id="header-run-status-label">{runActive ? "ENGINE ACTIVE" : "SYSTEM IDLE"}</span>
              </div>
          </div>
      </header>

      {/* Main Content Area */}
      <div id="main-layout" className="ui-main-layout flex flex-1 overflow-hidden relative">
          
          <main id="main-content" className="ui-main-content flex-1 min-w-0 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-black">
              {/* Error / Status Messages */}
              {loading && (
                  <div id="loading-state" className="ui-loading-state flex items-center justify-center p-12 text-blue-400 font-mono animate-pulse">
                      <Microscope className="animate-bounce mr-2" />
                      LOADING EXPERIMENT DATA...
                  </div>
              )}

              {/* Experiment Views */}
              {!loading && (
                  <div
                      id="experiment-views"
                      className="ui-experiment-views max-w-[1600px] mx-auto space-y-6"
                      data-view-mode={pageViewMode}
                  >
                      {isReadOnlyDeployment && (
                          <section
                              id="read-only-banner-section"
                              className="ui-section ui-read-only-banner rounded-lg border border-amber-500/40 bg-amber-900/20 px-4 py-3 text-amber-100"
                          >
                              <div className="text-[10px] font-mono uppercase tracking-widest text-amber-300">
                                  Hosted deployment mode
                              </div>
                              <p className="mt-1 text-sm leading-relaxed">
                                  {readOnlyMessage}
                              </p>
                          </section>
                      )}

                      {isProgram1Overview && (
                          <>
                      {/* Proof Program Map leads: theorem target + obligation ladder + open gaps.
                         PROOF_TARGET.md is the canonical theorem-facing doc; this surface
                         mirrors it. */}
                      <section id="proof-program-section" className="ui-section ui-proof-program-section">
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
                      </section>

                      {/* Ontology / role glossary layer. Subordinate to the theorem target above. */}
                      <section id="intro-panel-section" className="ui-section ui-intro-section">
                          <IntroPanel />
                      </section>

                      {/* Named open-gaps surface (PROOF_PROGRAM_SPEC.md §11). */}
                      <section id="open-gaps-section" className="ui-section ui-open-gaps-section">
                          <OpenGapsPanel
                              id="open-gaps-panel"
                              openGaps={data?.summary?.proof_program?.open_gaps}
                          />
                      </section>

                          </>
                      )}

                      {isExperimentView && (
                          <>
                      {/* Canonical trail: obligation + implementation-health flips. */}
                      <section id="history-section" className="ui-section ui-history-section">
                          <VerdictHistoryPanel />
                      </section>

                      {/* Header for Active View */}
                      {(() => {
                        const activeVerdict = getExperimentVerdict(activeExp.replace("EXP", "EXP_"));
                        return (
                          <section id="active-experiment-header" className="ui-section ui-active-experiment-header space-y-3 border-b border-white/5 pb-4 mb-6" data-active-exp={activeExp}>
                            <div className="flex items-center justify-between">
                              <div>
                                <h2 className="text-2xl font-light text-white flex items-center gap-3">
                                  {activeExp === "EXP0" && <><Lightbulb className="text-emerald-400" /> ZETA-0 CRITICAL LINE POLAR TRACE</>}
                                  {activeExp === "EXP1" && <><Scale className="text-blue-500" /> CORE-1 RIEMANN CONVERTER</>}
                                  {activeExp === "EXP1B" && <><GitBranch className="text-purple-500" /> CTRL-1 OPERATOR SCALING CONTROL</>}
                                  {activeExp === "EXP1C" && <><RotateCcw className="text-emerald-500" /> NOTE-1 ZERO-REUSE NOTE</>}
                                  {activeExp === "EXP2" && <><Activity className="text-red-500" /> P2-1 ROGUE CENTRIFUGE</>}
                                  {activeExp === "EXP2B" && <><Microscope className="text-emerald-500" /> P2-2 ROGUE ISOLATION</>}
                                  {activeExp === "EXP3" && <><AlertTriangle className="text-pink-500" /> CTRL-2 BETA COUNTERFACTUAL CONTROL</>}
                                  {activeExp === "EXP4" && <><RotateCcw className="text-orange-500" /> PATH-1 TRANSLATION / DILATION</>}
                                  {activeExp === "EXP5" && <><CheckCircle2 className="text-cyan-500" /> PATH-2 ZERO CORRESPONDENCE</>}
                                  {activeExp === "EXP6" && <><Activity className="text-yellow-500" /> VAL-1 BETA STABILITY</>}
                                  {activeExp === "EXP7" && <><Scale className="text-indigo-500" /> P2-3 CALIBRATED AMPLIFICATION</>}
                                  {activeExp === "EXP8" && <><RotateCcw className="text-emerald-500" /> REG-1 SCALED-ZETA REGRESSION</>}
                                  {activeExp === "EXP9" && <><Lightbulb className="text-violet-500" /> DEMO-1 BOUNDED VIEW</>}
                                  {activeExp === "EXP10" && <><Activity className="text-amber-400" /> TRANS-1 ZETA GAUGE TRANSPORT</>}
                                </h2>
                                <div className="flex gap-2 mt-2">
                                  {getVerdictBadge(activeVerdict)}
                                </div>
                              </div>

                              {/* Active K toggles embedded in the CORE-1 / CTRL-1 / NOTE-1 header */}
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
                          </section>
                        );
                      })()}

                      <section id="active-experiment-body" className="ui-section ui-active-experiment-body" data-active-exp={activeExp}>
                          {activeExp === "EXP0" && renderExperiment0()}
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
                          {activeExp === "EXP9" && renderExperiment9()}
                          {activeExp === "EXP10" && renderExperiment10()}
                      </section>

                      {/* Log Console (Bottom of View) */}
                      <section id="execution-logs-section" className="ui-section ui-execution-logs-section mt-12 border-t border-white/10 pt-6">
                          <h3 id="execution-logs-title" className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-2">
                              <Activity size={12} /> Execution Logs
                          </h3>
                          <div id="execution-logs-panel" className="bg-black/50 rounded-lg border border-white/10 p-4 font-mono text-[10px] h-48 overflow-y-auto text-gray-400">
                              {logs.length === 0 && <span className="opacity-30 italic">System Ready. Awaiting Command.</span>}
                              {logs.map((line, i) => (
                                  <div key={i} className="whitespace-pre-wrap">{line}</div>
                              ))}
                              <div ref={logEndRef} />
                          </div>
                      </section>

                          </>
                      )}

                  </div>
              )}
          </main>

          {/* Right Sidebar (Config) - Included in the Flex Row */}
          <aside id="experiment-sidebar-section" className="ui-sidebar-section h-full min-h-0 shrink-0">
              <ExperimentSidebar
                config={expConfig}
                onConfigChange={setExpConfig}
                onRun={() => runExperiment(expConfig)}
                isRunning={runActive}
                runControlsEnabled={runControlsEnabled}
                readOnlyMessage={readOnlyMessage}
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
                liveTelemetry={sidebarLiveTelemetry}
              />
          </aside>
      
      </div>
    </div>
  );
}

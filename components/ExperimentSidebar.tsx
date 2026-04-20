
import React, { useState } from 'react';
import {
    Settings,
    ChevronRight,
    ChevronLeft,
    ChevronDown,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    HelpCircle,
    Compass,
    Key,
    Radar,
    Shield,
    Lightbulb,
} from 'lucide-react';
import clsx from 'clsx';
import type { ExperimentRole, FidelityTier, StageVerdict, TheoryStage } from "../lib/types";

// Mirrors verifier.ROLE_MAP. Drives the per-row role glyph so reviewers can
// tell at a glance whether an experiment is an enabler, pathfinder, detector,
// or falsification control — orthogonal to the stage grouping.
const ROLE_MAP: { [summaryKey: string]: ExperimentRole } = {
    EXP_1:  "ENABLER",
    EXP_1B: "FALSIFICATION_CONTROL",
    EXP_1C: "ENABLER",
    EXP_2:  "DETECTOR",
    EXP_2B: "DETECTOR",
    EXP_3:  "FALSIFICATION_CONTROL",
    EXP_4:  "PATHFINDER",
    EXP_5:  "PATHFINDER",
    EXP_6:  "ENABLER",
    EXP_7:  "DETECTOR",
    EXP_8:  "ENABLER",
};

const roleGlyph = (role: ExperimentRole | undefined) => {
    switch (role) {
        case "ENABLER":
            return { icon: <Key size={10} />, label: "Enabler", cls: "text-emerald-400/80" };
        case "PATHFINDER":
            return { icon: <Compass size={10} />, label: "Pathfinder", cls: "text-cyan-400/80" };
        case "DETECTOR":
            return { icon: <Radar size={10} />, label: "Detector", cls: "text-indigo-400/80" };
        case "FALSIFICATION_CONTROL":
            return { icon: <Shield size={10} />, label: "Falsification Control", cls: "text-pink-400/80" };
        default:
            return { icon: <Lightbulb size={10} />, label: "Unknown role", cls: "text-gray-500" };
    }
};

export interface ExperimentConfig {
    selectedExperiments: string[];
    zeroSource: string; // "generated" | "file:..."
    zeroCount?: number;
    dps?: number;
    resolution?: number;
    xStart?: number;
    xEnd?: number;
    betaOffset?: number;
    kPower?: number;
}

// Sidebar experiment list, grouped by the Gauge -> Lattice -> Brittleness
// theoretical stage ordering. Each group shows a rollup badge pulled from
// summary.stage_verdicts when the artifact is present.
interface SidebarExperiment {
    id: string;          // CLI id passed to --run
    label: string;
    summaryKey: string;  // key into summary.experiments (e.g. "EXP_1")
}

interface SidebarStageGroup {
    stage: TheoryStage;
    title: string;
    accent: string;
    experiments: SidebarExperiment[];
}

const STAGE_GROUPS: SidebarStageGroup[] = [
    {
        stage: "gauge",
        title: "Stage 1 · Gauge",
        accent: "blue",
        experiments: [
            { id: "1",  label: "EXP 1: Equivariance",         summaryKey: "EXP_1" },
            { id: "1b", label: "EXP 1B: Operator Gauge",      summaryKey: "EXP_1B" },
            { id: "6",  label: "EXP 6: Critical Line Drift",  summaryKey: "EXP_6" },
        ],
    },
    {
        stage: "lattice",
        title: "Stage 2 · Lattice",
        accent: "emerald",
        experiments: [
            { id: "1c", label: "EXP 1C: Zero Scaling",        summaryKey: "EXP_1C" },
            { id: "4",  label: "EXP 4: Translation/Dilation", summaryKey: "EXP_4" },
            { id: "5",  label: "EXP 5: Zero Correspondence",  summaryKey: "EXP_5" },
            { id: "8",  label: "EXP 8: Scaled-Zeta Eq.",      summaryKey: "EXP_8" },
        ],
    },
    {
        stage: "brittleness",
        title: "Stage 3 · Brittleness",
        accent: "red",
        experiments: [
            { id: "2",  label: "EXP 2: Centrifuge",           summaryKey: "EXP_2" },
            { id: "2b", label: "EXP 2B: Rogue Isolation",     summaryKey: "EXP_2B" },
            { id: "7",  label: "EXP 7: Centrifuge Fix",       summaryKey: "EXP_7" },
        ],
    },
    {
        stage: "control",
        title: "Control",
        accent: "pink",
        experiments: [
            { id: "3",  label: "EXP 3: Falsification (β=π)",  summaryKey: "EXP_3" },
        ],
    },
];

// Unified palette for both stage-level theory_fit values and legacy mechanical
// status values. Green = theory-supporting, red = theory-refuting (incl. the
// serious CONTROL_BROKEN case), amber = partial/candidate/inconclusive.
const stageBadgeStyle = (status: string | undefined) => {
    switch (status) {
        case "SUPPORTS":
        case "PASS":
            return { cls: "text-emerald-300 bg-emerald-900/30 border-emerald-500/40", icon: <CheckCircle2 size={10} /> };
        case "REFUTES":
        case "CONTROL_BROKEN":
        case "FAIL":
            return { cls: "text-red-300 bg-red-900/30 border-red-500/40", icon: <XCircle size={10} /> };
        case "INFORMATIVE":
            return { cls: "text-cyan-300 bg-cyan-900/30 border-cyan-500/40", icon: <Compass size={10} /> };
        case "CANDIDATE":
        case "NOTEWORTHY":
        case "PARTIAL":
            return { cls: "text-amber-300 bg-amber-900/30 border-amber-500/40", icon: <AlertTriangle size={10} /> };
        case "INCONCLUSIVE":
        case "WARN":
        case "INSUFFICIENT_DATA":
        case "INSUFFICIENT_SEPARATION":
            return { cls: "text-amber-300 bg-amber-900/20 border-amber-500/30", icon: <AlertTriangle size={10} /> };
        case "SKIP":
        case undefined:
            return { cls: "text-gray-500 bg-gray-800/40 border-white/10", icon: <HelpCircle size={10} /> };
        default:
            return { cls: "text-gray-400 bg-gray-800/40 border-white/10", icon: <HelpCircle size={10} /> };
    }
};

const ZERO_SOURCES = [
    { id: "generated", label: "Generated ( Riemann-Siegel )", path: "generated" },
    { id: "odlyzko_100k", label: "Odlyzko (100k Zeros)", path: "file:agent_context/zeros_100K_three_ten_power_neg_nine.gz" },
];

interface Props {
    config: ExperimentConfig;
    onConfigChange: (newConfig: ExperimentConfig) => void;
    onRun: () => void;
    isRunning: boolean;
    stageVerdicts?: { [stage: string]: StageVerdict };
    experimentStatuses?: { [summaryKey: string]: string | undefined };
    fidelityTier?: FidelityTier;
    provisionalExperiments?: Set<string>;
}

export default function ExperimentSidebar({
    config,
    onConfigChange,
    onRun,
    isRunning,
    stageVerdicts,
    experimentStatuses,
    fidelityTier,
    provisionalExperiments,
}: Props) {
    const [isOpen, setIsOpen] = useState(true);
    const [collapsedStages, setCollapsedStages] = useState<Record<TheoryStage, boolean>>({
        gauge: false,
        lattice: false,
        brittleness: false,
        control: true,
    });
    const zeroSourceId = ZERO_SOURCES.find((z) => z.path === config.zeroSource)?.id || "generated";

    const toggleStage = (stage: TheoryStage) => {
        setCollapsedStages((prev) => ({ ...prev, [stage]: !prev[stage] }));
    };

    const handleChange = (partial: Partial<ExperimentConfig>) => {
        onConfigChange({ ...config, ...partial });
    };

    const handleSourceChange = (id: string) => {
        const path = ZERO_SOURCES.find(z => z.id === id)?.path || "generated";
        handleChange({ zeroSource: path });
    };
    
    // Smart Validation Messages
    const getPrecisionWarning = () => {
        if (config.zeroSource.startsWith("file:") && (config.dps || 50) < 50) {
            return "Odlyzko files have high precision. Lowering DPS below 50 significantly reduces accuracy.";
        }
        if ((config.dps || 50) < 30) {
            return "Tau is irrational. Low precision (<30) causes massive drift in Riemann Zeta calculations.";
        }
        return null;
    };

    // Collapse toggle
    if (!isOpen) {
        return (
            <div className="w-12 border-l border-white/5 bg-[#080c14] flex flex-col items-center py-4 gap-4 shrink-0 transition-all font-sans">
                <button onClick={() => setIsOpen(true)} className="p-2 hover:bg-white/5 rounded text-gray-400 hover:text-white">
                    <ChevronLeft size={20} />
                </button>
                <div className="writing-vertical-rl text-xs font-mono text-gray-500 tracking-widest uppercase rotate-180">
                    Configuration
                </div>
            </div>
        );
    }

    return (
        <aside className="w-80 border-l border-white/5 bg-[#080c14] flex flex-col shrink-0 transition-all font-mono text-xs overflow-hidden h-screen z-30 shadow-2xl">
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 bg-[#05080f] shrink-0">
                <div className="flex items-center gap-2 text-white font-bold tracking-wider">
                    <Settings size={14} className="text-blue-500" />
                    <span>CONFIGURATION</span>
                </div>
                <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white">
                    <ChevronRight size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                
                {/* 1. EXPERIMENT SELECTION -- grouped by theoretical stage. */}
                <section className="space-y-3">
                    <h3 className="text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-white/5 pb-1">Active Protocols</h3>
                    <div className="space-y-4">
                        {STAGE_GROUPS.map((group) => {
                            const rollup = stageVerdicts?.[group.stage];
                            const rollupStyle = stageBadgeStyle(rollup?.status);
                            const isCollapsed = collapsedStages[group.stage];
                            return (
                                <div key={group.stage} className="space-y-1">
                                    <button
                                        onClick={() => toggleStage(group.stage)}
                                        className="w-full flex items-center justify-between gap-2 px-1 py-1 text-left group"
                                    >
                                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-gray-400 group-hover:text-gray-200">
                                            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                            {group.title}
                                        </div>
                                        <span
                                            className={clsx(
                                                "text-[9px] font-mono px-2 py-0.5 rounded border flex items-center gap-1",
                                                rollupStyle.cls
                                            )}
                                            title={rollup?.reason ?? "No verdict yet"}
                                        >
                                            {rollupStyle.icon}
                                            {rollup?.status ?? "—"}
                                        </span>
                                    </button>
                                    {!isCollapsed && (
                                        <div className="space-y-1 pl-3 border-l border-white/5">
                                            {group.experiments.map((exp) => {
                                                const isSelected = config.selectedExperiments.includes(exp.id);
                                                const expStatus = experimentStatuses?.[exp.summaryKey];
                                                const expStyle = stageBadgeStyle(expStatus);
                                                const role = ROLE_MAP[exp.summaryKey];
                                                const roleInfo = roleGlyph(role);
                                                // Fidelity tag logic: mirrors the verifier clamp policy.
                                                //   SMOKE tier + ENABLER/DETECTOR -> "SMOKE-SUPPRESSED"
                                                //     (theory_fit was clamped to INCONCLUSIVE)
                                                //   STANDARD tier + this exp flagged provisional -> "PROVISIONAL"
                                                //   otherwise no tag
                                                const isFidelityClamped =
                                                    fidelityTier === "SMOKE" &&
                                                    (role === "ENABLER" || role === "DETECTOR");
                                                const isProvisional =
                                                    !!provisionalExperiments?.has(exp.summaryKey);
                                                const fidelityTag = isFidelityClamped
                                                    ? {
                                                          label: "SMOKE",
                                                          title:
                                                              "SMOKE tier: theory verdict suppressed below declared fidelity floor.",
                                                          cls: "text-gray-400 bg-gray-800/60 border-white/10",
                                                      }
                                                    : isProvisional
                                                    ? {
                                                          label: "PROV",
                                                          title:
                                                              "STANDARD tier: ENABLER verdict is provisional; cite AUTHORITATIVE only.",
                                                          cls: "text-amber-300 bg-amber-900/20 border-amber-500/30",
                                                      }
                                                    : null;
                                                return (
                                                    <label
                                                        key={exp.id}
                                                        className={clsx(
                                                            "flex items-center gap-2 p-2 rounded cursor-pointer transition-colors border",
                                                            isSelected
                                                                ? "bg-blue-900/20 border-blue-500/30"
                                                                : "hover:bg-white/5 border-transparent"
                                                        )}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                const prev = config.selectedExperiments.filter((x) => x !== "all");
                                                                const next = checked
                                                                    ? [...prev, exp.id]
                                                                    : prev.filter((x) => x !== exp.id);
                                                                handleChange({ selectedExperiments: next });
                                                            }}
                                                            className="rounded border-gray-600 bg-black/50 text-blue-500 focus:ring-0 focus:ring-offset-0 w-3 h-3"
                                                        />
                                                        <span
                                                            className={clsx("shrink-0", roleInfo.cls)}
                                                            title={`Role: ${roleInfo.label}`}
                                                        >
                                                            {roleInfo.icon}
                                                        </span>
                                                        <span
                                                            className={clsx(
                                                                "text-xs flex-1",
                                                                isSelected ? "text-blue-200 font-bold" : "text-gray-400"
                                                            )}
                                                        >
                                                            {exp.label}
                                                        </span>
                                                        {fidelityTag && (
                                                            <span
                                                                className={clsx(
                                                                    "text-[8px] font-mono px-1 py-0.5 rounded border tracking-tight",
                                                                    fidelityTag.cls
                                                                )}
                                                                title={fidelityTag.title}
                                                            >
                                                                {fidelityTag.label}
                                                            </span>
                                                        )}
                                                        {expStatus && (
                                                            <span
                                                                className={clsx(
                                                                    "text-[9px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-0.5",
                                                                    expStyle.cls
                                                                )}
                                                                title={expStatus}
                                                            >
                                                                {expStyle.icon}
                                                            </span>
                                                        )}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* 2. ZERO SOURCE */}
                <section className="space-y-3">
                    <h3 className="text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-white/5 pb-1">Zero Source</h3>
                    <div className="space-y-2">
                        {ZERO_SOURCES.map(src => (
                            <label key={src.id} className="flex items-center gap-2 cursor-pointer group">
                                <div className={clsx("w-3 h-3 rounded-full border flex items-center justify-center", 
                                    zeroSourceId === src.id ? "border-purple-500" : "border-gray-600 group-hover:border-gray-400"
                                )}>
                                    {zeroSourceId === src.id && <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>}
                                </div>
                                <input 
                                    type="radio" 
                                    name="zero_source"
                                    checked={zeroSourceId === src.id}
                                    onChange={() => handleSourceChange(src.id)}
                                    className="hidden"
                                />
                                <span className={clsx("text-xs", zeroSourceId === src.id ? "text-purple-200" : "text-gray-400")}>{src.label}</span>
                            </label>
                        ))}
                    </div>
                    {/* Zero Count Override */}
                    <div className="flex items-center justify-between pt-2">
                        <label className="text-gray-500 text-[10px]">Count Override</label>
                        <input 
                            type="number"
                            placeholder="Default"
                            value={config.zeroCount || ''}
                            onChange={(e) => handleChange({ zeroCount: e.target.value ? parseInt(e.target.value) : undefined })}
                            className="w-20 bg-black/40 border border-white/10 rounded px-2 py-1 text-right text-gray-300 focus:border-purple-500/50 outline-none hover:bg-black/60 transition-colors"
                        />
                    </div>
                </section>

                {/* 3. SIMULATION FIDELITY */}
                <section className="space-y-4">
                    <h3 className="text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-white/5 pb-1">Simulation Fidelity</h3>
                    
                    {/* Precision Slider */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="text-gray-400">Precision (DPS)</span>
                            <span className={clsx("font-bold", (config.dps || 50) > 60 ? "text-purple-400" : "text-blue-400")}>{config.dps || 50}</span>
                        </div>
                        <input 
                            type="range" min="15" max="150" step="5"
                            value={config.dps || 50}
                            onChange={(e) => handleChange({ dps: parseInt(e.target.value) })}
                            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-blue-400"
                        />
                        {getPrecisionWarning() && (
                            <div className="bg-amber-900/20 border border-amber-500/30 p-2 rounded text-amber-200 text-[10px] leading-tight flex gap-2 animate-in fade-in duration-300">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                {getPrecisionWarning()}
                            </div>
                        )}
                    </div>

                     {/* Resolution */}
                     <div className="flex items-center justify-between pt-2">
                        <label className="text-gray-400 text-[10px]">Resolution (Pts)</label>
                        <input 
                            type="number"
                            value={config.resolution || 500}
                            onChange={(e) => handleChange({ resolution: parseInt(e.target.value) })}
                             className="w-20 bg-black/40 border border-white/10 rounded px-2 py-1 text-right text-gray-300 focus:border-blue-500/50 outline-none hover:bg-black/60 transition-colors"
                        />
                    </div>
                </section>

                {/* 4. VISUAL WINDOW */}
                 <section className="space-y-3">
                    <h3 className="text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-white/5 pb-1">Evaluation Window</h3>
                    <div className="grid grid-cols-2 gap-3">
                         <div className="space-y-1">
                            <label className="text-gray-500 text-[10px] block">Start (X)</label>
                            <input 
                                type="number"
                                value={config.xStart ?? 2}
                                onChange={(e) => handleChange({ xStart: parseFloat(e.target.value) })}
                                className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-gray-300 focus:border-blue-500/50 outline-none text-center"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-gray-500 text-[10px] block">End (X)</label>
                            <input 
                                type="number"
                                value={config.xEnd ?? 50}
                                onChange={(e) => handleChange({ xEnd: parseFloat(e.target.value) })}
                                className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-gray-300 focus:border-blue-500/50 outline-none text-center"
                            />
                        </div>
                    </div>
                </section>

                {/* 5. DEEP PHYSICS (New) */}
                <section className="space-y-4 pt-2">
                     <h3 className="text-purple-400 font-bold uppercase text-[10px] tracking-wider border-b border-purple-500/20 pb-1">Deep Physics (Exp 2/7)</h3>
                     
                     <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="text-gray-400">Beta Offset</span>
                            <span className="text-purple-300">{config.betaOffset || 0.0001}</span>
                        </div>
                        <input 
                            type="range" min="0.00001" max="0.001" step="0.00001"
                            value={config.betaOffset || 0.0001}
                            onChange={(e) => handleChange({ betaOffset: parseFloat(e.target.value) })}
                             className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-purple-400"
                        />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                        <label className="text-gray-400 text-[10px]">Centrifuge Power (k)</label>
                        <input 
                            type="number"
                            value={config.kPower || -20}
                            onChange={(e) => handleChange({ kPower: parseInt(e.target.value) })}
                             className="w-20 bg-black/40 border border-white/10 rounded px-2 py-1 text-right text-purple-300 focus:border-purple-500/50 outline-none hover:bg-black/60 transition-colors"
                        />
                    </div>
                </section>

            </div>

             <div className="p-4 border-t border-white/5 bg-[#080c14] shrink-0">
                <button 
                    onClick={onRun}
                    disabled={isRunning}
                    className={clsx(
                        "w-full py-3 rounded-lg font-bold text-xs tracking-widest transition-all shadow-lg flex items-center justify-center gap-2",
                        isRunning 
                            ? "bg-gray-800 text-gray-500 cursor-not-allowed border border-transparent"
                            : "bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-blue-500/50 text-blue-200 hover:bg-blue-800/50 hover:border-blue-400 hover:text-white hover:shadow-blue-900/30"
                    )}
                >
                    {isRunning ? "PROCESSING..." : "EXECUTE PROTOCOL"}
                </button>
            </div>
        </aside>
    );
}

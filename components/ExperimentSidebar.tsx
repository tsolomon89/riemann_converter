
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
    Microscope,
    Wrench,
    BadgeCheck,
    LayoutList,
    Layers,
} from 'lucide-react';
import clsx from 'clsx';
import type {
    ExperimentClassification,
    ExperimentFunction,
    ExperimentRole,
    FidelityTier,
    ImplementationHealth,
    StageVerdict,
    TheoryStage,
} from "../lib/types";

// Fallback role map used only when an artifact predates Sprint 2a (i.e. does
// NOT include `meta.experiment_classification`). Post-migration the canonical
// source is `data.meta.experiment_classification[summaryKey].role`, written by
// verifier.py's _build_experiment_classification(). See PROOF_PROGRAM_SPEC.md
// Sprint 2a roadmap — "Unify the duplicated ROLE_MAP".
const ROLE_MAP_FALLBACK: { [summaryKey: string]: ExperimentRole } = {
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

function roleFor(
    summaryKey: string,
    classification: { [k: string]: ExperimentClassification } | undefined,
): ExperimentRole | undefined {
    const fromArtifact = classification?.[summaryKey]?.role;
    if (fromArtifact) return fromArtifact;
    return ROLE_MAP_FALLBACK[summaryKey];
}

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

// Flat source-of-truth list of every experiment the CLI knows about. Stage
// and function assignments are NOT hardcoded here — they come from
// `data.meta.experiment_classification` (emitted by verifier.py in Sprint 2a)
// with FALLBACK maps below used only for pre-migration artifacts. This
// single list is regrouped per render into function-grouped or stage-grouped
// views depending on the user's selected grouping mode.
interface SidebarExperiment {
    id: string;          // CLI id passed to --run
    label: string;
    summaryKey: string;  // key into summary.experiments (e.g. "EXP_1")
}

const ALL_EXPERIMENTS: SidebarExperiment[] = [
    { id: "1",  label: "EXP 1: Equivariance",         summaryKey: "EXP_1"  },
    { id: "1b", label: "EXP 1B: Operator Gauge",      summaryKey: "EXP_1B" },
    { id: "1c", label: "EXP 1C: Zero Scaling",        summaryKey: "EXP_1C" },
    { id: "2",  label: "EXP 2: Centrifuge",           summaryKey: "EXP_2"  },
    { id: "2b", label: "EXP 2B: Rogue Isolation",     summaryKey: "EXP_2B" },
    { id: "3",  label: "EXP 3: Falsification (β=π)",  summaryKey: "EXP_3"  },
    { id: "4",  label: "EXP 4: Translation/Dilation", summaryKey: "EXP_4"  },
    { id: "5",  label: "EXP 5: Zero Correspondence",  summaryKey: "EXP_5"  },
    { id: "6",  label: "EXP 6: Critical Line Drift",  summaryKey: "EXP_6"  },
    { id: "7",  label: "EXP 7: Centrifuge Fix",       summaryKey: "EXP_7"  },
    { id: "8",  label: "EXP 8: Scaled-Zeta Eq.",      summaryKey: "EXP_8"  },
];

// Fallback maps consulted only when `data.meta.experiment_classification` is
// missing (old artifact). Keep in sync with verifier.FUNCTION_MAP / STAGE_MAP.
const FUNCTION_FALLBACK: Record<string, ExperimentFunction> = {
    EXP_1:  "COHERENCE_WITNESS",
    EXP_1B: "CONTROL",
    EXP_1C: "COHERENCE_WITNESS",
    EXP_2:  "EXPLORATORY",
    EXP_2B: "EXPLORATORY",
    EXP_3:  "CONTROL",
    EXP_4:  "PATHFINDER",
    EXP_5:  "PATHFINDER",
    EXP_6:  "PROOF_OBLIGATION_WITNESS",
    EXP_7:  "EXPLORATORY",
    EXP_8:  "REGRESSION_CHECK",
};

const STAGE_FALLBACK: Record<string, TheoryStage> = {
    EXP_1:  "gauge",
    EXP_1B: "gauge",
    EXP_6:  "gauge",
    EXP_1C: "lattice",
    EXP_4:  "lattice",
    EXP_5:  "lattice",
    EXP_8:  "lattice",
    EXP_2:  "brittleness",
    EXP_2B: "brittleness",
    EXP_7:  "brittleness",
    EXP_3:  "control",
};

function functionFor(
    summaryKey: string,
    classification: { [k: string]: ExperimentClassification } | undefined,
): ExperimentFunction {
    return (
        classification?.[summaryKey]?.function ??
        FUNCTION_FALLBACK[summaryKey] ??
        "EXPLORATORY"
    );
}

function stageFor(
    summaryKey: string,
    classification: { [k: string]: ExperimentClassification } | undefined,
): TheoryStage {
    return (
        (classification?.[summaryKey]?.stage as TheoryStage | undefined) ??
        STAGE_FALLBACK[summaryKey] ??
        "gauge"
    );
}

// Function-grouped layout (primary mode, canonical per PROOF_PROGRAM_SPEC.md §8).
// Order is proof-directness descending: witnesses first, then controls and
// pathfinders, then regression plumbing, then Program-2 exploratory last.
const FUNCTION_GROUPS: Array<{
    key: ExperimentFunction;
    title: string;
    subtitle: string;
}> = [
    { key: "PROOF_OBLIGATION_WITNESS", title: "Proof-Obligation Witnesses", subtitle: "theorem-directed evidence" },
    { key: "COHERENCE_WITNESS",        title: "Coherence Witnesses",        subtitle: "showing the work" },
    { key: "CONTROL",                  title: "Controls",                   subtitle: "falsifier armed on known-bad" },
    { key: "PATHFINDER",               title: "Pathfinders",                subtitle: "direction selectors" },
    { key: "REGRESSION_CHECK",         title: "Regression Checks",          subtitle: "engine-health plumbing" },
    { key: "EXPLORATORY",              title: "Exploratory · Program 2",    subtitle: "not on proof-critical path" },
    { key: "THEOREM_STATEMENT",        title: "Theorem Statements",         subtitle: "rare / anchor only" },
];

const FUNCTION_ICON: Record<ExperimentFunction, React.ReactNode> = {
    THEOREM_STATEMENT:        <BadgeCheck size={12} />,
    PROOF_OBLIGATION_WITNESS: <Key size={12} />,
    COHERENCE_WITNESS:        <Microscope size={12} />,
    CONTROL:                  <Shield size={12} />,
    PATHFINDER:               <Compass size={12} />,
    REGRESSION_CHECK:         <Wrench size={12} />,
    EXPLORATORY:              <Lightbulb size={12} />,
};

// Stage-grouped layout (secondary mode, retained per spec §6 as a
// noncanonical navigation axis). Order matches the historical three-stage
// theory presentation plus the control row.
const STAGE_GROUPS_META: Array<{ key: TheoryStage; title: string; subtitle: string }> = [
    { key: "gauge",       title: "Gauge",       subtitle: "coordinate symmetry" },
    { key: "lattice",     title: "Lattice",     subtitle: "zero-scaling equivalence" },
    { key: "brittleness", title: "Brittleness", subtitle: "rogue-zero amplification" },
    { key: "control",     title: "Control",     subtitle: "falsification sanity" },
];

// Shape returned by buildGroups — one-size-fits-both-modes.
interface SidebarGroup {
    key: string;
    title: string;
    subtitle: string;
    icon?: React.ReactNode;
    experiments: SidebarExperiment[];
    rollupLabel: string;     // e.g. "IMPLEMENTATION_OK", "3 members", "—"
    rollupTooltip: string;
    rollupCls: string;
    rollupIcon: React.ReactNode;
}

// Rollup badge style for an ImplementationHealth status (non-theoretic).
// This is the canonical per-stage rollup under PROOF_PROGRAM_SPEC.md §6,
// replacing the deprecated stage-level theory rollup.
const healthBadgeStyle = (status: ImplementationHealth["status"] | undefined) => {
    switch (status) {
        case "IMPLEMENTATION_OK":
            return { cls: "text-emerald-300 bg-emerald-900/30 border-emerald-500/40", icon: <CheckCircle2 size={10} /> };
        case "IMPLEMENTATION_BROKEN":
            return { cls: "text-red-300 bg-red-900/30 border-red-500/40", icon: <XCircle size={10} /> };
        case "MIXED":
            return { cls: "text-amber-300 bg-amber-900/30 border-amber-500/40", icon: <AlertTriangle size={10} /> };
        case "NO_MEMBERS":
        case undefined:
            return { cls: "text-gray-500 bg-gray-800/40 border-white/10", icon: <HelpCircle size={10} /> };
        default:
            return { cls: "text-gray-400 bg-gray-800/40 border-white/10", icon: <HelpCircle size={10} /> };
    }
};

// Non-theoretic rollup synthesized from a function-group's member outcomes.
// CONSISTENT witnesses + IMPLEMENTATION_OK controls/regressions + DIRECTIONAL
// pathfinders count as "healthy"; IMPLEMENTATION_BROKEN is the red flag.
function rollupFromOutcomes(
    outcomes: Array<string | undefined>,
): ImplementationHealth["status"] {
    if (outcomes.length === 0) return "NO_MEMBERS";
    const broken = outcomes.some((o) => o === "IMPLEMENTATION_BROKEN" || o === "INCONSISTENT");
    if (broken) return "IMPLEMENTATION_BROKEN";
    const healthy = new Set([
        "IMPLEMENTATION_OK",
        "CONSISTENT",
        "DIRECTIONAL",
        "INCONCLUSIVE",
    ]);
    if (outcomes.every((o) => o !== undefined && healthy.has(o))) return "IMPLEMENTATION_OK";
    return "MIXED";
}

// Per-experiment status badge style (checkbox-row trailing indicator). Keeps
// the same color grammar as healthBadgeStyle for consistency.
const expStatusBadgeStyle = (outcome: string | undefined, rawTheoryFit: string | undefined) => {
    // Prefer canonical outcome vocabulary; fall back to deprecated theory_fit
    // values so older artifacts still render.
    const s = outcome ?? rawTheoryFit;
    switch (s) {
        // New canonical outcomes
        case "CONSISTENT":
        case "IMPLEMENTATION_OK":
        // Legacy theory_fit shim
        case "SUPPORTS":
        case "PASS":
            return { cls: "text-emerald-300 bg-emerald-900/30 border-emerald-500/40", icon: <CheckCircle2 size={10} /> };
        case "INCONSISTENT":
        case "IMPLEMENTATION_BROKEN":
        case "REFUTES":
        case "CONTROL_BROKEN":
        case "FAIL":
            return { cls: "text-red-300 bg-red-900/30 border-red-500/40", icon: <XCircle size={10} /> };
        case "DIRECTIONAL":
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
    /**
     * @deprecated PROOF_PROGRAM_SPEC.md §6: stage-level theory rollup is
     * forbidden. Retained as a one-release backward-compat prop; the sidebar
     * now uses `implementationHealth` instead.
     */
    stageVerdicts?: { [stage: string]: StageVerdict };
    /** Non-theoretic per-stage engine-health aggregate. Drives the stage-mode rollup badge. */
    implementationHealth?: { [stage: string]: ImplementationHealth };
    /** Map of summary key -> outcome/theory_fit for the trailing per-row badge. */
    experimentStatuses?: { [summaryKey: string]: string | undefined };
    fidelityTier?: FidelityTier;
    provisionalExperiments?: Set<string>;
    /**
     * Canonical classification table from data.meta.experiment_classification
     * (emitted by verifier.py starting Sprint 2a). Drives function/stage
     * assignment for every experiment; fallback maps above kick in only when
     * the artifact predates the migration.
     */
    experimentClassification?: { [summaryKey: string]: ExperimentClassification };
}

type GroupMode = "function" | "stage";

export default function ExperimentSidebar({
    config,
    onConfigChange,
    onRun,
    isRunning,
    stageVerdicts: _deprecatedStageVerdicts, // eslint-disable-line @typescript-eslint/no-unused-vars
    implementationHealth,
    experimentStatuses,
    fidelityTier,
    provisionalExperiments,
    experimentClassification,
}: Props) {
    const [isOpen, setIsOpen] = useState(true);
    const [groupMode, setGroupMode] = useState<GroupMode>("function");
    // Collapsed state is keyed by group-key string (function name or stage name),
    // so a single state object serves both modes.
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
        // Default: expand proof-directed groups, collapse exploratory + theorem_statement.
        EXPLORATORY: true,
        THEOREM_STATEMENT: true,
        // Legacy stage defaults (when user toggles to stage mode).
        control: true,
    });
    const zeroSourceId = ZERO_SOURCES.find((z) => z.path === config.zeroSource)?.id || "generated";

    const toggleGroup = (key: string) => {
        setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    // Build the groups array for the current mode. Both modes return
    // SidebarGroup[] so the render path is identical.
    const groups: SidebarGroup[] = React.useMemo(() => {
        if (groupMode === "function") {
            return FUNCTION_GROUPS
                .map<SidebarGroup | null>((g) => {
                    const members = ALL_EXPERIMENTS.filter(
                        (e) => functionFor(e.summaryKey, experimentClassification) === g.key,
                    );
                    if (members.length === 0) return null; // don't render empty groups (e.g. THEOREM_STATEMENT)
                    const outcomes = members.map((e) => experimentStatuses?.[e.summaryKey]);
                    const rollup = rollupFromOutcomes(outcomes);
                    const style = healthBadgeStyle(rollup);
                    return {
                        key: g.key,
                        title: g.title,
                        subtitle: g.subtitle,
                        icon: FUNCTION_ICON[g.key],
                        experiments: members,
                        rollupLabel: `${members.length}`,
                        rollupTooltip: `${rollup} · ${members.length} member${members.length === 1 ? "" : "s"}`,
                        rollupCls: style.cls,
                        rollupIcon: style.icon,
                    };
                })
                .filter((g): g is SidebarGroup => g !== null);
        }
        // Stage mode
        return STAGE_GROUPS_META.map<SidebarGroup>((g) => {
            const members = ALL_EXPERIMENTS.filter(
                (e) => stageFor(e.summaryKey, experimentClassification) === g.key,
            );
            const health = implementationHealth?.[g.key];
            const style = healthBadgeStyle(health?.status);
            return {
                key: g.key,
                title: g.title,
                subtitle: g.subtitle,
                experiments: members,
                rollupLabel: health?.status ? health.status.toLowerCase().replace(/_/g, " ") : "—",
                rollupTooltip: health?.reason ?? "no implementation-health data yet",
                rollupCls: style.cls,
                rollupIcon: style.icon,
            };
        });
    }, [groupMode, experimentClassification, experimentStatuses, implementationHealth]);

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
                
                {/* 1. EXPERIMENT SELECTION -- primary grouping by function
                    (canonical per PROOF_PROGRAM_SPEC.md §8); stage grouping
                    available as a secondary navigation toggle. */}
                <section className="space-y-3">
                    <div className="flex items-center justify-between border-b border-white/5 pb-1 gap-2">
                        <h3 className="text-gray-500 font-bold uppercase text-[10px] tracking-wider">Active Protocols</h3>
                        <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded border border-white/10">
                            <button
                                onClick={() => setGroupMode("function")}
                                className={clsx(
                                    "px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider flex items-center gap-1 transition-colors",
                                    groupMode === "function"
                                        ? "bg-blue-600/40 text-blue-200 border border-blue-500/40"
                                        : "text-gray-500 hover:text-gray-300 border border-transparent"
                                )}
                                title="Group experiments by their function in the proof program (canonical)"
                            >
                                <LayoutList size={10} /> function
                            </button>
                            <button
                                onClick={() => setGroupMode("stage")}
                                className={clsx(
                                    "px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider flex items-center gap-1 transition-colors",
                                    groupMode === "stage"
                                        ? "bg-gray-600/40 text-gray-200 border border-white/20"
                                        : "text-gray-500 hover:text-gray-300 border border-transparent"
                                )}
                                title="Group experiments by stage (navigation only; not a theory rollup)"
                            >
                                <Layers size={10} /> stage
                            </button>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {groups.map((group) => {
                            const isCollapsed = !!collapsed[group.key];
                            return (
                                <div key={group.key} className="space-y-1">
                                    <button
                                        onClick={() => toggleGroup(group.key)}
                                        className="w-full flex items-center justify-between gap-2 px-1 py-1 text-left group"
                                    >
                                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-gray-400 group-hover:text-gray-200 min-w-0">
                                            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                            {group.icon}
                                            <span className="truncate">{group.title}</span>
                                        </div>
                                        <span
                                            className={clsx(
                                                "text-[9px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 shrink-0",
                                                group.rollupCls
                                            )}
                                            title={group.rollupTooltip}
                                        >
                                            {group.rollupIcon}
                                            {group.rollupLabel}
                                        </span>
                                    </button>
                                    {!isCollapsed && (
                                        <>
                                            {group.subtitle && (
                                                <div className="pl-5 text-[9px] font-mono italic text-gray-600 leading-tight">
                                                    {group.subtitle}
                                                </div>
                                            )}
                                            <div className="space-y-1 pl-3 border-l border-white/5">
                                                {group.experiments.map((exp) => {
                                                    const isSelected = config.selectedExperiments.includes(exp.id);
                                                    const rawStatus = experimentStatuses?.[exp.summaryKey];
                                                    const expStyle = expStatusBadgeStyle(rawStatus, undefined);
                                                    const role = roleFor(exp.summaryKey, experimentClassification);
                                                    const roleInfo = roleGlyph(role);
                                                    const fn = functionFor(exp.summaryKey, experimentClassification);
                                                    // Fidelity tag: SMOKE suppresses WITNESS / EXPLORATORY outcomes
                                                    // (matches verifier.py fidelity_sensitive_functions). STANDARD
                                                    // tier flags PROOF_OBLIGATION_WITNESS as provisional.
                                                    const fidelitySensitive =
                                                        fn === "PROOF_OBLIGATION_WITNESS" ||
                                                        fn === "COHERENCE_WITNESS" ||
                                                        fn === "EXPLORATORY";
                                                    const isFidelityClamped =
                                                        fidelityTier === "SMOKE" && fidelitySensitive;
                                                    const isProvisional =
                                                        !!provisionalExperiments?.has(exp.summaryKey);
                                                    const fidelityTag = isFidelityClamped
                                                        ? {
                                                              label: "SMOKE",
                                                              title:
                                                                  "SMOKE tier: outcome suppressed below declared fidelity floor.",
                                                              cls: "text-gray-400 bg-gray-800/60 border-white/10",
                                                          }
                                                        : isProvisional
                                                        ? {
                                                              label: "PROV",
                                                              title:
                                                                  "STANDARD tier: proof-obligation witness is provisional; cite AUTHORITATIVE only.",
                                                              cls: "text-amber-300 bg-amber-900/20 border-amber-500/30",
                                                          }
                                                        : null;
                                                    // Secondary-axis chip: shows stage when in function mode, and
                                                    // function when in stage mode, so both axes are always visible.
                                                    const secondaryLabel =
                                                        groupMode === "function"
                                                            ? stageFor(exp.summaryKey, experimentClassification)
                                                            : fn
                                                                  .toLowerCase()
                                                                  .replace(/_/g, " ");
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
                                                                title={`Role: ${roleInfo.label} · Function: ${fn}`}
                                                            >
                                                                {roleInfo.icon}
                                                            </span>
                                                            <div className="flex-1 min-w-0">
                                                                <div
                                                                    className={clsx(
                                                                        "text-xs truncate",
                                                                        isSelected ? "text-blue-200 font-bold" : "text-gray-400"
                                                                    )}
                                                                >
                                                                    {exp.label}
                                                                </div>
                                                                <div className="text-[8px] font-mono text-gray-600 uppercase tracking-wider truncate">
                                                                    {secondaryLabel}
                                                                </div>
                                                            </div>
                                                            {fidelityTag && (
                                                                <span
                                                                    className={clsx(
                                                                        "text-[8px] font-mono px-1 py-0.5 rounded border tracking-tight shrink-0",
                                                                        fidelityTag.cls
                                                                    )}
                                                                    title={fidelityTag.title}
                                                                >
                                                                    {fidelityTag.label}
                                                                </span>
                                                            )}
                                                            {rawStatus && (
                                                                <span
                                                                    className={clsx(
                                                                        "text-[9px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-0.5 shrink-0",
                                                                        expStyle.cls
                                                                    )}
                                                                    title={rawStatus}
                                                                >
                                                                    {expStyle.icon}
                                                                </span>
                                                            )}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </>
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

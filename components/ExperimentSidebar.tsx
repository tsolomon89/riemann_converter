
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
    EXP_0:  "DEMONSTRATION",
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
    EXP_9:  "DEMONSTRATION",
    EXP_10: "PATHFINDER",
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
        case "DEMONSTRATION":
            return { icon: <Lightbulb size={10} />, label: "Demonstration", cls: "text-violet-400/80" };
        default:
            return { icon: <Lightbulb size={10} />, label: "Unknown role", cls: "text-gray-500" };
    }
};

export interface ExperimentConfig {
    runPreset?: RunPreset;
    selectedExperiments: string[];
    zeroSource: string; // "generated" | "file:..."
    zeroCount?: number;
    dps?: number;
    resolution?: number;
    xStart?: number;
    xEnd?: number;
    betaOffset?: number;
    kPower?: number;
    workers?: number;
    primeMinCount?: number;
    primeTargetCount?: number;
}

export interface SidebarLiveEvent {
    id: string;
    phase?: string;
    state?: string;
    message?: string;
    percent?: number;
}

export interface SidebarLiveTelemetry {
    runId: string;
    status?: string;
    phase?: string;
    percent?: number;
    elapsedSeconds?: number;
    etaSeconds?: number;
    heartbeatAgeSec?: number;
    currentExperiment?: string;
    workers?: number;
    primeMinCount?: number;
    primeTargetCount?: number;
    primeSource?: {
        sourceKind?: string;
        loadedCount?: number;
        maxPrime?: number;
        badRows?: number;
    };
    recentEvents: SidebarLiveEvent[];
}

export type RunPreset =
    | "custom"
    | "smoke"
    | "standard"
    | "authoritative"
    | "overkill"
    | "overkill_full";

const DEFAULT_ZERO_SOURCE = "generated";
const DEFAULT_ZERO_COUNT = 20000;
const DEFAULT_DPS = 50;
const DEFAULT_RESOLUTION = 500;
const DEFAULT_X_START = 2;
const DEFAULT_X_END = 50;
const DEFAULT_BETA_OFFSET = 0.0001;
const DEFAULT_K_POWER = -20;

const normalizeExperimentSelection = (selected: string[]) =>
    Array.from(
        new Set(
            selected
                .map((value) => value.trim().toLowerCase())
                .filter(Boolean),
        ),
    );

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
    { id: "0",  label: "ZETA-0: Critical Line Polar Trace",   summaryKey: "EXP_0"  },
    { id: "1",  label: "CORE-1: Harmonic Converter",          summaryKey: "EXP_1"  },
    { id: "1b", label: "CTRL-1: Operator Scaling Control",    summaryKey: "EXP_1B" },
    { id: "1c", label: "NOTE-1: Zero-Reuse Note",             summaryKey: "EXP_1C" },
    { id: "2",  label: "P2-1: Rogue Centrifuge",              summaryKey: "EXP_2"  },
    { id: "2b", label: "P2-2: Rogue Isolation",               summaryKey: "EXP_2B" },
    { id: "3",  label: "CTRL-2: Beta Counterfactual Control", summaryKey: "EXP_3"  },
    { id: "4",  label: "PATH-1: Translation vs Dilation",     summaryKey: "EXP_4"  },
    { id: "5",  label: "PATH-2: Zero Correspondence",         summaryKey: "EXP_5"  },
    { id: "6",  label: "VAL-1: Beta Stability",               summaryKey: "EXP_6"  },
    { id: "7",  label: "P2-3: Calibrated Amplification",      summaryKey: "EXP_7"  },
    { id: "8",  label: "WIT-1: Zero Scaling Witness",          summaryKey: "EXP_8"  },
    { id: "9",  label: "DEMO-1: Bounded View",                summaryKey: "EXP_9"  },
    { id: "10", label: "TRANS-1: Zeta Gauge Transport",       summaryKey: "EXP_10" },
];

const DISPLAY_FALLBACK: Record<string, { display_id: string; display_name: string }> =
    Object.fromEntries(
        ALL_EXPERIMENTS.map((exp) => {
            const [display_id, ...nameParts] = exp.label.split(":");
            return [exp.summaryKey, { display_id, display_name: nameParts.join(":").trim() }];
        }),
    );

function displayFor(
    summaryKey: string,
    classification: { [k: string]: ExperimentClassification } | undefined,
) {
    const fromArtifact = classification?.[summaryKey];
    const fallback = DISPLAY_FALLBACK[summaryKey] ?? { display_id: summaryKey, display_name: summaryKey };
    return {
        display_id: fromArtifact?.display_id ?? fallback.display_id,
        display_name: fromArtifact?.display_name ?? fallback.display_name,
    };
}

// Fallback maps consulted only when `data.meta.experiment_classification` is
// missing (old artifact). Keep in sync with verifier.FUNCTION_MAP / STAGE_MAP.
const FUNCTION_FALLBACK: Record<string, ExperimentFunction> = {
    EXP_0:  "VISUALIZATION",
    EXP_1:  "PROOF_OBLIGATION_WITNESS",
    EXP_1B: "CONTROL",
    EXP_1C: "RESEARCH_NOTE",
    EXP_2:  "EXPLORATORY",
    EXP_2B: "EXPLORATORY",
    EXP_3:  "CONTROL",
    EXP_4:  "PATHFINDER",
    EXP_5:  "PATHFINDER",
    EXP_6:  "PROOF_OBLIGATION_WITNESS",
    EXP_7:  "EXPLORATORY",
    EXP_8:  "PROOF_OBLIGATION_WITNESS",
    EXP_9:  "DEMONSTRATION",
    EXP_10: "EXPLORATORY",
};

const STAGE_FALLBACK: Record<string, TheoryStage> = {
    EXP_0:  "core_visualization",
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
    EXP_9:  "demonstration",
    EXP_10: "transport",
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
// pathfinders, then regression plumbing, then the Contradiction Track last.
const FUNCTION_GROUPS: Array<{
    key: ExperimentFunction;
    title: string;
    subtitle: string;
}> = [
    { key: "CORE_CALCULATION",         title: "Core Calculation",           subtitle: "main Riemann Converter" },
    { key: "VISUALIZATION",            title: "Visualizations",             subtitle: "zeta-direct descriptive views" },
    { key: "PROOF_OBLIGATION_WITNESS", title: "Proof-Obligation Witnesses", subtitle: "theorem-directed evidence" },
    { key: "COHERENCE_WITNESS",        title: "Coherence Witnesses",        subtitle: "showing the work" },
    { key: "CONTROL",                  title: "Controls",                   subtitle: "falsifier armed on known-bad" },
    { key: "PATHFINDER",               title: "Pathfinders",                subtitle: "direction selectors" },
    { key: "REGRESSION_CHECK",         title: "Regression Checks",          subtitle: "engine-health plumbing" },
    { key: "RESEARCH_NOTE",            title: "Research Notes",             subtitle: "informational engineering checks" },
    { key: "DEMONSTRATION",            title: "Demonstrations",             subtitle: "corollary mechanics only" },
    { key: "EXPLORATORY",              title: "Exploratory · Program 2",    subtitle: "not on proof-critical path" },
    { key: "THEOREM_STATEMENT",        title: "Theorem Statements",         subtitle: "rare / anchor only" },
];

const FUNCTION_ICON: Record<ExperimentFunction, React.ReactNode> = {
    THEOREM_STATEMENT:        <BadgeCheck size={12} />,
    CORE_CALCULATION:         <Microscope size={12} />,
    VISUALIZATION:            <Radar size={12} />,
    PROOF_OBLIGATION_WITNESS: <Key size={12} />,
    COHERENCE_WITNESS:        <Microscope size={12} />,
    CONTROL:                  <Shield size={12} />,
    PATHFINDER:               <Compass size={12} />,
    REGRESSION_CHECK:         <Wrench size={12} />,
    EXPLORATORY:              <Lightbulb size={12} />,
    RESEARCH_NOTE:            <Microscope size={12} />,
    DEMONSTRATION:            <Lightbulb size={12} />,
};

// Stage-grouped layout (secondary mode, retained per spec §6 as a
// noncanonical navigation axis). Order matches the historical three-stage
// theory presentation plus the control row.
const STAGE_GROUPS_META: Array<{ key: TheoryStage; title: string; subtitle: string }> = [
    { key: "gauge",       title: "Gauge",       subtitle: "coordinate symmetry" },
    { key: "core_visualization", title: "Core Visualization", subtitle: "zeta-direct descriptive view" },
    { key: "lattice",     title: "Lattice",     subtitle: "zero-scaling equivalence" },
    { key: "brittleness", title: "Brittleness", subtitle: "rogue-zero amplification" },
    { key: "control",     title: "Control",     subtitle: "falsification sanity" },
    { key: "demonstration", title: "Demonstration", subtitle: "bounded-view mechanics" },
    { key: "transport", title: "Transport", subtitle: "zeta-direct gauge residuals" },
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
        "INFORMATIONAL",
        "INCONCLUSIVE",
    ]);
    if (outcomes.every((o) => o !== undefined && healthy.has(o))) return "IMPLEMENTATION_OK";
    return "MIXED";
}

// Per-experiment status badge style (checkbox-row trailing indicator). Keeps
// the same color grammar as healthBadgeStyle for consistency.
// Accepts canonical outcome values only (CONSISTENT, IMPLEMENTATION_OK, etc.).
// Legacy theory_fit vocabulary (SUPPORTS/REFUTES) removed in Sprint 2b.
const expStatusBadgeStyle = (outcome: string | undefined) => {
    switch (outcome) {
        case "CONSISTENT":
        case "IMPLEMENTATION_OK":
        case "PASS":
            return { cls: "text-emerald-300 bg-emerald-900/30 border-emerald-500/40", icon: <CheckCircle2 size={10} /> };
        case "INCONSISTENT":
        case "IMPLEMENTATION_BROKEN":
        case "FAIL":
            return { cls: "text-red-300 bg-red-900/30 border-red-500/40", icon: <XCircle size={10} /> };
        case "DIRECTIONAL":
        case "INFORMATIVE":
            return { cls: "text-cyan-300 bg-cyan-900/30 border-cyan-500/40", icon: <Compass size={10} /> };
        case "INFORMATIONAL":
            return { cls: "text-violet-300 bg-violet-900/25 border-violet-500/35", icon: <Lightbulb size={10} /> };
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
    { id: "odlyzko_100k", label: "Odlyzko (100k Zeros)", path: "file:data/zeros/nontrivial/zeros_100K_three_ten_power_neg_nine.gz" },
];

const PRESET_DEFS: Array<{
    id: RunPreset;
    label: string;
    hint: string;
    patch: Partial<ExperimentConfig>;
}> = [
    {
        id: "custom",
        label: "Custom",
        hint: "Use the exact values currently set below.",
        patch: {},
    },
    {
        id: "smoke",
        label: "Smoke",
        hint: "Fast plumbing profile.",
        patch: { zeroSource: "generated", zeroCount: 100, dps: 30, primeMinCount: 0, primeTargetCount: 0 },
    },
    {
        id: "standard",
        label: "Standard",
        hint: "Iterative development fidelity profile.",
        patch: { zeroSource: "generated", zeroCount: 2000, dps: 40, primeMinCount: 0, primeTargetCount: 0 },
    },
    {
        id: "authoritative",
        label: "Authoritative",
        hint: "Reviewer-grade baseline profile.",
        patch: { zeroSource: "generated", zeroCount: 20000, dps: 50, primeMinCount: 0, primeTargetCount: 0 },
    },
    {
        id: "overkill",
        label: "Overkill",
        hint: "Stress profile with min/target 1,000,000 primes.",
        patch: {
            zeroSource: "file:data/zeros/nontrivial/zeros_100K_three_ten_power_neg_nine.gz",
            zeroCount: 20000,
            dps: 80,
            primeMinCount: 1_000_000,
            primeTargetCount: 1_000_000,
        },
    },
    {
        id: "overkill_full",
        label: "Overkill Full",
        hint: "Stress profile with full prime target (7,000,000).",
        patch: {
            zeroSource: "file:data/zeros/nontrivial/zeros_100K_three_ten_power_neg_nine.gz",
            zeroCount: 20000,
            dps: 80,
            primeMinCount: 1_000_000,
            primeTargetCount: 7_000_000,
        },
    },
];

export const applyPresetDefaults = (config: ExperimentConfig, preset: RunPreset): ExperimentConfig => {
    const def = PRESET_DEFS.find((entry) => entry.id === preset);
    if (!def) return { ...config };
    return {
        ...config,
        ...def.patch,
        runPreset: preset,
    };
};

export const applyParameterPatch = (
    config: ExperimentConfig,
    patch: Partial<ExperimentConfig>,
): ExperimentConfig => ({
    ...config,
    ...patch,
    runPreset: "custom",
});

export const applySelectionPatch = (
    config: ExperimentConfig,
    selectedExperiments: string[],
): ExperimentConfig => ({
    ...config,
    selectedExperiments: normalizeExperimentSelection(selectedExperiments),
});

export const hasPerturbationSelection = (selectedExperiments: string[]): boolean =>
    selectedExperiments.some((exp) => exp === "2" || exp === "2b" || exp === "7");

export interface RunSummaryView {
    preset: RunPreset;
    experiments: string;
    zero_source: string;
    dps: number;
    zero_count: number;
    workers: string;
    prime_min_count: number;
    prime_target_count: number;
}

export const buildRunSummaryView = (config: ExperimentConfig): RunSummaryView => {
    const source = ZERO_SOURCES.find((entry) => entry.path === config.zeroSource);
    return {
        preset: config.runPreset ?? "custom",
        experiments:
            config.selectedExperiments.length > 0
                ? normalizeExperimentSelection(config.selectedExperiments).join(",")
                : "none",
        zero_source: source?.id ?? config.zeroSource ?? DEFAULT_ZERO_SOURCE,
        dps: config.dps ?? DEFAULT_DPS,
        zero_count: config.zeroCount ?? DEFAULT_ZERO_COUNT,
        workers: config.workers !== undefined ? String(config.workers) : "auto",
        prime_min_count: config.primeMinCount ?? 0,
        prime_target_count: config.primeTargetCount ?? 0,
    };
};

export interface ExecuteButtonState {
    disabled: boolean;
    label: "READ ONLY" | "PROCESSING..." | "SELECT EXPERIMENT(S)" | "EXECUTE";
    status: string;
}

const fmtSeconds = (value?: number) => {
    if (value === undefined || !Number.isFinite(value)) return "n/a";
    const rounded = Math.max(0, Math.floor(value));
    const minutes = Math.floor(rounded / 60);
    const seconds = rounded % 60;
    return `${minutes}m ${seconds}s`;
};

export const getExecuteButtonState = ({
    runControlsEnabled,
    isRunning,
    selectedCount,
}: {
    runControlsEnabled: boolean;
    isRunning: boolean;
    selectedCount: number;
}): ExecuteButtonState => {
    if (!runControlsEnabled) {
        return {
            disabled: true,
            label: "READ ONLY",
            status: "Run controls unavailable in read-only mode.",
        };
    }
    if (isRunning) {
        return {
            disabled: true,
            label: "PROCESSING...",
            status: "Run in progress.",
        };
    }
    if (selectedCount <= 0) {
        return {
            disabled: true,
            label: "SELECT EXPERIMENT(S)",
            status: "Select one or more experiments to enable run.",
        };
    }
    return {
        disabled: false,
        label: "EXECUTE",
        status: "Ready.",
    };
};

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
    /** Map of summary key -> canonical outcome for the trailing per-row badge. */
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
    runControlsEnabled?: boolean;
    readOnlyMessage?: string;
    liveTelemetry?: SidebarLiveTelemetry | null;
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
    runControlsEnabled = true,
    readOnlyMessage,
    liveTelemetry,
}: Props) {
    const [isOpen, setIsOpen] = useState(true);
    const [advancedOpen, setAdvancedOpen] = useState(false);
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
    const selectedCount = config.selectedExperiments.length;
    const selectedPreset = config.runPreset ?? "custom";
    const showPerturbationSettings = hasPerturbationSelection(config.selectedExperiments);
    const summary = buildRunSummaryView(config);
    const summaryExperiments =
        summary.experiments === "none" ? summary.experiments : summary.experiments.toUpperCase();
    const executeState = getExecuteButtonState({
        runControlsEnabled,
        isRunning,
        selectedCount,
    });

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
                        title: g.key === "EXPLORATORY" ? "Contradiction Track" : g.title,
                        subtitle: g.key === "EXPLORATORY" ? "formalization incomplete" : g.subtitle,
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

    const updateParameters = (partial: Partial<ExperimentConfig>) => {
        onConfigChange(applyParameterPatch(config, partial));
    };

    const updateSelection = (selectedExperiments: string[]) => {
        onConfigChange(applySelectionPatch(config, selectedExperiments));
    };

    const applyPreset = (preset: RunPreset) => {
        onConfigChange(applyPresetDefaults(config, preset));
    };

    const handleSourceChange = (id: string) => {
        const path = ZERO_SOURCES.find((z) => z.id === id)?.path || "generated";
        updateParameters({ zeroSource: path });
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
        <aside className="w-80 h-full min-h-0 border-l border-white/5 bg-[#080c14] flex flex-col shrink-0 transition-all font-mono text-xs overflow-hidden overflow-x-hidden z-30 shadow-2xl">
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 bg-[#05080f] shrink-0">
                <div className="flex items-center gap-2 text-white font-bold tracking-wider">
                    <Settings size={14} className="text-blue-500" />
                    <span>CONFIGURATION</span>
                </div>
                <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white">
                    <ChevronRight size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-8 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                <section className="space-y-3">
                    <h3 className="text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-white/5 pb-1">
                        Run Preset
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                        {PRESET_DEFS.map((preset) => {
                            const active = selectedPreset === preset.id;
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => applyPreset(preset.id)}
                                    className={clsx(
                                        "px-2 py-2 rounded border text-[10px] font-mono transition-colors text-left",
                                        active
                                            ? "bg-blue-900/30 border-blue-500/50 text-blue-100"
                                            : "bg-black/30 border-white/10 text-gray-300 hover:border-blue-500/40 hover:text-blue-200",
                                    )}
                                    title={preset.hint}
                                >
                                    {preset.label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="text-[10px] text-gray-500 leading-tight">
                        Presets apply parameter defaults only. Experiment checkboxes control run scope.
                    </div>
                </section>

                {/* Experiment selection -- primary grouping by function (canonical), stage grouping as secondary. */}
                <section className="space-y-3">
                    <div className="flex items-center justify-between border-b border-white/5 pb-1 gap-2">
                        <h3 className="text-gray-500 font-bold uppercase text-[10px] tracking-wider">Experiments</h3>
                        <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded border border-white/10">
                            <button
                                type="button"
                                onClick={() => updateSelection(ALL_EXPERIMENTS.map((exp) => exp.id))}
                                className="px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider text-gray-400 hover:text-gray-200 border border-transparent hover:border-white/20"
                                title="Select all experiments"
                            >
                                all
                            </button>
                            <button
                                type="button"
                                onClick={() => updateSelection([])}
                                className="px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider text-gray-400 hover:text-gray-200 border border-transparent hover:border-white/20"
                                title="Clear selected experiments"
                            >
                                none
                            </button>
                            <button
                                onClick={() => setGroupMode("function")}
                                className={clsx(
                                    "px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider flex items-center gap-1 transition-colors",
                                    groupMode === "function"
                                        ? "bg-blue-600/40 text-blue-200 border border-blue-500/40"
                                        : "text-gray-500 hover:text-gray-300 border border-transparent",
                                )}
                                title="Group experiments by proof-program function"
                            >
                                <LayoutList size={10} /> function
                            </button>
                            <button
                                onClick={() => setGroupMode("stage")}
                                className={clsx(
                                    "px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider flex items-center gap-1 transition-colors",
                                    groupMode === "stage"
                                        ? "bg-gray-600/40 text-gray-200 border border-white/20"
                                        : "text-gray-500 hover:text-gray-300 border border-transparent",
                                )}
                                title="Group experiments by stage"
                            >
                                <Layers size={10} /> stage
                            </button>
                            <span className="text-[9px] font-mono px-2 py-1 rounded border border-white/10 text-gray-400">
                                selected {selectedCount}
                            </span>
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
                                                group.rollupCls,
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
                                                    const expStyle = expStatusBadgeStyle(rawStatus);
                                                    const role = roleFor(exp.summaryKey, experimentClassification);
                                                    const roleInfo = roleGlyph(role);
                                                    const fn = functionFor(exp.summaryKey, experimentClassification);
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
                                                    const secondaryLabel =
                                                        groupMode === "function"
                                                            ? stageFor(exp.summaryKey, experimentClassification)
                                                            : fn.toLowerCase().replace(/_/g, " ");
                                                    const display = displayFor(exp.summaryKey, experimentClassification);
                                                    return (
                                                        <label
                                                            key={exp.id}
                                                            className={clsx(
                                                                "flex items-center gap-2 p-2 rounded cursor-pointer transition-colors border",
                                                                isSelected
                                                                    ? "bg-blue-900/20 border-blue-500/30"
                                                                    : "hover:bg-white/5 border-transparent",
                                                            )}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={(e) => {
                                                                    const checked = e.target.checked;
                                                                    const next = checked
                                                                        ? [...config.selectedExperiments, exp.id]
                                                                        : config.selectedExperiments.filter((x) => x !== exp.id);
                                                                    updateSelection(next);
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
                                                                        isSelected ? "text-blue-200 font-bold" : "text-gray-400",
                                                                    )}
                                                                >
                                                                    {display.display_id}: {display.display_name}
                                                                </div>
                                                                <div
                                                                    className="text-[8px] font-mono text-gray-600 uppercase tracking-wider truncate"
                                                                    title={`Stable id: ${exp.summaryKey}`}
                                                                >
                                                                    {secondaryLabel}
                                                                </div>
                                                            </div>
                                                            {fidelityTag && (
                                                                <span
                                                                    className={clsx(
                                                                        "text-[8px] font-mono px-1 py-0.5 rounded border tracking-tight shrink-0",
                                                                        fidelityTag.cls,
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
                                                                        expStyle.cls,
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

                <section className="space-y-4">
                    <h3 className="text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-white/5 pb-1">
                        Basic Run Settings
                    </h3>
                    <div className="space-y-2">
                        <label className="text-gray-400 text-[10px] block uppercase tracking-wider">Zero Source</label>
                        {ZERO_SOURCES.map((src) => (
                            <label key={src.id} className="flex items-center gap-2 cursor-pointer group">
                                <div
                                    className={clsx(
                                        "w-3 h-3 rounded-full border flex items-center justify-center",
                                        zeroSourceId === src.id
                                            ? "border-purple-500"
                                            : "border-gray-600 group-hover:border-gray-400",
                                    )}
                                >
                                    {zeroSourceId === src.id && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                    )}
                                </div>
                                <input
                                    type="radio"
                                    name="zero_source"
                                    checked={zeroSourceId === src.id}
                                    onChange={() => handleSourceChange(src.id)}
                                    className="hidden"
                                />
                                <span
                                    className={clsx(
                                        "text-xs",
                                        zeroSourceId === src.id ? "text-purple-200" : "text-gray-400",
                                    )}
                                >
                                    {src.label}
                                </span>
                            </label>
                        ))}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                        <label className="text-gray-400 text-[10px]">Zero Count</label>
                        <input
                            type="number"
                            placeholder={String(DEFAULT_ZERO_COUNT)}
                            value={config.zeroCount ?? ""}
                            onChange={(e) =>
                                updateParameters({
                                    zeroCount: e.target.value ? parseInt(e.target.value, 10) : undefined,
                                })
                            }
                            className="w-24 bg-black/40 border border-white/10 rounded px-2 py-1 text-right text-gray-300 focus:border-blue-500/50 outline-none hover:bg-black/60 transition-colors"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="text-gray-400">Precision (DPS)</span>
                            <span
                                className={clsx(
                                    "font-bold",
                                    (config.dps ?? DEFAULT_DPS) > 60 ? "text-purple-400" : "text-blue-400",
                                )}
                            >
                                {config.dps ?? DEFAULT_DPS}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="15"
                            max="150"
                            step="5"
                            value={config.dps ?? DEFAULT_DPS}
                            onChange={(e) => updateParameters({ dps: parseInt(e.target.value, 10) })}
                            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-blue-400"
                        />
                        {getPrecisionWarning() && (
                            <div className="bg-amber-900/20 border border-amber-500/30 p-2 rounded text-amber-200 text-[10px] leading-tight flex gap-2 animate-in fade-in duration-300">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                {getPrecisionWarning()}
                            </div>
                        )}
                    </div>
                </section>

                <section className="space-y-3">
                    <button
                        type="button"
                        onClick={() => setAdvancedOpen((prev) => !prev)}
                        className="w-full flex items-center justify-between border-b border-white/5 pb-1 text-left"
                    >
                        <h3 className="text-gray-500 font-bold uppercase text-[10px] tracking-wider">
                            Advanced Settings
                        </h3>
                        <span className="text-gray-500">
                            {advancedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                    </button>
                    {advancedOpen && (
                        <div className="space-y-4">
                            <div className="space-y-3">
                                <h4 className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/5 pb-1">
                                    Sampling Window
                                </h4>
                                <div className="flex items-center justify-between">
                                    <label className="text-gray-400 text-[10px]">Resolution (Points)</label>
                                    <input
                                        type="number"
                                        value={config.resolution ?? DEFAULT_RESOLUTION}
                                        onChange={(e) =>
                                            updateParameters({
                                                resolution: e.target.value
                                                    ? parseInt(e.target.value, 10)
                                                    : undefined,
                                            })
                                        }
                                        className="w-24 bg-black/40 border border-white/10 rounded px-2 py-1 text-right text-gray-300 focus:border-blue-500/50 outline-none hover:bg-black/60 transition-colors"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-gray-500 text-[10px] block">Start (X)</label>
                                        <input
                                            type="number"
                                            value={config.xStart ?? DEFAULT_X_START}
                                            onChange={(e) =>
                                                updateParameters({
                                                    xStart: e.target.value ? parseFloat(e.target.value) : undefined,
                                                })
                                            }
                                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-gray-300 focus:border-blue-500/50 outline-none text-center"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-gray-500 text-[10px] block">End (X)</label>
                                        <input
                                            type="number"
                                            value={config.xEnd ?? DEFAULT_X_END}
                                            onChange={(e) =>
                                                updateParameters({
                                                    xEnd: e.target.value ? parseFloat(e.target.value) : undefined,
                                                })
                                            }
                                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-gray-300 focus:border-blue-500/50 outline-none text-center"
                                        />
                                    </div>
                                </div>
                            </div>

                            {showPerturbationSettings && (
                                <div className="space-y-3">
                                    <h4 className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/5 pb-1">
                                        Perturbation Settings
                                    </h4>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="text-gray-400">Beta Offset</span>
                                            <span className="text-purple-300">
                                                {config.betaOffset ?? DEFAULT_BETA_OFFSET}
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.00001"
                                            max="0.001"
                                            step="0.00001"
                                            value={config.betaOffset ?? DEFAULT_BETA_OFFSET}
                                            onChange={(e) =>
                                                updateParameters({ betaOffset: parseFloat(e.target.value) })
                                            }
                                            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-purple-400"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <label className="text-gray-400 text-[10px]">K Power</label>
                                        <input
                                            type="number"
                                            value={config.kPower ?? DEFAULT_K_POWER}
                                            onChange={(e) =>
                                                updateParameters({
                                                    kPower: e.target.value ? parseInt(e.target.value, 10) : undefined,
                                                })
                                            }
                                            className="w-24 bg-black/40 border border-white/10 rounded px-2 py-1 text-right text-purple-300 focus:border-purple-500/50 outline-none hover:bg-black/60 transition-colors"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                <h4 className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/5 pb-1">
                                    Runtime and Prime Policy
                                </h4>
                                <div className="flex items-center justify-between">
                                    <label className="text-gray-400 text-[10px]">Workers</label>
                                    <input
                                        type="number"
                                        min={1}
                                        placeholder="auto"
                                        value={config.workers ?? ""}
                                        onChange={(e) =>
                                            updateParameters({
                                                workers: e.target.value
                                                    ? Math.max(1, parseInt(e.target.value, 10))
                                                    : undefined,
                                            })
                                        }
                                        className="w-24 bg-black/40 border border-white/10 rounded px-2 py-1 text-right text-emerald-200 focus:border-emerald-500/50 outline-none hover:bg-black/60 transition-colors"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-gray-500 text-[10px] block">Prime Min</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={config.primeMinCount ?? ""}
                                            placeholder="0"
                                            onChange={(e) =>
                                                updateParameters({
                                                    primeMinCount: e.target.value
                                                        ? Math.max(0, parseInt(e.target.value, 10))
                                                        : undefined,
                                                })
                                            }
                                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-gray-300 focus:border-emerald-500/50 outline-none text-right"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-gray-500 text-[10px] block">Prime Target</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={config.primeTargetCount ?? ""}
                                            placeholder="0"
                                            onChange={(e) =>
                                                updateParameters({
                                                    primeTargetCount: e.target.value
                                                        ? Math.max(0, parseInt(e.target.value, 10))
                                                        : undefined,
                                                })
                                            }
                                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-gray-300 focus:border-emerald-500/50 outline-none text-right"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            updateParameters({
                                                primeMinCount: 1_000_000,
                                                primeTargetCount: 1_000_000,
                                            })
                                        }
                                        className="px-2 py-1 rounded border border-emerald-500/30 text-[10px] text-emerald-200 hover:bg-emerald-900/20"
                                        title="Set overkill prime policy"
                                    >
                                        Overkill 1M
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            updateParameters({
                                                primeMinCount: 1_000_000,
                                                primeTargetCount: 7_000_000,
                                            })
                                        }
                                        className="px-2 py-1 rounded border border-cyan-500/30 text-[10px] text-cyan-200 hover:bg-cyan-900/20"
                                        title="Set full prime file target"
                                    >
                                        Full 7M
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                <section className="space-y-3">
                    <h3 className="text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-white/5 pb-1">
                        Run Summary
                    </h3>
                    <div className="rounded border border-white/10 bg-black/30 p-3 text-[10px] space-y-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500">Preset</span>
                            <span className="text-gray-200 uppercase">{summary.preset}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500">Experiments</span>
                            <span className="text-gray-200 truncate" title={summaryExperiments}>
                                {summaryExperiments}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500">Zero Source</span>
                            <span className="text-gray-200">{summary.zero_source}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500">DPS</span>
                            <span className="text-gray-200">{summary.dps}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500">Zero Count</span>
                            <span className="text-gray-200">{summary.zero_count}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500">Workers</span>
                            <span className="text-gray-200">{summary.workers}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500">Prime Min/Target</span>
                            <span className="text-gray-200">
                                {summary.prime_min_count}/{summary.prime_target_count}
                            </span>
                        </div>
                    </div>
                </section>

                {liveTelemetry && (
                    <section className="space-y-3">
                        <h3 className="text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-white/5 pb-1">
                            Live Processing
                        </h3>
                        <div className="rounded border border-blue-500/20 bg-blue-950/20 p-3 text-[10px] space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">Run ID</span>
                                <span className="text-gray-200">{liveTelemetry.runId}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">Status</span>
                                <span className="text-blue-200">{liveTelemetry.status ?? "RUNNING"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">Phase</span>
                                <span className="text-gray-200">{liveTelemetry.phase ?? "n/a"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">Progress</span>
                                <span className="text-gray-200">
                                    {liveTelemetry.percent !== undefined
                                        ? `${liveTelemetry.percent.toFixed(1)}%`
                                        : "n/a"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">Elapsed / ETA</span>
                                <span className="text-gray-200">
                                    {fmtSeconds(liveTelemetry.elapsedSeconds)} / {fmtSeconds(liveTelemetry.etaSeconds)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">Heartbeat</span>
                                <span className="text-gray-200">
                                    {liveTelemetry.heartbeatAgeSec !== undefined
                                        ? `${liveTelemetry.heartbeatAgeSec}s ago`
                                        : "n/a"}
                                </span>
                            </div>
                            {liveTelemetry.currentExperiment && (
                                <div className="pt-1 text-blue-200">
                                    Active Experiment: {liveTelemetry.currentExperiment}
                                </div>
                            )}
                            {(liveTelemetry.workers !== undefined ||
                                liveTelemetry.primeMinCount !== undefined ||
                                liveTelemetry.primeTargetCount !== undefined) && (
                                <div className="pt-1 text-gray-400">
                                    workers={liveTelemetry.workers ?? "auto"} prime_min=
                                    {liveTelemetry.primeMinCount ?? "n/a"} prime_target=
                                    {liveTelemetry.primeTargetCount ?? "n/a"}
                                </div>
                            )}
                            {liveTelemetry.primeSource && (
                                <div className="pt-1 text-gray-400">
                                    prime_source={liveTelemetry.primeSource.sourceKind ?? "unknown"}
                                    {liveTelemetry.primeSource.loadedCount !== undefined
                                        ? ` loaded=${liveTelemetry.primeSource.loadedCount}`
                                        : ""}
                                    {liveTelemetry.primeSource.maxPrime !== undefined
                                        ? ` max=${liveTelemetry.primeSource.maxPrime}`
                                        : ""}
                                    {liveTelemetry.primeSource.badRows !== undefined
                                        ? ` bad_rows=${liveTelemetry.primeSource.badRows}`
                                        : ""}
                                </div>
                            )}
                        </div>
                        {liveTelemetry.recentEvents.length > 0 && (
                            <div className="rounded border border-white/10 bg-black/30 p-2 space-y-1">
                                {liveTelemetry.recentEvents.map((event) => (
                                    <div key={event.id} className="text-[10px] text-gray-400">
                                        [{event.phase ?? "RUN"}] {event.state ?? "-"} {event.message ?? ""}
                                        {event.percent !== undefined ? ` (${event.percent.toFixed(1)}%)` : ""}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                )}
            </div>

            <div className="p-4 border-t border-white/5 bg-[#080c14] shrink-0 space-y-3">
                <div className="text-[10px] text-gray-500">{executeState.status}</div>
                <button
                    onClick={onRun}
                    disabled={executeState.disabled}
                    className={clsx(
                        "w-full py-3 rounded-lg font-bold text-xs tracking-widest transition-all shadow-lg flex items-center justify-center gap-2",
                        !runControlsEnabled
                            ? "bg-amber-900/20 text-amber-200/80 cursor-not-allowed border border-amber-500/30"
                            : executeState.disabled
                              ? "bg-gray-800 text-gray-500 cursor-not-allowed border border-transparent"
                              : "bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-blue-500/50 text-blue-200 hover:bg-blue-800/50 hover:border-blue-400 hover:text-white hover:shadow-blue-900/30",
                    )}
                >
                    {executeState.label}
                </button>
                {!runControlsEnabled && (
                    <div className="text-[10px] text-amber-200/80 leading-relaxed">
                        {readOnlyMessage ??
                            "Hosted deployment is read-only. Fork/download from GitHub to run experiments locally."}
                    </div>
                )}
            </div>
        </aside>
    );
}

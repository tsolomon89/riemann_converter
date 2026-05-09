"use client";

import React from "react";
import clsx from "clsx";
import {
    CheckCircle2,
    XCircle,
    AlertTriangle,
    HelpCircle,
    Compass,
    ShieldAlert,
    Microscope,
    Key,
    Wrench,
    BadgeCheck,
} from "lucide-react";
import type {
    ExperimentFunction,
    ExperimentOutcome,
    ExperimentVerdict,
} from "../lib/types";

// Per-experiment badge. Renders `function` + `outcome`. The legacy
// InferenceRailsCallout was removed in favor of <ExperimentReviewPanel/>,
// which keeps `intended_inference_if_passed` and `actual_run_inference`
// visibly separate. Do NOT reintroduce a single "may infer" panel that
// reads from verdict.inference — that source mixes static-if-passed text
// with run state and was the bug that motivated the proof-discovery layer.

// ---------------------------------------------------------------------------
// FunctionOutcomeBadge — the primary verdict badge
// ---------------------------------------------------------------------------

const FUNCTION_LABEL: Record<ExperimentFunction, string> = {
    THEOREM_STATEMENT: "Theorem",
    CORE_CALCULATION: "Main Calc",
    VISUALIZATION: "Visualization",
    PROOF_OBLIGATION_WITNESS: "Witness",
    COHERENCE_WITNESS: "Coherence",
    CONTROL: "Control",
    PATHFINDER: "Pathfinder",
    REGRESSION_CHECK: "Regression",
    EXPLORATORY: "Exploratory",
    RESEARCH_NOTE: "Research Note",
    DEMONSTRATION: "Demo",
};

const FUNCTION_ICON: Record<ExperimentFunction, React.ReactNode> = {
    THEOREM_STATEMENT: <BadgeCheck size={10} />,
    CORE_CALCULATION: <Microscope size={10} />,
    VISUALIZATION: <Microscope size={10} />,
    PROOF_OBLIGATION_WITNESS: <Key size={10} />,
    COHERENCE_WITNESS: <Microscope size={10} />,
    CONTROL: <ShieldAlert size={10} />,
    PATHFINDER: <Compass size={10} />,
    REGRESSION_CHECK: <Wrench size={10} />,
    EXPLORATORY: <HelpCircle size={10} />,
    RESEARCH_NOTE: <Microscope size={10} />,
    DEMONSTRATION: <HelpCircle size={10} />,
};

// Outcome color is function-aware: CONSISTENT is green only for a
// proof-obligation witness; for a coherence witness it's blue (coherence,
// not evidence); for exploratory it's purple (Program 2).
function outcomeStyles(fn: ExperimentFunction, oc: ExperimentOutcome) {
    if (oc === "INCONCLUSIVE") {
        return { cls: "bg-gray-800/60 border-white/10 text-gray-400", icon: <AlertTriangle size={10} /> };
    }
    if (oc === "IMPLEMENTATION_BROKEN") {
        return { cls: "bg-red-900/40 border-red-500/40 text-red-300", icon: <XCircle size={10} /> };
    }
    if (oc === "IMPLEMENTATION_OK") {
        // Control OK: shield-green ("armed"); regression OK: muted green
        if (fn === "CONTROL") {
            return { cls: "bg-emerald-900/30 border-emerald-500/40 text-emerald-300", icon: <ShieldAlert size={10} /> };
        }
        return { cls: "bg-teal-900/30 border-teal-500/30 text-teal-300", icon: <CheckCircle2 size={10} /> };
    }
    if (oc === "DIRECTIONAL") {
        return { cls: "bg-cyan-900/30 border-cyan-500/40 text-cyan-300", icon: <Compass size={10} /> };
    }
    if (oc === "INFORMATIONAL") {
        return { cls: "bg-violet-900/30 border-violet-500/40 text-violet-300", icon: <HelpCircle size={10} /> };
    }
    if (oc === "INCONSISTENT") {
        return { cls: "bg-red-900/40 border-red-500/40 text-red-300", icon: <XCircle size={10} /> };
    }
    // CONSISTENT
    if (fn === "PROOF_OBLIGATION_WITNESS") {
        return { cls: "bg-emerald-900/30 border-emerald-500/40 text-emerald-300", icon: <CheckCircle2 size={10} /> };
    }
    if (fn === "CORE_CALCULATION" || fn === "COHERENCE_WITNESS") {
        return { cls: "bg-blue-900/30 border-blue-500/40 text-blue-300", icon: <CheckCircle2 size={10} /> };
    }
    if (fn === "EXPLORATORY") {
        return { cls: "bg-purple-900/30 border-purple-500/40 text-purple-300", icon: <CheckCircle2 size={10} /> };
    }
    return { cls: "bg-emerald-900/30 border-emerald-500/40 text-emerald-300", icon: <CheckCircle2 size={10} /> };
}

// Outcome label is function-aware too: "Armed" reads more accurately than
// "Implementation OK" for a control; "OK" is fine for a regression check.
function outcomeLabel(fn: ExperimentFunction, oc: ExperimentOutcome, direction?: string): string {
    switch (oc) {
        case "CONSISTENT":
            return "Consistent";
        case "INCONSISTENT":
            return "Inconsistent";
        case "DIRECTIONAL":
            return direction ? `→ ${direction}` : "Directional";
        case "INFORMATIONAL":
            return "Informational";
        case "INCONCLUSIVE":
            return "Inconclusive";
        case "IMPLEMENTATION_OK":
            return fn === "CONTROL" ? "Armed" : "OK";
        case "IMPLEMENTATION_BROKEN":
            return fn === "CONTROL" ? "Broken" : "Broken";
        default:
            return oc;
    }
}

export function FunctionOutcomeBadge({
    verdict,
    className,
}: {
    verdict: ExperimentVerdict | undefined;
    className?: string;
}) {
    if (!verdict) return null;
    const fn = (verdict.function ?? "EXPLORATORY") as ExperimentFunction;
    const oc = (verdict.outcome ?? "INCONCLUSIVE") as ExperimentOutcome;
    const styles = outcomeStyles(fn, oc);
    const label = outcomeLabel(fn, oc, verdict.direction);
    const provisionalTag = verdict.provisional ? (
        <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 ml-1"
            title="STANDARD tier: provisional — cite AUTHORITATIVE only"
        >
            provisional
        </span>
    ) : null;

    return (
        <div className={clsx("flex items-center gap-1 flex-wrap", className)}>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded border bg-gray-800/40 text-gray-300 border-white/10 flex items-center gap-1 uppercase tracking-tight">
                {FUNCTION_ICON[fn]}
                {FUNCTION_LABEL[fn]}
            </span>
            <span
                className={clsx(
                    "text-[10px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 uppercase tracking-tight",
                    styles.cls,
                )}
                title={verdict.interpretation}
            >
                {styles.icon}
                {label}
            </span>
            {verdict.program && (
                <span
                    className={clsx(
                        "text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-tight",
                        verdict.program === "PROGRAM_1"
                            ? "bg-blue-500/10 text-blue-300 border-blue-500/30"
                            : "bg-purple-500/10 text-purple-300 border-purple-500/30",
                    )}
                    title={
                        verdict.program === "PROGRAM_1"
                            ? "Program 1 — direct invariance (canonical)"
                            : "Program 2 — contradiction-by-detectability (exploratory)"
                    }
                >
                    {verdict.program === "PROGRAM_1" ? "P1" : "P2"}
                </span>
            )}
            {verdict.obligation_id && (
                <code
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-emerald-300 border border-emerald-500/20"
                    title="Proof obligation this witness bears on"
                >
                    {verdict.obligation_id}
                </code>
            )}
            {provisionalTag}
        </div>
    );
}


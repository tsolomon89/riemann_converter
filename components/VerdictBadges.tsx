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
    InferenceRails,
} from "../lib/types";

// Per-experiment badge + inference-rails callout. Replaces the legacy
// SUPPORTS/REFUTES/CANDIDATE vocabulary. Renders `function` + `outcome` and
// surfaces at least one of allowed/disallowed_conclusion near the badge
// (mandatory under PROOF_PROGRAM_SPEC.md §5/§8).

// ---------------------------------------------------------------------------
// FunctionOutcomeBadge — the primary verdict badge
// ---------------------------------------------------------------------------

const FUNCTION_LABEL: Record<ExperimentFunction, string> = {
    THEOREM_STATEMENT: "Theorem",
    PROOF_OBLIGATION_WITNESS: "Witness",
    COHERENCE_WITNESS: "Coherence",
    CONTROL: "Control",
    PATHFINDER: "Pathfinder",
    REGRESSION_CHECK: "Regression",
    EXPLORATORY: "Exploratory",
};

const FUNCTION_ICON: Record<ExperimentFunction, React.ReactNode> = {
    THEOREM_STATEMENT: <BadgeCheck size={10} />,
    PROOF_OBLIGATION_WITNESS: <Key size={10} />,
    COHERENCE_WITNESS: <Microscope size={10} />,
    CONTROL: <ShieldAlert size={10} />,
    PATHFINDER: <Compass size={10} />,
    REGRESSION_CHECK: <Wrench size={10} />,
    EXPLORATORY: <HelpCircle size={10} />,
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
    if (oc === "INCONSISTENT") {
        return { cls: "bg-red-900/40 border-red-500/40 text-red-300", icon: <XCircle size={10} /> };
    }
    // CONSISTENT
    if (fn === "PROOF_OBLIGATION_WITNESS") {
        return { cls: "bg-emerald-900/30 border-emerald-500/40 text-emerald-300", icon: <CheckCircle2 size={10} /> };
    }
    if (fn === "COHERENCE_WITNESS") {
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

// ---------------------------------------------------------------------------
// InferenceRailsCallout — mandatory surface alongside every verdict
// ---------------------------------------------------------------------------

export function InferenceRailsCallout({
    rails,
    className,
    dense = false,
}: {
    rails: InferenceRails | undefined;
    className?: string;
    dense?: boolean;
}) {
    if (!rails) {
        return (
            <div
                className={clsx(
                    "rounded border border-white/10 bg-black/30 p-3 text-[10px] font-mono text-gray-500 italic",
                    className,
                )}
            >
                No inference rails attached. Re-run verifier to populate.
            </div>
        );
    }

    const padding = dense ? "p-2" : "p-3";
    const textSize = dense ? "text-[10px]" : "text-[11px]";

    return (
        <div
            className={clsx(
                "rounded border border-white/10 bg-black/30",
                padding,
                "space-y-2",
                className,
            )}
        >
            <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-widest">
                <span className="text-gray-500">Inference rails</span>
                <span
                    className="text-gray-600 normal-case tracking-normal italic truncate max-w-[60%]"
                    title={rails.inference_scope}
                >
                    scope: {rails.inference_scope}
                </span>
            </div>
            {rails.allowed_conclusion.length > 0 && (
                <div className="space-y-1">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-emerald-400/80">
                        ✓ may infer
                    </div>
                    <ul className={clsx("list-disc pl-5 space-y-0.5", textSize, "text-emerald-100/90")}>
                        {rails.allowed_conclusion.map((c, i) => (
                            <li key={i}>{c}</li>
                        ))}
                    </ul>
                </div>
            )}
            {rails.disallowed_conclusion.length > 0 && (
                <div className="space-y-1">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-red-400/80">
                        ✗ must not infer
                    </div>
                    <ul className={clsx("list-disc pl-5 space-y-0.5", textSize, "text-red-100/90")}>
                        {rails.disallowed_conclusion.map((c, i) => (
                            <li key={i}>{c}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

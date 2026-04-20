"use client";

import React from "react";
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, Scale, RotateCcw, Activity, Shield, Compass, Key, Radar } from "lucide-react";
import clsx from "clsx";
import type { FidelityTier, StageVerdict, TheoryStage } from "../lib/types";

interface Props {
    stageVerdicts?: { [stage: string]: StageVerdict };
    overall?: string;
    schemaVersion?: string;
    fidelityTier?: FidelityTier;
    fidelityZeros?: number;
    fidelityDps?: number;
}

// Fidelity-tier chip palette. SMOKE is intentionally gray-not-red — it is
// *not* a failure signal, it is a declared refusal-to-grade.
const fidelityStyle = (tier: FidelityTier | undefined) => {
    switch (tier) {
        case "AUTHORITATIVE":
            return "bg-emerald-900/30 border-emerald-500/40 text-emerald-300";
        case "STANDARD":
            return "bg-amber-900/30 border-amber-500/40 text-amber-200";
        case "SMOKE":
            return "bg-gray-800/60 border-white/10 text-gray-400";
        default:
            return "bg-gray-800/40 border-white/5 text-gray-500";
    }
};

const STAGE_ORDER: TheoryStage[] = ["gauge", "lattice", "brittleness", "control"];

const STAGE_LABELS: Record<TheoryStage, string> = {
    gauge: "Gauge",
    lattice: "Lattice",
    brittleness: "Brittleness",
    control: "Control",
};

const STAGE_SUBTITLES: Record<TheoryStage, string> = {
    gauge: "Coordinate symmetry",
    lattice: "Zero-scaling equivalence",
    brittleness: "Rogue-zero amplification",
    control: "Falsification sanity",
};

const STAGE_ICONS: Record<TheoryStage, React.ComponentType<{ size?: number; className?: string }>> = {
    gauge: Scale,
    lattice: RotateCcw,
    brittleness: Activity,
    control: Shield,
};

// Maps both stage-level (SUPPORTS/REFUTES/CANDIDATE/PARTIAL/INCONCLUSIVE) and
// legacy mechanical statuses (PASS/FAIL/...) to a single visual treatment.
// Theory-fit values dominate: a "REFUTES" badge in red, "SUPPORTS" in green,
// "CANDIDATE"/"PARTIAL" in amber. Control-broken is the most serious red.
const statusStyle = (status: string) => {
    switch (status) {
        case "SUPPORTS":
        case "PASS":
            return {
                wrap: "bg-emerald-900/30 border-emerald-500/40 text-emerald-200",
                label: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
                icon: <CheckCircle2 size={12} />,
            };
        case "REFUTES":
        case "CONTROL_BROKEN":
        case "FAIL":
            return {
                wrap: "bg-red-900/30 border-red-500/40 text-red-200",
                label: "bg-red-500/20 text-red-300 border-red-500/40",
                icon: <XCircle size={12} />,
            };
        case "INFORMATIVE":
            return {
                wrap: "bg-cyan-900/30 border-cyan-500/40 text-cyan-200",
                label: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
                icon: <Compass size={12} />,
            };
        case "CANDIDATE":
        case "NOTEWORTHY":
        case "PARTIAL":
            return {
                wrap: "bg-amber-900/30 border-amber-500/40 text-amber-200",
                label: "bg-amber-500/20 text-amber-300 border-amber-500/40",
                icon: <AlertTriangle size={12} />,
            };
        case "INCONCLUSIVE":
        case "WARN":
        case "INSUFFICIENT_DATA":
        case "INSUFFICIENT_SEPARATION":
        case "SKIP":
            return {
                wrap: "bg-amber-900/20 border-amber-500/30 text-amber-200",
                label: "bg-amber-500/20 text-amber-300 border-amber-500/30",
                icon: <AlertTriangle size={12} />,
            };
        default:
            return {
                wrap: "bg-gray-800/60 border-white/10 text-gray-400",
                label: "bg-gray-700/50 text-gray-400 border-white/10",
                icon: <HelpCircle size={12} />,
            };
    }
};

export default function StageBanner({
    stageVerdicts,
    overall,
    schemaVersion,
    fidelityTier,
    fidelityZeros,
    fidelityDps,
}: Props) {
    if (!stageVerdicts) {
        return (
            <div className="bg-gray-900/40 border border-white/5 rounded-xl p-4 text-xs font-mono text-gray-500">
                No stage verdicts available. Run <code className="text-gray-300">python verifier.py</code> to grade the current artifact.
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-r from-[#06090f] to-[#0a0f18] border border-white/10 rounded-xl p-4 shadow-inner">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-gray-400 uppercase">
                    Theory Fit &middot; Gauge → Lattice → Brittleness
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono text-gray-500">
                    {schemaVersion && <span>schema {schemaVersion}</span>}
                    {fidelityTier && (
                        <span
                            className={clsx(
                                "px-2 py-0.5 rounded border text-[10px] font-bold uppercase",
                                fidelityStyle(fidelityTier)
                            )}
                            title={
                                `Fidelity tier: ${fidelityTier}` +
                                (typeof fidelityZeros === "number" ? ` · zeros=${fidelityZeros}` : "") +
                                (typeof fidelityDps === "number" ? ` · dps=${fidelityDps}` : "") +
                                (fidelityTier === "SMOKE"
                                    ? " — ENABLER/DETECTOR theory verdicts suppressed below declared floor"
                                    : fidelityTier === "STANDARD"
                                    ? " — ENABLER verdicts flagged provisional; cite AUTHORITATIVE only"
                                    : "")
                            }
                        >
                            fidelity: {fidelityTier}
                        </span>
                    )}
                    {overall && (
                        <span
                            className={clsx(
                                "px-2 py-0.5 rounded border text-[10px] font-bold uppercase",
                                statusStyle(overall === "PASS" ? "SUPPORTS" : overall === "FAIL" ? "REFUTES" : overall).label
                            )}
                        >
                            overall: {overall === "PASS" ? "SUPPORTS" : overall === "FAIL" ? "REFUTES" : overall}
                        </span>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {STAGE_ORDER.map((stage) => {
                    const verdict = stageVerdicts[stage];
                    const status = verdict?.status ?? "SKIP";
                    const styles = statusStyle(status);
                    const Icon = STAGE_ICONS[stage];
                    return (
                        <div
                            key={stage}
                            className={clsx(
                                "rounded-lg border p-3 flex flex-col gap-2 transition-colors",
                                styles.wrap
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                                    <Icon size={14} />
                                    {STAGE_LABELS[stage]}
                                </div>
                                <span
                                    className={clsx(
                                        "text-[10px] font-mono px-2 py-0.5 rounded border flex items-center gap-1",
                                        styles.label
                                    )}
                                >
                                    {styles.icon}
                                    {status}
                                </span>
                            </div>
                            <div className="text-[10px] font-mono opacity-70 leading-tight">
                                {STAGE_SUBTITLES[stage]}
                            </div>
                            {verdict?.members && verdict.members.length > 0 && (
                                <div className="text-[9px] font-mono opacity-60 tracking-wide">
                                    {verdict.members.join(" · ")}
                                </div>
                            )}
                            {verdict?.role_breakdown && Object.keys(verdict.role_breakdown).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 text-[9px] font-mono opacity-80">
                                    {Object.entries(verdict.role_breakdown).map(([role, count]) => {
                                        const roleIcon =
                                            role === "ENABLER" ? <Key size={9} /> :
                                            role === "PATHFINDER" ? <Compass size={9} /> :
                                            role === "DETECTOR" ? <Radar size={9} /> :
                                            role === "FALSIFICATION_CONTROL" ? <Shield size={9} /> :
                                            <HelpCircle size={9} />;
                                        const shortLabel =
                                            role === "FALSIFICATION_CONTROL" ? "control" :
                                            role.toLowerCase();
                                        return (
                                            <span
                                                key={role}
                                                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 bg-black/20"
                                                title={`${role}: ${count}`}
                                            >
                                                {roleIcon}
                                                <span>{count} {shortLabel}{count > 1 ? "s" : ""}</span>
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                            {verdict?.reason && (
                                <div className="text-[10px] opacity-70 italic line-clamp-2">
                                    {verdict.reason}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

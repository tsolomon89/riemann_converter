"use client";

import React from "react";
import clsx from "clsx";
import {
    Beaker,
    CheckCircle2,
    Circle,
    ShieldAlert,
    Compass,
    Microscope,
    Activity,
    AlertTriangle,
} from "lucide-react";
import type {
    FidelityTier,
    ImplementationHealth,
    ProofObligation,
    ProofProgram,
    ProgramId,
} from "../lib/types";

// Replaces StageBanner as the top-of-page headline. Renders the theorem
// candidate, the obligation list with per-obligation status + witnesses,
// and a non-theoretic implementation-health strip. No SUPPORTS/REFUTES
// vocabulary and no project-wide theory verdict (PROOF_PROGRAM_SPEC.md §6,
// §8; Decision Log #3/#6).

interface Props {
    proofProgram?: ProofProgram;
    implementationHealth?: { [stage: string]: ImplementationHealth };
    schemaVersion?: string;
    fidelityTier?: FidelityTier;
    fidelityZeros?: number;
    fidelityDps?: number;
    onJumpToGaps?: () => void;
}

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

const obligationStatusStyle = (status: ProofObligation["status"]) => {
    switch (status) {
        case "WITNESSED":
            return {
                wrap: "bg-emerald-900/20 border-emerald-500/30",
                badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
                icon: <CheckCircle2 size={10} />,
            };
        case "FORMALLY_PROVEN":
            return {
                wrap: "bg-blue-900/20 border-blue-500/30",
                badge: "bg-blue-500/20 text-blue-300 border-blue-500/40",
                icon: <CheckCircle2 size={10} />,
            };
        case "OPEN":
        default:
            return {
                wrap: "bg-gray-900/40 border-white/10",
                badge: "bg-gray-800/60 text-gray-400 border-white/10",
                icon: <Circle size={10} />,
            };
    }
};

const programStyle = (program: ProgramId) =>
    program === "PROGRAM_1"
        ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
        : "bg-purple-500/15 text-purple-300 border-purple-500/30";

const healthStyle = (status: ImplementationHealth["status"]) => {
    switch (status) {
        case "IMPLEMENTATION_OK":
            return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
        case "IMPLEMENTATION_BROKEN":
            return "bg-red-500/20 text-red-300 border-red-500/40";
        case "MIXED":
            return "bg-amber-500/15 text-amber-300 border-amber-500/30";
        case "NO_MEMBERS":
        default:
            return "bg-gray-800/60 text-gray-500 border-white/10";
    }
};

export default function ProofProgramMap({
    proofProgram,
    implementationHealth,
    schemaVersion,
    fidelityTier,
    fidelityZeros,
    fidelityDps,
    onJumpToGaps,
}: Props) {
    if (!proofProgram) {
        return (
            <div className="bg-gray-900/40 border border-white/5 rounded-xl p-4 text-xs font-mono text-gray-500">
                No proof program artifact found. Run{" "}
                <code className="text-gray-300">python verifier.py</code> to regenerate.
            </div>
        );
    }

    const { theorem_candidate, obligations, open_gaps } = proofProgram;

    return (
        <div className="bg-gradient-to-br from-[#06090f] to-[#0a0f18] border border-white/10 rounded-xl p-5 shadow-inner space-y-5">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-gray-400 uppercase">
                    <Beaker size={12} /> Proof Program
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono text-gray-500">
                    {schemaVersion && <span>schema {schemaVersion}</span>}
                    {fidelityTier && (
                        <span
                            className={clsx(
                                "px-2 py-0.5 rounded border text-[10px] font-bold uppercase",
                                fidelityStyle(fidelityTier),
                            )}
                            title={
                                `Fidelity tier: ${fidelityTier}` +
                                (typeof fidelityZeros === "number" ? ` · zeros=${fidelityZeros}` : "") +
                                (typeof fidelityDps === "number" ? ` · dps=${fidelityDps}` : "")
                            }
                        >
                            fidelity: {fidelityTier}
                        </span>
                    )}
                </div>
            </div>

            {/* Theorem candidate */}
            <section className="space-y-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-blue-400">
                    Theorem Candidate
                </div>
                <div className="bg-black/30 rounded-lg border border-blue-500/20 p-4 space-y-3">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-gray-500">
                        Formal statement
                    </div>
                    <p className="text-sm text-gray-200 leading-relaxed">
                        {theorem_candidate.formal_statement}
                    </p>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-gray-500 pt-2">
                        Plain language
                    </div>
                    <p className="text-sm text-emerald-100/90 italic leading-relaxed">
                        “{theorem_candidate.plain_language}”
                    </p>
                    <div className="flex items-center gap-3 pt-1 text-[10px] font-mono text-gray-500">
                        <span>
                            working gauge:{" "}
                            <code className="text-blue-200">
                                {theorem_candidate.working_gauge.base}
                            </code>
                        </span>
                        <span
                            className={clsx(
                                "px-2 py-0.5 rounded border",
                                theorem_candidate.working_gauge.unique
                                    ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
                                    : "text-amber-300 bg-amber-500/10 border-amber-500/30",
                            )}
                            title={
                                theorem_candidate.working_gauge.unique
                                    ? "τ-uniqueness is claimed."
                                    : "τ-uniqueness is NOT a proof obligation (GAP_TAU_UNIQUENESS)."
                            }
                        >
                            uniqueness: {theorem_candidate.working_gauge.unique ? "required" : "not required"}
                        </span>
                    </div>
                    {theorem_candidate.non_claims.length > 0 && (
                        <details className="pt-2">
                            <summary className="text-[10px] font-mono uppercase tracking-wider text-gray-500 cursor-pointer hover:text-gray-300">
                                Non-claims ({theorem_candidate.non_claims.length})
                            </summary>
                            <ul className="mt-2 space-y-1 text-[11px] text-gray-400 list-disc pl-5">
                                {theorem_candidate.non_claims.map((nc, i) => (
                                    <li key={i}>{nc}</li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            </section>

            {/* Obligations */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-blue-400">
                        Proof obligations ({obligations.length})
                    </div>
                    <div className="text-[9px] font-mono text-gray-500 italic">
                        Only `PROOF_OBLIGATION_WITNESS` + `CONSISTENT` + AUTHORITATIVE counts as theorem-directed evidence.
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-2">
                    {obligations.map((obl) => {
                        const s = obligationStatusStyle(obl.status);
                        return (
                            <div
                                key={obl.id}
                                className={clsx(
                                    "rounded-lg border p-3 flex flex-col gap-2",
                                    s.wrap,
                                )}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-[11px] font-bold text-gray-100 truncate">
                                            {obl.title}
                                        </span>
                                        <code className="text-[9px] font-mono text-gray-500 truncate">
                                            {obl.id}
                                        </code>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span
                                            className={clsx(
                                                "text-[9px] font-mono px-2 py-0.5 rounded border uppercase tracking-tight",
                                                programStyle(obl.program),
                                            )}
                                            title={
                                                obl.program === "PROGRAM_1"
                                                    ? "Program 1: direct invariance (canonical)"
                                                    : "Program 2: contradiction-by-detectability (exploratory only)"
                                            }
                                        >
                                            {obl.program === "PROGRAM_1" ? "P1 canonical" : "P2 exploratory"}
                                        </span>
                                        <span
                                            className={clsx(
                                                "text-[10px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 uppercase tracking-tight",
                                                s.badge,
                                            )}
                                        >
                                            {s.icon}
                                            {obl.status}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-[11px] text-gray-300 leading-relaxed">
                                    {obl.statement}
                                </p>
                                <div className="flex items-center justify-between text-[10px] font-mono text-gray-500">
                                    <span>
                                        witnesses:{" "}
                                        {obl.witnesses.length > 0 ? (
                                            <code className="text-emerald-300">
                                                {obl.witnesses.join(", ")}
                                            </code>
                                        ) : (
                                            <span className="text-gray-600 italic">none</span>
                                        )}
                                    </span>
                                    {obl.inference.disallowed_conclusion.length > 0 && (
                                        <span
                                            className="italic text-amber-300/80 truncate max-w-[60%]"
                                            title={obl.inference.disallowed_conclusion.join(" · ")}
                                        >
                                            ✗ {obl.inference.disallowed_conclusion[0]}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Open gaps strip */}
            {open_gaps.length > 0 && (
                <section className="space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400 flex items-center gap-1">
                            <AlertTriangle size={12} /> Open gaps ({open_gaps.length})
                        </div>
                        {onJumpToGaps && (
                            <button
                                onClick={onJumpToGaps}
                                className="text-[10px] font-mono text-amber-300 hover:text-amber-200 underline-offset-2 hover:underline"
                            >
                                jump to details ↓
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {open_gaps.map((g) => (
                            <span
                                key={g.id}
                                className="text-[10px] font-mono px-2 py-1 rounded border border-amber-500/20 bg-amber-900/15 text-amber-200"
                                title={g.description}
                            >
                                {g.id}
                            </span>
                        ))}
                    </div>
                </section>
            )}

            {/* Implementation-health strip (non-theoretic) */}
            {implementationHealth && (
                <section className="space-y-2 pt-2 border-t border-white/5">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 flex items-center gap-2">
                        <Activity size={12} /> Implementation health
                        <span className="normal-case text-[9px] text-gray-600 italic">
                            engine-level per-stage aggregate (not a theory verdict)
                        </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {(["gauge", "lattice", "brittleness", "control"] as const).map((stg) => {
                            const h = implementationHealth[stg];
                            if (!h) return null;
                            return (
                                <div
                                    key={stg}
                                    className={clsx(
                                        "rounded border px-2 py-1.5 flex flex-col gap-0.5",
                                        healthStyle(h.status),
                                    )}
                                    title={h.reason ?? ""}
                                >
                                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono uppercase">
                                        <span>{stg}</span>
                                        <span className="opacity-70">{h.members.length}</span>
                                    </div>
                                    <div className="text-[9px] font-mono opacity-90">
                                        {h.status.toLowerCase().replace(/_/g, " ")}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Legend (keeps the vocabulary explicit to prevent drift) */}
            <div className="flex flex-wrap gap-3 pt-2 border-t border-white/5 text-[9px] font-mono text-gray-500">
                <span className="flex items-center gap-1">
                    <Microscope size={10} /> witness
                </span>
                <span className="flex items-center gap-1">
                    <ShieldAlert size={10} /> control
                </span>
                <span className="flex items-center gap-1">
                    <Compass size={10} /> pathfinder
                </span>
                <span className="italic">Not every experiment is a verdict on the theory.</span>
            </div>
        </div>
    );
}

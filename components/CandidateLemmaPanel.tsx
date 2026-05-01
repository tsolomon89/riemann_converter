"use client";

import React from "react";
import clsx from "clsx";
import type { CandidateLemma } from "../lib/lemma-generator";

const STATUS_TONE: Record<CandidateLemma["status"], string> = {
    SUGGESTED_FROM_PASS: "border-emerald-500/40 bg-emerald-900/20 text-emerald-200",
    SUGGESTED_FROM_FAILURE: "border-amber-500/40 bg-amber-900/20 text-amber-200",
    DEFERRED: "border-cyan-500/40 bg-cyan-900/20 text-cyan-200",
    NO_LEMMA_SUGGESTED: "border-gray-500/40 bg-gray-900/40 text-gray-300",
};

const STATUS_LABEL: Record<CandidateLemma["status"], string> = {
    SUGGESTED_FROM_PASS: "Candidate (from pass)",
    SUGGESTED_FROM_FAILURE: "Candidate (from failure-direction)",
    DEFERRED: "Deferred",
    NO_LEMMA_SUGGESTED: "No lemma suggested",
};

export default function CandidateLemmaPanel({
    lemmas,
    className,
}: {
    lemmas: CandidateLemma[];
    className?: string;
}) {
    if (!lemmas || lemmas.length === 0) {
        return (
            <div className={clsx("rounded border border-white/10 bg-black/30 p-3 text-[10px] font-mono italic text-gray-500", className)}>
                No candidate lemma generated for this run.
            </div>
        );
    }

    return (
        <div className={clsx("space-y-2", className)} data-testid="candidate-lemma-panel">
            {lemmas.map((lemma, i) => (
                <div
                    key={i}
                    className={clsx("rounded border bg-black/30 p-3 space-y-2", STATUS_TONE[lemma.status] ?? "border-white/10")}
                    data-testid="candidate-lemma-card"
                    data-lemma-status={lemma.status}
                >
                    <div className="flex items-start justify-between gap-2">
                        <div className="font-mono text-[11px]">{lemma.name}</div>
                        <span className="text-[9px] font-mono uppercase tracking-widest opacity-80">
                            {STATUS_LABEL[lemma.status] ?? lemma.status}
                        </span>
                    </div>
                    <div className="text-[11px] leading-snug">{lemma.statement}</div>
                    {lemma.alternative_directions && lemma.alternative_directions.length > 0 && (
                        <div className="space-y-1">
                            <div className="text-[9px] font-mono uppercase tracking-wider text-amber-300/80">
                                alternative directions
                            </div>
                            <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-amber-100/90">
                                {lemma.alternative_directions.map((alt, idx) => (
                                    <li key={idx}>{alt}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {lemma.what_it_does_not_prove && lemma.what_it_does_not_prove.length > 0 && (
                        <div className="space-y-1">
                            <div className="text-[9px] font-mono uppercase tracking-wider text-red-400/80">
                                what it does not prove
                            </div>
                            <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-red-100/90">
                                {lemma.what_it_does_not_prove.map((d, idx) => (
                                    <li key={idx}>{d}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <div className="text-[9px] font-mono uppercase tracking-wider text-gray-500">
                        scope: {lemma.scope}
                    </div>
                </div>
            ))}
        </div>
    );
}

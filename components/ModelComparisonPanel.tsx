"use client";

import React from "react";
import clsx from "clsx";
import type { ModelComparison } from "../lib/lemma-generator";

const STATUS_TONE: Record<string, string> = {
    CONFIRMED: "border-emerald-500/40 bg-emerald-900/20 text-emerald-200",
    FAILED: "border-red-500/40 bg-red-900/20 text-red-200",
    INCONCLUSIVE: "border-gray-500/40 bg-gray-900/40 text-gray-300",
    INCOMPLETE: "border-cyan-500/40 bg-cyan-900/20 text-cyan-200",
    NOT_APPLICABLE: "border-violet-500/40 bg-violet-900/20 text-violet-200",
};

const PRIORITY_TONE: Record<string, string> = {
    HIGH: "border-red-500/40 text-red-200",
    MEDIUM: "border-amber-500/40 text-amber-200",
    LOW: "border-gray-500/40 text-gray-300",
};

export default function ModelComparisonPanel({
    comparison,
    className,
}: {
    comparison: ModelComparison | null;
    className?: string;
}) {
    if (!comparison) {
        return (
            <div className={clsx("rounded border border-white/10 bg-black/30 p-3 text-[10px] font-mono italic text-gray-500", className)}>
                No model comparison artifact for this run.
            </div>
        );
    }
    const status = comparison.fit_result.baseline_status;
    return (
        <div
            className={clsx("rounded border bg-black/30 p-3 space-y-2", STATUS_TONE[status] ?? "border-white/10", className)}
            data-testid="model-comparison-panel"
        >
            <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-widest">
                <span>Model Comparison</span>
                <span className={clsx("rounded border px-1.5 py-0.5", PRIORITY_TONE[comparison.agent_review_priority])}>
                    review priority: {comparison.agent_review_priority}
                </span>
            </div>
            <div className="text-[10px] font-mono">
                <span className="text-gray-400">baseline status:</span>{" "}
                <span data-testid="baseline-status">{status}</span>
            </div>
            <dl className="grid grid-cols-1 gap-1 text-[11px]">
                <div>
                    <dt className="text-[9px] font-mono uppercase tracking-wider text-gray-400">Predicted</dt>
                    <dd>
                        <span className="font-mono">{comparison.baseline_prediction.metric}</span>{" "}
                        <span className="text-gray-400">→</span> {comparison.baseline_prediction.expected}
                        <span className="text-gray-500"> (tol: {comparison.baseline_prediction.tolerance})</span>
                    </dd>
                </div>
                <div>
                    <dt className="text-[9px] font-mono uppercase tracking-wider text-gray-400">Pass rule</dt>
                    <dd>{comparison.baseline_prediction.pass_rule}</dd>
                </div>
                <div>
                    <dt className="text-[9px] font-mono uppercase tracking-wider text-gray-400">Reason</dt>
                    <dd>{comparison.fit_result.reason}</dd>
                </div>
                {comparison.fit_result.failed_metrics.length > 0 && (
                    <div>
                        <dt className="text-[9px] font-mono uppercase tracking-wider text-red-300/80">Failed metrics</dt>
                        <dd>
                            <ul className="list-disc pl-5 space-y-0.5 text-red-100/90">
                                {comparison.fit_result.failed_metrics.map((m, i) => (
                                    <li key={i} className="font-mono text-[10px]">
                                        {m}
                                    </li>
                                ))}
                            </ul>
                        </dd>
                    </div>
                )}
                {comparison.alternative_model_candidates.length > 0 && (
                    <div>
                        <dt className="text-[9px] font-mono uppercase tracking-wider text-amber-300/80">Alternative model candidates</dt>
                        <dd>
                            <ul className="list-disc pl-5 space-y-0.5 text-amber-100/90">
                                {comparison.alternative_model_candidates.map((alt, i) => (
                                    <li key={i} className="text-[11px]">
                                        {alt}
                                    </li>
                                ))}
                            </ul>
                        </dd>
                    </div>
                )}
            </dl>
        </div>
    );
}

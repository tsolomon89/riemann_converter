"use client";

import React, { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { ExperimentReview, ModelComparison } from "../lib/lemma-generator";
import CandidateLemmaPanel from "./CandidateLemmaPanel";
import ModelComparisonPanel from "./ModelComparisonPanel";

interface Props {
    /** Stable id (EXP_2B), display id (P2-2), or alias (rogue-isolation). */
    experimentId: string | null | undefined;
    /** Optional explicit run id; defaults to the latest run. */
    runId?: string | null;
    className?: string;
    /** Pre-fetched review (skips fetch). Used for SSR / tests. */
    initialReview?: ExperimentReview | null;
    /** Pre-fetched model comparison (skips fetch). */
    initialComparison?: ModelComparison | null;
}

interface ReviewEnvelope {
    ok: boolean;
    run_id: string | null;
    data: ExperimentReview | null;
    warnings: string[];
    errors: string[];
    plain_language_summary: string;
}

interface ModelEnvelope {
    ok: boolean;
    data: ModelComparison | null;
}

const BASELINE_TONE: Record<string, string> = {
    CONFIRMED: "border-emerald-500/40 bg-emerald-900/20 text-emerald-200",
    FAILED: "border-red-500/40 bg-red-900/20 text-red-200",
    INCONCLUSIVE: "border-gray-500/40 bg-gray-900/40 text-gray-300",
    INCOMPLETE: "border-cyan-500/40 bg-cyan-900/20 text-cyan-200",
    NOT_APPLICABLE: "border-violet-500/40 bg-violet-900/20 text-violet-200",
};

const SCOPE_TONE: Record<string, string> = {
    THEORY: "border-red-600/60 text-red-200",
    FORMALIZATION: "border-orange-500/60 text-orange-200",
    WITNESS: "border-amber-500/60 text-amber-200",
    ROUTE: "border-yellow-500/60 text-yellow-200",
    IMPLEMENTATION: "border-cyan-500/60 text-cyan-200",
    BASELINE_MODEL: "border-violet-500/60 text-violet-200",
    NONE: "border-gray-500/60 text-gray-300",
};

function buildQuery(runId?: string | null) {
    const qs = new URLSearchParams();
    if (runId) qs.set("run_id", runId);
    return qs.toString() ? `?${qs.toString()}` : "";
}

export default function ExperimentReviewPanel({
    experimentId,
    runId = null,
    className,
    initialReview,
    initialComparison,
}: Props) {
    const hasInitial = initialReview !== undefined;
    const [state, setState] = useState<{
        loading: boolean;
        review: ExperimentReview | null;
        comparison: ModelComparison | null;
        warnings: string[];
        errors: string[];
        summary: string;
    }>({
        loading: !hasInitial,
        review: initialReview ?? null,
        comparison: initialComparison ?? null,
        warnings: [],
        errors: [],
        summary: "",
    });

    const reviewUrl = useMemo(
        () => experimentId ? `/api/research/experiment-reviews/${encodeURIComponent(experimentId)}${buildQuery(runId)}` : null,
        [experimentId, runId],
    );
    const modelUrl = useMemo(
        () => experimentId ? `/api/research/model-comparisons/${encodeURIComponent(experimentId)}${buildQuery(runId)}` : null,
        [experimentId, runId],
    );

    useEffect(() => {
        if (hasInitial) return;
        if (!reviewUrl || !modelUrl) {
            setState({ loading: false, review: null, comparison: null, warnings: [], errors: ["no experiment id"], summary: "" });
            return;
        }
        let cancelled = false;
        setState((s) => ({ ...s, loading: true }));
        Promise.all([fetch(reviewUrl), fetch(modelUrl)])
            .then(async ([r, m]) => {
                const reviewBody = (await r.json()) as ReviewEnvelope;
                const modelBody = (await m.json()) as ModelEnvelope;
                if (cancelled) return;
                setState({
                    loading: false,
                    review: reviewBody.data,
                    comparison: modelBody.data,
                    warnings: reviewBody.warnings ?? [],
                    errors: reviewBody.errors ?? [],
                    summary: reviewBody.plain_language_summary ?? "",
                });
            })
            .catch((err) => {
                if (cancelled) return;
                setState({
                    loading: false,
                    review: null,
                    comparison: null,
                    warnings: [],
                    errors: [String(err)],
                    summary: "",
                });
            });
        return () => {
            cancelled = true;
        };
    }, [reviewUrl, modelUrl, hasInitial]);

    if (state.loading) {
        return (
            <div className={clsx("rounded border border-white/10 bg-black/30 p-3 text-[10px] font-mono italic text-gray-500", className)}>
                Loading experiment review…
            </div>
        );
    }

    if (!state.review) {
        return (
            <div
                className={clsx(
                    "rounded border border-white/10 bg-black/30 p-3 text-[10px] font-mono text-gray-400 space-y-1",
                    className,
                )}
                data-testid="experiment-review-empty"
            >
                <div className="uppercase tracking-widest text-gray-500">Experiment review</div>
                <div>{state.summary || "No experiment review available for this run."}</div>
                {state.errors.length > 0 && (
                    <ul className="list-disc pl-5 text-red-300/80">
                        {state.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }

    const review = state.review;
    const baselineStatus = review.model_comparison.baseline_status;
    const baselineTone = BASELINE_TONE[baselineStatus] ?? "border-white/10";
    const scopeTone = SCOPE_TONE[review.scoped_consequence] ?? "border-white/10";

    return (
        <div
            className={clsx("rounded border bg-black/30 p-4 space-y-4", baselineTone, className)}
            data-testid="experiment-review-panel"
            data-experiment-id={review.experiment_id}
            data-baseline-status={baselineStatus}
            data-scoped-consequence={review.scoped_consequence}
        >
            <header className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-mono text-xs uppercase tracking-widest opacity-80">
                        {review.display_id} · {review.experiment_id} · {review.role} · {review.program}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono uppercase tracking-widest border rounded px-2 py-0.5 border-white/30">
                            baseline: {baselineStatus}
                        </span>
                        <span className={clsx("text-[9px] font-mono uppercase tracking-widest border rounded px-2 py-0.5", scopeTone)}>
                            scoped: {review.scoped_consequence}
                        </span>
                    </div>
                </div>
                <div className="text-[11px] text-gray-300/90">{state.summary}</div>
            </header>

            <section className="space-y-1">
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
                    Baseline hypothesis
                </h3>
                <div className="text-[12px] leading-snug">
                    {review.baseline_hypothesis.plain_statement}
                </div>
                <dl className="text-[10px] grid grid-cols-1 gap-1 text-gray-300">
                    <div>
                        <dt className="inline text-gray-500">primary metric: </dt>
                        <dd className="inline font-mono">{review.baseline_hypothesis.expected_signature.primary_metric}</dd>
                    </div>
                    <div>
                        <dt className="inline text-gray-500">expected: </dt>
                        <dd className="inline">{review.baseline_hypothesis.expected_signature.expected_value}</dd>
                    </div>
                    <div>
                        <dt className="inline text-gray-500">tolerance: </dt>
                        <dd className="inline">{review.baseline_hypothesis.expected_signature.tolerance}</dd>
                    </div>
                    <div>
                        <dt className="inline text-gray-500">pass rule: </dt>
                        <dd className="inline">{review.baseline_hypothesis.expected_signature.pass_rule}</dd>
                    </div>
                </dl>
                {review.baseline_hypothesis.why_this_matters && (
                    <p className="text-[11px] text-gray-300/90 italic">{review.baseline_hypothesis.why_this_matters}</p>
                )}
            </section>

            <section className="space-y-1" data-testid="actual-run-inference">
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-emerald-300/80">
                    Actual run inference (this run only)
                </h3>
                <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                    {review.actual_run_inference.map((line, i) => (
                        <li key={i}>{line}</li>
                    ))}
                </ul>
            </section>

            <ModelComparisonPanel comparison={state.comparison} />

            <section className="space-y-1" data-testid="candidate-lemma-section">
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-amber-300/80">
                    Candidate lemma / research note
                </h3>
                <CandidateLemmaPanel lemmas={review.candidate_lemmas} />
            </section>

            {review.next_hypotheses.length > 0 && (
                <section className="space-y-1">
                    <h3 className="text-[10px] font-mono uppercase tracking-widest text-cyan-300/80">
                        Next test / next hypothesis
                    </h3>
                    <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-cyan-100/90">
                        {review.next_hypotheses.map((line, i) => (
                            <li key={i}>{line}</li>
                        ))}
                    </ul>
                </section>
            )}

            {review.intended_inference_if_passed.length > 0 && (
                <section className="space-y-1" data-testid="intended-if-passed">
                    <h3 className="text-[10px] font-mono uppercase tracking-widest text-violet-300/80">
                        Intended inference if baseline is confirmed
                        <span className="ml-2 normal-case tracking-normal text-[9px] text-violet-300/60">
                            (do NOT read as the conclusion of this run)
                        </span>
                    </h3>
                    <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-violet-100/80 italic">
                        {review.intended_inference_if_passed.map((line, i) => (
                            <li key={i}>{line}</li>
                        ))}
                    </ul>
                </section>
            )}

            {review.disallowed_conclusions.length > 0 && (
                <section className="space-y-1" data-testid="disallowed-conclusions">
                    <h3 className="text-[10px] font-mono uppercase tracking-widest text-red-300/80">
                        What this does not prove (always)
                    </h3>
                    <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-red-100/90">
                        {review.disallowed_conclusions.map((line, i) => (
                            <li key={i}>{line}</li>
                        ))}
                    </ul>
                </section>
            )}

            {state.warnings.length > 0 && (
                <ul className="text-[10px] font-mono italic text-amber-200/80 list-disc pl-5">
                    {state.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

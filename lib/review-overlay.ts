/**
 * Read-time overlay merge for the proof-discovery layer.
 *
 * Per-run review / model-comparison / lemma artifacts on disk are written
 * once at run completion against the canonical baseline that was active then.
 * If a proposal is later accepted, the canonical registry now serves a
 * different baseline for the same experiment — but mutating those on-disk
 * files would silently rewrite history.
 *
 * This module mirrors the data-driven parts of
 * `proof_kernel/lemma_generator.py` and re-templates the registry-derived
 * fields of an on-disk review against the current overlay-merged baseline,
 * stamping the result with `_overlay_provenance` so consumers can tell when
 * a merge happened.
 *
 * The on-disk JSON stays frozen. The Python generator remains the canonical
 * write-time author. This module only assists at request time.
 */

import type {
    BaselineHypothesis,
    BaselineStatus,
} from "./hypothesis-registry";
import type {
    CandidateLemma,
    ExperimentReview,
    ModelComparison,
    ProofDiscoveryIndex,
    ProofDiscoveryLemmaEntry,
    ScopedConsequence,
} from "./lemma-generator";

// ---------------------------------------------------------------------------
// Provenance shape
// ---------------------------------------------------------------------------

export interface OverlayProvenance {
    from_proposal_id?: string | null;
    accepted_by?: string | null;
    accepted_at?: string | null;
    old_baseline_hash?: string | null;
    new_baseline_hash?: string | null;
}

export interface OverlayResult<T> {
    data: T;
    overlay_applied: boolean;
    provenance: OverlayProvenance | null;
}

// ---------------------------------------------------------------------------
// Helpers — port of proof_kernel.lemma_generator templating
// ---------------------------------------------------------------------------

function readProvenance(baseline: BaselineHypothesis): OverlayProvenance | null {
    const p = (baseline as { _overlay_provenance?: OverlayProvenance })._overlay_provenance;
    if (!p || typeof p !== "object") return null;
    return p;
}

/** Stable representation of the registry-sourced fields used for change detection. */
function baselineFingerprint(b: { plain_statement: string; expected_signature: BaselineHypothesis["expected_signature"]; object_under_test: string; why_this_matters?: string }): string {
    return JSON.stringify({
        ps: b.plain_statement,
        sig: b.expected_signature,
        obj: b.object_under_test,
        why: b.why_this_matters ?? "",
    });
}

function formatMetric(value: number | null | undefined): string {
    if (value === null || value === undefined) return "";
    if (Math.abs(value) >= 1e6 || (value !== 0 && Math.abs(value) < 1e-3)) {
        return value.toExponential(3).replace(/e([-+])/, "e$1");
    }
    return value.toString();
}

function buildActualRunInference(
    baseline: BaselineHypothesis,
    status: BaselineStatus,
): string[] {
    const role = baseline.role;
    const displayId = baseline.display_id;
    const plain = baseline.plain_statement;

    if (status === "CONFIRMED") {
        if (role === "control") {
            return [
                `${displayId}: the falsifier described by this control is armed in this run.`,
                "This is a statement about instrument health, not theory support.",
            ];
        }
        if (role === "visualization" || role === "demonstration") {
            return [
                `${displayId}: the descriptive baseline is consistent with this run's output.`,
                "No theoretical conclusion follows.",
            ];
        }
        if (role === "pathfinder" || role === "exploratory") {
            return [
                `${displayId}: the pathfinder / guardrail behaved as declared on this run's window.`,
                "This is a direction note, not theory support.",
            ];
        }
        return [
            `${displayId}: the finite/proxy baseline was confirmed on this run's window.`,
            `What was tested: ${plain}`,
            "This preserves the route the experiment witnesses; it does not prove the base claim or any necessary condition.",
        ];
    }

    if (status === "FAILED") {
        if (role === "control") {
            return [
                `${displayId}: the control did not produce its expected divergence on this run.`,
                "Implementation health is in question; results from related experiments may be unreliable until fixed.",
                "This is not a statement about the theory.",
            ];
        }
        if (role === "visualization" || role === "demonstration") {
            return [
                `${displayId}: the descriptive / demonstration baseline did not match this run.`,
                "The visualization or mapping needs review; this does not refute the theory.",
            ];
        }
        if (role === "pathfinder" || role === "exploratory") {
            return [
                `${displayId}: the pathfinder / guardrail did not give a decisive signal on this run.`,
                "The direction note is inconclusive; the theory is not refuted.",
            ];
        }
        return [
            `${displayId}: the current baseline was not confirmed on this run.`,
            `Baseline tested: ${plain}`,
            "The raw data may still contain structured behavior — see candidate lemma and alternative-hypothesis suggestions.",
            "This run does not, by itself, refute the base claim.",
        ];
    }

    if (status === "INCONCLUSIVE") {
        return [
            `${displayId}: the run was inconclusive against this baseline.`,
            "More precision, a wider window, or a revised metric may be needed to decide.",
        ];
    }
    if (status === "INCOMPLETE") {
        return [
            `${displayId}: the run produced partial / directional information against this baseline.`,
            "Strengthening the metric or extending the window is the natural next step.",
        ];
    }
    return [
        `${displayId}: status not determinable from this run.`,
        "This is an instrument / coverage gap, not a theory result.",
    ];
}

function buildCandidateLemmas(
    baseline: BaselineHypothesis,
    status: BaselineStatus,
    summaryMetric: number | null,
): CandidateLemma[] {
    const name = baseline.candidate_lemma_name ?? `${baseline.display_id} Candidate Note`;
    const primaryMetric = baseline.expected_signature?.primary_metric ?? "";
    const metricStr = formatMetric(summaryMetric);
    const metricClause = metricStr && primaryMetric
        ? ` (primary metric ${primaryMetric}: observed ≈ ${metricStr})`
        : metricStr ? ` (observed summary value ≈ ${metricStr})` : "";

    const observedMetric = summaryMetric !== null && summaryMetric !== undefined
        ? { primary_metric: primaryMetric || null, value: summaryMetric }
        : null;

    if (status === "CONFIRMED") {
        return [{
            name,
            status: "SUGGESTED_FROM_PASS",
            statement:
                `On this run's window, ${baseline.plain_statement.replace(/\.$/, "")} held within tolerance${metricClause}. ` +
                "Formalizing this as a finite/proxy lemma is the next research step.",
            scope: "finite/proxy",
            observed_metric: observedMetric,
            what_it_does_not_prove: baseline.disallowed_conclusions ?? [],
        }];
    }

    if (status === "FAILED") {
        return [{
            name: `${name} (failure-direction)`,
            status: "SUGGESTED_FROM_FAILURE",
            statement:
                `The current baseline (${baseline.plain_statement.replace(/\.$/, "")}) was not confirmed on this run${metricClause}. ` +
                "A revised lemma should account for the observed deviation, possibly via one of the alternative hypotheses below.",
            scope: "baseline-revision",
            observed_metric: observedMetric,
            alternative_directions: baseline.possible_alternative_hypotheses ?? [],
            what_it_does_not_prove: baseline.disallowed_conclusions ?? [],
        }];
    }

    if (status === "INCONCLUSIVE" || status === "INCOMPLETE") {
        return [{
            name: `${name} (deferred)`,
            status: "DEFERRED",
            statement:
                `This run was ${status.toLowerCase()} against the current baseline${metricClause}. ` +
                "No candidate lemma is suggested until the baseline is confirmed or definitively failed.",
            scope: "deferred",
            observed_metric: observedMetric,
            what_it_does_not_prove: baseline.disallowed_conclusions ?? [],
        }];
    }

    return [{
        name: `${name} (no-lemma)`,
        status: "NO_LEMMA_SUGGESTED",
        statement: `This experiment is ${baseline.role}-typed; no candidate lemma is suggested from this run.`,
        scope: baseline.role,
        what_it_does_not_prove: baseline.disallowed_conclusions ?? [],
    }];
}

function buildNextHypotheses(
    baseline: BaselineHypothesis,
    status: BaselineStatus,
): string[] {
    if (status === "FAILED") {
        return [...(baseline.possible_alternative_hypotheses ?? [])];
    }
    if (status === "CONFIRMED") {
        return [
            `Extend the tested window for ${baseline.display_id} to confirm robustness.`,
            `Tighten the tolerance on ${baseline.expected_signature.primary_metric} and re-run.`,
        ];
    }
    if (status === "INCONCLUSIVE" || status === "INCOMPLETE") {
        return [
            `Increase precision and re-run ${baseline.display_id}.`,
            `Re-examine the metric ${baseline.expected_signature.primary_metric} for sensitivity.`,
        ];
    }
    return [];
}

function scopedConsequenceForRoleAndStatus(
    role: BaselineHypothesis["role"],
    status: BaselineStatus,
    scopedStatus: string | null | undefined,
): ScopedConsequence {
    if (status === "CONFIRMED" || status === "NOT_APPLICABLE") return "NONE";
    if (role === "control") return "IMPLEMENTATION";
    if (role === "pathfinder" || role === "exploratory" || role === "visualization" || role === "demonstration") {
        return status === "INCONCLUSIVE" ? "NONE" : "BASELINE_MODEL";
    }
    if (status === "FAILED") {
        const sc = (scopedStatus ?? "").toUpperCase();
        if (sc.includes("ROUTE")) return "ROUTE";
        if (sc.includes("WITNESS")) return "WITNESS";
        return "BASELINE_MODEL";
    }
    return "BASELINE_MODEL";
}

// ---------------------------------------------------------------------------
// Public API: review + model-comparison merge
// ---------------------------------------------------------------------------

/**
 * Merge an on-disk review with the current overlay-aware baseline. If the
 * baseline hasn't changed (no overlay applied since the review was written),
 * returns the review unchanged with `overlay_applied: false`. Otherwise
 * re-templates the registry-sourced fields and stamps `_overlay_provenance`.
 */
export function applyReviewOverlay(
    review: ExperimentReview,
    currentBaseline: BaselineHypothesis | null,
): OverlayResult<ExperimentReview> {
    if (!currentBaseline) {
        return { data: review, overlay_applied: false, provenance: null };
    }
    const reviewBaselineFp = baselineFingerprint(review.baseline_hypothesis);
    const currentBaselineFp = baselineFingerprint(currentBaseline);
    if (reviewBaselineFp === currentBaselineFp) {
        return { data: review, overlay_applied: false, provenance: null };
    }

    const status = review.model_comparison.baseline_status;
    const summaryMetric = (() => {
        const fm = review.model_comparison.fit_metrics as Record<string, unknown> | undefined;
        const v = fm?.summary_metric;
        return typeof v === "number" ? v : null;
    })();
    const provenance = readProvenance(currentBaseline);

    // Merge disallowed_conclusions: registry side from new baseline, plus any
    // verifier-side disallowances already in the on-disk review (kept verbatim).
    const fromBaseline = currentBaseline.disallowed_conclusions ?? [];
    const fromVerifier = review.disallowed_conclusions.filter(
        (d) => !(review.baseline_hypothesis as unknown as { disallowed_conclusions?: string[] }).disallowed_conclusions?.includes(d),
    );
    // Simpler heuristic: keep any existing entry that isn't a registry disallowance.
    const merged: string[] = [...fromBaseline];
    for (const d of review.disallowed_conclusions) {
        if (!merged.includes(d)) merged.push(d);
    }

    const newReview: ExperimentReview = {
        ...review,
        baseline_hypothesis: {
            id: currentBaseline.hypothesis_id,
            plain_statement: currentBaseline.plain_statement,
            object_under_test: currentBaseline.object_under_test,
            expected_signature: currentBaseline.expected_signature,
            why_this_matters: currentBaseline.why_this_matters,
        },
        intended_inference_if_passed: currentBaseline.intended_inference_if_passed ?? [],
        actual_run_inference: buildActualRunInference(currentBaseline, status),
        candidate_lemmas: buildCandidateLemmas(currentBaseline, status, summaryMetric),
        next_hypotheses: buildNextHypotheses(currentBaseline, status),
        disallowed_conclusions: merged,
        scoped_consequence: scopedConsequenceForRoleAndStatus(
            currentBaseline.role,
            status,
            review.verifier_signal?.scoped_status,
        ),
        model_comparison: {
            ...review.model_comparison,
            alternative_model_candidates:
                status === "FAILED"
                    ? (currentBaseline.possible_alternative_hypotheses ?? [])
                    : [],
            failed_metrics: status === "FAILED"
                ? (review.model_comparison.failed_metrics.length > 0
                    ? review.model_comparison.failed_metrics
                    : (currentBaseline.expected_signature.primary_metric
                        ? [currentBaseline.expected_signature.primary_metric]
                        : []))
                : review.model_comparison.failed_metrics,
        },
    };

    void fromVerifier; // kept name for clarity; merge above already covers
    return { data: newReview, overlay_applied: true, provenance };
}

/**
 * Merge an on-disk model comparison with the current overlay-aware baseline.
 */
export function applyComparisonOverlay(
    comparison: ModelComparison,
    currentBaseline: BaselineHypothesis | null,
): OverlayResult<ModelComparison> {
    if (!currentBaseline) {
        return { data: comparison, overlay_applied: false, provenance: null };
    }
    // The on-disk comparison records `baseline_hypothesis_id`. If the current
    // baseline's hypothesis_id matches but its expected_signature differs, we
    // need to merge.
    if (comparison.baseline_hypothesis_id !== currentBaseline.hypothesis_id) {
        // hypothesis_id mismatch — overlay is not for this comparison; leave alone.
        return { data: comparison, overlay_applied: false, provenance: null };
    }
    const oldSig = JSON.stringify(comparison.baseline_prediction);
    const newSig = JSON.stringify({
        metric: currentBaseline.expected_signature.primary_metric,
        expected: currentBaseline.expected_signature.expected_value,
        tolerance: currentBaseline.expected_signature.tolerance,
        pass_rule: currentBaseline.expected_signature.pass_rule,
    });
    if (oldSig === newSig) {
        return { data: comparison, overlay_applied: false, provenance: null };
    }
    const provenance = readProvenance(currentBaseline);
    const status = comparison.fit_result.baseline_status;
    const newComparison: ModelComparison = {
        ...comparison,
        baseline_prediction: {
            metric: currentBaseline.expected_signature.primary_metric,
            expected: currentBaseline.expected_signature.expected_value,
            tolerance: currentBaseline.expected_signature.tolerance,
            pass_rule: currentBaseline.expected_signature.pass_rule,
        },
        alternative_model_candidates:
            status === "FAILED"
                ? (currentBaseline.possible_alternative_hypotheses ?? [])
                : [],
        fit_result: {
            ...comparison.fit_result,
            failed_metrics: status === "FAILED"
                ? (comparison.fit_result.failed_metrics.length > 0
                    ? comparison.fit_result.failed_metrics
                    : (currentBaseline.expected_signature.primary_metric
                        ? [currentBaseline.expected_signature.primary_metric]
                        : []))
                : comparison.fit_result.failed_metrics,
        },
    };
    return { data: newComparison, overlay_applied: true, provenance };
}

// ---------------------------------------------------------------------------
// Index re-aggregation
// ---------------------------------------------------------------------------

function lemmaEntriesFromReviews(reviews: ExperimentReview[]): ProofDiscoveryLemmaEntry[] {
    const out: ProofDiscoveryLemmaEntry[] = [];
    for (const r of reviews) {
        for (const lemma of r.candidate_lemmas) {
            out.push({
                experiment_id: r.experiment_id,
                display_id: r.display_id,
                lemma_name: lemma.name,
                lemma_status: lemma.status,
                role: r.role,
                program: r.program,
                baseline_status: r.model_comparison.baseline_status,
                scoped_consequence: r.scoped_consequence,
                statement: lemma.statement,
                what_it_does_not_prove: lemma.what_it_does_not_prove ?? [],
            });
        }
    }
    return out;
}

function statusSummary(reviews: ExperimentReview[]) {
    return reviews.map((r) => ({
        experiment_id: r.experiment_id,
        display_id: r.display_id,
        role: r.role,
        baseline_status: r.model_comparison.baseline_status,
        scoped_consequence: r.scoped_consequence,
    }));
}

const FAIL_OR_INCOMPLETE: ReadonlySet<BaselineStatus> = new Set(["FAILED", "INCOMPLETE", "INCONCLUSIVE"]);

/**
 * Aggregate a fresh proof-discovery index from the (already-merged) reviews.
 * Mirrors `proof_kernel.lemma_generator.build_proof_discovery_index` but
 * operates on TS-side data so overlay-merged reviews flow through.
 *
 * `experimentsRun` is the full set of experiment_ids that produced verifier
 * output (may include experiments without baselines).
 */
export function aggregateProofDiscoveryIndex(
    runId: string,
    reviews: ExperimentReview[],
    registeredExperiments: readonly string[],
    experimentsRun: readonly string[],
    schemaVersion: string,
): ProofDiscoveryIndex {
    const program1 = reviews.filter((r) => r.program === "PROGRAM_1");
    const program2 = reviews.filter((r) => r.program === "PROGRAM_2");
    const noneProgram = reviews.filter((r) => r.program === "NONE");
    const split = (items: ExperimentReview[]) => ({
        witnesses: items.filter((r) => r.role === "witness"),
        controls: items.filter((r) => r.role === "control"),
        pathfinders: items.filter((r) => r.role === "pathfinder"),
        exploratory: items.filter((r) => r.role === "exploratory"),
        demonstrations: items.filter((r) => r.role === "demonstration"),
        visualizations: items.filter((r) => r.role === "visualization"),
    });
    const p1Roles = split(program1);
    const p2Roles = split(program2);
    const program1Witnesses = p1Roles.witnesses;
    const program2Witnesses = p2Roles.witnesses;
    const controls = reviews.filter((r) => r.role === "control");
    const pathfinders = reviews.filter((r) => r.role === "pathfinder" || r.role === "exploratory");
    const demos = reviews.filter((r) => r.role === "demonstration" || r.role === "visualization");

    const failedOrIncomplete = reviews.filter((r) => FAIL_OR_INCOMPLETE.has(r.model_comparison.baseline_status));

    const altHypotheses = failedOrIncomplete
        .filter((r) => (r.model_comparison.alternative_model_candidates ?? []).length > 0)
        .map((r) => ({
            experiment_id: r.experiment_id,
            display_id: r.display_id,
            alternatives: r.model_comparison.alternative_model_candidates,
        }));

    const formalizationTargets = program1Witnesses
        .filter((r) => r.model_comparison.baseline_status === "CONFIRMED")
        .map((r) => ({
            experiment_id: r.experiment_id,
            display_id: r.display_id,
            candidate_lemma_name: r.candidate_lemmas[0]?.name ?? null,
            scope: "finite/proxy",
        }));

    const mustNot: string[] = [];
    for (const r of reviews) {
        for (const d of r.disallowed_conclusions) {
            if (!mustNot.includes(d)) mustNot.push(d);
        }
    }

    const nextExperiments = failedOrIncomplete
        .filter((r) => r.next_hypotheses.length > 0)
        .map((r) => ({
            experiment_id: r.experiment_id,
            display_id: r.display_id,
            next_hypotheses: r.next_hypotheses,
        }));

    const reviewsGenerated = Array.from(new Set(reviews.map((r) => r.experiment_id))).sort();
    const expRunSet = new Set(experimentsRun);
    const expReviewedSet = new Set(reviewsGenerated);
    const experimentsNotRun = registeredExperiments.filter((e) => !expRunSet.has(e) && !expReviewedSet.has(e));
    const coverageComplete = registeredExperiments.every((e) => expReviewedSet.has(e));
    const allConfirmed = coverageComplete && reviews.every((r) => r.model_comparison.baseline_status === "CONFIRMED");

    return {
        schema_version: schemaVersion,
        run_id: runId,
        coverage: {
            registered_experiments: [...registeredExperiments],
            experiments_run: Array.from(new Set(experimentsRun)).sort(),
            experiments_not_run: experimentsNotRun,
            reviews_generated: reviewsGenerated,
            model_comparisons_generated: reviewsGenerated,
            lemmas_generated: reviewsGenerated,
            coverage_complete: coverageComplete,
            all_confirmed: allConfirmed,
        },
        totals: {
            experiments_reviewed: reviews.length,
            program_1_witnesses: program1Witnesses.length,
            program_2_witnesses: program2Witnesses.length,
            program_1_total: program1.length,
            program_2_total: program2.length,
            controls: controls.length,
            pathfinders: pathfinders.length,
            demonstrations: demos.length,
            failed_or_incomplete: failedOrIncomplete.length,
        },
        by_program: {
            PROGRAM_1: {
                witnesses: statusSummary(p1Roles.witnesses),
                controls: statusSummary(p1Roles.controls),
                pathfinders: statusSummary(p1Roles.pathfinders),
                exploratory: statusSummary(p1Roles.exploratory),
                demonstrations: statusSummary(p1Roles.demonstrations),
                visualizations: statusSummary(p1Roles.visualizations),
            },
            PROGRAM_2: {
                witnesses: statusSummary(p2Roles.witnesses),
                controls: statusSummary(p2Roles.controls),
                pathfinders: statusSummary(p2Roles.pathfinders),
                exploratory: statusSummary(p2Roles.exploratory),
                demonstrations: statusSummary(p2Roles.demonstrations),
                visualizations: statusSummary(p2Roles.visualizations),
            },
            NONE: statusSummary(noneProgram),
        },
        program_1_candidate_lemmas: lemmaEntriesFromReviews(
            program1Witnesses.filter((r) => r.model_comparison.baseline_status === "CONFIRMED"),
        ),
        program_1_witnesses: program1Witnesses.map((r) => ({
            experiment_id: r.experiment_id,
            display_id: r.display_id,
            baseline_status: r.model_comparison.baseline_status,
        })),
        controls_and_instrument_lemmas: lemmaEntriesFromReviews(controls),
        pathfinding_notes: lemmaEntriesFromReviews(pathfinders),
        demonstrations: lemmaEntriesFromReviews(demos),
        program_2_contradiction_track_lemmas: lemmaEntriesFromReviews(program2),
        failed_or_incomplete_baselines: failedOrIncomplete.map((r) => ({
            experiment_id: r.experiment_id,
            display_id: r.display_id,
            baseline_status: r.model_comparison.baseline_status,
            scoped_consequence: r.scoped_consequence,
            actual_run_inference: r.actual_run_inference,
        })),
        alternative_hypotheses: altHypotheses,
        formalization_targets: formalizationTargets,
        recommended_next_experiments: nextExperiments,
        what_must_not_be_concluded: mustNot,
    };
}

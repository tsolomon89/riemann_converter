/**
 * Reader for per-run experiment reviews, model comparisons, candidate lemmas,
 * and proof-discovery indices.
 *
 * Generation happens server-side in Python (proof_kernel/lemma_generator.py)
 * during run finalization. This module reads those artifacts back so the
 * API/MCP/UI can surface them. Server-only (uses fs).
 */

import fs from "fs";
import path from "path";
import type { BaselineHypothesis, BaselineStatus } from "./hypothesis-registry";

export const REVIEW_SCHEMA_VERSION = "2026.05.experiment-review.v1";

export type ScopedConsequence =
    | "THEORY"
    | "FORMALIZATION"
    | "WITNESS"
    | "ROUTE"
    | "IMPLEMENTATION"
    | "BASELINE_MODEL"
    | "NONE";

export type CandidateLemmaStatus =
    | "SUGGESTED_FROM_PASS"
    | "SUGGESTED_FROM_FAILURE"
    | "DEFERRED"
    | "NO_LEMMA_SUGGESTED";

export interface CandidateLemma {
    name: string;
    status: CandidateLemmaStatus;
    statement: string;
    scope: string;
    /** Observed primary-metric value on this run, when one was available.
     *  Threaded into `statement` and exposed structurally for agents that
     *  want to reason about the magnitude of the deviation. */
    observed_metric?: { primary_metric: string | null; value: number | null } | null;
    alternative_directions?: string[];
    what_it_does_not_prove?: string[];
}

export interface VerifierSignal {
    outcome?: string | null;
    status?: string | null;
    scoped_status?: string | null;
    epistemic_level?: string | null;
    function?: string | null;
}

export interface ExperimentReview {
    schema_version: string;
    run_id: string;
    experiment_id: string;
    display_id: string;
    program: BaselineHypothesis["program"];
    role: BaselineHypothesis["role"];
    baseline_hypothesis: {
        id: string;
        plain_statement: string;
        object_under_test: string;
        expected_signature: BaselineHypothesis["expected_signature"];
        why_this_matters: string;
    };
    raw_observations: Record<string, unknown>;
    model_comparison: {
        baseline_status: BaselineStatus;
        fit_metrics: Record<string, unknown>;
        failed_metrics: string[];
        alternative_model_candidates: string[];
    };
    intended_inference_if_passed: string[];
    actual_run_inference: string[];
    candidate_lemmas: CandidateLemma[];
    next_hypotheses: string[];
    scoped_consequence: ScopedConsequence;
    disallowed_conclusions: string[];
    verifier_signal: VerifierSignal;
}

export interface ModelComparison {
    schema_version: string;
    run_id: string;
    experiment_id: string;
    display_id: string;
    baseline_hypothesis_id: string;
    baseline_prediction: {
        metric: string;
        expected: string;
        tolerance: string;
        pass_rule: string;
    };
    observations: {
        series_refs: string[];
        summary_metrics: Record<string, unknown>;
    };
    fit_result: {
        baseline_status: BaselineStatus;
        reason: string;
        failed_metrics: string[];
    };
    alternative_model_candidates: string[];
    agent_review_priority: "HIGH" | "MEDIUM" | "LOW";
}

export interface CoverageSummary {
    registered_experiments: string[];
    experiments_run: string[];
    experiments_not_run: string[];
    reviews_generated: string[];
    model_comparisons_generated: string[];
    lemmas_generated: string[];
    coverage_complete: boolean;
    all_confirmed: boolean;
}

export interface ByProgramRoleEntry {
    experiment_id: string;
    display_id: string;
    role: string;
    baseline_status: BaselineStatus;
    scoped_consequence: ScopedConsequence;
}

export interface ByProgramSummary {
    PROGRAM_1: Record<string, ByProgramRoleEntry[]>;
    PROGRAM_2: Record<string, ByProgramRoleEntry[]>;
    NONE: ByProgramRoleEntry[];
}

export interface ProofDiscoveryIndex {
    schema_version: string;
    run_id: string;
    coverage: CoverageSummary;
    by_program: ByProgramSummary;
    totals: {
        experiments_reviewed: number;
        program_1_witnesses: number;
        program_2_witnesses: number;
        program_1_total: number;
        program_2_total: number;
        controls: number;
        pathfinders: number;
        demonstrations: number;
        failed_or_incomplete: number;
    };
    program_1_candidate_lemmas: ProofDiscoveryLemmaEntry[];
    program_1_witnesses: { experiment_id: string; display_id: string; baseline_status: BaselineStatus }[];
    controls_and_instrument_lemmas: ProofDiscoveryLemmaEntry[];
    pathfinding_notes: ProofDiscoveryLemmaEntry[];
    demonstrations: ProofDiscoveryLemmaEntry[];
    program_2_contradiction_track_lemmas: ProofDiscoveryLemmaEntry[];
    failed_or_incomplete_baselines: {
        experiment_id: string;
        display_id: string;
        baseline_status: BaselineStatus;
        scoped_consequence: ScopedConsequence;
        actual_run_inference: string[];
    }[];
    alternative_hypotheses: { experiment_id: string; display_id: string; alternatives: string[] }[];
    formalization_targets: {
        experiment_id: string;
        display_id: string;
        candidate_lemma_name: string | null;
        scope: string;
    }[];
    recommended_next_experiments: {
        experiment_id: string;
        display_id: string;
        next_hypotheses: string[];
    }[];
    what_must_not_be_concluded: string[];
}

export interface ProofDiscoveryLemmaEntry {
    experiment_id: string;
    display_id: string;
    lemma_name: string | null;
    lemma_status: CandidateLemmaStatus | null;
    /** Role of the experiment that produced the lemma. Added by the Python
     *  generator's lemma_entries() so consumers can group/filter without a
     *  separate registry lookup. */
    role: BaselineHypothesis["role"];
    /** Program of the experiment (PROGRAM_1 / PROGRAM_2 / NONE). */
    program: BaselineHypothesis["program"];
    baseline_status: BaselineStatus;
    scoped_consequence: ScopedConsequence;
    statement: string | null;
    what_it_does_not_prove: string[];
}

function runDir(repoRoot: string, runId: string): string {
    return path.join(repoRoot, "artifacts", "runs", runId);
}

function readJsonOptional<T>(filePath: string): T | null {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
    } catch {
        return null;
    }
}

export function readExperimentReview(
    runId: string,
    expId: string,
    repoRoot: string = process.cwd(),
): ExperimentReview | null {
    return readJsonOptional<ExperimentReview>(
        path.join(runDir(repoRoot, runId), "experiment_reviews", `${expId}.json`),
    );
}

export function listExperimentReviews(
    runId: string,
    repoRoot: string = process.cwd(),
): ExperimentReview[] {
    const dir = path.join(runDir(repoRoot, runId), "experiment_reviews");
    if (!fs.existsSync(dir)) return [];
    const out: ExperimentReview[] = [];
    for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith(".json")) continue;
        if (entry.endsWith(".no_baseline.json")) continue;
        const review = readJsonOptional<ExperimentReview>(path.join(dir, entry));
        if (review) out.push(review);
    }
    out.sort((a, b) => a.experiment_id.localeCompare(b.experiment_id));
    return out;
}

export function readModelComparison(
    runId: string,
    expId: string,
    repoRoot: string = process.cwd(),
): ModelComparison | null {
    return readJsonOptional<ModelComparison>(
        path.join(runDir(repoRoot, runId), "model_comparisons", `${expId}.json`),
    );
}

export function listModelComparisons(
    runId: string,
    repoRoot: string = process.cwd(),
): ModelComparison[] {
    const dir = path.join(runDir(repoRoot, runId), "model_comparisons");
    if (!fs.existsSync(dir)) return [];
    const out: ModelComparison[] = [];
    for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith(".json")) continue;
        const mc = readJsonOptional<ModelComparison>(path.join(dir, entry));
        if (mc) out.push(mc);
    }
    out.sort((a, b) => a.experiment_id.localeCompare(b.experiment_id));
    return out;
}

export function readLemmaMarkdown(
    runId: string,
    expId: string,
    repoRoot: string = process.cwd(),
): string | null {
    const fp = path.join(runDir(repoRoot, runId), "lemmas", `${expId}.md`);
    if (!fs.existsSync(fp)) return null;
    return fs.readFileSync(fp, "utf-8");
}

export function listCandidateLemmas(
    runId: string,
    repoRoot: string = process.cwd(),
): { experiment_id: string; display_id: string; markdown: string; review: ExperimentReview }[] {
    const reviews = listExperimentReviews(runId, repoRoot);
    const out: { experiment_id: string; display_id: string; markdown: string; review: ExperimentReview }[] = [];
    for (const review of reviews) {
        const md = readLemmaMarkdown(runId, review.experiment_id, repoRoot);
        if (md) {
            out.push({
                experiment_id: review.experiment_id,
                display_id: review.display_id,
                markdown: md,
                review,
            });
        }
    }
    return out;
}

export function readProofDiscoveryIndex(
    runId: string,
    repoRoot: string = process.cwd(),
): ProofDiscoveryIndex | null {
    return readJsonOptional<ProofDiscoveryIndex>(
        path.join(runDir(repoRoot, runId), "proof_discovery_index.json"),
    );
}

export function readProofDiscoveryMarkdown(
    runId: string,
    repoRoot: string = process.cwd(),
): string | null {
    const fp = path.join(runDir(repoRoot, runId), "proof_discovery.md");
    if (!fs.existsSync(fp)) return null;
    return fs.readFileSync(fp, "utf-8");
}

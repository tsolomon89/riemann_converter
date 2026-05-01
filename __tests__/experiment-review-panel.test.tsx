/**
 * Phase E — UI separation test.
 *
 * Renders <ExperimentReviewPanel /> with a known FAILED Program 2 review
 * (EXP_2B / P2-2) and verifies that the rendered markup separates
 * intended_inference_if_passed from actual_run_inference, and never echoes
 * the static "consistent with model" copy as the run conclusion.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExperimentReviewPanel from "../components/ExperimentReviewPanel";
import type { ExperimentReview, ModelComparison } from "../lib/lemma-generator";

const failedProgram2Review: ExperimentReview = {
    schema_version: "2026.05.experiment-review.v1",
    run_id: "run_test_ui",
    experiment_id: "EXP_2B",
    display_id: "P2-2",
    program: "PROGRAM_2",
    role: "witness",
    baseline_hypothesis: {
        id: "HYP_P2_2_RESIDUAL_ISOLATION",
        plain_statement:
            "A single-perturbed-zero model predicts residual behavior according to the current residual-ratio model (observed/predicted residual ~ 1.0 under the tested envelope).",
        object_under_test: "zero_ensemble",
        expected_signature: {
            primary_metric: "observed_over_predicted_residual_ratio",
            expected_value: "near 1.0 within declared envelope",
            tolerance: "experiment-declared residual envelope",
            pass_rule: "ratio remains near 1.0 across the tested k / window range",
        },
        why_this_matters:
            "Residual isolation is the finite-precision baseline for NC6 via single-perturbation modeling.",
    },
    raw_observations: { metrics: { residual_ratio: 9.7 } },
    model_comparison: {
        baseline_status: "FAILED",
        fit_metrics: { summary_metric: 9.7 },
        failed_metrics: ["observed_over_predicted_residual_ratio"],
        alternative_model_candidates: [
            "phase-dependent residual envelope",
            "multi-zero interference dominates over single-perturbation contribution",
        ],
    },
    intended_inference_if_passed: [
        "the single-perturbation residual model is consistent on the tested window",
        "the Program 2 detection route via residual ratios remains armed",
        "this is not a proof of NC6",
    ],
    actual_run_inference: [
        "P2-2: the current baseline was not confirmed on this run.",
        "Baseline tested: A single-perturbed-zero model predicts residual behavior...",
        "The raw data may still contain structured behavior — see candidate lemma and alternative-hypothesis suggestions.",
        "This run does not, by itself, refute the base claim.",
    ],
    candidate_lemmas: [
        {
            name: "Residual Isolation Candidate Lemma (failure-direction)",
            status: "SUGGESTED_FROM_FAILURE",
            statement:
                "The current baseline was not confirmed on this run. A revised lemma should account for the observed deviation.",
            scope: "baseline-revision",
            alternative_directions: ["phase-dependent residual envelope"],
            what_it_does_not_prove: ["this proves NC6", "this proves RH"],
        },
    ],
    next_hypotheses: ["phase-dependent residual envelope"],
    scoped_consequence: "ROUTE",
    disallowed_conclusions: [
        "this proves NC6",
        "this proves the rogue-isolation theorem",
        "this is consistent with Program 1 in any direct sense",
    ],
    verifier_signal: { outcome: "INCONSISTENT", status: "FAIL", scoped_status: "ROUTE_NEGATIVE", epistemic_level: "EMPIRICAL", function: "EXPLORATORY" },
};

const failedComparison: ModelComparison = {
    schema_version: "2026.05.experiment-review.v1",
    run_id: "run_test_ui",
    experiment_id: "EXP_2B",
    display_id: "P2-2",
    baseline_hypothesis_id: "HYP_P2_2_RESIDUAL_ISOLATION",
    baseline_prediction: {
        metric: "observed_over_predicted_residual_ratio",
        expected: "near 1.0 within declared envelope",
        tolerance: "envelope",
        pass_rule: "ratio remains near 1.0",
    },
    observations: { series_refs: [], summary_metrics: { summary_metric: 9.7 } },
    fit_result: {
        baseline_status: "FAILED",
        reason: "Residual ratio far from unity.",
        failed_metrics: ["observed_over_predicted_residual_ratio"],
    },
    alternative_model_candidates: ["phase-dependent residual envelope"],
    agent_review_priority: "HIGH",
};

const passingProgram1Review: ExperimentReview = {
    ...failedProgram2Review,
    experiment_id: "EXP_1",
    display_id: "CORE-1",
    program: "PROGRAM_1",
    baseline_hypothesis: {
        id: "HYP_CORE_1_RECONSTRUCTION_COVARIANCE",
        plain_statement: "Reconstruction is covariant across tested gauge scales.",
        object_under_test: "explicit_formula_reconstruction",
        expected_signature: {
            primary_metric: "max_drift",
            expected_value: "near zero",
            tolerance: "tol",
            pass_rule: "drift within tolerance",
        },
        why_this_matters: "covariance proxy",
    },
    model_comparison: {
        baseline_status: "CONFIRMED",
        fit_metrics: { summary_metric: 0.0001 },
        failed_metrics: [],
        alternative_model_candidates: [],
    },
    actual_run_inference: [
        "CORE-1: the finite/proxy baseline was confirmed on this run's window.",
        "This preserves the route the experiment witnesses; it does not prove the base claim or any necessary condition.",
    ],
    candidate_lemmas: [
        {
            name: "Finite Reconstruction Covariance Lemma",
            status: "SUGGESTED_FROM_PASS",
            statement: "On this run's window, reconstruction covariance held within tolerance.",
            scope: "finite/proxy",
            what_it_does_not_prove: ["this proves RH"],
        },
    ],
    scoped_consequence: "NONE",
    verifier_signal: { outcome: "CONSISTENT", status: "PASS", scoped_status: null, epistemic_level: "EMPIRICAL", function: "PROOF_OBLIGATION_WITNESS" },
};

describe("ExperimentReviewPanel UI separation", () => {
    it("FAILED Program 2 baseline: shows actual not-confirmed copy and labels intended-if-passed as conditional", () => {
        const html = renderToStaticMarkup(
            <ExperimentReviewPanel
                experimentId="EXP_2B"
                initialReview={failedProgram2Review}
                initialComparison={failedComparison}
            />,
        );

        // Actual run inference is rendered.
        expect(html).toContain("Actual run inference");
        expect(html).toContain("not confirmed on this run");
        // Disallowed conclusions visible.
        expect(html).toContain("this proves NC6");
        // Intended-if-passed appears with the warning wrapper, NOT as the run conclusion.
        expect(html).toContain("Intended inference if baseline is confirmed");
        expect(html).toContain("do NOT read as the conclusion of this run");
        // Static "consistent with the rogue-isolation model" copy must NOT appear as actual.
        expect(html.toLowerCase()).not.toContain("consistent with the rogue-isolation model");
        // Scoped consequence is ROUTE (not THEORY).
        expect(html).toContain('data-scoped-consequence="ROUTE"');
        expect(html).toContain('data-baseline-status="FAILED"');
        // Candidate lemma is failure-direction.
        expect(html).toContain('data-lemma-status="SUGGESTED_FROM_FAILURE"');
        // Alternative directions surface.
        expect(html).toContain("phase-dependent residual envelope");
        // Model comparison panel is present.
        expect(html).toContain("Model Comparison");
        expect(html).toContain("review priority: HIGH");
    });

    it("CONFIRMED Program 1 witness: shows pass-direction lemma and never claims to prove RH", () => {
        const html = renderToStaticMarkup(
            <ExperimentReviewPanel
                experimentId="EXP_1"
                initialReview={passingProgram1Review}
                initialComparison={null}
            />,
        );
        expect(html).toContain('data-baseline-status="CONFIRMED"');
        expect(html).toContain('data-lemma-status="SUGGESTED_FROM_PASS"');
        expect(html).toContain("Finite Reconstruction Covariance Lemma");
        expect(html).toContain("does not prove the base claim");
        expect(html).toContain("this proves RH"); // appears under "what it does not prove"
        // Scoped consequence is NONE for a confirmed run.
        expect(html).toContain('data-scoped-consequence="NONE"');
    });

    it("renders an empty state when no review is supplied (and no fetch can run)", () => {
        const html = renderToStaticMarkup(
            <ExperimentReviewPanel experimentId={null} initialReview={null} initialComparison={null} />,
        );
        expect(html).toContain("Experiment review");
    });
});

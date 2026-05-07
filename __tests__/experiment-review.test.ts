import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import {
    listExperimentReviews,
    readExperimentReview,
    readModelComparison,
    readProofDiscoveryIndex,
    readLemmaMarkdown,
} from "../lib/lemma-generator";

const repoRoot = path.resolve(__dirname, "..");

describe("experiment review pipeline", () => {
    let tmpRoot: string;
    const runId = "run_test_review";

    beforeAll(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "riemann-review-"));
        // Mirror the hypothesis registry into the temp repo so the Python loader
        // can find it without us copying the whole tree.
        const hypDir = path.join(tmpRoot, "proof_kernel", "hypotheses");
        fs.mkdirSync(hypDir, { recursive: true });
        for (const f of ["program_1.json", "program_2.json", "controls.json", "pathfinders.json", "demonstrations.json"]) {
            fs.copyFileSync(path.join(repoRoot, "proof_kernel", "hypotheses", f), path.join(hypDir, f));
        }
        // Copy the loader + generator + proposal store + __init__ marker.
        for (const f of ["__init__.py", "hypothesis_registry.py", "hypothesis_proposals.py", "lemma_generator.py"]) {
            const src = path.join(repoRoot, "proof_kernel", f);
            const dst = path.join(tmpRoot, "proof_kernel", f);
            fs.copyFileSync(src, dst);
        }
        // Build a synthetic summary that mixes outcomes:
        //   PASS: EXP_1 (witness), EXP_1B (control), EXP_6 (witness), EXP_8 (witness),
        //         EXP_3 (control), EXP_0 (vis), EXP_9 (demo), EXP_10 (exploratory),
        //         EXP_7 (Program 2 witness)
        //   FAIL: EXP_1C (research note), EXP_2 (Program 2), EXP_2B (Program 2)
        //   INCONCLUSIVE: EXP_4 (pathfinder)
        //   DIRECTIONAL: EXP_5 (pathfinder)
        const summary = {
            experiments: {
                EXP_0: { display_id: "ZETA-0", outcome: "INFORMATIONAL", status: "PASS", role: "VISUALIZATION", function: "VISUALIZATION", metrics: {} },
                EXP_1: { display_id: "CORE-1", outcome: "CONSISTENT", status: "PASS", role: "WITNESS", function: "PROOF_OBLIGATION_WITNESS", metrics: { main_metrics: { max_drift: 0.0001, harmonic_curve_key: "harmonic_N_200" } } },
                EXP_1B: { display_id: "CTRL-1", outcome: "IMPLEMENTATION_OK", status: "PASS", role: "CONTROL", function: "CONTROL", metrics: {} },
                EXP_1C: { display_id: "NOTE-1", outcome: "INFORMATIONAL", status: "FAIL", scoped_status: "FAIL", role: "PATHFINDER", function: "RESEARCH_NOTE", metrics: { max_drift: 284.9, max_ratio_op_over_coord: 667.6 }, interpretation: "Zero-scaling hypothesis fails documented tolerances." },
                EXP_2: { display_id: "P2-1", outcome: "INCONSISTENT", status: "FAIL", scoped_status: "ROUTE_NEGATIVE", role: "WITNESS", function: "EXPLORATORY", metrics: { detection: 0.0 }, interpretation: "Detection metric below threshold." },
                EXP_2B: { display_id: "P2-2", outcome: "INCONSISTENT", status: "FAIL", scoped_status: "ROUTE_NEGATIVE", role: "WITNESS", function: "EXPLORATORY", metrics: { residual_ratio: 9.7 }, interpretation: "Residual ratio far from unity." },
                EXP_3: { display_id: "CTRL-2", outcome: "IMPLEMENTATION_OK", status: "PASS", role: "CONTROL", function: "CONTROL", metrics: {} },
                EXP_4: { display_id: "PATH-1", outcome: "INCONCLUSIVE", status: "WARN", role: "PATHFINDER", function: "PATHFINDER", metrics: {} },
                EXP_5: { display_id: "PATH-2", outcome: "DIRECTIONAL", status: "WARN", role: "PATHFINDER", function: "PATHFINDER", metrics: {} },
                EXP_6: { display_id: "VAL-1", outcome: "CONSISTENT", status: "PASS", role: "WITNESS", function: "PROOF_OBLIGATION_WITNESS", metrics: { main_metrics: { recovered_beta: 0.5 } } },
                EXP_7: { display_id: "P2-3", outcome: "CONSISTENT", status: "PASS", role: "WITNESS", function: "EXPLORATORY", metrics: {} },
                EXP_8: { display_id: "WIT-1", outcome: "CONSISTENT", status: "PASS", role: "WITNESS", function: "PROOF_OBLIGATION_WITNESS", metrics: {} },
                EXP_9: { display_id: "DEMO-1", outcome: "INFORMATIONAL", status: "PASS", role: "DEMONSTRATION", function: "DEMONSTRATION", metrics: {} },
                EXP_10: { display_id: "TRANS-1", outcome: "CONSISTENT", status: "PASS", role: "PATHFINDER", function: "EXPLORATORY", metrics: {} },
            },
        };

        const driver = path.join(tmpRoot, "drive.py");
        fs.writeFileSync(
            driver,
            `import json, sys
sys.path.insert(0, ${JSON.stringify(tmpRoot)})
from pathlib import Path
from proof_kernel.lemma_generator import write_run_reviews
summary = json.loads(${JSON.stringify(JSON.stringify(summary))})
out = Path(${JSON.stringify(tmpRoot)}) / "artifacts" / "runs" / ${JSON.stringify(runId)}
out.mkdir(parents=True, exist_ok=True)
write_run_reviews(${JSON.stringify(runId)}, summary, out, repo=${JSON.stringify(tmpRoot)})
print("OK")
`,
            "utf-8",
        );
        const result = execFileSync("python", [driver], { cwd: tmpRoot, encoding: "utf-8" });
        expect(result).toContain("OK");
    });

    afterAll(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it("generates a review for every experiment in the run", () => {
        const reviews = listExperimentReviews(runId, tmpRoot);
        expect(reviews.length).toBe(14);
        const ids = new Set(reviews.map((r) => r.experiment_id));
        for (const expected of ["EXP_0", "EXP_1", "EXP_1B", "EXP_1C", "EXP_2", "EXP_2B", "EXP_3", "EXP_4", "EXP_5", "EXP_6", "EXP_7", "EXP_8", "EXP_9", "EXP_10"]) {
            expect(ids.has(expected)).toBe(true);
        }
    });

    it("EXP_2B failed Program 2 baseline produces a candidate lemma with alternative hypotheses (not just a verdict)", () => {
        const review = readExperimentReview(runId, "EXP_2B", tmpRoot)!;
        expect(review.model_comparison.baseline_status).toBe("FAILED");
        expect(review.candidate_lemmas.length).toBeGreaterThan(0);
        const lemma = review.candidate_lemmas[0];
        expect(lemma.status).toBe("SUGGESTED_FROM_FAILURE");
        expect((lemma.alternative_directions ?? []).length).toBeGreaterThan(0);
        expect(review.model_comparison.alternative_model_candidates.length).toBeGreaterThan(0);
        // scoped to ROUTE / BASELINE_MODEL — never THEORY
        expect(review.scoped_consequence).not.toBe("THEORY");
    });

    it("intended_inference_if_passed is distinct from actual_run_inference for failed runs", () => {
        const review = readExperimentReview(runId, "EXP_2B", tmpRoot)!;
        const intended = review.intended_inference_if_passed.join(" ");
        const actual = review.actual_run_inference.join(" ");
        // The intended-if-passed text claims the model is consistent.
        expect(intended.toLowerCase()).toContain("consistent");
        // The actual run inference must not echo that for a FAILED run.
        expect(actual.toLowerCase()).not.toContain("consistent on the tested window");
        expect(actual.toLowerCase()).toContain("not confirmed");
    });

    it("failed pathfinder result does not refute theory", () => {
        const review = readExperimentReview(runId, "EXP_4", tmpRoot)!; // INCONCLUSIVE pathfinder
        expect(["NONE", "BASELINE_MODEL"]).toContain(review.scoped_consequence);
        const actual = review.actual_run_inference.join(" ").toLowerCase();
        expect(actual).not.toContain("refute");
        expect(actual).not.toContain("theory failed");
    });

    it("EXP_1C informational failure reads as partial-transport / zero-reuse failure", () => {
        const review = readExperimentReview(runId, "EXP_1C", tmpRoot)!;
        expect(review.model_comparison.baseline_status).toBe("FAILED");
        const actual = review.actual_run_inference.join(" ").toLowerCase();
        expect(actual).toContain("partial-transport / zero-reuse");
        expect(actual).toContain("not confirmed");
        expect(actual).not.toContain("status not determinable");
        expect(actual).toContain("not as a program 1 same-object failure");
    });

    it("control pass reports control / instrument status, not theory support", () => {
        const review = readExperimentReview(runId, "EXP_1B", tmpRoot)!;
        expect(review.role).toBe("control");
        expect(review.model_comparison.baseline_status).toBe("CONFIRMED");
        const actual = review.actual_run_inference.join(" ").toLowerCase();
        expect(actual).toContain("instrument");
        expect(actual).not.toMatch(/proves rh|supports rh|proves the theory/i);
        // Disallowed conclusions still include theory-support disallowance.
        expect(review.disallowed_conclusions.some((d) => /supports/i.test(d) || /rh/i.test(d))).toBe(true);
    });

    it("Program 1 witness pass generates a candidate proof lemma with formalization target", () => {
        const review = readExperimentReview(runId, "EXP_1", tmpRoot)!;
        expect(review.role).toBe("witness");
        expect(review.program).toBe("PROGRAM_1");
        expect(review.model_comparison.baseline_status).toBe("CONFIRMED");
        expect(review.candidate_lemmas[0].status).toBe("SUGGESTED_FROM_PASS");
        const md = readLemmaMarkdown(runId, "EXP_1", tmpRoot)!;
        expect(md).toMatch(/Formalization Target/);
        expect(md.toLowerCase()).toContain("finite/proxy");
    });

    it("model comparison has structured fit_result + baseline prediction", () => {
        const mc = readModelComparison(runId, "EXP_2B", tmpRoot)!;
        expect(mc.fit_result.baseline_status).toBe("FAILED");
        expect(mc.baseline_prediction.metric).toBeTruthy();
        expect(mc.baseline_prediction.pass_rule).toBeTruthy();
        expect(mc.alternative_model_candidates.length).toBeGreaterThan(0);
        expect(mc.agent_review_priority).toBe("HIGH");
    });

    it("proof_discovery_index covers every experiment that ran", () => {
        const idx = readProofDiscoveryIndex(runId, tmpRoot)!;
        expect(idx.totals.experiments_reviewed).toBe(14);
        expect(idx.totals.program_1_witnesses).toBeGreaterThan(0);
        expect(idx.totals.failed_or_incomplete).toBeGreaterThanOrEqual(2);
        expect(idx.formalization_targets.length).toBeGreaterThan(0);
        expect(idx.what_must_not_be_concluded.length).toBeGreaterThan(0);
    });

    it("candidate lemmas always include disallowed conclusions", () => {
        const reviews = listExperimentReviews(runId, tmpRoot);
        const lemma_bearing = reviews.filter((r) => r.candidate_lemmas.length > 0);
        expect(lemma_bearing.length).toBeGreaterThan(0);
        for (const r of lemma_bearing) {
            for (const lemma of r.candidate_lemmas) {
                expect(lemma.what_it_does_not_prove ?? []).not.toEqual([]);
            }
        }
    });
});

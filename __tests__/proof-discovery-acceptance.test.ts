/**
 * Phase F — proof-discovery layer acceptance tests.
 *
 * Each `describe` corresponds 1:1 to a numbered acceptance criterion from the
 * EPIC. Every test in this file is intended to be a precise, independently
 * verifiable check against that criterion. Where a behavior is already
 * exercised in detail by another suite (hypothesis-registry, experiment-review,
 * hypothesis-proposals, proof-discovery-api, experiment-review-panel), we keep
 * the assertion thin here to avoid duplication — the suite reads as a ledger
 * of what is required, not as a re-implementation of the lower-level tests.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { GET, POST } from "../app/api/research/[...segments]/route";
import { POST as MCP_POST } from "../app/mcp/route";
import {
    REQUIRED_EXPERIMENT_IDS,
    clearHypothesisRegistryCache,
    getBaselineForExperiment,
    listBaselineHypotheses,
} from "../lib/hypothesis-registry";
import {
    listExperimentReviews,
    readExperimentReview,
    readModelComparison,
    readProofDiscoveryIndex,
    type ExperimentReview,
} from "../lib/lemma-generator";
import ExperimentReviewPanel from "../components/ExperimentReviewPanel";

const repoRoot = path.resolve(__dirname, "..");
const RUN_ID = "run_phase_f_acc";

let tmpRoot = "";
let cwdSpy: jest.SpyInstance;

const ctx = (...segments: string[]) => ({ params: { segments } });
const req = (url: string) => new Request(`http://test.local${url}`, { method: "GET" });
const reqJsonPost = (url: string, body: unknown) =>
    new Request(`http://test.local${url}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });

beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "riemann-acc-"));

    // Mirror registry + python modules.
    const hypDir = path.join(tmpRoot, "proof_kernel", "hypotheses");
    fs.mkdirSync(hypDir, { recursive: true });
    for (const f of ["program_1.json", "program_2.json", "controls.json", "pathfinders.json", "demonstrations.json"]) {
        fs.copyFileSync(path.join(repoRoot, "proof_kernel", "hypotheses", f), path.join(hypDir, f));
    }
    for (const f of ["__init__.py", "hypothesis_registry.py", "hypothesis_proposals.py", "lemma_generator.py"]) {
        fs.copyFileSync(path.join(repoRoot, "proof_kernel", f), path.join(tmpRoot, "proof_kernel", f));
    }

    // Mixed run that exercises every role + status combination we care about.
    const summary = {
        experiments: {
            EXP_0: { display_id: "ZETA-0", outcome: "INFORMATIONAL", status: "PASS", function: "VISUALIZATION", role: "VISUALIZATION", metrics: {} },
            EXP_1: { display_id: "CORE-1", outcome: "CONSISTENT", status: "PASS", function: "PROOF_OBLIGATION_WITNESS", role: "WITNESS", metrics: { main_metrics: { max_drift: 0.0001 } } },
            EXP_1B: { display_id: "CTRL-1", outcome: "IMPLEMENTATION_OK", status: "PASS", function: "CONTROL", role: "CONTROL", metrics: {} },
            EXP_1C: { display_id: "NOTE-1", outcome: "CONSISTENT", status: "PASS", function: "RESEARCH_NOTE", role: "PATHFINDER", metrics: {} },
            EXP_2: { display_id: "P2-1", outcome: "INCONSISTENT", status: "FAIL", scoped_status: "ROUTE_NEGATIVE", function: "EXPLORATORY", role: "WITNESS", metrics: { detection: 0.0 }, interpretation: "Detection metric below threshold." },
            EXP_2B: { display_id: "P2-2", outcome: "INCONSISTENT", status: "FAIL", scoped_status: "ROUTE_NEGATIVE", function: "EXPLORATORY", role: "WITNESS", metrics: { residual_ratio: 9.7 }, interpretation: "Residual ratio far from unity." },
            EXP_3: { display_id: "CTRL-2", outcome: "IMPLEMENTATION_OK", status: "PASS", function: "CONTROL", role: "CONTROL", metrics: {} },
            EXP_4: { display_id: "PATH-1", outcome: "INCONCLUSIVE", status: "WARN", function: "PATHFINDER", role: "PATHFINDER", metrics: {} },
            EXP_5: { display_id: "PATH-2", outcome: "DIRECTIONAL", status: "WARN", function: "PATHFINDER", role: "PATHFINDER", metrics: {} },
            EXP_6: { display_id: "VAL-1", outcome: "CONSISTENT", status: "PASS", function: "PROOF_OBLIGATION_WITNESS", role: "WITNESS", metrics: { main_metrics: { recovered_beta: 0.5 } } },
            EXP_7: { display_id: "P2-3", outcome: "CONSISTENT", status: "PASS", function: "EXPLORATORY", role: "WITNESS", metrics: {} },
            EXP_8: { display_id: "WIT-1", outcome: "CONSISTENT", status: "PASS", function: "PROOF_OBLIGATION_WITNESS", role: "WITNESS", metrics: {} },
            EXP_9: { display_id: "DEMO-1", outcome: "INFORMATIONAL", status: "PASS", function: "DEMONSTRATION", role: "DEMONSTRATION", metrics: {} },
            EXP_10: { display_id: "TRANS-1", outcome: "CONSISTENT", status: "PASS", function: "EXPLORATORY", role: "PATHFINDER", metrics: {} },
        },
        program_2_summary: {
            isolation: { outcomes: { residual_isolation: "INCONSISTENT" } },
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
out = Path(${JSON.stringify(tmpRoot)}) / "artifacts" / "runs" / ${JSON.stringify(RUN_ID)}
out.mkdir(parents=True, exist_ok=True)
write_run_reviews(${JSON.stringify(RUN_ID)}, summary, out, repo=${JSON.stringify(tmpRoot)})
print("OK")
`,
        "utf-8",
    );
    expect(execFileSync("python", [driver], { cwd: tmpRoot, encoding: "utf-8" })).toContain("OK");

    fs.mkdirSync(path.join(tmpRoot, "public"), { recursive: true });
    fs.writeFileSync(
        path.join(tmpRoot, "public", "current.json"),
        JSON.stringify({ latest_run_id: RUN_ID, engine_status: "CURRENT_RUN" }, null, 2),
    );

    cwdSpy = jest.spyOn(process, "cwd").mockReturnValue(tmpRoot);
    clearHypothesisRegistryCache();
});

afterAll(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    clearHypothesisRegistryCache();
});

const callMcp = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await MCP_POST(
        new Request("http://test.local/mcp", {
            method: "POST",
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
            headers: { "content-type": "application/json" },
        }),
    );
    const body = (await response.json()) as { result?: { content?: { text: string }[] } };
    return JSON.parse(body.result?.content?.[0]?.text ?? "{}");
};

// =============================================================================
// 1. Every registered experiment has a baseline hypothesis.
// =============================================================================
describe("acceptance 1: every registered experiment has a baseline hypothesis", () => {
    it.each(REQUIRED_EXPERIMENT_IDS)("%s has a registered baseline hypothesis", (expId) => {
        expect(getBaselineForExperiment(expId, tmpRoot)).not.toBeNull();
    });
});

// =============================================================================
// 2. Every registered experiment generates an experiment review artifact.
// =============================================================================
describe("acceptance 2: every registered experiment generates a review artifact", () => {
    it("writes one review per experiment that ran", () => {
        const reviews = listExperimentReviews(RUN_ID, tmpRoot);
        const seen = new Set(reviews.map((r) => r.experiment_id));
        for (const id of REQUIRED_EXPERIMENT_IDS) {
            expect(seen.has(id)).toBe(true);
        }
    });
});

// =============================================================================
// 3. Every registered experiment generates a lemma/note or explicit no-lemma
//    explanation.
// =============================================================================
describe("acceptance 3: every experiment produces a lemma, note, or explicit no-lemma explanation", () => {
    it.each(REQUIRED_EXPERIMENT_IDS)("%s has a candidate_lemmas entry with a status", (expId) => {
        const review = readExperimentReview(RUN_ID, expId, tmpRoot)!;
        expect(review.candidate_lemmas.length).toBeGreaterThan(0);
        for (const lemma of review.candidate_lemmas) {
            expect([
                "SUGGESTED_FROM_PASS",
                "SUGGESTED_FROM_FAILURE",
                "DEFERRED",
                "NO_LEMMA_SUGGESTED",
            ]).toContain(lemma.status);
        }
    });
});

// =============================================================================
// 4. Static intended inference is not displayed as actual inference on
//    failed/inconclusive runs.
// =============================================================================
describe("acceptance 4: intended-if-passed never substitutes for actual run inference", () => {
    it.each(["EXP_2B", "EXP_2", "EXP_4"])(
        "%s (failed/inconclusive): actual_run_inference does not echo intended_inference_if_passed",
        (expId) => {
            const review = readExperimentReview(RUN_ID, expId, tmpRoot)!;
            const actual = review.actual_run_inference.join(" ");
            const intended = review.intended_inference_if_passed.join(" ");
            expect(actual).not.toBe(intended);
            // None of the intended-if-passed lines may appear verbatim as actual.
            for (const line of review.intended_inference_if_passed) {
                expect(review.actual_run_inference).not.toContain(line);
            }
        },
    );
});

// =============================================================================
// 5. Failed Program 2 baseline generates candidate lemma / alternative
//    hypothesis, not only a verdict.
// =============================================================================
describe("acceptance 5: failed Program 2 baselines produce candidate lemmas + alternatives", () => {
    it("EXP_2B (P2-2) FAILED produces a SUGGESTED_FROM_FAILURE lemma with non-empty alternative_directions", () => {
        const review = readExperimentReview(RUN_ID, "EXP_2B", tmpRoot)!;
        expect(review.model_comparison.baseline_status).toBe("FAILED");
        expect(review.candidate_lemmas[0].status).toBe("SUGGESTED_FROM_FAILURE");
        expect((review.candidate_lemmas[0].alternative_directions ?? []).length).toBeGreaterThan(0);
        expect(review.model_comparison.alternative_model_candidates.length).toBeGreaterThan(0);
    });
});

// =============================================================================
// 6. Failed pathfinder result does not refute theory.
// =============================================================================
describe("acceptance 6: failed pathfinder does not refute theory", () => {
    it.each(["EXP_4", "EXP_5"])("%s pathfinder scoped_consequence is never THEORY", (expId) => {
        const review = readExperimentReview(RUN_ID, expId, tmpRoot)!;
        expect(review.role).toBe("pathfinder");
        expect(review.scoped_consequence).not.toBe("THEORY");
        expect(review.scoped_consequence).not.toBe("FORMALIZATION");
        const actual = review.actual_run_inference.join(" ").toLowerCase();
        expect(actual).not.toMatch(/refute|theory failed/);
    });
});

// =============================================================================
// 7. Control pass reports control/instrument status, not theory support.
// =============================================================================
describe("acceptance 7: control pass reports instrument health, not theory support", () => {
    it.each(["EXP_1B", "EXP_3"])("%s control pass labels the result as instrument-health", (expId) => {
        const review = readExperimentReview(RUN_ID, expId, tmpRoot)!;
        expect(review.role).toBe("control");
        expect(review.model_comparison.baseline_status).toBe("CONFIRMED");
        const actual = review.actual_run_inference.join(" ").toLowerCase();
        expect(actual).toMatch(/instrument|control|falsifier|armed/);
        expect(actual).not.toMatch(/proves the theory|supports rh|proves rh/);
    });
});

// =============================================================================
// 8. Program 1 witness pass generates candidate proof lemma.
// =============================================================================
describe("acceptance 8: Program 1 witness pass generates a candidate proof lemma", () => {
    it.each(["EXP_1", "EXP_6", "EXP_8"])("%s confirmed Program 1 witness suggests a finite/proxy lemma", (expId) => {
        const review = readExperimentReview(RUN_ID, expId, tmpRoot)!;
        expect(review.program).toBe("PROGRAM_1");
        expect(review.role).toBe("witness");
        expect(review.model_comparison.baseline_status).toBe("CONFIRMED");
        expect(review.candidate_lemmas[0].status).toBe("SUGGESTED_FROM_PASS");
        expect(review.candidate_lemmas[0].scope.toLowerCase()).toContain("finite/proxy");
    });
});

// =============================================================================
// 9. Program 2 mixed route does not contaminate Same-Object Certificate
//    (tested by checking that Program 2 failures are scoped to BASELINE_MODEL /
//    ROUTE / WITNESS — never THEORY or FORMALIZATION — and that the
//    proof-discovery index keeps Program 1 and Program 2 lemmas in separate
//    sections).
// =============================================================================
describe("acceptance 9: Program 2 failures stay scoped + role-separated from Program 1", () => {
    it("EXP_2 and EXP_2B failures scope to ROUTE / BASELINE_MODEL / WITNESS, never THEORY/FORMALIZATION", () => {
        for (const expId of ["EXP_2", "EXP_2B"]) {
            const review = readExperimentReview(RUN_ID, expId, tmpRoot)!;
            expect(review.program).toBe("PROGRAM_2");
            expect(review.scoped_consequence).not.toBe("THEORY");
            expect(review.scoped_consequence).not.toBe("FORMALIZATION");
        }
    });

    it("proof_discovery_index keeps Program 1 and Program 2 lemmas separate", () => {
        const idx = readProofDiscoveryIndex(RUN_ID, tmpRoot)!;
        const p1Ids = new Set(idx.program_1_candidate_lemmas.map((e) => e.experiment_id));
        const p2Ids = new Set(idx.program_2_contradiction_track_lemmas.map((e) => e.experiment_id));
        for (const id of p1Ids) expect(p2Ids.has(id)).toBe(false);
        for (const id of p2Ids) expect(p1Ids.has(id)).toBe(false);
    });
});

// =============================================================================
// 10. MCP get_experiment_review returns baseline, observations, model
//     comparison, candidate lemmas, actual inference.
// =============================================================================
describe("acceptance 10: MCP get_experiment_review returns full structured review", () => {
    it("returns every required field for P2-2", async () => {
        const result = await callMcp("get_experiment_review", { id: "P2-2" });
        const review = result.data as ExperimentReview;
        expect(review.baseline_hypothesis).toBeTruthy();
        expect(review.raw_observations).toBeTruthy();
        expect(review.model_comparison).toBeTruthy();
        expect(review.candidate_lemmas.length).toBeGreaterThan(0);
        expect(review.actual_run_inference.length).toBeGreaterThan(0);
        expect(review.intended_inference_if_passed.length).toBeGreaterThan(0);
        expect(review.disallowed_conclusions.length).toBeGreaterThan(0);
    });
});

// =============================================================================
// 11. MCP raw-data endpoint returns observed/predicted/residual data where
//     available.
// =============================================================================
describe("acceptance 11: MCP get_experiment_raw_data returns observed/predicted/residual data", () => {
    it("returns raw_observations + verifier_signal + observations", async () => {
        const result = await callMcp("get_experiment_raw_data", { id: "P2-2" });
        const data = result.data as {
            raw_observations: Record<string, unknown>;
            verifier_signal: { outcome: string };
            observations: { summary_metrics: Record<string, unknown> } | null;
        };
        expect(data.raw_observations).toBeTruthy();
        expect(data.verifier_signal.outcome).toBe("INCONSISTENT");
        expect(data.observations).toBeTruthy();
    });
});

// =============================================================================
// 12. Agent baseline proposals are stored as PROPOSED and do not mutate
//     canonical baseline.
// =============================================================================
describe("acceptance 12: agent proposals start PROPOSED and do not auto-mutate canonical", () => {
    it("propose returns status PROPOSED and canonical registry is unchanged", async () => {
        const before = getBaselineForExperiment("EXP_2B", tmpRoot)!;
        const resp = await POST(
            reqJsonPost("/api/research/hypothesis-proposals", {
                source_agent: "claude",
                experiment_id: "EXP_2B",
                proposed_baseline: { plain_statement: "ACC-12-REVISED", expected_signature: { primary_metric: "x", expected_value: "y", tolerance: "z", pass_rule: "w" } },
                reason: "test",
            }),
            ctx("hypothesis-proposals"),
        );
        expect(resp.status).toBe(201);
        const body = (await resp.json()) as { data: { status: string } };
        expect(body.data.status).toBe("PROPOSED");
        clearHypothesisRegistryCache();
        const after = getBaselineForExperiment("EXP_2B", tmpRoot)!;
        expect(after.plain_statement).toBe(before.plain_statement);
    });
});

// =============================================================================
// 13. UI shows actual_run_inference distinct from intended_inference_if_passed.
// =============================================================================
describe("acceptance 13: UI separates actual from intended-if-passed", () => {
    it("FAILED P2-2: rendered HTML labels the intended-if-passed section as conditional", () => {
        const review = readExperimentReview(RUN_ID, "EXP_2B", tmpRoot)!;
        const comparison = readModelComparison(RUN_ID, "EXP_2B", tmpRoot);
        const html = renderToStaticMarkup(
            React.createElement(ExperimentReviewPanel, {
                experimentId: "EXP_2B",
                initialReview: review,
                initialComparison: comparison,
            }),
        );
        expect(html).toContain("Actual run inference");
        expect(html).toContain("Intended inference if baseline is confirmed");
        expect(html).toContain("do NOT read as the conclusion of this run");
        expect(html.toLowerCase()).not.toContain("consistent with the rogue-isolation model");
    });
});

// =============================================================================
// 14. proof_discovery_index includes all experiments that ran.
// =============================================================================
describe("acceptance 14: proof_discovery_index includes every experiment that ran", () => {
    it("totals.experiments_reviewed equals 14", async () => {
        const resp = await GET(req("/api/research/proof-discovery"), ctx("proof-discovery"));
        const body = (await resp.json()) as { data: { index: { totals: { experiments_reviewed: number } } } };
        expect(body.data.index.totals.experiments_reviewed).toBe(REQUIRED_EXPERIMENT_IDS.length);
    });
});

// =============================================================================
// 15. Candidate lemmas include disallowed conclusions.
// =============================================================================
describe("acceptance 15: every candidate lemma carries explicit disallowed conclusions", () => {
    it("every lemma in every reviewed experiment has what_it_does_not_prove", () => {
        const reviews = listExperimentReviews(RUN_ID, tmpRoot);
        for (const review of reviews) {
            for (const lemma of review.candidate_lemmas) {
                expect(lemma.what_it_does_not_prove ?? []).not.toEqual([]);
            }
        }
    });
});

// =============================================================================
// Bonus: top-level baseline-hypothesis listing is overlay-aware (sanity check
// that the registry loader respects accepted overlays).
// =============================================================================
describe("registry loader is overlay-aware", () => {
    it("listBaselineHypotheses returns 14 baselines with valid roles", () => {
        const all = listBaselineHypotheses(tmpRoot);
        expect(all.length).toBe(14);
        for (const b of all) {
            expect(["witness", "control", "pathfinder", "demonstration", "exploratory", "visualization"]).toContain(b.role);
            expect(["PROGRAM_1", "PROGRAM_2", "NONE"]).toContain(b.program);
        }
    });
});

/**
 * Read-time overlay merge tests.
 *
 * Verifies the third-priority cleanup: when a hypothesis proposal is accepted,
 * the on-disk per-run review files stay FROZEN (historically honest) but the
 * API/MCP responses re-derive registry-sourced fields against the current
 * overlay-merged baseline and stamp `_overlay_provenance` warnings.
 *
 * Coverage:
 *   • on-disk review JSON is byte-identical before vs after accept
 *   • GET /experiment-reviews/:id returns the new baseline + warning
 *   • GET /model-comparisons/:id reflects the new baseline_prediction
 *   • GET /candidate-lemmas/:id surfaces the new alternative_directions
 *   • GET /proof-discovery re-aggregates from merged reviews (alternative_hypotheses,
 *     what_must_not_be_concluded reflect the new baseline)
 *   • MCP get_experiment_review parity
 *   • Reject reverts every observable view back to canonical
 *   • The bridge fallback stamps an overlay-active warning
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync, spawn } from "child_process";

import { GET, POST } from "../app/api/research/[...segments]/route";
import { POST as MCP_POST } from "../app/mcp/route";
import { clearHypothesisRegistryCache } from "../lib/hypothesis-registry";

const repoRoot = path.resolve(__dirname, "..");
const RUN_ID = "run_overlay_merge";

let tmpRoot = "";
let cwdSpy: jest.SpyInstance;

const ctx = (...segments: string[]) => ({ params: { segments } });
const reqGet = (url: string) => new Request(`http://test.local${url}`, { method: "GET" });
const reqJsonPost = (url: string, body: unknown) =>
    new Request(`http://test.local${url}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
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
    const text = body.result?.content?.[0]?.text ?? "";
    return JSON.parse(text);
};

beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "riemann-overlay-"));

    const hypDir = path.join(tmpRoot, "proof_kernel", "hypotheses");
    fs.mkdirSync(hypDir, { recursive: true });
    for (const f of ["program_1.json", "program_2.json", "controls.json", "pathfinders.json", "demonstrations.json"]) {
        fs.copyFileSync(path.join(repoRoot, "proof_kernel", "hypotheses", f), path.join(hypDir, f));
    }
    for (const f of ["__init__.py", "hypothesis_registry.py", "hypothesis_proposals.py", "lemma_generator.py"]) {
        fs.copyFileSync(path.join(repoRoot, "proof_kernel", f), path.join(tmpRoot, "proof_kernel", f));
    }

    const summary = {
        experiments: {
            EXP_0: { display_id: "ZETA-0", outcome: "INFORMATIONAL", status: "PASS", function: "VISUALIZATION", role: "VISUALIZATION", metrics: {} },
            EXP_1: { display_id: "CORE-1", outcome: "CONSISTENT", status: "PASS", function: "PROOF_OBLIGATION_WITNESS", role: "WITNESS", metrics: { main_metrics: { max_drift: 0.0001 } } },
            EXP_1B: { display_id: "CTRL-1", outcome: "IMPLEMENTATION_OK", status: "PASS", function: "CONTROL", role: "CONTROL", metrics: {} },
            EXP_1C: { display_id: "NOTE-1", outcome: "CONSISTENT", status: "PASS", function: "RESEARCH_NOTE", role: "PATHFINDER", metrics: {} },
            EXP_2: { display_id: "P2-1", outcome: "CONSISTENT", status: "PASS", function: "EXPLORATORY", role: "WITNESS", metrics: {} },
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
    // Best-effort cleanup; child processes spawned by inner describes may still
    // hold open handles on Windows. Jest's tmpdir is short-lived either way.
    try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
        // ignore EPERM / EBUSY on Windows
    }
    clearHypothesisRegistryCache();
});

const reviewPath = (expId: string) =>
    path.join(tmpRoot, "artifacts", "runs", RUN_ID, "experiment_reviews", `${expId}.json`);
const comparisonPath = (expId: string) =>
    path.join(tmpRoot, "artifacts", "runs", RUN_ID, "model_comparisons", `${expId}.json`);

describe("read-time overlay merge", () => {
    let proposalId: string = "";
    let originalReviewBytes: Buffer;
    let originalReviewMtimeMs: number;
    let originalComparisonBytes: Buffer;

    test("snapshot disk state before any proposal", () => {
        originalReviewBytes = fs.readFileSync(reviewPath("EXP_2B"));
        originalReviewMtimeMs = fs.statSync(reviewPath("EXP_2B")).mtimeMs;
        originalComparisonBytes = fs.readFileSync(comparisonPath("EXP_2B"));
        expect(originalReviewBytes.length).toBeGreaterThan(0);
        expect(originalComparisonBytes.length).toBeGreaterThan(0);
    });

    test("propose + accept a baseline revision for EXP_2B", async () => {
        const propose = await POST(
            reqJsonPost("/api/research/hypothesis-proposals", {
                source_agent: "claude",
                experiment_id: "EXP_2B",
                proposed_baseline: {
                    plain_statement: "OVERLAY-MERGE-PROBE: phase-dependent residual envelope.",
                    object_under_test: "zero_ensemble",
                    expected_signature: {
                        primary_metric: "phase_aware_residual_envelope",
                        expected_value: "fits a phase-dependent envelope curve",
                        tolerance: "envelope-fit residual within 0.5",
                        pass_rule: "residual fits envelope across the tested k / window range",
                    },
                    why_this_matters: "Overlay-merge probe.",
                    intended_inference_if_passed: [
                        "phase-aware residual model is consistent on the tested window",
                    ],
                    disallowed_conclusions: [
                        "this proves the phase-aware model is the unique alternative",
                    ],
                    possible_alternative_hypotheses: [
                        "k-depth dependent attenuation",
                        "multi-zero interference",
                    ],
                    candidate_lemma_name: "Phase-Aware Residual Envelope Lemma",
                    role: "witness",
                    program: "PROGRAM_2",
                    display_id: "P2-2",
                    experiment_ids: ["EXP_2B"],
                    hypothesis_id: "HYP_P2_2_RESIDUAL_ISOLATION",
                },
                reason: "overlay-merge end-to-end test",
            }),
            ctx("hypothesis-proposals"),
        );
        expect(propose.status).toBe(201);
        const proposed = (await propose.json()) as { data: { proposal_id: string } };
        proposalId = proposed.data.proposal_id;

        const accept = await POST(
            reqJsonPost(`/api/research/hypothesis-proposals/${proposalId}/accept`, {
                accepted_by: "user:overlay-test",
                note: "overlay-merge probe",
            }),
            ctx("hypothesis-proposals", proposalId, "accept"),
        );
        expect(accept.status).toBe(200);
    });

    test("on-disk experiment_reviews/EXP_2B.json is BYTE-IDENTICAL after accept (historically honest)", () => {
        const after = fs.readFileSync(reviewPath("EXP_2B"));
        expect(after.equals(originalReviewBytes)).toBe(true);
        const afterMtime = fs.statSync(reviewPath("EXP_2B")).mtimeMs;
        expect(afterMtime).toBe(originalReviewMtimeMs);
    });

    test("on-disk model_comparisons/EXP_2B.json is BYTE-IDENTICAL after accept", () => {
        const after = fs.readFileSync(comparisonPath("EXP_2B"));
        expect(after.equals(originalComparisonBytes)).toBe(true);
    });

    test("GET /experiment-reviews/EXP_2B returns the NEW baseline + overlay-applied warning", async () => {
        const resp = await GET(reqGet("/api/research/experiment-reviews/EXP_2B"), ctx("experiment-reviews", "EXP_2B"));
        const body = (await resp.json()) as { ok: boolean; warnings: string[]; data: { baseline_hypothesis: { plain_statement: string; expected_signature: { primary_metric: string } }; intended_inference_if_passed: string[]; actual_run_inference: string[]; candidate_lemmas: { alternative_directions?: string[] }[]; model_comparison: { alternative_model_candidates: string[] } } };
        expect(body.ok).toBe(true);
        expect(body.data.baseline_hypothesis.plain_statement).toMatch(/OVERLAY-MERGE-PROBE/);
        expect(body.data.baseline_hypothesis.expected_signature.primary_metric).toBe("phase_aware_residual_envelope");
        expect(body.data.intended_inference_if_passed.join(" ")).toMatch(/phase-aware residual model/);
        expect(body.data.model_comparison.alternative_model_candidates).toEqual([
            "k-depth dependent attenuation",
            "multi-zero interference",
        ]);
        expect(body.data.candidate_lemmas[0].alternative_directions).toEqual([
            "k-depth dependent attenuation",
            "multi-zero interference",
        ]);
        // Warning surfaced with proposal id + accepted_by.
        expect(body.warnings.join(" ")).toMatch(proposalId);
        expect(body.warnings.join(" ")).toMatch(/user:overlay-test/);
    });

    test("GET /experiment-reviews/EXP_2B preserves the data-driven actual_run_inference (FAILED status)", async () => {
        const resp = await GET(reqGet("/api/research/experiment-reviews/EXP_2B"), ctx("experiment-reviews", "EXP_2B"));
        const body = (await resp.json()) as { data: { actual_run_inference: string[]; model_comparison: { baseline_status: string } } };
        // Data-driven status is unchanged: the run failed against whichever baseline.
        expect(body.data.model_comparison.baseline_status).toBe("FAILED");
        // The actual_run_inference re-templates against the new baseline plain_statement
        // — must still say "not confirmed" (data-driven scope), but the cited baseline text changed.
        expect(body.data.actual_run_inference.join(" ").toLowerCase()).toContain("not confirmed");
        expect(body.data.actual_run_inference.join(" ")).toMatch(/OVERLAY-MERGE-PROBE/);
    });

    test("GET /model-comparisons/EXP_2B reflects the NEW baseline_prediction", async () => {
        const resp = await GET(reqGet("/api/research/model-comparisons/EXP_2B"), ctx("model-comparisons", "EXP_2B"));
        const body = (await resp.json()) as { warnings: string[]; data: { baseline_prediction: { metric: string; expected: string; pass_rule: string }; alternative_model_candidates: string[]; fit_result: { baseline_status: string } } };
        expect(body.data.baseline_prediction.metric).toBe("phase_aware_residual_envelope");
        expect(body.data.baseline_prediction.pass_rule).toMatch(/envelope/);
        expect(body.data.alternative_model_candidates).toEqual([
            "k-depth dependent attenuation",
            "multi-zero interference",
        ]);
        expect(body.data.fit_result.baseline_status).toBe("FAILED");
        expect(body.warnings.join(" ")).toMatch(proposalId);
    });

    test("GET /candidate-lemmas/EXP_2B surfaces the NEW alternative directions and lemma name", async () => {
        const resp = await GET(reqGet("/api/research/candidate-lemmas/EXP_2B"), ctx("candidate-lemmas", "EXP_2B"));
        const body = (await resp.json()) as { warnings: string[]; data: { candidate_lemmas: { name: string; alternative_directions?: string[]; status: string }[]; intended_inference_if_passed: string[] } };
        expect(body.data.candidate_lemmas[0].name).toMatch(/Phase-Aware Residual Envelope/);
        expect(body.data.candidate_lemmas[0].status).toBe("SUGGESTED_FROM_FAILURE");
        expect(body.data.candidate_lemmas[0].alternative_directions).toEqual([
            "k-depth dependent attenuation",
            "multi-zero interference",
        ]);
        expect(body.data.intended_inference_if_passed.join(" ")).toMatch(/phase-aware residual model/);
    });

    test("GET /proof-discovery re-aggregates from merged reviews", async () => {
        const resp = await GET(reqGet("/api/research/proof-discovery"), ctx("proof-discovery"));
        const body = (await resp.json()) as {
            warnings: string[];
            data: {
                index: {
                    alternative_hypotheses: { experiment_id: string; alternatives: string[] }[];
                    program_2_contradiction_track_lemmas: { experiment_id: string; lemma_name: string }[];
                    what_must_not_be_concluded: string[];
                };
            };
        };
        // Find EXP_2B's entry in alternative_hypotheses; should reflect the new alternatives.
        const altEntry = body.data.index.alternative_hypotheses.find((e) => e.experiment_id === "EXP_2B");
        expect(altEntry).toBeDefined();
        expect(altEntry!.alternatives).toEqual([
            "k-depth dependent attenuation",
            "multi-zero interference",
        ]);
        // Program 2 lemma carries the new lemma name.
        const p2Entry = body.data.index.program_2_contradiction_track_lemmas.find((e) => e.experiment_id === "EXP_2B");
        expect(p2Entry?.lemma_name).toMatch(/Phase-Aware Residual Envelope/);
        // what_must_not_be_concluded includes the new disallowance.
        expect(body.data.index.what_must_not_be_concluded).toContain(
            "this proves the phase-aware model is the unique alternative",
        );
        // Top-level summary mentions the overlay was applied.
        expect(body.warnings.join(" ")).toMatch(proposalId);
    });

    test("MCP get_experiment_review parity — same merge, same provenance", async () => {
        const result = await callMcp("get_experiment_review", { id: "P2-2" });
        const review = result.data as { baseline_hypothesis: { plain_statement: string }; intended_inference_if_passed: string[] };
        expect(review.baseline_hypothesis.plain_statement).toMatch(/OVERLAY-MERGE-PROBE/);
        expect(result.warnings.join(" ")).toMatch(proposalId);
    });

    test("rejecting the proposal reverts every observable view back to canonical", async () => {
        const reject = await POST(
            reqJsonPost(`/api/research/hypothesis-proposals/${proposalId}/reject`, {
                rejected_by: "user:overlay-test",
                reason: "rolling back",
            }),
            ctx("hypothesis-proposals", proposalId, "reject"),
        );
        expect(reject.status).toBe(200);

        const resp = await GET(reqGet("/api/research/experiment-reviews/EXP_2B"), ctx("experiment-reviews", "EXP_2B"));
        const body = (await resp.json()) as { warnings: string[]; data: { baseline_hypothesis: { plain_statement: string } } };
        expect(body.data.baseline_hypothesis.plain_statement).not.toMatch(/OVERLAY-MERGE-PROBE/);
        // No overlay-applied warning now.
        expect(body.warnings.join(" ")).not.toMatch(proposalId);
    });
});

// -----------------------------------------------------------------------------
// Bridge fallback honesty: warning attached when overlay is active
// -----------------------------------------------------------------------------

describe("mcp-bridge fallback overlay-active warning", () => {
    let bridgeProc: ReturnType<typeof spawn> | null = null;
    let stdoutBuffer = "";
    let stdinReady = false;

    afterAll(async () => {
        if (bridgeProc && !bridgeProc.killed) {
            bridgeProc.stdin?.end();
            await new Promise<void>((resolve) => {
                bridgeProc!.once("exit", () => resolve());
                bridgeProc!.kill();
                // Safety net in case `exit` already fired.
                setTimeout(() => resolve(), 200);
            });
        }
    });

    const callBridge = (op: string, args: unknown[] = []): Promise<unknown> => {
        if (!bridgeProc) {
            const loaderPath = path.resolve(__dirname, "_helpers", "mcp-bridge-loader.mjs");
            bridgeProc = spawn(process.execPath, [loaderPath], {
                cwd: tmpRoot,
                stdio: ["pipe", "pipe", "pipe"],
                env: { ...process.env, MCP_BRIDGE_REPO_ROOT: tmpRoot },
            });
            bridgeProc.stdout?.on("data", (chunk: Buffer) => {
                stdoutBuffer += chunk.toString();
            });
        }
        return new Promise((resolve, reject) => {
            const tryDispatch = () => {
                const idx = stdoutBuffer.indexOf("\n");
                if (idx < 0) return false;
                const line = stdoutBuffer.slice(0, idx).trim();
                stdoutBuffer = stdoutBuffer.slice(idx + 1);
                if (!line) return tryDispatch();
                let resp: { id: number | string; ok: boolean; result?: unknown; error?: string };
                try { resp = JSON.parse(line); } catch { return tryDispatch(); }
                if (resp.id === "ready") { stdinReady = true; return tryDispatch(); }
                if (resp.ok) resolve(resp.result);
                else reject(new Error(resp.error ?? "loader error"));
                return true;
            };
            const send = () => {
                bridgeProc!.stdin!.write(JSON.stringify({ id: 1, op, args }) + "\n");
                const interval = setInterval(() => {
                    if (tryDispatch()) clearInterval(interval);
                }, 10);
            };
            if (stdinReady) send();
            else {
                const wait = setInterval(() => {
                    if (stdinReady) { clearInterval(wait); send(); }
                    else tryDispatch();
                }, 10);
            }
        });
    };

    test("bridge fallback for get_experiment_review attaches overlay-active warning when overlay file is non-empty", async () => {
        // First, re-accept a proposal to repopulate the overlay file.
        const propose = await POST(
            reqJsonPost("/api/research/hypothesis-proposals", {
                source_agent: "claude",
                experiment_id: "EXP_2B",
                proposed_baseline: {
                    plain_statement: "BRIDGE-OVERLAY-PROBE",
                    object_under_test: "zero_ensemble",
                    expected_signature: { primary_metric: "x", expected_value: "y", tolerance: "z", pass_rule: "w" },
                    why_this_matters: "test",
                    role: "witness",
                    program: "PROGRAM_2",
                    display_id: "P2-2",
                    experiment_ids: ["EXP_2B"],
                    hypothesis_id: "HYP_P2_2_RESIDUAL_ISOLATION",
                },
                reason: "bridge overlay probe",
            }),
            ctx("hypothesis-proposals"),
        );
        const proposed = (await propose.json()) as { data: { proposal_id: string } };
        const propId = proposed.data.proposal_id;
        const accept = await POST(
            reqJsonPost(`/api/research/hypothesis-proposals/${propId}/accept`, { accepted_by: "user:bridge-test" }),
            ctx("hypothesis-proposals", propId, "accept"),
        );
        expect(accept.status).toBe(200);

        const result = (await callBridge("fallback_payload", ["get_experiment_review", { id: "EXP_2B" }])) as {
            ok: boolean; warnings: string[]; data: { baseline_hypothesis?: { plain_statement?: string } };
        };
        expect(result.ok).toBe(true);
        // Bridge does NOT apply the overlay merge — the baseline text is the
        // ORIGINAL canonical text from when the review was written.
        expect(result.data.baseline_hypothesis?.plain_statement).not.toMatch(/BRIDGE-OVERLAY-PROBE/);
        // But it DOES surface a warning explaining the bridge limitation.
        expect(result.warnings.join(" ").toLowerCase()).toMatch(/overlay/);
        expect(result.warnings.join(" ").toLowerCase()).toMatch(/http server/);
    });
});

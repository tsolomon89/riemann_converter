/**
 * Phase D — proof-discovery API + MCP contract tests.
 *
 * These tests run a live in-process Python invocation to materialize
 * per-run experiment_reviews / model_comparisons / lemmas, then exercise the
 * GET/POST routes and the JSON-RPC MCP route end-to-end.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

import { GET, POST } from "../app/api/research/[...segments]/route";
import { POST as MCP_POST } from "../app/mcp/route";

const repoRoot = path.resolve(__dirname, "..");
const RUN_ID = "run_phase_d";

let tmpRoot = "";
let cwdSpy: jest.SpyInstance;

const ctx = (...segments: string[]) => ({ params: { segments } });

function setupTmpRepo(): string {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "riemann-phaseD-"));

    // Mirror hypothesis registry + Python modules into the tmp repo.
    const hypDir = path.join(tmp, "proof_kernel", "hypotheses");
    fs.mkdirSync(hypDir, { recursive: true });
    for (const f of ["program_1.json", "program_2.json", "controls.json", "pathfinders.json", "demonstrations.json"]) {
        fs.copyFileSync(path.join(repoRoot, "proof_kernel", "hypotheses", f), path.join(hypDir, f));
    }
    for (const f of ["__init__.py", "hypothesis_registry.py", "hypothesis_proposals.py", "lemma_generator.py"]) {
        fs.copyFileSync(path.join(repoRoot, "proof_kernel", f), path.join(tmp, "proof_kernel", f));
    }

    // Synthetic summary mirroring the live shape — covers all 14 experiments.
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
    };

    const driver = path.join(tmp, "drive.py");
    fs.writeFileSync(
        driver,
        `import json, sys
sys.path.insert(0, ${JSON.stringify(tmp)})
from pathlib import Path
from proof_kernel.lemma_generator import write_run_reviews
summary = json.loads(${JSON.stringify(JSON.stringify(summary))})
out = Path(${JSON.stringify(tmp)}) / "artifacts" / "runs" / ${JSON.stringify(RUN_ID)}
out.mkdir(parents=True, exist_ok=True)
write_run_reviews(${JSON.stringify(RUN_ID)}, summary, out, repo=${JSON.stringify(tmp)})
print("OK")
`,
        "utf-8",
    );
    const result = execFileSync("python", [driver], { cwd: tmp, encoding: "utf-8" });
    expect(result).toContain("OK");

    // Provide a public/current.json so resolveRunId() picks our test run.
    fs.mkdirSync(path.join(tmp, "public"), { recursive: true });
    fs.writeFileSync(
        path.join(tmp, "public", "current.json"),
        JSON.stringify({ latest_run_id: RUN_ID, engine_status: "CURRENT_RUN" }, null, 2),
    );
    return tmp;
}

beforeAll(() => {
    tmpRoot = setupTmpRepo();
    cwdSpy = jest.spyOn(process, "cwd").mockReturnValue(tmpRoot);
});

afterAll(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const reqGet = (url: string) =>
    new Request(`http://test.local${url}`, { method: "GET" });
const reqJsonPost = (url: string, body: unknown) =>
    new Request(`http://test.local${url}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });

const parseJson = async (response: Response) => ({
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
});

const expectEnvelope = (body: Record<string, unknown>) => {
    expect(body).toHaveProperty("ok");
    expect(body).toHaveProperty("schema_version");
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("warnings");
    expect(body).toHaveProperty("errors");
    expect(body).toHaveProperty("plain_language_summary");
};

describe("/api/research proof-discovery layer", () => {
    it("GET /experiment-reviews lists 14 reviews", async () => {
        const resp = await GET(reqGet("/api/research/experiment-reviews"), ctx("experiment-reviews"));
        const { status, body } = await parseJson(resp);
        expect(status).toBe(200);
        expectEnvelope(body);
        const data = body.data as { reviews: Array<{ experiment_id: string }>; run_id: string };
        expect(data.reviews.length).toBe(14);
        expect(data.run_id).toBe(RUN_ID);
    });

    it("GET /experiment-reviews/EXP_2B returns failed-baseline review with actual != intended", async () => {
        const resp = await GET(
            reqGet("/api/research/experiment-reviews/EXP_2B"),
            ctx("experiment-reviews", "EXP_2B"),
        );
        const { status, body } = await parseJson(resp);
        expect(status).toBe(200);
        const data = body.data as {
            experiment_id: string;
            display_id: string;
            model_comparison: { baseline_status: string };
            scoped_consequence: string;
            actual_run_inference: string[];
            intended_inference_if_passed: string[];
            disallowed_conclusions: string[];
            candidate_lemmas: { status: string; alternative_directions?: string[] }[];
        };
        expect(data.experiment_id).toBe("EXP_2B");
        expect(data.display_id).toBe("P2-2");
        expect(data.model_comparison.baseline_status).toBe("FAILED");
        expect(data.scoped_consequence).not.toBe("THEORY");
        expect(data.actual_run_inference.join(" ").toLowerCase()).toContain("not confirmed");
        // Static intended-if-passed is preserved separately and NOT echoed as actual.
        expect(data.intended_inference_if_passed.join(" ")).not.toEqual(data.actual_run_inference.join(" "));
        expect(data.candidate_lemmas[0].status).toBe("SUGGESTED_FROM_FAILURE");
        expect((data.candidate_lemmas[0].alternative_directions ?? []).length).toBeGreaterThan(0);
        expect(data.disallowed_conclusions.length).toBeGreaterThan(0);
    });

    it("accepts display-id and lowercase aliases", async () => {
        for (const id of ["P2-2", "p2-2", "rogue-isolation"]) {
            const resp = await GET(
                reqGet(`/api/research/experiment-reviews/${id}`),
                ctx("experiment-reviews", id),
            );
            const { status, body } = await parseJson(resp);
            expect(status).toBe(200);
            const data = body.data as { experiment_id: string };
            expect(data.experiment_id).toBe("EXP_2B");
        }
    });

    it("GET /candidate-lemmas/EXP_1 returns SUGGESTED_FROM_PASS for confirmed Program 1 witness", async () => {
        const resp = await GET(
            reqGet("/api/research/candidate-lemmas/EXP_1"),
            ctx("candidate-lemmas", "EXP_1"),
        );
        const { status, body } = await parseJson(resp);
        expect(status).toBe(200);
        const data = body.data as {
            program: string;
            role: string;
            baseline_status: string;
            candidate_lemmas: { status: string }[];
            markdown: string | null;
        };
        expect(data.program).toBe("PROGRAM_1");
        expect(data.role).toBe("witness");
        expect(data.baseline_status).toBe("CONFIRMED");
        expect(data.candidate_lemmas[0].status).toBe("SUGGESTED_FROM_PASS");
        expect(data.markdown).toMatch(/Formalization Target/);
    });

    it("GET /baseline-hypotheses lists 14 entries", async () => {
        const resp = await GET(
            reqGet("/api/research/baseline-hypotheses"),
            ctx("baseline-hypotheses"),
        );
        const { status, body } = await parseJson(resp);
        expect(status).toBe(200);
        const data = body.data as { baselines: unknown[]; coverage: { covered: boolean } };
        expect(data.baselines.length).toBe(14);
        expect(data.coverage.covered).toBe(true);
    });

    it("GET /proof-discovery returns the index + markdown", async () => {
        const resp = await GET(reqGet("/api/research/proof-discovery"), ctx("proof-discovery"));
        const { status, body } = await parseJson(resp);
        expect(status).toBe(200);
        const data = body.data as { index: { totals: { experiments_reviewed: number; failed_or_incomplete: number; program_1_witnesses: number } }; markdown: string };
        expect(data.index.totals.experiments_reviewed).toBe(14);
        expect(data.index.totals.failed_or_incomplete).toBeGreaterThan(0);
        expect(data.markdown).toMatch(/Proof Discovery/);
    });

    it("GET /model-comparisons/EXP_2B returns HIGH-priority FAILED comparison", async () => {
        const resp = await GET(
            reqGet("/api/research/model-comparisons/EXP_2B"),
            ctx("model-comparisons", "EXP_2B"),
        );
        const { status, body } = await parseJson(resp);
        expect(status).toBe(200);
        const data = body.data as { fit_result: { baseline_status: string }; agent_review_priority: string; alternative_model_candidates: string[] };
        expect(data.fit_result.baseline_status).toBe("FAILED");
        expect(data.agent_review_priority).toBe("HIGH");
        expect(data.alternative_model_candidates.length).toBeGreaterThan(0);
    });
});

describe("/api/research hypothesis-proposals lifecycle", () => {
    it("POST creates a PROPOSED proposal and never auto-mutates the registry", async () => {
        const resp = await POST(
            reqJsonPost("/api/research/hypothesis-proposals", {
                source_agent: "claude",
                experiment_id: "EXP_2B",
                proposed_baseline: {
                    plain_statement: "REVISED phase-dependent residual envelope.",
                    expected_signature: { primary_metric: "phase_aware_envelope" },
                },
                reason: "evidence supports phase-dependent envelope",
            }),
            ctx("hypothesis-proposals"),
        );
        const { status, body } = await parseJson(resp);
        expect(status).toBe(201);
        expectEnvelope(body);
        const data = body.data as { proposal_id: string; status: string; experiment_id: string };
        expect(data.status).toBe("PROPOSED");
        expect(data.experiment_id).toBe("EXP_2B");
        expect(data.proposal_id).toMatch(/^prop_/);
        expect((body.warnings as string[]).join(" ")).toMatch(/canonical/i);

        // GET listing shows it.
        const listResp = await GET(
            reqGet("/api/research/hypothesis-proposals?status=PROPOSED"),
            ctx("hypothesis-proposals"),
        );
        const listed = (await listResp.json()) as { data: { proposals: { proposal_id: string }[] } };
        expect(listed.data.proposals.map((p) => p.proposal_id)).toContain(data.proposal_id);
    });

    it("accept rejects empty accepted_by", async () => {
        const create = await POST(
            reqJsonPost("/api/research/hypothesis-proposals", {
                source_agent: "claude",
                experiment_id: "EXP_2B",
                proposed_baseline: { plain_statement: "X", expected_signature: { primary_metric: "y" } },
                reason: "y",
            }),
            ctx("hypothesis-proposals"),
        );
        const created = (await create.json()) as { data: { proposal_id: string } };
        const acceptResp = await POST(
            reqJsonPost(`/api/research/hypothesis-proposals/${created.data.proposal_id}/accept`, {}),
            ctx("hypothesis-proposals", created.data.proposal_id, "accept"),
        );
        const { status, body } = await parseJson(acceptResp);
        expect(status).toBe(400);
        expect(body.ok).toBe(false);
        expect((body.errors as string[]).join(" ")).toMatch(/accepted_by/i);
    });
});

// -----------------------------------------------------------------------------
// MCP JSON-RPC parity
// -----------------------------------------------------------------------------

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
    return JSON.parse(text) as { ok: boolean; data: unknown; warnings: string[]; errors: string[] };
};

describe("MCP proof-discovery tool parity", () => {
    it("list_experiment_reviews returns the 14 reviews (no envelope double-wrap)", async () => {
        const result = await callMcp("list_experiment_reviews");
        expect(result.ok).toBe(true);
        // No double-wrap: result.data IS the proof-discovery payload directly.
        const data = result.data as { reviews: unknown[] };
        expect(data.reviews.length).toBe(14);
    });

    it("get_experiment_review accepts P2-2 alias and returns FAILED baseline", async () => {
        const result = await callMcp("get_experiment_review", { id: "P2-2" });
        expect(result.ok).toBe(true);
        const review = result.data as { experiment_id: string; model_comparison: { baseline_status: string } };
        expect(review.experiment_id).toBe("EXP_2B");
        expect(review.model_comparison.baseline_status).toBe("FAILED");
    });

    it("get_experiment_raw_data exposes raw observations + verifier signal", async () => {
        const result = await callMcp("get_experiment_raw_data", { id: "P2-2" });
        const data = result.data as { raw_observations: Record<string, unknown>; verifier_signal: { outcome: string } };
        expect(data.raw_observations).toBeTruthy();
        expect(data.verifier_signal.outcome).toBe("INCONSISTENT");
    });

    it("get_proof_discovery_index returns aggregated lemmas", async () => {
        const result = await callMcp("get_proof_discovery_index");
        const data = result.data as { index: { totals: { experiments_reviewed: number } } };
        expect(data.index.totals.experiments_reviewed).toBe(14);
    });

    it("propose_baseline_update -> accept -> overlay applies; subsequent get_baseline_hypothesis reflects accepted overlay", async () => {
        const proposed = await callMcp("propose_baseline_update", {
            source_agent: "claude",
            experiment_id: "EXP_2B",
            proposed_baseline: {
                plain_statement: "MCP-ACCEPTED REVISED baseline.",
                expected_signature: { primary_metric: "phase_aware_envelope", expected_value: "...", tolerance: "...", pass_rule: "..." },
            },
            reason: "data supports revision",
        });
        const proposalId = (proposed.data as { proposal_id: string }).proposal_id;
        expect(proposalId).toMatch(/^prop_/);

        const accepted = await callMcp("accept_hypothesis_proposal", {
            proposal_id: proposalId,
            accepted_by: "user:tsolomon89",
            note: "approved via MCP test",
        });
        expect(accepted.ok).toBe(true);
        const acceptedData = accepted.data as { status: string; accepted_by: string };
        expect(acceptedData.status).toBe("ACCEPTED");
        expect(acceptedData.accepted_by).toBe("user:tsolomon89");

        const baseline = await callMcp("get_baseline_hypothesis", { id: "P2-2" });
        const baselineData = baseline.data as { plain_statement: string; _overlay_provenance?: { accepted_by: string } };
        expect(baselineData.plain_statement).toMatch(/MCP-ACCEPTED/);
        expect(baselineData._overlay_provenance?.accepted_by).toBe("user:tsolomon89");
    });
});

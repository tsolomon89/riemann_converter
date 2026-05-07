/**
 * Patch tests for the proof-discovery layer review.
 *
 * 1.  Auth gate on proposal mutation routes (API + MCP).
 * 2.  Cache invalidation tied to overlay file fingerprint; always cleared on
 *     accept/reject.
 * 3.  MCP responses are not double-wrapped — proof-discovery payloads come
 *     through directly, legacy raw payloads still get wrapped.
 * 4.  API errors return ok=false envelopes, never bare {error: ...}.
 * 5.  get_experiment_raw_data exposes observation_series + series_refs +
 *     verifier_static_inference (no verdict reliance).
 * 6.  proof-discovery groups by program first, then by role; Program 2
 *     contradiction-track lemmas include EVERY Program 2 review regardless
 *     of role.
 * 7.  proof-discovery coverage metadata reports partial runs accurately and
 *     never claims "all baselines confirmed" without coverage_complete.
 * 8.  ExperimentReviewPanel renders for every registered experiment id
 *     without throwing.
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
    loadHypothesisRegistry,
} from "../lib/hypothesis-registry";
import { listExperimentReviews, readExperimentReview, readModelComparison } from "../lib/lemma-generator";
import ExperimentReviewPanel from "../components/ExperimentReviewPanel";

const repoRoot = path.resolve(__dirname, "..");
const RUN_ID = "run_patches";
const PARTIAL_RUN_ID = "run_patches_partial";

let tmpRoot = "";
let cwdSpy: jest.SpyInstance;

const ctx = (...segments: string[]) => ({ params: { segments } });
const reqGet = (url: string, headers: Record<string, string> = {}) =>
    new Request(`http://test.local${url}`, { method: "GET", headers });
const reqJsonPost = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`http://test.local${url}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", ...headers },
    });

const callMcp = async (name: string, args: Record<string, unknown> = {}, headers: Record<string, string> = {}) => {
    const response = await MCP_POST(
        new Request("http://test.local/mcp", {
            method: "POST",
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
            headers: { "content-type": "application/json", ...headers },
        }),
    );
    const body = (await response.json()) as { result?: { content?: { text: string }[] }; error?: unknown };
    if (body.error) return { rpcError: body.error };
    const text = body.result?.content?.[0]?.text ?? "";
    return JSON.parse(text);
};

function setupTmpRepo(): string {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "riemann-patches-"));
    const hypDir = path.join(tmp, "proof_kernel", "hypotheses");
    fs.mkdirSync(hypDir, { recursive: true });
    for (const f of ["program_1.json", "program_2.json", "controls.json", "pathfinders.json", "demonstrations.json"]) {
        fs.copyFileSync(path.join(repoRoot, "proof_kernel", "hypotheses", f), path.join(hypDir, f));
    }
    for (const f of ["__init__.py", "hypothesis_registry.py", "hypothesis_proposals.py", "lemma_generator.py"]) {
        fs.copyFileSync(path.join(repoRoot, "proof_kernel", f), path.join(tmp, "proof_kernel", f));
    }

    const fullSummary = {
        experiments: {
            EXP_0: { display_id: "ZETA-0", outcome: "INFORMATIONAL", status: "PASS", function: "VISUALIZATION", role: "VISUALIZATION", metrics: {} },
            EXP_1: {
                display_id: "CORE-1",
                outcome: "CONSISTENT",
                status: "PASS",
                function: "PROOF_OBLIGATION_WITNESS",
                role: "WITNESS",
                metrics: {
                    main_metrics: {
                        observed_max_drift: 0.0001,
                        predicted_max_drift: 0.0,
                        residual_drift: 0.0001,
                        harmonic_curve_key: "harmonic_N_200",
                    },
                },
                inference: {
                    allowed_conclusion: ["IF passed: reconstruction covariant"],
                    disallowed_conclusion: ["proves RH"],
                    inference_scope: "this run",
                },
            },
            EXP_1B: { display_id: "CTRL-1", outcome: "IMPLEMENTATION_OK", status: "PASS", function: "CONTROL", role: "CONTROL", metrics: {} },
            EXP_1C: { display_id: "NOTE-1", outcome: "CONSISTENT", status: "PASS", function: "RESEARCH_NOTE", role: "PATHFINDER", metrics: {} },
            EXP_2: {
                display_id: "P2-1",
                outcome: "INCONSISTENT",
                status: "FAIL",
                scoped_status: "ROUTE_NEGATIVE",
                function: "EXPLORATORY",
                role: "WITNESS",
                metrics: { detection: 0.0 },
                interpretation: "Detection metric below threshold.",
            },
            EXP_2B: {
                display_id: "P2-2",
                outcome: "INCONSISTENT",
                status: "FAIL",
                scoped_status: "ROUTE_NEGATIVE",
                function: "EXPLORATORY",
                role: "WITNESS",
                metrics: {
                    observed_residual_ratio: 9.7,
                    predicted_residual_ratio: 1.0,
                    max_abs_residual_dev: 9.68,
                    threshold: 0.5,
                },
                interpretation: "Residual ratio far from unity.",
            },
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

    // Partial run: only 4 experiments ran. Used for coverage tests.
    const partialSummary = {
        experiments: {
            EXP_1: { display_id: "CORE-1", outcome: "CONSISTENT", status: "PASS", function: "PROOF_OBLIGATION_WITNESS", role: "WITNESS", metrics: {} },
            EXP_1B: { display_id: "CTRL-1", outcome: "IMPLEMENTATION_OK", status: "PASS", function: "CONTROL", role: "CONTROL", metrics: {} },
            EXP_2: { display_id: "P2-1", outcome: "CONSISTENT", status: "PASS", function: "EXPLORATORY", role: "WITNESS", metrics: {} },
            EXP_6: { display_id: "VAL-1", outcome: "CONSISTENT", status: "PASS", function: "PROOF_OBLIGATION_WITNESS", role: "WITNESS", metrics: {} },
        },
    };

    const driver = path.join(tmp, "drive.py");
    fs.writeFileSync(
        driver,
        `import json, sys
sys.path.insert(0, ${JSON.stringify(tmp)})
from pathlib import Path
from proof_kernel.lemma_generator import write_run_reviews

for run_id, summary_json in (
    (${JSON.stringify(RUN_ID)}, ${JSON.stringify(JSON.stringify(fullSummary))}),
    (${JSON.stringify(PARTIAL_RUN_ID)}, ${JSON.stringify(JSON.stringify(partialSummary))}),
):
    out = Path(${JSON.stringify(tmp)}) / "artifacts" / "runs" / run_id
    out.mkdir(parents=True, exist_ok=True)
    write_run_reviews(run_id, json.loads(summary_json), out, repo=${JSON.stringify(tmp)})
print("OK")
`,
        "utf-8",
    );
    expect(execFileSync("python", [driver], { cwd: tmp, encoding: "utf-8" })).toContain("OK");

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
    clearHypothesisRegistryCache();
});

afterAll(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    clearHypothesisRegistryCache();
});

// =============================================================================
// Patch 1: Auth gate on proposal mutation routes (API + MCP)
// =============================================================================
describe("patch 1: proposal mutations require auth + write-enabled deployment", () => {
    const ENV_KEYS = ["NODE_ENV", "RESEARCH_RUN_TOKEN", "RESEARCH_READ_ONLY", "RESEARCH_ENABLE_HOSTED_RUNS", "VERCEL", "VERCEL_ENV"] as const;
    const saved: Record<string, string | undefined> = {};

    const setEnv = (key: string, value: string | undefined) => {
        const env = process.env as Record<string, string | undefined>;
        if (value === undefined) delete env[key];
        else env[key] = value;
    };

    beforeEach(() => {
        for (const key of ENV_KEYS) saved[key] = process.env[key];
    });
    afterEach(() => {
        for (const key of ENV_KEYS) setEnv(key, saved[key]);
    });

    const expectEnvelopeError = async (resp: Response, expectedStatus: number) => {
        expect(resp.status).toBe(expectedStatus);
        const body = (await resp.json()) as Record<string, unknown>;
        // Proof-discovery envelope shape — no bare {error} or {code} at top level.
        expect(body).toHaveProperty("ok", false);
        expect(body).toHaveProperty("schema_version");
        expect(body).toHaveProperty("data", null);
        expect(body).toHaveProperty("errors");
        expect(body).toHaveProperty("warnings");
        expect(body).toHaveProperty("plain_language_summary");
        expect(body).not.toHaveProperty("error");
        expect(body).not.toHaveProperty("code");
        return body;
    };

    it("API: POST /hypothesis-proposals in read-only deployment returns ok=false envelope, status 403, code via warnings", async () => {
        setEnv("RESEARCH_ENABLE_HOSTED_RUNS", "");
        setEnv("VERCEL", "1");
        setEnv("VERCEL_ENV", "production");
        const resp = await POST(
            reqJsonPost("/api/research/hypothesis-proposals", { source_agent: "x", experiment_id: "EXP_2B", proposed_baseline: { plain_statement: "x", expected_signature: { primary_metric: "x" } }, reason: "x" }),
            ctx("hypothesis-proposals"),
        );
        const body = await expectEnvelopeError(resp, 403);
        expect((body.warnings as string[]).join(" ")).toMatch(/READ_ONLY_DEPLOYMENT/);
        expect((body.errors as string[]).join(" ")).toMatch(/read-only/i);
    });

    it("API: POST /hypothesis-proposals/:id/accept blocked in read-only deployments (envelope)", async () => {
        setEnv("RESEARCH_ENABLE_HOSTED_RUNS", "");
        setEnv("VERCEL", "1");
        setEnv("VERCEL_ENV", "production");
        const resp = await POST(
            reqJsonPost("/api/research/hypothesis-proposals/prop_test/accept", { accepted_by: "user:x" }),
            ctx("hypothesis-proposals", "prop_test", "accept"),
        );
        await expectEnvelopeError(resp, 403);
    });

    it("API: POST /hypothesis-proposals/:id/reject blocked in read-only deployments (envelope)", async () => {
        setEnv("RESEARCH_ENABLE_HOSTED_RUNS", "");
        setEnv("VERCEL", "1");
        setEnv("VERCEL_ENV", "production");
        const resp = await POST(
            reqJsonPost("/api/research/hypothesis-proposals/prop_test/reject", { rejected_by: "user:x" }),
            ctx("hypothesis-proposals", "prop_test", "reject"),
        );
        await expectEnvelopeError(resp, 403);
    });

    it("API: write-enabled but missing token returns 401 envelope (auth required, envelope-shaped)", async () => {
        setEnv("NODE_ENV", "production");
        setEnv("RESEARCH_RUN_TOKEN", "secret-token");
        setEnv("RESEARCH_ENABLE_HOSTED_RUNS", "1");
        setEnv("VERCEL", "");
        setEnv("VERCEL_ENV", "");
        const resp = await POST(
            reqJsonPost("/api/research/hypothesis-proposals", { source_agent: "x", experiment_id: "EXP_2B", proposed_baseline: { plain_statement: "x", expected_signature: { primary_metric: "x" } }, reason: "x" }),
            ctx("hypothesis-proposals"),
        );
        const body = await expectEnvelopeError(resp, 401);
        expect((body.errors as string[]).join(" ")).toMatch(/unauthorized/i);
    });

    it("MCP: propose_baseline_update returns READ_ONLY error in read-only deployment", async () => {
        process.env.RESEARCH_ENABLE_HOSTED_RUNS = "";
        process.env.VERCEL = "1";
        process.env.VERCEL_ENV = "production";
        const result = await callMcp("propose_baseline_update", {
            source_agent: "claude",
            experiment_id: "EXP_2B",
            proposed_baseline: { plain_statement: "X", expected_signature: { primary_metric: "x" } },
            reason: "y",
        });
        expect(result.rpcError).toBeDefined();
        const err = result.rpcError as { data?: { code?: string } };
        expect(err.data?.code).toBe("READ_ONLY_DEPLOYMENT");
    });

    it("MCP: accept_hypothesis_proposal blocked in read-only deployments", async () => {
        process.env.RESEARCH_ENABLE_HOSTED_RUNS = "";
        process.env.VERCEL = "1";
        process.env.VERCEL_ENV = "production";
        const result = await callMcp("accept_hypothesis_proposal", { proposal_id: "prop_x", accepted_by: "user:x" });
        expect(result.rpcError).toBeDefined();
    });

    it("MCP: reject_hypothesis_proposal blocked in read-only deployments", async () => {
        process.env.RESEARCH_ENABLE_HOSTED_RUNS = "";
        process.env.VERCEL = "1";
        process.env.VERCEL_ENV = "production";
        const result = await callMcp("reject_hypothesis_proposal", { proposal_id: "prop_x", rejected_by: "user:x" });
        expect(result.rpcError).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // Direct MCP mutation-auth tests: production-mode bearer-token enforcement.
    // assertRunAuth() enforces auth when NODE_ENV is not "development" / "test".
    // -----------------------------------------------------------------------

    const productionEnv = () => {
        setEnv("NODE_ENV", "production");
        setEnv("RESEARCH_RUN_TOKEN", "test-secret-token");
        setEnv("RESEARCH_ENABLE_HOSTED_RUNS", "1");
        setEnv("VERCEL", "");
        setEnv("VERCEL_ENV", "");
    };

    it.each([
        ["propose_baseline_update", { source_agent: "claude", experiment_id: "EXP_2B", proposed_baseline: { plain_statement: "X", expected_signature: { primary_metric: "x", expected_value: "y", tolerance: "z", pass_rule: "w" } }, reason: "test" }],
        ["accept_hypothesis_proposal", { proposal_id: "prop_x", accepted_by: "user:test" }],
        ["reject_hypothesis_proposal", { proposal_id: "prop_x", rejected_by: "user:test" }],
    ])(
        "MCP: %s without bearer token in production returns -32001 Unauthorized",
        async (toolName, args) => {
            productionEnv();
            const result = await callMcp(toolName, args as Record<string, unknown>);
            expect(result.rpcError).toBeDefined();
            const err = result.rpcError as { code: number; message: string };
            expect(err.code).toBe(-32001);
            expect(err.message.toLowerCase()).toMatch(/unauthorized/);
        },
    );

    it.each([
        ["propose_baseline_update", { source_agent: "claude", experiment_id: "EXP_2B", proposed_baseline: { plain_statement: "X", expected_signature: { primary_metric: "x", expected_value: "y", tolerance: "z", pass_rule: "w" } }, reason: "test" }],
        ["accept_hypothesis_proposal", { proposal_id: "prop_x", accepted_by: "user:test" }],
        ["reject_hypothesis_proposal", { proposal_id: "prop_x", rejected_by: "user:test" }],
    ])(
        "MCP: %s with wrong bearer token in production returns -32001 Unauthorized",
        async (toolName, args) => {
            productionEnv();
            const result = await callMcp(toolName, args as Record<string, unknown>, { authorization: "Bearer wrong-token" });
            expect(result.rpcError).toBeDefined();
            const err = result.rpcError as { code: number };
            expect(err.code).toBe(-32001);
        },
    );

    it("MCP: propose_baseline_update with valid bearer token in production succeeds", async () => {
        productionEnv();
        const result = await callMcp(
            "propose_baseline_update",
            {
                source_agent: "claude",
                experiment_id: "EXP_2B",
                proposed_baseline: {
                    plain_statement: "PROD-AUTH-PROBE",
                    expected_signature: { primary_metric: "x", expected_value: "y", tolerance: "z", pass_rule: "w" },
                },
                reason: "production-mode auth test",
            },
            { authorization: "Bearer test-secret-token" },
        );
        expect(result.rpcError).toBeUndefined();
        expect(result.ok).toBe(true);
        const proposal = result.data as { status: string; proposal_id: string; experiment_id: string };
        expect(proposal.status).toBe("PROPOSED");
        expect(proposal.experiment_id).toBe("EXP_2B");
        // Cleanup: reject the proposal so it doesn't leak state into other tests.
        await callMcp(
            "reject_hypothesis_proposal",
            { proposal_id: proposal.proposal_id, rejected_by: "user:test", reason: "cleanup after auth test" },
            { authorization: "Bearer test-secret-token" },
        );
    });

    it("MCP: accept and reject with valid bearer token in production execute end-to-end", async () => {
        productionEnv();
        const proposed = await callMcp(
            "propose_baseline_update",
            {
                source_agent: "claude",
                experiment_id: "EXP_2B",
                proposed_baseline: {
                    plain_statement: "PROD-LIFECYCLE-PROBE",
                    expected_signature: { primary_metric: "x", expected_value: "y", tolerance: "z", pass_rule: "w" },
                },
                reason: "lifecycle test",
            },
            { authorization: "Bearer test-secret-token" },
        );
        const proposalId = (proposed.data as { proposal_id: string }).proposal_id;

        const accepted = await callMcp(
            "accept_hypothesis_proposal",
            { proposal_id: proposalId, accepted_by: "user:test", note: "production accept test" },
            { authorization: "Bearer test-secret-token" },
        );
        expect(accepted.rpcError).toBeUndefined();
        expect(accepted.ok).toBe(true);
        expect((accepted.data as { status: string }).status).toBe("ACCEPTED");

        const rejected = await callMcp(
            "reject_hypothesis_proposal",
            { proposal_id: proposalId, rejected_by: "user:test", reason: "rollback" },
            { authorization: "Bearer test-secret-token" },
        );
        expect(rejected.rpcError).toBeUndefined();
        expect((rejected.data as { status: string }).status).toBe("REJECTED");
    });

    it("MCP: read-only takes precedence over auth — read-only deployment returns -32003 even with valid token", async () => {
        // Even with a valid token, a read-only deployment must block proposal mutations.
        setEnv("NODE_ENV", "production");
        setEnv("RESEARCH_RUN_TOKEN", "test-secret-token");
        setEnv("RESEARCH_ENABLE_HOSTED_RUNS", "");
        setEnv("VERCEL", "1");
        setEnv("VERCEL_ENV", "production");
        const result = await callMcp(
            "propose_baseline_update",
            {
                source_agent: "claude",
                experiment_id: "EXP_2B",
                proposed_baseline: { plain_statement: "X", expected_signature: { primary_metric: "x", expected_value: "y", tolerance: "z", pass_rule: "w" } },
                reason: "y",
            },
            { authorization: "Bearer test-secret-token" },
        );
        expect(result.rpcError).toBeDefined();
        const err = result.rpcError as { code: number; data?: { code?: string } };
        expect(err.code).toBe(-32003);
        expect(err.data?.code).toBe("READ_ONLY_DEPLOYMENT");
    });

    it("MCP: read-only tools (list_baseline_hypotheses) are NOT auth-gated even in production", async () => {
        productionEnv();
        const result = await callMcp("list_baseline_hypotheses");
        expect(result.rpcError).toBeUndefined();
        expect(result.ok).toBe(true);
    });
});

// =============================================================================
// Patch 2: Cache invalidation on accept/reject + overlay-file fingerprint
// =============================================================================
describe("patch 2: hypothesis registry cache invalidates on overlay change", () => {
    it("accepting a proposal flips the registry cache to the new baseline immediately", async () => {
        clearHypothesisRegistryCache();
        const before = getBaselineForExperiment("EXP_2B", tmpRoot)!;
        const propose = await POST(
            reqJsonPost("/api/research/hypothesis-proposals", {
                source_agent: "claude",
                experiment_id: "EXP_2B",
                proposed_baseline: {
                    plain_statement: "PATCH-2-INVALIDATED-BASELINE",
                    expected_signature: { primary_metric: "x", expected_value: "y", tolerance: "z", pass_rule: "w" },
                },
                reason: "test cache invalidation",
            }),
            ctx("hypothesis-proposals"),
        );
        expect(propose.status).toBe(201);
        const proposalId = ((await propose.json()) as { data: { proposal_id: string } }).data.proposal_id;

        // Without invalidation, the next call would still see the old baseline if
        // the cache key were just repoRoot. The fingerprint includes overlay
        // mtime+size, so the next read sees the overlay.
        const accept = await POST(
            reqJsonPost(`/api/research/hypothesis-proposals/${proposalId}/accept`, { accepted_by: "user:test" }),
            ctx("hypothesis-proposals", proposalId, "accept"),
        );
        expect(accept.status).toBe(200);

        const after = getBaselineForExperiment("EXP_2B", tmpRoot)!;
        expect(after.plain_statement).toBe("PATCH-2-INVALIDATED-BASELINE");
        expect(after.plain_statement).not.toBe(before.plain_statement);

        // Reject removes the overlay; cache must invalidate again.
        const reject = await POST(
            reqJsonPost(`/api/research/hypothesis-proposals/${proposalId}/reject`, { rejected_by: "user:test", reason: "test rollback" }),
            ctx("hypothesis-proposals", proposalId, "reject"),
        );
        expect(reject.status).toBe(200);
        const restored = getBaselineForExperiment("EXP_2B", tmpRoot)!;
        expect(restored.plain_statement).toBe(before.plain_statement);
    });

    it("loadHypothesisRegistry recomputes when overlay file mtime changes", () => {
        clearHypothesisRegistryCache();
        loadHypothesisRegistry(tmpRoot); // warm cache
        // Touch overlay file to bump mtime/size; the next call must re-read.
        const overlayPath = path.join(tmpRoot, "proof_kernel", "hypotheses", "_accepted_overlays.json");
        fs.writeFileSync(overlayPath, JSON.stringify({ schema_version: "x", overlays: { HYP_FAKE: { accepted_baseline: { plain_statement: "FINGERPRINT-PROBE" } } } }));
        const reg = loadHypothesisRegistry(tmpRoot);
        expect(reg.byHypothesisId.HYP_FAKE).toBeDefined();
        expect(reg.byHypothesisId.HYP_FAKE.plain_statement).toBe("FINGERPRINT-PROBE");
        // Restore overlay (delete it for clean state).
        fs.unlinkSync(overlayPath);
        clearHypothesisRegistryCache();
    });
});

// =============================================================================
// Patch 3: MCP envelope no double-wrap
// =============================================================================
describe("patch 3: MCP responses are not double-wrapped", () => {
    it("proof-discovery tool envelope has schema_version + run_id at top level (not nested under .data)", async () => {
        const result = await callMcp("get_experiment_review", { id: "P2-2" });
        expect(result.ok).toBe(true);
        // Top-level envelope contains schema_version and run_id.
        expect(typeof result.schema_version).toBe("string");
        expect(result.schema_version).toMatch(/proof-discovery-api/);
        expect(result.run_id).toBe(RUN_ID);
        // result.data is the actual experiment review (not another envelope).
        const data = result.data as { experiment_id: string; baseline_hypothesis?: unknown };
        expect(data.experiment_id).toBe("EXP_2B");
        expect(data.baseline_hypothesis).toBeTruthy();
        // No nested .data.data shape.
        expect((data as { data?: unknown }).data).toBeUndefined();
    });

    it("legacy raw-payload tool (get_manifest) is still shaped by the envelope helper", async () => {
        const result = await callMcp("get_manifest");
        // Legacy payloads do NOT carry envelope-shape themselves; the wrapper
        // gives them {ok, data, warnings, errors}. The success/failure value
        // depends on test fixtures — what we care about here is the *shape*:
        // the legacy wrapper does not add schema_version, so we can tell it
        // apart from the proof-discovery envelope.
        expect(result).toHaveProperty("ok");
        expect(result).toHaveProperty("data");
        expect(result).toHaveProperty("warnings");
        expect(result).toHaveProperty("errors");
        expect("schema_version" in result).toBe(false);
    });
});

// =============================================================================
// Patch 4: API errors return ok=false envelopes
// =============================================================================
describe("patch 4: API errors return ok=false envelopes (not bare {error})", () => {
    it("invalid experiment id on /experiment-reviews/:id returns ok=false envelope", async () => {
        const resp = await GET(
            reqGet("/api/research/experiment-reviews/NOT_A_VALID_ID"),
            ctx("experiment-reviews", "NOT_A_VALID_ID"),
        );
        const body = (await resp.json()) as Record<string, unknown>;
        expect(body).toHaveProperty("ok");
        expect(body.ok).toBe(false);
        expect(body).toHaveProperty("schema_version");
        expect(body).toHaveProperty("data");
        expect(body).toHaveProperty("warnings");
        expect(body).toHaveProperty("errors");
        expect((body.errors as string[]).join(" ")).toMatch(/invalid experiment id/i);
        // No bare {error: ...} key.
        expect(body).not.toHaveProperty("error");
    });

    it("invalid id on /candidate-lemmas/:id and /model-comparisons/:id also returns envelope", async () => {
        for (const head of ["candidate-lemmas", "model-comparisons", "baseline-hypotheses"]) {
            const resp = await GET(reqGet(`/api/research/${head}/NOT_VALID`), ctx(head, "NOT_VALID"));
            const body = (await resp.json()) as Record<string, unknown>;
            expect(body.ok).toBe(false);
            expect(body).not.toHaveProperty("error");
            expect((body.errors as string[]).length).toBeGreaterThan(0);
        }
    });
});

// =============================================================================
// Patch 5: Strengthened raw-data artifacts
// =============================================================================
describe("patch 5: get_experiment_raw_data exposes observation_series + series_refs + verifier_static_inference", () => {
    it("observation_series buckets observed/predicted/residual metric keys", async () => {
        const result = await callMcp("get_experiment_raw_data", { id: "P2-2" });
        const data = result.data as {
            observation_series: { observed: Record<string, unknown>; predicted: Record<string, unknown>; residual: Record<string, unknown>; other_numeric: Record<string, unknown> };
            series_refs: string[];
            verifier_static_inference: { _label?: string; allowed_conclusion?: string[]; disallowed_conclusion?: string[] } | null;
        };
        // observed_residual_ratio → bucketed under residual (residual takes priority over observed).
        expect(Object.keys(data.observation_series.residual).some((k) => k.includes("residual"))).toBe(true);
        // predicted_residual_ratio also lands under residual (residual priority).
        expect(Object.keys(data.observation_series.residual).length).toBeGreaterThan(0);
    });

    it("series_refs surfaces curve_keys for experiments with chart series", async () => {
        const result = await callMcp("get_experiment_raw_data", { id: "EXP_1" });
        const data = result.data as { series_refs: string[]; observation_series: { observed: Record<string, unknown> } };
        expect(data.series_refs).toEqual(expect.arrayContaining(["harmonic_N_200"]));
    });

    it("verifier_static_inference is exposed but labeled 'do not read as run conclusion'", async () => {
        const result = await callMcp("get_experiment_raw_data", { id: "EXP_1" });
        const data = result.data as { verifier_static_inference: { _label?: string; allowed_conclusion?: string[] } | null };
        expect(data.verifier_static_inference).toBeTruthy();
        expect(data.verifier_static_inference?._label).toMatch(/do not read as run conclusion/i);
        expect(data.verifier_static_inference?.allowed_conclusion).toEqual(["IF passed: reconstruction covariant"]);
    });
});

// =============================================================================
// Patch 6: Program-first grouping in proof-discovery index
// =============================================================================
describe("patch 6: proof-discovery groups by program first, then by role", () => {
    it("by_program groups every experiment under PROGRAM_1 / PROGRAM_2 / NONE with role buckets", async () => {
        const result = await callMcp("get_proof_discovery_index");
        const idx = (result.data as { index: { by_program: Record<string, Record<string, unknown[]> | unknown[]> } }).index;
        expect(idx.by_program).toBeTruthy();
        expect(idx.by_program.PROGRAM_1).toBeTruthy();
        expect(idx.by_program.PROGRAM_2).toBeTruthy();
        // PROGRAM_2 must contain witnesses + (any) other roles. P2 currently has 3 witness experiments.
        const p2 = idx.by_program.PROGRAM_2 as Record<string, { experiment_id: string }[]>;
        const p2Witnesses = p2.witnesses;
        const p2Ids = new Set(p2Witnesses.map((e) => e.experiment_id));
        for (const id of ["EXP_2", "EXP_2B", "EXP_7"]) {
            expect(p2Ids.has(id)).toBe(true);
        }
    });

    it("program_2_contradiction_track_lemmas covers every Program 2 experiment regardless of role", async () => {
        const result = await callMcp("get_proof_discovery_index");
        const idx = (result.data as { index: { program_2_contradiction_track_lemmas: { experiment_id: string }[] } }).index;
        const ids = new Set(idx.program_2_contradiction_track_lemmas.map((e) => e.experiment_id));
        for (const id of ["EXP_2", "EXP_2B", "EXP_7"]) {
            expect(ids.has(id)).toBe(true);
        }
    });
});

// =============================================================================
// Patch 7: Coverage metadata
// =============================================================================
describe("patch 7: proof-discovery reports coverage honestly", () => {
    it("full run: coverage_complete true, registered = experiments_run = 14", async () => {
        const result = await callMcp("get_proof_discovery_index", { run_id: RUN_ID });
        const idx = (result.data as { index: { coverage: { coverage_complete: boolean; registered_experiments: string[]; experiments_run: string[]; reviews_generated: string[]; experiments_not_run: string[]; all_confirmed: boolean } } }).index;
        expect(idx.coverage.registered_experiments.length).toBe(14);
        expect(idx.coverage.experiments_run.length).toBe(14);
        expect(idx.coverage.coverage_complete).toBe(true);
        expect(idx.coverage.experiments_not_run).toEqual([]);
        // Some experiments failed → all_confirmed must be false.
        expect(idx.coverage.all_confirmed).toBe(false);
    });

    it("partial run: coverage_complete false, experiments_not_run lists the missing ones", async () => {
        const result = await callMcp("get_proof_discovery_index", { run_id: PARTIAL_RUN_ID });
        const idx = (result.data as { index: { coverage: { coverage_complete: boolean; registered_experiments: string[]; experiments_run: string[]; experiments_not_run: string[]; all_confirmed: boolean } } }).index;
        expect(idx.coverage.coverage_complete).toBe(false);
        expect(idx.coverage.experiments_not_run.length).toBe(REQUIRED_EXPERIMENT_IDS.length - 4);
        expect(idx.coverage.all_confirmed).toBe(false);
    });

    it("partial run markdown does NOT claim 'all baselines confirmed'", () => {
        const md = fs.readFileSync(
            path.join(tmpRoot, "artifacts", "runs", PARTIAL_RUN_ID, "proof_discovery.md"),
            "utf-8",
        );
        expect(md).not.toMatch(/All baselines confirmed in this run/);
        expect(md).toMatch(/Partial coverage/);
    });
});

// =============================================================================
// Patch 8: UI suite-wide review-panel coverage
// =============================================================================
describe("patch 8: ExperimentReviewPanel renders for every registered experiment", () => {
    it.each(REQUIRED_EXPERIMENT_IDS)(
        "renders panel for %s without throwing and labels intended-if-passed as conditional",
        (expId) => {
            const review = readExperimentReview(RUN_ID, expId, tmpRoot);
            const comparison = readModelComparison(RUN_ID, expId, tmpRoot);
            expect(review).toBeTruthy();
            const html = renderToStaticMarkup(
                React.createElement(ExperimentReviewPanel, {
                    experimentId: expId,
                    initialReview: review,
                    initialComparison: comparison,
                }),
            );
            // The panel's outer container always has experiment-review-panel testid.
            expect(html).toContain('data-testid="experiment-review-panel"');
            expect(html).toContain(`data-experiment-id="${expId}"`);
            // Intended-if-passed must always be labeled, not echoed as conclusion.
            if (review!.intended_inference_if_passed.length > 0) {
                expect(html).toContain("Intended inference if baseline is confirmed");
                expect(html).toContain("do NOT read as the conclusion of this run");
            }
            // For failed/inconclusive runs, actual_run_inference must include "not confirmed" or "inconclusive" or "partial".
            const status = review!.model_comparison.baseline_status;
            if (status === "FAILED") {
                expect(html.toLowerCase()).toContain("not confirmed");
            }
        },
    );

    it("review panel never echoes 'consistent with the rogue-isolation model' for any experiment", () => {
        const reviews = listExperimentReviews(RUN_ID, tmpRoot);
        for (const review of reviews) {
            const comparison = readModelComparison(RUN_ID, review.experiment_id, tmpRoot);
            const html = renderToStaticMarkup(
                React.createElement(ExperimentReviewPanel, {
                    experimentId: review.experiment_id,
                    initialReview: review,
                    initialComparison: comparison,
                }),
            );
            expect(html.toLowerCase()).not.toContain("consistent with the rogue-isolation model");
        }
    });
});

import fs from "fs";
import os from "os";
import path from "path";
import { GET } from "../app/api/research/[...segments]/route";
import { POST as MCP_POST } from "../app/mcp/route";
import { buildResearchPlan } from "../lib/research-plan";
import type { DataPlannerOutput } from "../lib/data-planner";
import {
    buildFidelityReport,
    classifyHistoricalComparison,
    classifyScopedStatus,
    getArtifactFreshness,
    getCurrentReportingState,
    getPublicCertificateMirrorStatus,
} from "../lib/current-reporting";
import type { ExperimentsData } from "../lib/types";

const ctx = (...segments: string[]) => ({ params: { segments } });

const mcpCall = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await MCP_POST(
        new Request("http://localhost/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: { name, arguments: args },
            }),
        }),
    );
    return response.json();
};

type McpToolBody = {
    result?: {
        content?: Array<{ type?: string; text?: string }>;
    };
};

const unwrapMcpData = (body: McpToolBody) => {
    if (!body.result) throw new Error("MCP response did not include result.");
    expect(body.result.content?.[0]?.type).toBe("text");
    const text = body.result.content?.[0]?.text;
    expect(typeof text).toBe("string");
    const parsed = JSON.parse(text as string);
    expect(parsed).toMatchObject({
        ok: true,
        warnings: expect.any(Array),
        errors: [],
    });
    return parsed.data;
};

const makeTempRepo = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "riemann-current-"));
    fs.mkdirSync(path.join(root, "public"), { recursive: true });
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    fs.writeFileSync(
        path.join(root, "data", "manifest.json"),
        JSON.stringify({
            assets: [
                { kind: "tau", valid: true },
                { kind: "nontrivial_zeta_zeros", valid: true },
                { kind: "primes", valid: true },
            ],
        }),
    );
    fs.writeFileSync(
        path.join(root, "public", "experiments.json"),
        JSON.stringify({
            engine_status: "NO_CURRENT_RUN",
            artifact_kind: "experiments",
            meta: { schema_version: "test.reset" },
            summary: {
                engine_status: "NO_CURRENT_RUN",
                experiments: {},
                proof_program: {
                    obligations: [
                        {
                            id: "NC1",
                            status: "OPEN",
                            witnesses: [],
                            notes: [],
                            blocked_by: [],
                            depends_on: [],
                        },
                    ],
                    open_gaps: [],
                },
            },
        }),
    );
    return root;
};

const writeJson = (filePath: string, payload: unknown) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
};

const writeCurrent = (root: string, latestRunId: string | null) => {
    writeJson(path.join(root, "public", "current.json"), {
        engine_status: latestRunId ? "CURRENT_RUN" : "NO_CURRENT_RUN",
        reason: latestRunId ? undefined : "historical run artifacts cleared during active development",
        latest_run_id: latestRunId,
        current_experiments_path: latestRunId ? `artifacts/runs/${latestRunId}/experiments.json` : null,
        current_certificate_path: latestRunId ? `artifacts/runs/${latestRunId}/certificate.json` : null,
        certificate_status: latestRunId ? "MISSING_FOR_RUN" : "NOT_BUILT",
        data_assets_status: "AVAILABLE",
        historical_comparison_enabled: false,
        next_action: "run clean Program 1 critical suite",
    });
};

const readyData: DataPlannerOutput = {
    status: "READY",
    mode: "same_object_certificate",
    required_assets: [],
    available_assets: [],
    missing_assets: [],
    insufficient_assets: [],
    generation_plan: [],
    warnings: [],
    errors: [],
    next_action: "run_next_research_step",
    requirements: {
        experiments: [],
        declarations: {},
        required_assets: [],
        required_stored_dps: 100,
        guard_dps: 20,
        requested_dps: 80,
    },
};

describe("current-run-only reporting", () => {
    const originalCwd = process.cwd();
    let isolatedRoot: string | null = null;

    beforeEach(() => {
        isolatedRoot = makeTempRepo();
        writeCurrent(isolatedRoot, null);
        process.chdir(isolatedRoot);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        if (isolatedRoot) {
            fs.rmSync(isolatedRoot, { recursive: true, force: true });
            isolatedRoot = null;
        }
    });

    it("ignores historical run artifacts after reset", () => {
        const root = makeTempRepo();
        writeCurrent(root, null);
        writeJson(path.join(root, "artifacts", "runs", "old_run", "certificate.json"), {
            run_id: "old_run",
            artifact_kind: "certificate",
        });

        expect(getArtifactFreshness("certificate", { run_id: "old_run" }, root).freshness).toBe("RESET");
    });

    it("reports clean NO_CURRENT_RUN state", () => {
        const root = makeTempRepo();
        writeCurrent(root, null);

        expect(getCurrentReportingState(root)).toMatchObject({
            engine_status: "NO_CURRENT_RUN",
            latest_run_id: null,
            certificate_status: "NOT_BUILT",
            historical_comparison_enabled: false,
        });
    });

    it("does not treat a stale certificate as current", () => {
        const root = makeTempRepo();
        writeCurrent(root, "run_current");
        writeJson(path.join(root, "artifacts", "runs", "run_old", "certificate.json"), {
            run_id: "run_old",
            artifact_kind: "certificate",
        });

        expect(getArtifactFreshness("certificate", { run_id: "run_old" }, root).freshness).toBe("STALE");
    });

    it("reports a missing per-run certificate as MISSING_FOR_RUN", () => {
        const root = makeTempRepo();
        writeCurrent(root, "run_current");
        writeJson(path.join(root, "artifacts", "runs", "run_current", "experiments.json"), {
            run_id: "run_current",
            artifact_kind: "experiments",
        });

        expect(getArtifactFreshness("certificate", {}, root).freshness).toBe("MISSING_FOR_RUN");
    });

    it("marks a public certificate mirror stale when run ids differ", () => {
        const root = makeTempRepo();
        writeCurrent(root, "run_current");
        writeJson(path.join(root, "public", "same_object_certificate.json"), {
            mirrors_run_id: "run_old",
            freshness: "CURRENT",
        });

        expect(getPublicCertificateMirrorStatus(root)).toBe("STALE");
    });

    it("allows compute_fidelity and data_fidelity to differ", () => {
        const artifact = {
            meta: {
                dps: 80,
                zeros: 20000,
                zero_source_info: { declared_decimals: 9 },
            },
        } as unknown as ExperimentsData;

        const report = buildFidelityReport(artifact);
        expect(report.compute_fidelity).toBe("AUTHORITATIVE");
        expect(report.data_fidelity).toBe("INSUFFICIENT");
        expect(report.certificate_fidelity).toBe("BLOCKED");
    });

    it("warns when an 80 dps run uses a 9-decimal zero source", () => {
        const report = buildFidelityReport({
            meta: {
                dps: 80,
                zeros: 20000,
                zero_source_info: { declared_decimals: 9 },
            },
        } as unknown as ExperimentsData);

        expect(report.warnings.join(" ")).toContain("zero source precision below certificate policy");
    });

    it("treats the generated 60K baseline as warning-gated rather than blocked", () => {
        const report = buildFidelityReport(
            {
                meta: {
                    dps: 80,
                    zeros: 60000,
                    zero_source_info: {
                        declared_decimals: 75,
                        requested_count: 60000,
                        loaded_count: 60000,
                        source_kind: "generated_cache",
                        source_path: "data/zeros/nontrivial/zeros.generated.jsonl",
                        valid: true,
                    },
                },
            } as unknown as ExperimentsData,
            { data_sufficiency: readyData },
        );

        expect(report.compute_fidelity).toBe("AUTHORITATIVE");
        expect(report.data_fidelity).toBe("READY_WITH_WARNINGS");
        expect(report.certificate_fidelity).toBe("ELIGIBLE_WITH_WARNINGS");
        expect(report.warnings.join(" ")).toContain("accepted for this baseline run");
    });

    it("keeps Program 2 mixed status out of Same-Object Certificate next action", () => {
        const plan = buildResearchPlan(readyData, {
            meta: { dps: 80, zeros: 20000, tau: 6.28 },
            summary: {
                overall: "PASS",
                experiments: {
                    EXP_1: { type: "x", status: "PASS", outcome: "CONSISTENT", program: "PROGRAM_1", metrics: {}, interpretation: "" },
                    EXP_6: { type: "x", status: "PASS", outcome: "CONSISTENT", program: "PROGRAM_1", metrics: {}, interpretation: "" },
                    EXP_8: { type: "x", status: "PASS", outcome: "CONSISTENT", program: "PROGRAM_1", metrics: {}, interpretation: "" },
                    EXP_2: { type: "x", status: "FAIL", outcome: "INCONSISTENT", program: "PROGRAM_2", metrics: {}, interpretation: "" },
                    EXP_7: { type: "x", status: "PASS", outcome: "CONSISTENT", program: "PROGRAM_2", metrics: {}, interpretation: "" },
                },
            },
        } as unknown as ExperimentsData, null);

        expect(plan.recommended_next_action).toBe("BUILD_SAME_OBJECT_CERTIFICATE");
    });

    it("reports controls as CONTROL_ARMED, not SUPPORTS", () => {
        expect(classifyScopedStatus({ function: "CONTROL", status: "PASS", outcome: "IMPLEMENTATION_OK" })).toBe("CONTROL_ARMED");
    });

    it("keeps reset current reporting free of SUPPORTS/REFUTES current statuses", () => {
        const current = JSON.stringify(getCurrentReportingState());
        expect(current).not.toMatch(/\bSUPPORTS\b|\bREFUTES\b/);
    });

    it("disables historical comparison by default", () => {
        expect(getCurrentReportingState().historical_comparison_enabled).toBe(false);
    });

    it("classifies code-fingerprint changes as expected implementation drift", () => {
        const classification = classifyHistoricalComparison(
            { schema_version: "s", code_fingerprint: { "verifier.py": "a" }, zero_source_info: { hash: "z" } },
            { schema_version: "s", code_fingerprint: { "verifier.py": "b" }, zero_source_info: { hash: "z" } },
        );

        expect(classification.comparison_type).toBe("EXPECTED_IMPLEMENTATION_DRIFT");
        expect(classification.interpretation).toContain("Expected implementation drift");
    });

    it("latest-run endpoint returns clean no-current-run state after reset", async () => {
        const response = await GET(new Request("http://localhost/api/research/latest-run"), ctx("latest-run"));
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            latest_real_run_id: null,
            status: "NO_CURRENT_RUN",
            certificate_status: "NOT_BUILT",
            historical_comparison_enabled: false,
        });
    });

    it("current-experiments endpoint resolves through current-run state", async () => {
        const response = await GET(new Request("http://localhost/api/research/current-experiments"), ctx("current-experiments"));
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            engine_status: "NO_CURRENT_RUN",
            artifact_kind: "experiments",
        });
    });

    it("current-experiments endpoint falls back to the public mirror when the per-run artifact is not committed", async () => {
        const root = process.cwd();
        writeCurrent(root, "run_public");
        writeJson(path.join(root, "public", "experiments.json"), {
            run_id: "run_public",
            artifact_kind: "experiments",
            meta: { dps: 80, zeros: 60000, tau: 6.283185307179586 },
            summary: { overall: "PASS", experiments: {} },
            experiment_0: {
                polar_trace: {
                    samples: [{ t: 2, re: 1, im: 0 }],
                },
            },
        });

        const response = await GET(new Request("http://localhost/api/research/current-experiments"), ctx("current-experiments"));
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            run_id: "run_public",
            experiment_0: {
                polar_trace: {
                    samples: [expect.objectContaining({ t: 2 })],
                },
            },
        });
    });

    it("obligations API marks reset-state obligations as not witnessed", async () => {
        const response = await GET(new Request("http://localhost/api/research/obligations"), ctx("obligations"));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.current_run_status).toBe("NO_CURRENT_RUN");
        expect(body.data.obligations.some((obl: { current_status?: string }) => obl.current_status === "NOT_WITNESSED")).toBe(true);
        expect(body.data.note).toContain("awaiting fresh witnesses");
    });

    it("history API exposes disabled-comparison semantics", async () => {
        const response = await GET(new Request("http://localhost/api/research/history"), ctx("history"));
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            data: {
                historical_comparison_enabled: false,
            },
        });
    });

    it("MCP exposes current run, artifact freshness, and reporting state", async () => {
        expect(unwrapMcpData(await mcpCall("get_latest_run"))).toMatchObject({
            status: "NO_CURRENT_RUN",
            certificate_status: "NOT_BUILT",
        });
        expect(unwrapMcpData(await mcpCall("get_artifact_freshness", { artifact_kind: "certificate" }))).toMatchObject({
            freshness: "RESET",
        });
        expect(unwrapMcpData(await mcpCall("get_current_reporting_state"))).toMatchObject({
            engine_status: "NO_CURRENT_RUN",
            historical_comparison_enabled: false,
        });
    });

    it("MCP obligations use reset-state reporting statuses", async () => {
        expect(unwrapMcpData(await mcpCall("get_obligations"))).toMatchObject({
            data: {
                current_run_status: "NO_CURRENT_RUN",
                note: expect.stringContaining("awaiting fresh witnesses"),
            },
        });
    });
});

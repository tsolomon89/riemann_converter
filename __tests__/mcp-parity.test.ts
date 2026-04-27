import { POST as MCP_POST } from "../app/mcp/route";
import { GET as API_GET, POST as API_POST } from "../app/api/research/[...segments]/route";
import { readHistory } from "../lib/research-service";

jest.mock("../lib/run-manager", () => ({
    startCanonicalRun: jest.fn(() => ({
        run: {
            run_id: "run_test",
            mode: "verify",
            status: "RUNNING",
            started_at: "2026-04-21T00:00:00.000Z",
        },
    })),
    startConfiguredRun: jest.fn((config: Record<string, unknown>) => ({
        run: {
            run_id: "run_custom",
            mode: `custom:${config.run ?? "all"}`,
            status: "RUNNING",
            started_at: "2026-04-21T00:00:00.000Z",
        },
    })),
    getRunStatus: jest.fn(() => ({
        run_id: "run_test",
        mode: "verify",
        status: "RUNNING",
        started_at: "2026-04-21T00:00:00.000Z",
    })),
    getRunLogs: jest.fn((_id: string, from: number) => ({
        run_id: "run_test",
        from,
        next: from + 5,
        chunk: "hello",
        done: false,
        status: "RUNNING",
    })),
    getRunEvents: jest.fn((_id: string, from: number) => ({
        run_id: "run_test",
        from,
        next: from + 1,
        events: [
            {
                run_id: "run_test",
                index: from,
                ts: "2026-04-21T00:00:00.000Z",
                kind: "PROGRESS",
                phase: "EXPERIMENT_LOOP",
                percent: 12.5,
            },
        ],
        done: false,
        status: "RUNNING",
    })),
    cancelRun: jest.fn(() => ({
        run: {
            run_id: "run_test",
            status: "CANCELLING",
            cancelled_at: "2026-04-21T00:00:00.000Z",
        },
    })),
    resumeCanonicalRun: jest.fn(() => ({
        run: {
            run_id: "run_resumed",
            mode: "verify",
            status: "RUNNING",
            resumed_from_checkpoint: true,
            checkpoint_path: ".runtime/checkpoints/canonical-verify.checkpoint.json",
        },
    })),
}));

const mcpCall = async (
    name: string,
    args: Record<string, unknown> = {},
    headers: Record<string, string> = {},
) => {
    const res = await MCP_POST(
        new Request("http://localhost/mcp", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...headers,
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: { name, arguments: args },
            }),
        }),
    );
    return res.json();
};

const mcpListTools = async () => {
    const res = await MCP_POST(
        new Request("http://localhost/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/list",
                params: {},
            }),
        }),
    );
    return res.json();
};

const ctx = (...segments: string[]) => ({ params: { segments } });
const BASE_ENV = {
    NODE_ENV: process.env.NODE_ENV,
    RESEARCH_RUN_TOKEN: process.env.RESEARCH_RUN_TOKEN,
    RESEARCH_READ_ONLY: process.env.RESEARCH_READ_ONLY,
    RESEARCH_ENABLE_HOSTED_RUNS: process.env.RESEARCH_ENABLE_HOSTED_RUNS,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
};

const setEnv = (key: keyof typeof BASE_ENV, value: string | undefined) => {
    const env = process.env as Record<string, string | undefined>;
    if (value === undefined) {
        delete env[key];
        return;
    }
    env[key] = value;
};

const restoreEnv = () => {
    setEnv("NODE_ENV", BASE_ENV.NODE_ENV);
    setEnv("RESEARCH_RUN_TOKEN", BASE_ENV.RESEARCH_RUN_TOKEN);
    setEnv("RESEARCH_READ_ONLY", BASE_ENV.RESEARCH_READ_ONLY);
    setEnv("RESEARCH_ENABLE_HOSTED_RUNS", BASE_ENV.RESEARCH_ENABLE_HOSTED_RUNS);
    setEnv("VERCEL", BASE_ENV.VERCEL);
    setEnv("VERCEL_ENV", BASE_ENV.VERCEL_ENV);
};

describe("MCP parity with HTTP research API", () => {
    afterEach(() => {
        restoreEnv();
    });

    it("blocks run tools in read-only deployments", async () => {
        process.env.RESEARCH_READ_ONLY = "";
        process.env.RESEARCH_ENABLE_HOSTED_RUNS = "";
        process.env.VERCEL = "1";
        process.env.VERCEL_ENV = "production";

        const blockedStart = await mcpCall("start_run", { mode: "verify" });
        expect(blockedStart).toHaveProperty("error");
        expect(blockedStart.error.code).toBe(-32003);
        expect(blockedStart.error.data).toMatchObject({ code: "READ_ONLY_DEPLOYMENT" });

        const blockedStatus = await mcpCall("get_run_status", { run_id: "run_test" });
        expect(blockedStatus).toHaveProperty("error");
        expect(blockedStatus.error.code).toBe(-32003);
        expect(blockedStatus.error.data).toMatchObject({ code: "READ_ONLY_DEPLOYMENT" });

        const blockedLogs = await mcpCall("get_run_logs", { run_id: "run_test", from: 0 });
        expect(blockedLogs).toHaveProperty("error");
        expect(blockedLogs.error.code).toBe(-32003);
        expect(blockedLogs.error.data).toMatchObject({ code: "READ_ONLY_DEPLOYMENT" });

        const blockedEvents = await mcpCall("get_run_events", { run_id: "run_test", from: 0 });
        expect(blockedEvents).toHaveProperty("error");
        expect(blockedEvents.error.code).toBe(-32003);
        expect(blockedEvents.error.data).toMatchObject({ code: "READ_ONLY_DEPLOYMENT" });

        const blockedCancel = await mcpCall("cancel_run", { run_id: "run_test" });
        expect(blockedCancel).toHaveProperty("error");
        expect(blockedCancel.error.code).toBe(-32003);
        expect(blockedCancel.error.data).toMatchObject({ code: "READ_ONLY_DEPLOYMENT" });

        const blockedResume = await mcpCall("resume_run", { mode: "verify" });
        expect(blockedResume).toHaveProperty("error");
        expect(blockedResume.error.code).toBe(-32003);
        expect(blockedResume.error.data).toMatchObject({ code: "READ_ONLY_DEPLOYMENT" });
    });

    it("run tool schemas include overkill_full mode", async () => {
        const listed = await mcpListTools();
        const tools = (listed.result?.tools ?? []) as Array<{
            name?: string;
            inputSchema?: { properties?: { mode?: { enum?: string[] } } };
        }>;

        const start = tools.find((tool) => tool.name === "start_run");
        const custom = tools.find((tool) => tool.name === "start_custom_run");
        const resume = tools.find((tool) => tool.name === "resume_run");

        expect(start?.inputSchema?.properties?.mode?.enum ?? []).toContain("overkill_full");
        expect(custom?.inputSchema?.properties).toHaveProperty("run");
        expect(resume?.inputSchema?.properties?.mode?.enum ?? []).toContain("overkill_full");
    });

    it("read tools mirror HTTP envelopes", async () => {
        const manifestBody = await (
            await API_GET(new Request("http://localhost/api/research/manifest"), ctx("manifest"))
        ).json() as { data?: { experiment_ids?: string[] } };
        const experimentIds = manifestBody.data?.experiment_ids ?? [];

        const comparisons: Array<{
            tool: string;
            args?: Record<string, unknown>;
            getHttp: () => Promise<Response>;
        }> = [
            {
                tool: "get_manifest",
                getHttp: () => API_GET(new Request("http://localhost/api/research/manifest"), ctx("manifest")),
            },
            {
                tool: "get_theorem_candidate",
                getHttp: () =>
                    API_GET(
                        new Request("http://localhost/api/research/theorem-candidate"),
                        ctx("theorem-candidate"),
                    ),
            },
            {
                tool: "get_obligations",
                getHttp: () => API_GET(new Request("http://localhost/api/research/obligations"), ctx("obligations")),
            },
            {
                tool: "get_open_gaps",
                getHttp: () => API_GET(new Request("http://localhost/api/research/open-gaps"), ctx("open-gaps")),
            },
            {
                tool: "get_implementation_health",
                getHttp: () =>
                    API_GET(
                        new Request("http://localhost/api/research/implementation-health"),
                        ctx("implementation-health"),
                    ),
            },
            {
                tool: "get_history",
                args: { limit: 5 },
                getHttp: () => API_GET(new Request("http://localhost/api/research/history?limit=5"), ctx("history")),
            },
        ];

        if (experimentIds.length > 0) {
            const referenceExperiment = experimentIds.includes("EXP_1")
                ? "EXP_1"
                : experimentIds[0];
            comparisons.push({
                tool: "get_experiment",
                args: { id: referenceExperiment },
                getHttp: () =>
                    API_GET(
                        new Request(`http://localhost/api/research/experiments/${referenceExperiment}`),
                        ctx("experiments", referenceExperiment),
                    ),
            });
        }

        if (experimentIds.includes("EXP_1")) {
            comparisons.push(
                {
                    tool: "get_series",
                    args: { id: "EXP_1", k: "0", downsample: 25 },
                    getHttp: () =>
                        API_GET(
                            new Request("http://localhost/api/research/experiments/EXP_1/series?k=0&downsample=25"),
                            ctx("experiments", "EXP_1", "series"),
                        ),
                },
                {
                    tool: "compare_scales",
                    args: { experiment: "EXP_1", k: "-1,0,1" },
                    getHttp: () =>
                        API_GET(
                            new Request("http://localhost/api/research/compare/scales?experiment=EXP_1&k=-1,0,1"),
                            ctx("compare", "scales"),
                        ),
                },
            );
        }

        const history = readHistory();
        if (history.length > 1) {
            const runA = history[history.length - 1].timestamp;
            const runB = history[history.length - 2].timestamp;
            comparisons.push(
                {
                    tool: "compare_runs",
                    args: { runA, runB },
                    getHttp: () =>
                        API_GET(
                            new Request(`http://localhost/api/research/compare/runs?runA=${encodeURIComponent(runA)}&runB=${encodeURIComponent(runB)}`),
                            ctx("compare", "runs"),
                        ),
                },
                {
                    tool: "compare_verdicts",
                    args: { runA, runB },
                    getHttp: () =>
                        API_GET(
                            new Request(`http://localhost/api/research/compare/verdicts?runA=${encodeURIComponent(runA)}&runB=${encodeURIComponent(runB)}`),
                            ctx("compare", "verdicts"),
                        ),
                },
            );
        }

        for (const cmp of comparisons) {
            const mcp = await mcpCall(cmp.tool, cmp.args);
            const http = await (await cmp.getHttp()).json();
            expect(mcp).toHaveProperty("result");
            expect(mcp.result).toEqual(http);
        }
    });

    it("run tools enforce auth in production", async () => {
        const oldNodeEnv = process.env.NODE_ENV;
        const oldToken = process.env.RESEARCH_RUN_TOKEN;
        const oldReadOnly = process.env.RESEARCH_READ_ONLY;
        const oldEnableHosted = process.env.RESEARCH_ENABLE_HOSTED_RUNS;
        const oldVercel = process.env.VERCEL;
        const oldVercelEnv = process.env.VERCEL_ENV;
        setEnv("NODE_ENV", "production");
        process.env.RESEARCH_RUN_TOKEN = "secret-token";
        process.env.RESEARCH_READ_ONLY = "";
        process.env.RESEARCH_ENABLE_HOSTED_RUNS = "true";
        process.env.VERCEL = "";
        process.env.VERCEL_ENV = "";
        try {
            const unauth = await mcpCall("start_run", { mode: "verify" });
            expect(unauth).toHaveProperty("error");
            expect(unauth.error.code).toBe(-32001);

            const unauthStatus = await mcpCall("get_run_status", { run_id: "run_test" });
            expect(unauthStatus).toHaveProperty("error");
            expect(unauthStatus.error.code).toBe(-32001);

            const unauthLogs = await mcpCall("get_run_logs", { run_id: "run_test", from: 0 });
            expect(unauthLogs).toHaveProperty("error");
            expect(unauthLogs.error.code).toBe(-32001);

            const unauthEvents = await mcpCall("get_run_events", { run_id: "run_test", from: 0 });
            expect(unauthEvents).toHaveProperty("error");
            expect(unauthEvents.error.code).toBe(-32001);

            const unauthCancel = await mcpCall("cancel_run", { run_id: "run_test" });
            expect(unauthCancel).toHaveProperty("error");
            expect(unauthCancel.error.code).toBe(-32001);

            const unauthResume = await mcpCall("resume_run", { mode: "verify" });
            expect(unauthResume).toHaveProperty("error");
            expect(unauthResume.error.code).toBe(-32001);

            const auth = await mcpCall(
                "start_run",
                { mode: "verify" },
                { Authorization: "Bearer secret-token" },
            );
            expect(auth).toHaveProperty("result");
        } finally {
            setEnv("NODE_ENV", oldNodeEnv);
            setEnv("RESEARCH_RUN_TOKEN", oldToken);
            setEnv("RESEARCH_READ_ONLY", oldReadOnly);
            setEnv("RESEARCH_ENABLE_HOSTED_RUNS", oldEnableHosted);
            setEnv("VERCEL", oldVercel);
            setEnv("VERCEL_ENV", oldVercelEnv);
        }
    });

    it("run tools mirror HTTP envelopes", async () => {
        process.env.RESEARCH_READ_ONLY = "";
        process.env.RESEARCH_ENABLE_HOSTED_RUNS = "true";
        process.env.VERCEL = "";
        process.env.VERCEL_ENV = "";

        const mcpStart = await mcpCall("start_run", { mode: "verify" });
        const httpStart = await (
            await API_POST(
                new Request("http://localhost/api/research/run", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mode: "verify" }),
                }),
                ctx("run"),
            )
        ).json();
        expect(mcpStart.result).toEqual(httpStart);

        const customPayload = {
            run: "1,6",
            zero_source: "generated",
            zero_count: 100,
            dps: 30,
        };
        const mcpCustomStart = await mcpCall("start_custom_run", customPayload);
        const httpCustomStart = await (
            await API_POST(
                new Request("http://localhost/api/research/run", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ kind: "custom", custom: customPayload }),
                }),
                ctx("run"),
            )
        ).json();
        expect(mcpCustomStart.result).toEqual(httpCustomStart);

        const mcpStatus = await mcpCall("get_run_status", { run_id: "run_test" });
        const httpStatus = await (
            await API_GET(
                new Request("http://localhost/api/research/run?run_id=run_test"),
                ctx("run"),
            )
        ).json();
        expect(mcpStatus.result).toEqual(httpStatus);

        const mcpLogs = await mcpCall("get_run_logs", { run_id: "run_test", from: 0 });
        const httpLogs = await (
            await API_GET(
                new Request("http://localhost/api/research/run/logs?run_id=run_test&from=0"),
                ctx("run", "logs"),
            )
        ).json();
        expect(mcpLogs.result).toEqual(httpLogs);

        const mcpEvents = await mcpCall("get_run_events", { run_id: "run_test", from: 0 });
        const httpEvents = await (
            await API_GET(
                new Request("http://localhost/api/research/run/events?run_id=run_test&from=0"),
                ctx("run", "events"),
            )
        ).json();
        expect(mcpEvents.result).toEqual(httpEvents);

        const mcpCancel = await mcpCall("cancel_run", { run_id: "run_test" });
        const httpCancel = await (
            await API_POST(
                new Request("http://localhost/api/research/run/cancel", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ run_id: "run_test" }),
                }),
                ctx("run", "cancel"),
            )
        ).json();
        expect(mcpCancel.result).toEqual(httpCancel);

        const mcpResume = await mcpCall("resume_run", { mode: "verify" });
        const httpResume = await (
            await API_POST(
                new Request("http://localhost/api/research/run/resume", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mode: "verify" }),
                }),
                ctx("run", "resume"),
            )
        ).json();
        expect(mcpResume.result).toEqual(httpResume);
    });
});

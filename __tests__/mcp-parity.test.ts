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

const ctx = (...segments: string[]) => ({ params: { segments } });

describe("MCP parity with HTTP research API", () => {
    it("read tools mirror HTTP envelopes", async () => {
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
            {
                tool: "get_experiment",
                args: { id: "EXP_1" },
                getHttp: () =>
                    API_GET(new Request("http://localhost/api/research/experiments/EXP_1"), ctx("experiments", "EXP_1")),
            },
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
        ];

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
        process.env.NODE_ENV = "production";
        process.env.RESEARCH_RUN_TOKEN = "secret-token";
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

            const auth = await mcpCall(
                "start_run",
                { mode: "verify" },
                { Authorization: "Bearer secret-token" },
            );
            expect(auth).toHaveProperty("result");
        } finally {
            process.env.NODE_ENV = oldNodeEnv;
            process.env.RESEARCH_RUN_TOKEN = oldToken;
        }
    });

    it("run tools mirror HTTP envelopes", async () => {
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
    });
});

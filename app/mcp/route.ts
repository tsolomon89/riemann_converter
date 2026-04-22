import { NextResponse } from "next/server";
import {
    ApiError,
    compareRunsEnvelope,
    compareScalesEnvelope,
    compareVerdictsEnvelope,
    getExperimentEnvelope,
    getHistoryEnvelope,
    getImplementationHealthEnvelope,
    getManifestEnvelope,
    getObligationEnvelope,
    getObligationsEnvelope,
    getOpenGapsEnvelope,
    getRunLogsEnvelope,
    getRunStatusEnvelope,
    getSeriesEnvelope,
    getTheoremCandidateEnvelope,
    parseCanonicalMode,
    startRunEnvelope,
} from "../../lib/research-api";
import type { McpToolCallParams, McpToolDef, McpToolListResult } from "../../lib/research-types";
import { assertRunAuth } from "../../lib/run-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface JsonRpcRequest {
    jsonrpc?: string;
    id?: string | number | null;
    method?: string;
    params?: Record<string, unknown>;
}

const jsonRpcResult = (id: JsonRpcRequest["id"], result: unknown) =>
    NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });

const jsonRpcError = (id: JsonRpcRequest["id"], code: number, message: string, data?: unknown) =>
    NextResponse.json({
        jsonrpc: "2.0",
        id: id ?? null,
        error: { code, message, data },
    });

const TOOLS: McpToolDef[] = [
    {
        name: "get_manifest",
        description: "Get project manifest and canonical ontology summary.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_theorem_candidate",
        description: "Get theorem candidate statement and non-claims.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_obligations",
        description: "List proof obligations and statuses.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_obligation",
        description: "Get a single obligation by id.",
        inputSchema: {
            type: "object",
            required: ["id"],
            properties: { id: { type: "string" } },
        },
    },
    {
        name: "get_open_gaps",
        description: "List open gaps.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_implementation_health",
        description: "Get non-theoretic stage health statuses.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_history",
        description: "Get canonical history entries.",
        inputSchema: {
            type: "object",
            properties: { limit: { type: "integer" } },
        },
    },
    {
        name: "get_experiment",
        description: "Get canonical experiment verdict payload.",
        inputSchema: {
            type: "object",
            required: ["id"],
            properties: { id: { type: "string" } },
        },
    },
    {
        name: "get_series",
        description: "Get downsampled experiment series.",
        inputSchema: {
            type: "object",
            required: ["id"],
            properties: {
                id: { type: "string" },
                variant: { type: "string" },
                k: { type: "string" },
                fields: { type: "string" },
                downsample: { type: "integer" },
            },
        },
    },
    {
        name: "compare_scales",
        description: "Compare experiment numeric summaries across k values.",
        inputSchema: {
            type: "object",
            required: ["experiment", "k"],
            properties: {
                experiment: { type: "string" },
                k: { type: "string" },
                downsample: { type: "integer" },
            },
        },
    },
    {
        name: "compare_runs",
        description: "Compare canonical run-level deltas between two timestamps.",
        inputSchema: {
            type: "object",
            required: ["runA", "runB"],
            properties: {
                runA: { type: "string" },
                runB: { type: "string" },
            },
        },
    },
    {
        name: "compare_verdicts",
        description: "Compare verdict delta maps between two run timestamps.",
        inputSchema: {
            type: "object",
            required: ["runA", "runB"],
            properties: {
                runA: { type: "string" },
                runB: { type: "string" },
            },
        },
    },
    {
        name: "start_run",
        description: "Start a canonical run mode.",
        inputSchema: {
            type: "object",
            required: ["mode"],
            properties: {
                mode: {
                    type: "string",
                    enum: ["verify", "smoke", "standard", "authoritative", "overkill"],
                },
            },
        },
    },
    {
        name: "get_run_status",
        description: "Get run status by run_id (or current if omitted).",
        inputSchema: {
            type: "object",
            properties: { run_id: { type: "string" } },
        },
    },
    {
        name: "get_run_logs",
        description: "Get run logs incrementally from an offset.",
        inputSchema: {
            type: "object",
            required: ["run_id"],
            properties: {
                run_id: { type: "string" },
                from: { type: "integer" },
            },
        },
    },
];

const paramsToSearch = (params: Record<string, unknown>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        search.set(key, String(value));
    }
    return search;
};

const runToolRequiresAuth = (name: string) =>
    name === "start_run" || name === "get_run_status" || name === "get_run_logs";

const callTool = (name: string, args: Record<string, unknown>) => {
    switch (name) {
        case "get_manifest":
            return getManifestEnvelope();
        case "get_theorem_candidate":
            return getTheoremCandidateEnvelope();
        case "get_obligations":
            return getObligationsEnvelope();
        case "get_obligation":
            return getObligationEnvelope(String(args.id ?? ""));
        case "get_open_gaps":
            return getOpenGapsEnvelope();
        case "get_implementation_health":
            return getImplementationHealthEnvelope();
        case "get_history":
            return getHistoryEnvelope(args.limit ? String(args.limit) : null);
        case "get_experiment":
            return getExperimentEnvelope(String(args.id ?? ""));
        case "get_series":
            return getSeriesEnvelope(String(args.id ?? ""), paramsToSearch(args));
        case "compare_scales":
            return compareScalesEnvelope(paramsToSearch(args));
        case "compare_runs":
            return compareRunsEnvelope(paramsToSearch(args));
        case "compare_verdicts":
            return compareVerdictsEnvelope(paramsToSearch(args));
        case "start_run":
            return startRunEnvelope(parseCanonicalMode(args.mode));
        case "get_run_status":
            return getRunStatusEnvelope(args.run_id ? String(args.run_id) : null);
        case "get_run_logs":
            return getRunLogsEnvelope(
                args.run_id ? String(args.run_id) : null,
                args.from !== undefined ? String(args.from) : null,
            );
        default:
            throw new ApiError(404, `Unknown tool: ${name}`);
    }
};

export async function POST(request: Request) {
    const rpc = (await request.json().catch(() => ({}))) as JsonRpcRequest;
    const id = rpc.id ?? null;
    const method = rpc.method ?? "";

    if (method === "initialize") {
        return jsonRpcResult(id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "riemann-research-mcp", version: "0.1.0" },
        });
    }

    if (method === "tools/list") {
        const result: McpToolListResult = { tools: TOOLS };
        return jsonRpcResult(id, result);
    }

    if (method !== "tools/call") {
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }

    const params = (rpc.params ?? {}) as unknown as McpToolCallParams;
    const name = params.name;
    if (!name || typeof name !== "string") {
        return jsonRpcError(id, -32602, "Invalid params: tool name is required.");
    }

    if (runToolRequiresAuth(name)) {
        const auth = assertRunAuth(request);
        if (auth) {
            const body = (await auth.json().catch(() => ({ error: "Unauthorized." }))) as {
                error?: string;
            };
            return jsonRpcError(id, -32001, body.error ?? "Unauthorized.");
        }
    }

    try {
        const result = callTool(name, params.arguments ?? {});
        return jsonRpcResult(id, result);
    } catch (error) {
        if (error instanceof ApiError) {
            return jsonRpcError(id, -32000, error.message, { status: error.status });
        }
        return jsonRpcError(id, -32603, String(error));
    }
}

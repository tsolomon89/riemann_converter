import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isEntrypoint = (() => {
    if (!process.argv[1]) return false;
    try {
        return import.meta.url === pathToFileURL(process.argv[1]).href;
    } catch {
        return false;
    }
})();

const DEFAULT_TIMEOUT_MS = 30000;
const parsedTimeoutMs = Number.parseInt(process.env.MCP_BRIDGE_TIMEOUT_MS || `${DEFAULT_TIMEOUT_MS}`, 10);
const REQUEST_TIMEOUT_MS =
    Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0 ? parsedTimeoutMs : DEFAULT_TIMEOUT_MS;

const normalizeMcpUrl = (raw) => {
    if (!raw) return null;
    const value = raw.trim();
    if (!value) return null;
    if (value.endsWith("/mcp")) return value;
    if (value.endsWith("/")) return `${value}mcp`;
    return `${value}/mcp`;
};

const explicitEndpoint = normalizeMcpUrl(process.env.MCP_BRIDGE_URL || "");
const localPorts = Array.from(
    new Set([
        process.env.MCP_BRIDGE_LOCAL_PORT || "7000",
        "3000",
    ].filter(Boolean)),
);

const getCandidateEndpoints = () => {
    if (explicitEndpoint) return [explicitEndpoint];

    const endpoints = [];

    const vercelUrl = process.env.VERCEL_URL?.trim();
    if (vercelUrl) {
        const host = vercelUrl.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
        endpoints.push(`https://${host}/mcp`);
    }

    for (const port of localPorts) {
        endpoints.push(`http://127.0.0.1:${port}/mcp`);
        endpoints.push(`http://localhost:${port}/mcp`);
    }

    return Array.from(new Set(endpoints));
};

const rl = isEntrypoint
    ? readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          terminal: false,
      })
    : null;

const writeJsonRpc = (payload) => {
    console.log(JSON.stringify(payload));
};

const emitJsonRpcError = (req, message, data = undefined) => {
    writeJsonRpc({
        jsonrpc: "2.0",
        id: req?.id ?? null,
        error: {
            code: -32099,
            message,
            ...(data !== undefined ? { data } : {})
        }
    });
};

// Tool-result envelope (MCP `tools/call` shape). Returning text content here
// guarantees the client surfaces the message, unlike a JSON-RPC `error`
// response which some clients render as silent no-output.
const emitToolResult = (req, text, { isError = false } = {}) => {
    writeJsonRpc({
        jsonrpc: "2.0",
        id: req?.id ?? null,
        result: {
            content: [{ type: "text", text }],
            ...(isError ? { isError: true } : {}),
        },
    });
};

const fetchWithTimeout = async (url, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timer);
    }
};

// =============================================================================
// Local-filesystem fallback for read-only tools
// =============================================================================
//
// When the Next.js HTTP endpoint is unreachable (most commonly: dev server not
// running), read-only MCP tools can still be answered from the canonical
// artifacts on disk: `public/experiments.json` and `public/verdict_history.jsonl`.
// Run-control tools (start_run, etc.) genuinely need the live HTTP server and
// must be answered with a visible error explaining the requirement.

const REPO_ROOT = process.env.MCP_BRIDGE_REPO_ROOT || __dirname;
const EXPERIMENTS_PATH = path.join(REPO_ROOT, "public", "experiments.json");
const HISTORY_PATH = path.join(REPO_ROOT, "public", "verdict_history.jsonl");

const READ_ONLY_TOOLS = new Set([
    "get_manifest",
    "get_theorem_candidate",
    "get_obligations",
    "get_obligation",
    "get_open_gaps",
    "get_implementation_health",
    "get_history",
    "get_experiment",
]);

const RUN_CONTROL_TOOLS = new Set([
    "start_run",
    "start_custom_run",
    "resume_run",
    "cancel_run",
    "get_run_status",
    "get_run_logs",
    "get_run_events",
    "get_series",
    "compare_scales",
    "compare_runs",
    "compare_verdicts",
]);

const readExperimentsArtifact = () => {
    const raw = fs.readFileSync(EXPERIMENTS_PATH, "utf-8");
    return JSON.parse(raw);
};

const readHistoryArtifact = () => {
    if (!fs.existsSync(HISTORY_PATH)) return [];
    const raw = fs.readFileSync(HISTORY_PATH, "utf-8");
    const out = [];
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            out.push(JSON.parse(trimmed));
        } catch {
            // skip malformed lines
        }
    }
    return out;
};

const normalizeAliasKey = (value) =>
    String(value ?? "").trim().toUpperCase().replace(/_/g, "-").replace(/\s+/g, "-");

const experimentAliasMap = (data) => {
    const classification = data?.meta?.experiment_classification || {};
    const out = {};
    for (const [stableId, entry] of Object.entries(classification)) {
        out[stableId] = stableId;
        out[normalizeAliasKey(stableId)] = stableId;
        if (entry?.display_id) {
            out[entry.display_id] = stableId;
            out[normalizeAliasKey(entry.display_id)] = stableId;
        }
        for (const alias of entry?.cli_aliases || []) {
            out[alias] = stableId;
            out[normalizeAliasKey(alias)] = stableId;
        }
    }
    return out;
};

const resolveExperimentId = (data, id) => {
    const raw = String(id ?? "");
    const upper = raw.trim().toUpperCase();
    if (/^EXP_[0-9]+[A-Z]?$/.test(upper)) return upper;
    if (/^EXP[0-9]+[A-Z]?$/.test(upper)) return upper.replace(/^EXP/, "EXP_");
    return experimentAliasMap(data)[normalizeAliasKey(raw)] || upper;
};

const fallbackPayload = (toolName, args) => {
    const data = readExperimentsArtifact();
    const summary = data.summary || {};
    const proofProgram = summary.proof_program || {};
    const classification = data.meta?.experiment_classification || {};

    switch (toolName) {
        case "get_manifest":
            return {
                schema_version: summary.schema_version,
                fidelity_tier: summary.fidelity_tier,
                fidelity_zeros: summary.fidelity_zeros,
                fidelity_dps: summary.fidelity_dps,
                experiment_ids: Object.keys(summary.experiments || {}),
                experiments: Object.entries(classification).map(([stable_id, entry]) => ({ stable_id, ...entry })),
                experiment_aliases: experimentAliasMap(data),
                witness_map_review: proofProgram.witness_map_review,
            };
        case "get_theorem_candidate":
            return proofProgram.theorem_candidate || null;
        case "get_obligations":
            return proofProgram.obligations || [];
        case "get_obligation": {
            const id = String(args?.id ?? "");
            const obls = proofProgram.obligations || [];
            return obls.find((o) => o.id === id) || null;
        }
        case "get_open_gaps":
            return proofProgram.open_gaps || [];
        case "get_implementation_health":
            return summary.implementation_health || null;
        case "get_history": {
            const history = readHistoryArtifact();
            const limitRaw = Number.parseInt(String(args?.limit ?? ""), 10);
            const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : history.length;
            return history.slice(-limit);
        }
        case "get_experiment": {
            const id = resolveExperimentId(data, args?.id);
            return (summary.experiments || {})[id] || null;
        }
        default:
            return null;
    }
};

const tryFallback = (req) => {
    const params = req?.params || {};
    if (req?.method !== "tools/call") return false;
    const toolName = params?.name;
    if (!toolName) return false;

    if (READ_ONLY_TOOLS.has(toolName)) {
        try {
            const payload = fallbackPayload(toolName, params.arguments || {});
            const banner = "[mcp-bridge fallback: HTTP endpoint unreachable; "
                + "served from local public/* artifacts]";
            emitToolResult(req, `${banner}\n\n${JSON.stringify(payload, null, 2)}`);
            return true;
        } catch (err) {
            emitToolResult(
                req,
                "MCP HTTP endpoint is unreachable AND the local-filesystem fallback "
                + `failed: ${err instanceof Error ? err.message : String(err)}.\n\n`
                + `Looked for: ${EXPERIMENTS_PATH}\n`
                + "Either start the dev server with `npm run dev` or run "
                + "`python experiment_engine.py` to produce a fresh artifact.",
                { isError: true },
            );
            return true;
        }
    }

    if (RUN_CONTROL_TOOLS.has(toolName)) {
        emitToolResult(
            req,
            `Tool \`${toolName}\` requires the Next.js HTTP server. `
            + "The bridge could not reach any /mcp endpoint.\n\n"
            + "Remedy: start the app with `npm run dev` (port 7000) or set "
            + "`MCP_BRIDGE_URL` to a deployed /mcp endpoint.\n\n"
            + "Read-only tools (get_history, get_experiment, get_manifest, etc.) "
            + "still work via the local-filesystem fallback while the server is down.",
            { isError: true },
        );
        return true;
    }

    return false;
};

const handleLine = async (line) => {
    if (!line.trim()) return;
    let req;
    try {
        req = JSON.parse(line);
        const headers = { "Content-Type": "application/json" };
        if (process.env.RESEARCH_RUN_TOKEN) {
            headers["Authorization"] = `Bearer ${process.env.RESEARCH_RUN_TOKEN}`;
        }
        const endpoints = getCandidateEndpoints();
        const httpErrors = [];
        const networkErrors = [];

        for (const endpoint of endpoints) {
            try {
                const res = await fetchWithTimeout(endpoint, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(req)
                });

                if (!res.ok) {
                    const body = await res.text();
                    httpErrors.push({ endpoint, status: res.status, body });
                    if (explicitEndpoint) break;
                    continue;
                }

                const data = await res.text();
                if (data.trim()) {
                    console.log(data);
                }
                return;
            } catch (error) {
                networkErrors.push({
                    endpoint,
                    cause: error instanceof Error ? error.message : String(error)
                });
                if (explicitEndpoint) break;
            }
        }

        if (tryFallback(req)) {
            return;
        }

        if (httpErrors.length > 0) {
            const first = httpErrors[0];
            console.error(`HTTP Error: ${first.status} @ ${first.endpoint}`);
            emitJsonRpcError(req, `MCP endpoint returned HTTP ${first.status}.`, {
                attempted_endpoints: endpoints,
                http_errors: httpErrors,
                network_errors: networkErrors,
                hint: "If running locally, start the app with `npm run dev` (port 7000). Otherwise set MCP_BRIDGE_URL to your deployed /mcp endpoint."
            });
            return;
        }

        emitJsonRpcError(req, "Bridge fetch failed.", {
            attempted_endpoints: endpoints,
            network_errors: networkErrors,
            hint: "No MCP endpoint was reachable. Start the app with `npm run dev` (port 7000) or set MCP_BRIDGE_URL to your deployed /mcp endpoint."
        });
    } catch (e) {
        console.error("Bridge Error:", e);
        emitJsonRpcError(req, "Bridge fetch failed.", {
            cause: e instanceof Error ? e.message : String(e)
        });
    }
};

if (rl) {
    rl.on("line", handleLine);
}

// Exported for tests via dynamic import.
export const __test__ = {
    handleLine,
    tryFallback,
    fallbackPayload,
    readExperimentsArtifact,
    readHistoryArtifact,
    READ_ONLY_TOOLS,
    RUN_CONTROL_TOOLS,
};

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
const DATA_MANIFEST_PATH = path.join(REPO_ROOT, "data", "manifest.json");
const DATA_MIGRATION_REPORT_PATH = path.join(REPO_ROOT, "public", "data_migration_report.json");
const SAME_OBJECT_CERT_PATH = path.join(REPO_ROOT, "public", "same_object_certificate.json");

const READ_ONLY_TOOLS = new Set([
    "get_manifest",
    "get_theorem_candidate",
    "get_obligations",
    "get_obligation",
    "get_open_gaps",
    "get_implementation_health",
    "get_history",
    "get_experiment",
    "get_data_assets",
    "check_data_sufficiency",
    "get_precision_policy",
    "get_research_plan",
    "get_next_action",
    "explain_why_this_experiment_next",
    "explain_why_stop_experimenting",
    "get_data_migration_report",
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

const readJsonOrNull = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
        return null;
    }
};

const precisionPolicy = () => ({
    default_guard_dps: 20,
    authoritative_min_dps: 80,
    asset_required_dps_rule: "experiment_dps + guard_dps",
    tau_required_dps_rule: "experiment_dps + guard_dps",
    zero_required_dps_rule: "experiment_dps + guard_dps",
    display_float_policy: "allowed_for_ui_only",
    certificate_policy: "prefer_raw_high_precision_artifacts",
});

const dataManifest = () => readJsonOrNull(DATA_MANIFEST_PATH) || {
    schema_version: "2026.05.data-assets.v1",
    project: "riemann_converter",
    canonical_root: "data",
    agent_context_is_canonical: false,
    assets: [{
        asset_id: "trivial_zeta_zeros_formula",
        kind: "trivial_zeta_zeros",
        generator: "formula",
        formula: "s = -2n",
        valid: true,
        warnings: [],
        errors: [],
    }],
};

const dataMigrationReport = () => readJsonOrNull(DATA_MIGRATION_REPORT_PATH) || {
    status: "NOT_RUN",
    migrated_assets: [],
    deprecated_sources: [],
    warnings: [],
    errors: [],
    next_action: "run_data_migration",
};

const summarizeAssets = (assets) => {
    const byKind = {};
    for (const asset of assets || []) {
        const kind = asset?.kind || "unknown";
        byKind[kind] = (byKind[kind] || 0) + 1;
    }
    return { asset_count: Object.values(byKind).reduce((a, b) => a + b, 0), by_kind: byKind, agent_context_is_canonical: false };
};

const validAssets = (kind) => (dataManifest().assets || []).filter((asset) => asset?.kind === kind && asset?.valid === true);
const bestByCountDps = (assets) => [...assets].sort((a, b) =>
    ((Number(b.count) || 0) * 100000 + (Number(b.stored_dps) || 0))
    - ((Number(a.count) || 0) * 100000 + (Number(a.stored_dps) || 0))
)[0];
const bestPrime = (assets) => [...assets].sort((a, b) =>
    ((b.role === "canonical_static_asset" ? 1e12 : 0) + (Number(b.count) || 0) * 1000 + (Number(b.max_prime || b.max_value) || 0))
    - ((a.role === "canonical_static_asset" ? 1e12 : 0) + (Number(a.count) || 0) * 1000 + (Number(a.max_prime || a.max_value) || 0))
)[0];

const simpleDataSufficiency = (args = {}) => {
    const dps = Number(args.dps || args.requested_dps || 80);
    const zeros = Number(args.zeros || args.requested_zero_count || 100000);
    const guard = Number(args.guard_dps || 20);
    const requiredDps = dps + guard;
    const required = [
        { kind: "tau", stored_dps: requiredDps },
        { kind: "nontrivial_zeta_zeros", count: zeros, stored_dps: requiredDps },
        { kind: "trivial_zeta_zeros", formula: "s = -2n" },
        { kind: "primes", count: Number(args.prime_target_count || 0), max_prime: 1974 },
    ];
    const available = [];
    const missing = [];
    const insufficient = [];
    const generation = [];
    for (const req of required) {
        const best = req.kind === "primes" ? bestPrime(validAssets("primes")) : bestByCountDps(validAssets(req.kind));
        available.push({ required: req, available: best || null });
        if (!best) {
            missing.push({ kind: req.kind, required: req });
            if (req.kind === "tau") generation.push({ action: "generate_tau", command: `python -m proof_kernel.generate_tau --stored-dps ${req.stored_dps}` });
            if (req.kind === "nontrivial_zeta_zeros") generation.push({ action: "generate_nontrivial_zeros", command: `python -m proof_kernel.generate_zeros --count ${req.count} --stored-dps ${req.stored_dps}` });
            if (req.kind === "primes") generation.push({ action: "generate_primes_fallback", command: "python -m proof_kernel.generate_primes --required-count 0 --required-max-prime 1974" });
            continue;
        }
        if (req.stored_dps && Number(best.stored_dps || 0) < req.stored_dps) {
            insufficient.push({ kind: req.kind, reason: "INSUFFICIENT_PRECISION", status: "INSUFFICIENT_PRECISION", required: req, available: best });
        }
        if (req.count && Number(best.count || 0) < req.count) {
            insufficient.push({ kind: req.kind, reason: "INSUFFICIENT_COUNT", status: "NEEDS_EXTENSION", required: req, available: best });
        }
        if (req.kind === "primes" && Number(best.max_prime || best.max_value || 0) < Number(req.max_prime || 0)) {
            insufficient.push({ kind: req.kind, reason: "INSUFFICIENT_COVERAGE", status: "INSUFFICIENT_COVERAGE", required: req, available: best });
        }
    }
    const status = insufficient.some((item) => item.reason === "INSUFFICIENT_PRECISION")
        ? "INSUFFICIENT"
        : (missing.length || insufficient.length ? "NEEDS_GENERATION" : "READY");
    return {
        status,
        mode: args.mode || "same_object_certificate",
        required_assets: required,
        available_assets: available,
        missing_assets: missing,
        insufficient_assets: insufficient,
        generation_plan: generation,
        warnings: [],
        errors: [],
        next_action: generation[0]?.action || (status === "READY" ? "run_next_research_step" : null),
    };
};

const simpleResearchPlan = (args = {}) => {
    const ds = simpleDataSufficiency(args);
    const cert = readJsonOrNull(SAME_OBJECT_CERT_PATH);
    if (ds.status !== "READY") {
        return {
            current_node: "DATA_PREFLIGHT",
            completed_nodes: [],
            blocked_nodes: ["RUN_CORE_1", "RUN_EXP_8", "RUN_EXP_6", "BUILD_SAME_OBJECT_CERTIFICATE"],
            recommended_next_action: ds.next_action || "FIX_DATA",
            why: "Data preflight is not ready; fix data coverage or precision first.",
            commands: ds.generation_plan.map((step) => step.command),
            expected_artifacts: ["data/manifest.json", "public/data_migration_report.json"],
            stop_condition: "Data assets satisfy count, coverage, and requested_dps + guard_dps.",
            proof_work_recommended: false,
        };
    }
    if (cert?.status === "SAME_OBJECT_CANDIDATE" && cert?.fidelity?.tier === "AUTHORITATIVE") {
        return {
            current_node: "WRITE_NC3_NC4",
            completed_nodes: ["DATA_PREFLIGHT", "RUN_CORE_1", "RUN_EXP_8", "RUN_EXP_6", "BUILD_SAME_OBJECT_CERTIFICATE"],
            blocked_nodes: ["FORMAL_PROOF_CLOSURE"],
            recommended_next_action: "RECOMMEND_NC3_NC4_FORMALIZATION",
            why: "Same-Object Certificate passes at AUTHORITATIVE fidelity. Further empirical tests are lower priority than NC3/NC4 formalization.",
            commands: [],
            expected_artifacts: ["proof artifact for NC3/NC4"],
            stop_condition: "Stop running more empirical tests unless increasing fidelity or targeting a named blocker.",
            proof_work_recommended: true,
        };
    }
    return {
        current_node: "RUN_CORE_1",
        completed_nodes: ["DATA_PREFLIGHT"],
        blocked_nodes: ["RUN_EXP_8", "RUN_EXP_6", "BUILD_SAME_OBJECT_CERTIFICATE"],
        recommended_next_action: "RUN_CORE_1",
        why: "Data is ready and CORE-1 is the first critical path experiment.",
        commands: ["python experiment_engine.py --run exp1"],
        expected_artifacts: ["public/experiments.json"],
        stop_condition: "CORE-1 passes or exposes a converter formalization defect.",
        proof_work_recommended: false,
    };
};

const simpleNextAction = (args = {}) => {
    const ds = simpleDataSufficiency(args);
    const plan = simpleResearchPlan(args);
    if (ds.status !== "READY") {
        const step = ds.generation_plan[0] || {};
        return {
            next_action: String(step.action || ds.next_action || "FIX_DATA").toUpperCase(),
            command: step.command,
            why: "Data assets are not sufficient for the requested run.",
            blocks: plan.blocked_nodes,
            data_sufficiency: ds,
            research_plan: plan,
        };
    }
    if (plan.recommended_next_action === "RECOMMEND_NC3_NC4_FORMALIZATION") {
        return {
            next_action: "WRITE_FORMAL_LEMMA",
            target: "NC3/NC4",
            why: plan.why,
            blocks: ["FORMAL_PROOF_CLOSURE"],
            data_sufficiency: ds,
            research_plan: plan,
        };
    }
    return {
        next_action: plan.recommended_next_action,
        command: plan.commands[0],
        why: plan.why,
        blocks: plan.blocked_nodes,
        data_sufficiency: ds,
        research_plan: plan,
    };
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
        case "get_data_assets": {
            const manifest = dataManifest();
            return { summary: summarizeAssets(manifest.assets || []), manifest, warnings: [] };
        }
        case "check_data_sufficiency":
            return simpleDataSufficiency(args);
        case "get_precision_policy":
            return { policy: precisionPolicy() };
        case "get_research_plan":
            return simpleResearchPlan(args);
        case "get_next_action":
            return simpleNextAction(args);
        case "explain_why_this_experiment_next": {
            const action = simpleNextAction(args);
            return { structured: action, explanation: action.why, blocked_by: action.blocks, recommended_next_action: action.next_action };
        }
        case "explain_why_stop_experimenting": {
            const action = simpleNextAction(args);
            return {
                structured: action,
                explanation: action.next_action === "WRITE_FORMAL_LEMMA" ? action.research_plan.stop_condition : "Do not stop empirical testing yet; a blocker remains.",
                blocked_by: action.blocks,
                recommended_next_action: action.next_action,
            };
        }
        case "get_data_migration_report":
            return dataMigrationReport();
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

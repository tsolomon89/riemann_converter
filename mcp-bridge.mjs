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

const toToolText = (payload) => (
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)
);

const toResearchToolResponse = (payload) => ({
    ok: true,
    data: payload,
    warnings: [],
    errors: [],
});

const normalizeHttpMcpResponseText = (req, text) => {
    if (req?.method !== "tools/call" || !text.trim()) return text;
    try {
        const message = JSON.parse(text);
        if (!message?.result || message.error) return text;
        if (Array.isArray(message.result.content)) return text;
        message.result = {
            content: [
                {
                    type: "text",
                    text: toToolText(toResearchToolResponse(message.result)),
                },
            ],
        };
        return JSON.stringify(message);
    } catch {
        return text;
    }
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
// artifacts on disk, starting from `public/current.json` and then resolving the
// latest per-run artifact. `public/experiments.json` is used only for reset
// placeholders and display mirrors.
// Run-control tools (start_run, etc.) genuinely need the live HTTP server and
// must be answered with a visible error explaining the requirement.

const REPO_ROOT = process.env.MCP_BRIDGE_REPO_ROOT || __dirname;
const EXPERIMENTS_PATH = path.join(REPO_ROOT, "public", "experiments.json");
const CURRENT_PATH = path.join(REPO_ROOT, "public", "current.json");
const HISTORY_PATH = path.join(REPO_ROOT, "public", "verdict_history.jsonl");
const DATA_MANIFEST_PATH = path.join(REPO_ROOT, "data", "manifest.json");
const DATA_MIGRATION_REPORT_PATH = path.join(REPO_ROOT, "public", "data_migration_report.json");

const READ_ONLY_TOOLS = new Set([
    "get_manifest",
    "get_latest_run",
    "get_artifact_freshness",
    "get_current_reporting_state",
    "get_theorem_candidate",
    "get_obligations",
    "get_obligation",
    "get_open_gaps",
    "get_implementation_health",
    "get_history",
    "get_experiment",
    "get_data_assets",
    "check_data_sufficiency",
    "get_run_presets",
    "resolve_run_preset",
    "get_selected_data_source",
    "validate_zero_assets",
    "run_preflight",
    "get_precision_policy",
    "get_research_plan",
    "get_next_action",
    "explain_why_this_experiment_next",
    "explain_why_stop_experimenting",
    "get_data_migration_report",
    "get_same_object_certificate",
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

const resolveRepoPath = (candidate) => path.isAbsolute(candidate) ? candidate : path.join(REPO_ROOT, candidate);

const readExperimentsArtifact = () => {
    const current = currentState();
    const artifactPath =
        current.engine_status === "NO_CURRENT_RUN" || !current.latest_run_id
            ? EXPERIMENTS_PATH
            : resolveRepoPath(current.current_experiments_path || path.join("artifacts", "runs", current.latest_run_id, "experiments.json"));
    const raw = fs.readFileSync(artifactPath, "utf-8");
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

const resetCurrentState = () => ({
    engine_status: "NO_CURRENT_RUN",
    reason: "historical run artifacts cleared during active development",
    latest_run_id: null,
    current_experiments_path: null,
    current_certificate_path: null,
    certificate_status: "NOT_BUILT",
    data_assets_status: fs.existsSync(DATA_MANIFEST_PATH) ? "AVAILABLE" : "NEEDS_CHECK",
    historical_comparison_enabled: false,
    next_action: "run clean Program 1 critical suite",
});

const rawCurrentState = () => readJsonOrNull(CURRENT_PATH) || resetCurrentState();

const currentCertificateFallback = () => {
    const current = rawCurrentState();
    if (!current.latest_run_id || current.engine_status === "NO_CURRENT_RUN") return null;
    const certPath = path.join(REPO_ROOT, "artifacts", "runs", current.latest_run_id, "certificate.json");
    const cert = readJsonOrNull(certPath);
    if (!cert) return null;
    return { cert, certPath, status: cert.run_id === current.latest_run_id ? "CURRENT" : "STALE" };
};

const currentState = () => {
    const current = rawCurrentState();
    if (!current.latest_run_id || current.engine_status === "NO_CURRENT_RUN") return current;
    const currentCert = currentCertificateFallback();
    return {
        ...current,
        certificate_status: currentCert?.status || "MISSING_FOR_RUN",
        current_certificate_path: currentCert?.status === "CURRENT" ? currentCert.certPath : current.current_certificate_path || null,
    };
};

const sameObjectCertificateFallback = () => {
    const current = currentState();
    if (!current.latest_run_id || current.engine_status === "NO_CURRENT_RUN") {
        return { status: "NOT_BUILT", message: "Same-Object Certificate: not built for current run." };
    }
    const currentCert = currentCertificateFallback();
    if (!currentCert) {
        return { status: "MISSING_FOR_RUN", message: "Certificate not built for this run." };
    }
    if (currentCert.status === "STALE") {
        return { status: "STALE", message: "Stale certificate hidden. Build a fresh certificate." };
    }
    return currentCert.cert;
};

const latestRunFallback = () => {
    const current = currentState();
    if (!current.latest_run_id || current.engine_status === "NO_CURRENT_RUN") {
        return {
            latest_real_run_id: null,
            status: "NO_CURRENT_RUN",
            started_at: null,
            finished_at: null,
            experiments_path: null,
            certificate_path: null,
            certificate_status: "NOT_BUILT",
            analysis_path: null,
            is_public_experiments_current: false,
            historical_comparison_enabled: false,
            next_action: current.next_action || "run clean Program 1 critical suite",
        };
    }
    return {
        latest_real_run_id: current.latest_run_id,
        status: "SUCCEEDED",
        started_at: null,
        finished_at: null,
        experiments_path: current.current_experiments_path,
        certificate_path: currentCertificateFallback()?.status === "CURRENT" ? currentCertificateFallback()?.certPath || null : null,
        certificate_status: currentCertificateFallback()?.status || "MISSING_FOR_RUN",
        analysis_path: path.join(REPO_ROOT, "artifacts", "runs", current.latest_run_id, "analysis.json"),
        is_public_experiments_current: readJsonOrNull(EXPERIMENTS_PATH)?.run_id === current.latest_run_id,
        historical_comparison_enabled: Boolean(current.historical_comparison_enabled),
        next_action: current.next_action || "run clean Program 1 critical suite",
    };
};

const artifactFreshnessFallback = (args = {}) => {
    const current = currentState();
    const kind = String(args.artifact_kind || args.kind || "experiments");
    const runId = String(args.run_id || current.latest_run_id || "");
    if (!current.latest_run_id || current.engine_status === "NO_CURRENT_RUN") {
        return {
            artifact_kind: kind,
            run_id: runId || null,
            latest_run_id: current.latest_run_id || null,
            path: null,
            freshness: "RESET",
            reason: "No current run is registered; reset placeholders are expected.",
            source_artifact_hash: null,
            expected_source_artifact_hash: null,
        };
    }
    const fileName = {
        experiments: "experiments.json",
        certificate: "certificate.json",
        analysis: "analysis.json",
        data_sufficiency: "data_sufficiency.json",
        research_plan: "research_plan.json",
    }[kind] || "experiments.json";
    const artifactPath = path.join(REPO_ROOT, "artifacts", "runs", runId, fileName);
    const artifact = readJsonOrNull(artifactPath);
    if (!artifact) {
        return {
            artifact_kind: kind,
            run_id: runId || null,
            latest_run_id: current.latest_run_id,
            path: artifactPath,
            freshness: "MISSING_FOR_RUN",
            reason: `Artifact ${fileName} does not exist for ${current.latest_run_id}.`,
            source_artifact_hash: null,
            expected_source_artifact_hash: null,
        };
    }
    const freshness = artifact.run_id === current.latest_run_id ? "CURRENT" : "STALE";
    return {
        artifact_kind: kind,
        run_id: artifact.run_id || runId,
        latest_run_id: current.latest_run_id,
        path: artifactPath,
        freshness,
        reason: freshness === "CURRENT" ? "Artifact run_id matches the latest run." : "Artifact run_id does not match latest_run_id.",
        source_artifact_hash: artifact.source_artifact_hash || null,
        expected_source_artifact_hash: null,
    };
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

const simpleRunPreset = (preset = "standard") => {
    const id = String(preset || "standard").toLowerCase();
    const base = {
        preset: id,
        requested_dps: id === "smoke" ? 30 : id === "standard" ? 40 : 80,
        requested_zero_count: id === "smoke" ? 100 : id === "standard" ? 2000 : id === "overkill" ? 60000 : 100000,
        guard_dps: id === "smoke" ? 0 : 20,
        zero_policy: {
            selection: "highest_available",
            allow_lower_precision_fallback: id === "smoke" || id === "standard",
            require_odlyzko_crosscheck: id === "authoritative" || id === "overkill" || id === "overkill_full",
        },
        tau_policy: { selection: "highest_available", require_dps_plus_guard: true },
        prime_policy: { selection: "canonical_7m", require_sufficient_max_prime: true },
        certificate_policy: { require_raw_high_precision_artifacts: id === "authoritative" || id === "overkill" || id === "overkill_full" },
    };
    return base;
};

const isGeneratedZeroAsset = (asset) => {
    const text = ["asset_id", "source_path", "source_original_path", "generator"]
        .map((key) => String(asset?.[key] || ""))
        .join(" ")
        .toLowerCase();
    return text.includes("generated") || ["python-flint", "mpmath", "siegelz", "zetazero"].some((token) => text.includes(token));
};

const zeroValidationArtifacts = () => {
    const dir = path.join(REPO_ROOT, "data", "zeros", "nontrivial");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter((name) => name.endsWith(".validation.json"))
        .map((name) => readJsonOrNull(path.join(dir, name)))
        .filter(Boolean);
};

const validationForAsset = (asset) => zeroValidationArtifacts().find((validation) =>
    validation?.asset_id === asset?.asset_id ||
    validation?.asset_path === asset?.source_path ||
    validation?.generated_asset_path === asset?.source_path
) || null;

const simpleSelectedDataSource = (args = {}) => {
    const preset = simpleRunPreset(args.preset || args.mode || "standard");
    const requiredDps = preset.requested_dps + preset.guard_dps;
    const zeros = validAssets("nontrivial_zeta_zeros");
    const strongGenerated = zeros
        .filter((asset) =>
            isGeneratedZeroAsset(asset) &&
            Number(asset.count || 0) >= preset.requested_zero_count &&
            Number(asset.stored_dps || 0) >= requiredDps)
        .sort((a, b) => (Number(b.stored_dps || 0) - Number(a.stored_dps || 0)) || (Number(b.count || 0) - Number(a.count || 0)))[0];
    const strongValidation = validationForAsset(strongGenerated);
    const fallback = bestByCountDps(zeros);
    const validationReady = !preset.zero_policy.require_odlyzko_crosscheck ||
        (strongValidation?.status === "PASS" && Number(strongValidation.validated_count || 0) >= preset.requested_zero_count);
    const zero = (strongGenerated && validationReady) ? strongGenerated : fallback || null;
    const status = (strongGenerated && validationReady) || preset.zero_policy.allow_lower_precision_fallback ? "READY" : "BLOCKED";
    return {
        preset: preset.preset,
        requested_zero_count: preset.requested_zero_count,
        requested_dps: preset.requested_dps,
        guard_dps: preset.guard_dps,
        required_stored_dps: requiredDps,
        selected_zero_source: zero?.source_path || null,
        zero_validation_status: strongValidation?.status || "NOT_AVAILABLE",
        reference_source: strongValidation?.reference_asset_path || null,
        status,
        blocking_reasons: status === "READY" ? [] : ["ODLYZKO_CROSSCHECK_NOT_PASS"],
        reason: status === "READY" ? "highest valid asset satisfying preset policy" : "no acceptable zero source satisfies count + dps + guard + Odlyzko validation",
        selected_assets: {
            zero: {
                asset: zero,
                reason: strongGenerated ? "highest valid generated high-dps asset satisfying count + dps + guard" : "fallback or unavailable",
                validation: strongValidation,
            },
            tau: { asset: bestByCountDps(validAssets("tau")), reason: "highest valid tau asset satisfying dps + guard" },
            prime: { asset: bestPrime(validAssets("primes")), reason: "canonical 7M prime asset" },
        },
    };
};

const simpleDataSufficiency = (args = {}) => {
    const preset = simpleRunPreset(args.preset || args.mode || "standard");
    const dps = Number(args.dps || args.requested_dps || preset.requested_dps);
    const zeros = Number(args.zeros || args.requested_zero_count || preset.requested_zero_count);
    const guard = Number(args.guard_dps || preset.guard_dps);
    const defaultPrimeTarget = preset.preset === "overkill" || preset.preset === "overkill_full"
        ? 7000000
        : preset.preset === "authoritative"
            ? 1000000
            : 0;
    const requiredDps = dps + guard;
    const required = [
        { kind: "tau", stored_dps: requiredDps },
        { kind: "nontrivial_zeta_zeros", count: zeros, stored_dps: requiredDps },
        { kind: "trivial_zeta_zeros", formula: "s = -2n" },
        { kind: "primes", count: Number(args.prime_target_count || defaultPrimeTarget), max_prime: 1974 },
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
        preset: preset.preset,
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
    const currentCert = currentCertificateFallback();
    const cert = currentCert?.status === "CURRENT" ? currentCert.cert : null;
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
    if (cert?.status === "SAME_OBJECT_PROXY_CANDIDATE" && cert?.fidelity?.tier === "AUTHORITATIVE") {
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
        expected_artifacts: ["artifacts/runs/<run_id>/experiments.json"],
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
    if (ds.preset === "overkill") {
        return {
            next_action: "RERUN_OVERKILL_60K_WITH_VALIDATED_HIGH_DPS_ZEROS",
            command: "python experiment_engine.py --preset overkill --zero-count 60000 --dps 80",
            why: "Overkill 60K preflight is ready; run the validated high-dps zero source before proof work.",
            blocks: ["RUN_OVERKILL_60K"],
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

const resetReportingObligation = (obl) => {
    const current = currentState();
    if (current.engine_status !== "NO_CURRENT_RUN") {
        return { ...obl, current_status: obl.status, reporting_status: obl.status };
    }
    return {
        ...obl,
        current_status: "NOT_WITNESSED",
        reporting_status: "NOT_WITNESSED",
        reporting_reason: "No current run is registered; proof obligations are awaiting fresh witnesses.",
    };
};

const fallbackPayload = (toolName, args) => {
    switch (toolName) {
        case "get_latest_run":
            return latestRunFallback();
        case "get_artifact_freshness":
            return artifactFreshnessFallback(args);
        case "get_current_reporting_state":
            return currentState();
        case "get_same_object_certificate":
            return sameObjectCertificateFallback();
    }

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
            return {
                obligations: (proofProgram.obligations || []).map(resetReportingObligation),
                current_run_status: currentState().engine_status,
                note:
                    currentState().engine_status === "NO_CURRENT_RUN"
                        ? "No current run. Proof obligations are awaiting fresh witnesses; template dependency blockers are not current-run failures."
                        : undefined,
            };
        case "get_obligation": {
            const id = String(args?.id ?? "");
            const obls = proofProgram.obligations || [];
            const obl = obls.find((o) => o.id === id);
            return obl ? resetReportingObligation(obl) : null;
        }
        case "get_open_gaps":
            return proofProgram.open_gaps || [];
        case "get_implementation_health":
            return summary.implementation_health || null;
        case "get_history": {
            const history = readHistoryArtifact();
            const limitRaw = Number.parseInt(String(args?.limit ?? ""), 10);
            const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : history.length;
            return {
                total: history.length,
                entries: history.slice(-limit).reverse(),
                historical_comparison_enabled: Boolean(currentState().historical_comparison_enabled),
                comparison_note: currentState().historical_comparison_enabled
                    ? undefined
                    : "Historical comparison is disabled during active development. Current reports reflect only the latest clean run.",
            };
        }
        case "get_data_assets": {
            const manifest = dataManifest();
            return { summary: summarizeAssets(manifest.assets || []), manifest, warnings: [] };
        }
        case "check_data_sufficiency":
            return simpleDataSufficiency(args);
        case "get_run_presets":
            return { presets: ["smoke", "standard", "authoritative", "overkill", "overkill_full"].map(simpleRunPreset) };
        case "resolve_run_preset":
            return { contract: simpleRunPreset(args?.preset || args?.mode || "standard") };
        case "get_selected_data_source":
            return simpleSelectedDataSource(args);
        case "validate_zero_assets":
            return { validations: [], existing_validation_artifacts: [], note: "zero validation requires the HTTP MCP server for full cross-check execution" };
        case "run_preflight": {
            const selected = simpleSelectedDataSource(args);
            return {
                ...selected,
                run_status: selected.status,
                contract: simpleRunPreset(args?.preset || args?.mode || "standard"),
                data_sufficiency: simpleDataSufficiency(args),
                warnings: [],
                errors: [],
                next_action: selected.status === "READY" && selected.preset === "overkill"
                    ? "RERUN_OVERKILL_60K_WITH_VALIDATED_HIGH_DPS_ZEROS"
                    : selected.status === "READY"
                        ? "run_next_research_step"
                        : "fix_data_preflight",
            };
        }
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
                + "served from local current-run artifacts]";
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
                    console.log(normalizeHttpMcpResponseText(req, data));
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
    normalizeHttpMcpResponseText,
    readExperimentsArtifact,
    readHistoryArtifact,
    READ_ONLY_TOOLS,
    RUN_CONTROL_TOOLS,
};

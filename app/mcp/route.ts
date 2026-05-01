import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
    ApiError,
    cancelRunEnvelope,
    compareRunsEnvelope,
    compareScalesEnvelope,
    compareVerdictsEnvelope,
    explainWhyStopExperimentingEnvelope,
    explainWhyThisExperimentNextEnvelope,
    getDataAssetsEnvelope,
    getDataMigrationReportEnvelope,
    getDataSufficiencyEnvelope,
    getArtifactFreshnessPayload,
    getCurrentReportingStatePayload,
    getExperimentEnvelope,
    getHistoryEnvelope,
    getImplementationHealthEnvelope,
    getLatestRunPayloadPlain,
    getManifestEnvelope,
    getNextActionEnvelope,
    getObligationEnvelope,
    getObligationsEnvelope,
    getOpenGapsEnvelope,
    getPrecisionPolicyEnvelope,
    getPreflightEnvelope,
    getResearchPlanEnvelope,
    getRunPresetsEnvelope,
    getRunEventsEnvelope,
    getRunLogsEnvelope,
    getRunStatusEnvelope,
    getSeriesEnvelope,
    getSelectedDataSourceEnvelope,
    getTheoremCandidateEnvelope,
    getZeroValidationEnvelope,
    parseCanonicalMode,
    resumeRunEnvelope,
    resolveRunPresetEnvelope,
    startCustomRunEnvelope,
    startRunEnvelope,
} from "../../lib/research-api";
import {
    acceptHypothesisProposalEnvelope,
    getBaselineHypothesisEnvelope,
    getCandidateLemmaEnvelope,
    getExperimentRawDataEnvelope,
    getExperimentReviewEnvelope,
    getHypothesisProposalEnvelope,
    getModelComparisonEnvelope,
    getProofDiscoveryEnvelope,
    listBaselineHypothesesEnvelope,
    listCandidateLemmasEnvelope,
    listExperimentReviewsEnvelope,
    listHypothesisProposalsEnvelope,
    proposeBaselineUpdateEnvelope,
    rejectHypothesisProposalEnvelope,
} from "../../lib/proof-discovery-api";
import type { McpToolCallParams, McpToolDef, McpToolListResult } from "../../lib/research-types";
import {
    getDeploymentCapabilities,
    READ_ONLY_DEPLOYMENT_CODE,
    READ_ONLY_DEPLOYMENT_MESSAGE,
} from "../../lib/deployment-policy";
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

const toStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item));
};

const collectWarnings = (payload: unknown): string[] => {
    if (!payload || typeof payload !== "object") return [];
    const record = payload as Record<string, unknown>;
    const direct = toStringArray(record.warnings);
    const data = record.data;
    if (!data || typeof data !== "object") return direct;
    return Array.from(new Set([...direct, ...toStringArray((data as Record<string, unknown>).warnings)]));
};

/**
 * Build the JSON-RPC response body for a tool call.
 *
 * If the payload already has the proof-discovery envelope shape
 * ({ok, data, warnings, errors, ...}) — e.g. anything from
 * lib/proof-discovery-api.ts — pass it through unchanged. Otherwise wrap the
 * raw payload in the legacy {ok, data, warnings, errors} shape used by the
 * older research tools.
 *
 * This prevents `result.data.data` double-nesting on the MCP wire.
 */
const toResearchToolResponse = (payload: unknown) => {
    if (
        payload !== null &&
        typeof payload === "object" &&
        "ok" in (payload as object) &&
        "data" in (payload as object) &&
        "warnings" in (payload as object) &&
        "errors" in (payload as object)
    ) {
        return payload;
    }
    return {
        ok: true,
        data: payload,
        warnings: collectWarnings(payload),
        errors: [] as string[],
    };
};

const toMcpToolResult = (payload: unknown) => ({
    content: [
        {
            type: "text",
            text: JSON.stringify(toResearchToolResponse(payload), null, 2),
        },
    ],
});

const toMcpToolError = (message: string) => ({
    content: [
        {
            type: "text",
            text: JSON.stringify(
                {
                    ok: false,
                    data: null,
                    warnings: [] as string[],
                    errors: [message],
                },
                null,
                2,
            ),
        },
    ],
    isError: true,
});

const TOOLS: McpToolDef[] = [
    {
        name: "get_manifest",
        description: "Get project manifest and canonical ontology summary.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_latest_run",
        description: "Get the latest current-run identity, artifact paths, and certificate freshness.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_artifact_freshness",
        description: "Classify an artifact as CURRENT, STALE, MISSING_FOR_RUN, or RESET.",
        inputSchema: {
            type: "object",
            properties: {
                artifact_kind: {
                    type: "string",
                    enum: ["experiments", "certificate", "analysis", "data_sufficiency", "research_plan"],
                },
                run_id: { type: "string" },
            },
        },
    },
    {
        name: "get_current_reporting_state",
        description: "Get the current-run-only reporting state used by the app.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_theorem_candidate",
        description: "Get theorem candidate statement and non-claims.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_data_assets",
        description: "Get canonical mathematical data assets and registry summary.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "check_data_sufficiency",
        description: "Check data sufficiency for a requested research run.",
        inputSchema: {
            type: "object",
            properties: {
                mode: { type: "string" },
                experiments: { type: "string" },
                dps: { type: "integer" },
                zeros: { type: "integer" },
                guard_dps: { type: "integer" },
            },
        },
    },
    {
        name: "get_run_presets",
        description: "List run preset contracts.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "resolve_run_preset",
        description: "Resolve a run preset into its stable contract.",
        inputSchema: {
            type: "object",
            properties: {
                preset: { type: "string", enum: ["smoke", "standard", "authoritative", "overkill", "overkill_full"] },
            },
        },
    },
    {
        name: "get_selected_data_source",
        description: "Select data sources for a preset using preflight policy.",
        inputSchema: {
            type: "object",
            properties: {
                preset: { type: "string", enum: ["smoke", "standard", "authoritative", "overkill", "overkill_full"] },
            },
        },
    },
    {
        name: "validate_zero_assets",
        description: "Validate generated zero assets against available Odlyzko/reference data.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "run_preflight",
        description: "Resolve preset, select data assets, validate policy, and report READY/BLOCKED before a run.",
        inputSchema: {
            type: "object",
            properties: {
                preset: { type: "string", enum: ["smoke", "standard", "authoritative", "overkill", "overkill_full"] },
            },
        },
    },
    {
        name: "get_precision_policy",
        description: "Get precision policy for data assets and certificates.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_research_plan",
        description: "Get the current research pathfinding DAG state and recommended next node.",
        inputSchema: {
            type: "object",
            properties: {
                mode: { type: "string" },
                experiments: { type: "string" },
                dps: { type: "integer" },
                zeros: { type: "integer" },
                guard_dps: { type: "integer" },
            },
        },
    },
    {
        name: "get_next_action",
        description: "Get the combined next action from data sufficiency, experiment results, and certificate state.",
        inputSchema: {
            type: "object",
            properties: {
                mode: { type: "string" },
                experiments: { type: "string" },
                dps: { type: "integer" },
                zeros: { type: "integer" },
                guard_dps: { type: "integer" },
            },
        },
    },
    {
        name: "explain_why_this_experiment_next",
        description: "Explain why the current next experiment or action is recommended.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "explain_why_stop_experimenting",
        description: "Explain whether and why empirical testing should stop in favor of proof work.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_data_migration_report",
        description: "Get the legacy data migration report.",
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
        description: "Get canonical experiment verdict payload. id accepts stable ids like EXP_1 or display aliases like CORE-1.",
        inputSchema: {
            type: "object",
            required: ["id"],
            properties: { id: { type: "string" } },
        },
    },
    {
        name: "get_series",
        description: "Get downsampled experiment series. id accepts stable ids like EXP_1 or display aliases like CORE-1.",
        inputSchema: {
            type: "object",
            required: ["id"],
            properties: {
                id: { type: "string" },
                variant: { type: "string" },
                k: { type: "string" },
                base: { type: "string" },
                fields: { type: "string" },
                downsample: { type: "integer" },
            },
        },
    },
    {
        name: "compare_scales",
        description: "Compare experiment numeric summaries across k values. experiment accepts stable ids or display aliases.",
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
                    enum: ["verify", "smoke", "standard", "authoritative", "overkill", "overkill_full"],
                },
            },
        },
    },
    {
        name: "start_custom_run",
        description: "Start a custom experiment run using the same payload shape as POST /api/research/run with kind=custom.",
        inputSchema: {
            type: "object",
            required: ["run"],
            properties: {
                run: { type: "string" },
                zero_source: { type: "string" },
                zero_count: { type: "integer" },
                dps: { type: "integer" },
                resolution: { type: "integer" },
                x_start: { type: "number" },
                x_end: { type: "number" },
                beta_offset: { type: "number" },
                k_power: { type: "integer" },
                workers: { type: "integer" },
                prime_min_count: { type: "integer" },
                prime_target_count: { type: "integer" },
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
    {
        name: "get_run_events",
        description: "Get structured run events incrementally from an offset.",
        inputSchema: {
            type: "object",
            required: ["run_id"],
            properties: {
                run_id: { type: "string" },
                from: { type: "integer" },
            },
        },
    },
    {
        name: "cancel_run",
        description: "Request cancellation of the current/target run.",
        inputSchema: {
            type: "object",
            properties: {
                run_id: { type: "string" },
            },
        },
    },
    {
        name: "resume_run",
        description: "Resume a canonical run mode from checkpoint.",
        inputSchema: {
            type: "object",
            required: ["mode"],
            properties: {
                mode: {
                    type: "string",
                    enum: ["verify", "smoke", "standard", "authoritative", "overkill", "overkill_full"],
                },
            },
        },
    },
    {
        name: "get_same_object_certificate",
        description: "Get the current per-run Same-Object Certificate, if it has been built for the latest clean run.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_base_claim",
        description: "Get the base compression claim document from the proof kernel.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_necessary_conditions",
        description: "Get the necessary conditions derived from the base compression claim.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_experiment_relevance",
        description: "Get the from-scratch experiment relevance audit against the base claim.",
        inputSchema: { type: "object", properties: {} },
    },
    // -------- proof-discovery layer --------
    {
        name: "list_experiment_reviews",
        description: "List experiment reviews for a run (uses current run if run_id is omitted).",
        inputSchema: {
            type: "object",
            properties: { run_id: { type: "string" } },
        },
    },
    {
        name: "get_experiment_review",
        description:
            "Get the per-experiment review (baseline hypothesis, model comparison, candidate lemmas, intended-vs-actual inference). id accepts EXP_2B, P2-2, p2-2, rogue-isolation.",
        inputSchema: {
            type: "object",
            required: ["id"],
            properties: { id: { type: "string" }, run_id: { type: "string" } },
        },
    },
    {
        name: "get_experiment_raw_data",
        description:
            "Get the raw observations and verifier signal for an experiment in a given run, alongside its declared baseline. Lets agents inspect data without verdict labels.",
        inputSchema: {
            type: "object",
            required: ["id"],
            properties: { id: { type: "string" }, run_id: { type: "string" } },
        },
    },
    {
        name: "get_experiment_model_comparison",
        description: "Get the model-comparison artifact for an experiment in a given run.",
        inputSchema: {
            type: "object",
            required: ["id"],
            properties: { id: { type: "string" }, run_id: { type: "string" } },
        },
    },
    {
        name: "list_candidate_lemmas",
        description: "List candidate-lemma payloads for every reviewed experiment in a run.",
        inputSchema: {
            type: "object",
            properties: { run_id: { type: "string" } },
        },
    },
    {
        name: "get_candidate_lemma",
        description:
            "Get the candidate-lemma / research-note payload for a single experiment, including markdown rendering and disallowed conclusions.",
        inputSchema: {
            type: "object",
            required: ["id"],
            properties: { id: { type: "string" }, run_id: { type: "string" } },
        },
    },
    {
        name: "list_baseline_hypotheses",
        description: "List the canonical baseline-hypothesis registry (overlay-aware).",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_baseline_hypothesis",
        description: "Get the canonical baseline hypothesis for an experiment.",
        inputSchema: {
            type: "object",
            required: ["id"],
            properties: { id: { type: "string" } },
        },
    },
    {
        name: "get_proof_discovery_index",
        description:
            "Get the proof-discovery index for a run: candidate lemmas, formalization targets, alternative hypotheses, and recommended next experiments.",
        inputSchema: {
            type: "object",
            properties: { run_id: { type: "string" } },
        },
    },
    {
        name: "propose_baseline_update",
        description:
            "Propose a revision to a baseline hypothesis. Status starts at PROPOSED and never mutates the canonical registry until accepted.",
        inputSchema: {
            type: "object",
            required: ["source_agent", "experiment_id", "proposed_baseline", "reason"],
            properties: {
                source_agent: { type: "string" },
                experiment_id: { type: "string" },
                proposed_baseline: { type: "object" },
                reason: { type: "string" },
                evidence: { type: "array" },
                recommended_next_experiment: { type: "string" },
                run_id: { type: "string" },
            },
        },
    },
    {
        name: "list_hypothesis_proposals",
        description: "List hypothesis proposals for a run, optionally filtered by status.",
        inputSchema: {
            type: "object",
            properties: {
                run_id: { type: "string" },
                status: { type: "string", enum: ["PROPOSED", "ACCEPTED", "REJECTED"] },
            },
        },
    },
    {
        name: "get_hypothesis_proposal",
        description: "Get a single hypothesis proposal and its audit record (if any).",
        inputSchema: {
            type: "object",
            required: ["proposal_id"],
            properties: {
                proposal_id: { type: "string" },
                run_id: { type: "string" },
            },
        },
    },
    {
        name: "accept_hypothesis_proposal",
        description:
            "Accept a hypothesis proposal. Writes an audit trail (old/new baseline hash, accepted_by, timestamp) and applies the overlay.",
        inputSchema: {
            type: "object",
            required: ["proposal_id", "accepted_by"],
            properties: {
                proposal_id: { type: "string" },
                accepted_by: { type: "string" },
                note: { type: "string" },
                run_id: { type: "string" },
            },
        },
    },
    {
        name: "reject_hypothesis_proposal",
        description:
            "Reject a hypothesis proposal. If the proposal was previously accepted, removes its overlay.",
        inputSchema: {
            type: "object",
            required: ["proposal_id", "rejected_by"],
            properties: {
                proposal_id: { type: "string" },
                rejected_by: { type: "string" },
                reason: { type: "string" },
                run_id: { type: "string" },
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
    name === "start_run" ||
    name === "start_custom_run" ||
    name === "get_run_status" ||
    name === "get_run_logs" ||
    name === "get_run_events" ||
    name === "cancel_run" ||
    name === "resume_run";

// Proposal mutation tools share the same gate as run-control: they mutate
// canonical state and are blocked in read-only deployments + require auth.
const proposalMutationToolRequiresAuth = (name: string) =>
    name === "propose_baseline_update" ||
    name === "accept_hypothesis_proposal" ||
    name === "reject_hypothesis_proposal";

const mutationToolRequiresAuth = (name: string) =>
    runToolRequiresAuth(name) || proposalMutationToolRequiresAuth(name);

const mutationToolBlockedByReadOnly = (name: string) =>
    mutationToolRequiresAuth(name) && !getDeploymentCapabilities().run_controls_enabled;

const callTool = (name: string, args: Record<string, unknown>) => {
    switch (name) {
        case "get_manifest":
            return getManifestEnvelope();
        case "get_latest_run":
            return getLatestRunPayloadPlain();
        case "get_artifact_freshness":
            return getArtifactFreshnessPayload(
                args.artifact_kind ? String(args.artifact_kind) : "experiments",
                args.run_id ? String(args.run_id) : null,
            );
        case "get_current_reporting_state":
            return getCurrentReportingStatePayload();
        case "get_theorem_candidate":
            return getTheoremCandidateEnvelope();
        case "get_data_assets":
            return getDataAssetsEnvelope();
        case "check_data_sufficiency":
            return getDataSufficiencyEnvelope(paramsToSearch(args));
        case "get_run_presets":
            return getRunPresetsEnvelope();
        case "resolve_run_preset":
            return resolveRunPresetEnvelope(paramsToSearch(args));
        case "get_selected_data_source":
            return getSelectedDataSourceEnvelope(paramsToSearch(args));
        case "validate_zero_assets":
            return getZeroValidationEnvelope();
        case "run_preflight":
            return getPreflightEnvelope(paramsToSearch(args));
        case "get_precision_policy":
            return getPrecisionPolicyEnvelope();
        case "get_research_plan":
            return getResearchPlanEnvelope(paramsToSearch(args));
        case "get_next_action":
            return getNextActionEnvelope(paramsToSearch(args));
        case "explain_why_this_experiment_next":
            return explainWhyThisExperimentNextEnvelope(paramsToSearch(args));
        case "explain_why_stop_experimenting":
            return explainWhyStopExperimentingEnvelope(paramsToSearch(args));
        case "get_data_migration_report":
            return getDataMigrationReportEnvelope();
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
        case "start_custom_run":
            return startCustomRunEnvelope(args);
        case "get_run_status":
            return getRunStatusEnvelope(args.run_id ? String(args.run_id) : null);
        case "get_run_logs":
            return getRunLogsEnvelope(
                args.run_id ? String(args.run_id) : null,
                args.from !== undefined ? String(args.from) : null,
            );
        case "get_run_events":
            return getRunEventsEnvelope(
                args.run_id ? String(args.run_id) : null,
                args.from !== undefined ? String(args.from) : null,
            );
        case "cancel_run":
            return cancelRunEnvelope(args.run_id ? String(args.run_id) : null);
        case "resume_run":
            return resumeRunEnvelope(parseCanonicalMode(args.mode));
        case "get_same_object_certificate": {
            const latest = getLatestRunPayloadPlain();
            if (!latest.latest_real_run_id) {
                return { status: "NOT_BUILT", message: "Same-Object Certificate: not built for current run." };
            }
            if (latest.certificate_status === "STALE") {
                return { status: "STALE", message: "Stale certificate hidden. Build a fresh certificate." };
            }
            if (latest.certificate_status !== "CURRENT" || !latest.certificate_path) {
                return { status: "MISSING_FOR_RUN", message: "Certificate not built for this run." };
            }
            const certPath = latest.certificate_path;
            try {
                return JSON.parse(fs.readFileSync(certPath, "utf-8"));
            } catch {
                return { status: "MISSING_FOR_RUN", message: "Certificate not built for this run." };
            }
        }
        case "get_base_claim": {
            const claimPath = path.join(process.cwd(), "proof_kernel", "base_claim.md");
            try {
                return { content: fs.readFileSync(claimPath, "utf-8") };
            } catch {
                return { error: "base_claim.md not found" };
            }
        }
        case "get_necessary_conditions": {
            const ncPath = path.join(process.cwd(), "proof_kernel", "necessary_conditions.md");
            try {
                return { content: fs.readFileSync(ncPath, "utf-8") };
            } catch {
                return { error: "necessary_conditions.md not found" };
            }
        }
        case "get_experiment_relevance": {
            const relPath = path.join(process.cwd(), "proof_kernel", "experiment_relevance.md");
            try {
                return { content: fs.readFileSync(relPath, "utf-8") };
            } catch {
                return { error: "experiment_relevance.md not found" };
            }
        }
        // -------- proof-discovery layer --------
        case "list_experiment_reviews":
            return listExperimentReviewsEnvelope(args.run_id ? String(args.run_id) : null);
        case "get_experiment_review":
            return getExperimentReviewEnvelope(
                String(args.id ?? ""),
                args.run_id ? String(args.run_id) : null,
            );
        case "get_experiment_raw_data":
            return getExperimentRawDataEnvelope(
                String(args.id ?? ""),
                args.run_id ? String(args.run_id) : null,
            );
        case "get_experiment_model_comparison":
            return getModelComparisonEnvelope(
                String(args.id ?? ""),
                args.run_id ? String(args.run_id) : null,
            );
        case "list_candidate_lemmas":
            return listCandidateLemmasEnvelope(args.run_id ? String(args.run_id) : null);
        case "get_candidate_lemma":
            return getCandidateLemmaEnvelope(
                String(args.id ?? ""),
                args.run_id ? String(args.run_id) : null,
            );
        case "list_baseline_hypotheses":
            return listBaselineHypothesesEnvelope();
        case "get_baseline_hypothesis":
            return getBaselineHypothesisEnvelope(String(args.id ?? ""));
        case "get_proof_discovery_index":
            return getProofDiscoveryEnvelope(args.run_id ? String(args.run_id) : null);
        case "propose_baseline_update":
            return proposeBaselineUpdateEnvelope(args);
        case "list_hypothesis_proposals":
            return listHypothesisProposalsEnvelope(
                args.run_id ? String(args.run_id) : null,
                args.status ? String(args.status) : null,
            );
        case "get_hypothesis_proposal":
            return getHypothesisProposalEnvelope(
                String(args.proposal_id ?? ""),
                args.run_id ? String(args.run_id) : null,
            );
        case "accept_hypothesis_proposal":
            return acceptHypothesisProposalEnvelope(String(args.proposal_id ?? ""), args);
        case "reject_hypothesis_proposal":
            return rejectHypothesisProposalEnvelope(String(args.proposal_id ?? ""), args);
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

    if (method === "ping") {
        return jsonRpcResult(id, {});
    }

    if (method === "tools/list") {
        const result: McpToolListResult = { tools: TOOLS };
        return jsonRpcResult(id, result);
    }

    // JSON-RPC specification: A Notification is a Request object without an id member.
    // The Server MUST NOT reply to a Notification.
    if (rpc.id === undefined) {
        return new NextResponse(null, { status: 204 });
    }

    if (method !== "tools/call") {
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }

    const params = (rpc.params ?? {}) as unknown as McpToolCallParams;
    const name = params.name;
    if (!name || typeof name !== "string") {
        return jsonRpcError(id, -32602, "Invalid params: tool name is required.");
    }

    if (mutationToolRequiresAuth(name)) {
        if (mutationToolBlockedByReadOnly(name)) {
            return jsonRpcError(id, -32003, READ_ONLY_DEPLOYMENT_MESSAGE, {
                code: READ_ONLY_DEPLOYMENT_CODE,
                reason: getDeploymentCapabilities().read_only_reason,
            });
        }
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
        return jsonRpcResult(id, toMcpToolResult(result));
    } catch (error) {
        const errorMessage = error instanceof ApiError ? error.message : String(error);
        return jsonRpcResult(id, toMcpToolError(errorMessage));
    }
}

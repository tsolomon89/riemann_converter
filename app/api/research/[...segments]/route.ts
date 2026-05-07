import { NextResponse } from "next/server";
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
    getCurrentExperimentsPayloadPlain,
    getCurrentReportingStatePayload,
    getExperimentEnvelope,
    getHistoryEnvelope,
    getImplementationHealthEnvelope,
    getLatestRunPayloadPlain,
    getManifestEnvelope,
    getProgramDocsEnvelope,
    getObligationEnvelope,
    getObligationsEnvelope,
    getOpenGapsEnvelope,
    getNextActionEnvelope,
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
} from "../../../../lib/research-api";
import {
    acceptHypothesisProposalEnvelope,
    getBaselineHypothesisEnvelope,
    getCandidateLemmaEnvelope,
    getExperimentReviewEnvelope,
    getHypothesisProposalEnvelope,
    getModelComparisonEnvelope,
    getProofDiscoveryEnvelope,
    listBaselineHypothesesEnvelope,
    listCandidateLemmasEnvelope,
    listExperimentReviewsEnvelope,
    listHypothesisProposalsEnvelope,
    listModelComparisonsEnvelope,
    proposeBaselineUpdateEnvelope,
    PROOF_DISCOVERY_API_SCHEMA_VERSION,
    ProofDiscoveryApiError,
    rejectHypothesisProposalEnvelope,
} from "../../../../lib/proof-discovery-api";
import {
    getDeploymentCapabilities,
    getReadOnlyErrorResponse,
    READ_ONLY_DEPLOYMENT_CODE,
    READ_ONLY_DEPLOYMENT_MESSAGE,
} from "../../../../lib/deployment-policy";
import { assertRunAuth } from "../../../../lib/run-auth";

/**
 * Build a proof-discovery-shaped envelope for a framework error (read-only
 * deployment, missing/invalid auth, internal failure). Keeps the wire shape
 * consistent for every proof-discovery route so agents never have to switch
 * between {error: ...} and the proof-discovery envelope.
 */
function proofDiscoveryErrorEnvelope(
    status: number,
    message: string,
    summary: string,
    extraWarnings: string[] = [],
) {
    return NextResponse.json(
        {
            ok: false,
            schema_version: PROOF_DISCOVERY_API_SCHEMA_VERSION,
            run_id: null,
            data: null,
            warnings: extraWarnings,
            errors: [message],
            plain_language_summary: summary,
        },
        { status },
    );
}

/**
 * Gate a proposal mutation request. Returns a proof-discovery envelope
 * Response if blocked (read-only / unauthorized) or null if the request
 * should proceed. Mirrors the run-control gate semantics but never returns
 * the framework {error/code} shape — proposal routes are part of the
 * proof-discovery surface and must speak its envelope.
 */
async function gateProposalMutation(request: Request): Promise<Response | null> {
    if (!getDeploymentCapabilities().run_controls_enabled) {
        return proofDiscoveryErrorEnvelope(
            403,
            READ_ONLY_DEPLOYMENT_MESSAGE,
            "Read-only deployment: hypothesis-proposal mutations require a write-enabled host.",
            [`code:${READ_ONLY_DEPLOYMENT_CODE}`],
        );
    }
    const auth = assertRunAuth(request);
    if (auth) {
        const body = (await auth.json().catch(() => ({}))) as { error?: string };
        return proofDiscoveryErrorEnvelope(
            auth.status,
            body.error ?? "Unauthorized.",
            "Hypothesis-proposal mutations require a valid bearer token.",
        );
    }
    return null;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params?: { segments?: string[] } | Promise<{ segments?: string[] }> };

const resolveSegments = async (context: RouteContext): Promise<string[]> => {
    const params = context.params ? await context.params : {};
    const segments = params?.segments;
    return Array.isArray(segments) ? segments : [];
};

const handleError = (error: unknown) => {
    if (error instanceof ApiError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ProofDiscoveryApiError) {
        return proofDiscoveryErrorEnvelope(
            error.status,
            error.message,
            "Proof-discovery API rejected the request.",
        );
    }
    return NextResponse.json({ error: `Internal error: ${String(error)}` }, { status: 500 });
};

const dispatchGet = async (request: Request, segments: string[]) => {
    const [head, id, tail] = segments;
    const url = new URL(request.url);

    if (segments.length === 1 && head === "manifest") {
        return NextResponse.json(getManifestEnvelope());
    }
    if (segments.length === 1 && head === "latest-run") {
        return NextResponse.json(getLatestRunPayloadPlain());
    }
    if (segments.length === 1 && head === "current-experiments") {
        return NextResponse.json(getCurrentExperimentsPayloadPlain());
    }
    if (segments.length === 1 && head === "current-reporting-state") {
        return NextResponse.json(getCurrentReportingStatePayload());
    }
    if (segments.length === 1 && head === "artifact-freshness") {
        return NextResponse.json(
            getArtifactFreshnessPayload(
                url.searchParams.get("artifact_kind") ?? url.searchParams.get("kind"),
                url.searchParams.get("run_id"),
            ),
        );
    }
    if (segments.length === 1 && head === "theorem-candidate") {
        return NextResponse.json(getTheoremCandidateEnvelope());
    }
    if (segments.length === 1 && head === "program-docs") {
        return NextResponse.json(getProgramDocsEnvelope());
    }
    if (segments.length === 1 && head === "data-assets") {
        return NextResponse.json(getDataAssetsEnvelope());
    }
    if (segments.length === 1 && head === "data-sufficiency") {
        return NextResponse.json(getDataSufficiencyEnvelope(url.searchParams));
    }
    if (segments.length === 1 && head === "run-presets") {
        return NextResponse.json(getRunPresetsEnvelope());
    }
    if (segments.length === 1 && head === "resolve-run-preset") {
        return NextResponse.json(resolveRunPresetEnvelope(url.searchParams));
    }
    if (segments.length === 1 && head === "selected-data-source") {
        return NextResponse.json(getSelectedDataSourceEnvelope(url.searchParams));
    }
    if (segments.length === 1 && head === "zero-validation") {
        return NextResponse.json(getZeroValidationEnvelope());
    }
    if (segments.length === 1 && head === "preflight") {
        return NextResponse.json(getPreflightEnvelope(url.searchParams));
    }
    if (segments.length === 1 && head === "research-plan") {
        return NextResponse.json(getResearchPlanEnvelope(url.searchParams));
    }
    if (segments.length === 1 && head === "next-action") {
        return NextResponse.json(getNextActionEnvelope(url.searchParams));
    }
    if (segments.length === 1 && head === "precision-policy") {
        return NextResponse.json(getPrecisionPolicyEnvelope());
    }
    if (segments.length === 1 && head === "data-migration-report") {
        return NextResponse.json(getDataMigrationReportEnvelope());
    }
    if (segments.length === 1 && head === "why-this-experiment-next") {
        return NextResponse.json(explainWhyThisExperimentNextEnvelope(url.searchParams));
    }
    if (segments.length === 1 && head === "why-stop-experimenting") {
        return NextResponse.json(explainWhyStopExperimentingEnvelope(url.searchParams));
    }
    if (segments.length === 1 && head === "obligations") {
        return NextResponse.json(getObligationsEnvelope());
    }
    if (segments.length === 2 && head === "obligations" && id) {
        return NextResponse.json(getObligationEnvelope(id));
    }
    if (segments.length === 1 && head === "open-gaps") {
        return NextResponse.json(getOpenGapsEnvelope());
    }
    if (segments.length === 1 && head === "implementation-health") {
        return NextResponse.json(getImplementationHealthEnvelope());
    }
    if (segments.length === 1 && head === "history") {
        return NextResponse.json(getHistoryEnvelope(url.searchParams.get("limit")));
    }
    if (segments.length === 2 && head === "experiments" && id) {
        return NextResponse.json(getExperimentEnvelope(id));
    }
    if (segments.length === 3 && head === "experiments" && id && tail === "series") {
        return NextResponse.json(getSeriesEnvelope(id, url.searchParams));
    }
    if (segments.length === 2 && head === "compare" && id === "scales") {
        return NextResponse.json(compareScalesEnvelope(url.searchParams));
    }
    if (segments.length === 2 && head === "compare" && id === "runs") {
        return NextResponse.json(compareRunsEnvelope(url.searchParams));
    }
    if (segments.length === 2 && head === "compare" && id === "verdicts") {
        return NextResponse.json(compareVerdictsEnvelope(url.searchParams));
    }
    if (segments.length === 1 && head === "run") {
        if (!getDeploymentCapabilities().run_controls_enabled) {
            return getReadOnlyErrorResponse();
        }
        const auth = assertRunAuth(request);
        if (auth) return auth;
        return NextResponse.json(getRunStatusEnvelope(url.searchParams.get("run_id")));
    }
    if (segments.length === 2 && head === "run" && id === "logs") {
        if (!getDeploymentCapabilities().run_controls_enabled) {
            return getReadOnlyErrorResponse();
        }
        const auth = assertRunAuth(request);
        if (auth) return auth;
        return NextResponse.json(
            getRunLogsEnvelope(url.searchParams.get("run_id"), url.searchParams.get("from")),
        );
    }
    if (segments.length === 2 && head === "run" && id === "events") {
        if (!getDeploymentCapabilities().run_controls_enabled) {
            return getReadOnlyErrorResponse();
        }
        const auth = assertRunAuth(request);
        if (auth) return auth;
        return NextResponse.json(
            getRunEventsEnvelope(url.searchParams.get("run_id"), url.searchParams.get("from")),
        );
    }

    // ----- proof-discovery layer (baselines / reviews / lemmas / proposals) -----
    if (segments.length === 1 && head === "experiment-reviews") {
        return NextResponse.json(listExperimentReviewsEnvelope(url.searchParams.get("run_id")));
    }
    if (segments.length === 2 && head === "experiment-reviews" && id) {
        return NextResponse.json(getExperimentReviewEnvelope(id, url.searchParams.get("run_id")));
    }
    if (segments.length === 1 && head === "model-comparisons") {
        return NextResponse.json(listModelComparisonsEnvelope(url.searchParams.get("run_id")));
    }
    if (segments.length === 2 && head === "model-comparisons" && id) {
        return NextResponse.json(getModelComparisonEnvelope(id, url.searchParams.get("run_id")));
    }
    if (segments.length === 1 && head === "candidate-lemmas") {
        return NextResponse.json(listCandidateLemmasEnvelope(url.searchParams.get("run_id")));
    }
    if (segments.length === 2 && head === "candidate-lemmas" && id) {
        return NextResponse.json(getCandidateLemmaEnvelope(id, url.searchParams.get("run_id")));
    }
    if (segments.length === 1 && head === "baseline-hypotheses") {
        return NextResponse.json(listBaselineHypothesesEnvelope());
    }
    if (segments.length === 2 && head === "baseline-hypotheses" && id) {
        return NextResponse.json(getBaselineHypothesisEnvelope(id));
    }
    if (segments.length === 1 && head === "proof-discovery") {
        return NextResponse.json(getProofDiscoveryEnvelope(url.searchParams.get("run_id")));
    }
    if (segments.length === 1 && head === "hypothesis-proposals") {
        return NextResponse.json(
            listHypothesisProposalsEnvelope(url.searchParams.get("run_id"), url.searchParams.get("status")),
        );
    }
    if (segments.length === 2 && head === "hypothesis-proposals" && id) {
        return NextResponse.json(
            getHypothesisProposalEnvelope(id, url.searchParams.get("run_id")),
        );
    }

    if (segments.length === 1 && head === "same-object-certificate") {
        const latest = getLatestRunPayloadPlain();
        if (!latest.latest_real_run_id) {
            return NextResponse.json(
                { status: "NOT_BUILT", message: "Same-Object Certificate: not built for current run." },
                { status: 404 },
            );
        }
        if (latest.certificate_status === "STALE") {
            return NextResponse.json(
                { status: "STALE", message: "Stale certificate hidden. Build a fresh certificate." },
                { status: 409 },
            );
        }
        if (latest.certificate_status !== "CURRENT" || !latest.certificate_path) {
            return NextResponse.json(
                { status: "MISSING_FOR_RUN", message: "Certificate not built for this run." },
                { status: 404 },
            );
        }
        try {
            const certData = require("fs").readFileSync(latest.certificate_path, "utf-8");
            return NextResponse.json(JSON.parse(certData));
        } catch {
            return NextResponse.json(
                { status: "MISSING_FOR_RUN", message: "Certificate not built for this run." },
                { status: 404 },
            );
        }
    }

    return NextResponse.json({ error: "Not found." }, { status: 404 });
};

const dispatchPost = async (request: Request, segments: string[]) => {
    const [head, id] = segments;
    if (segments.length === 1 && head === "run") {
        if (!getDeploymentCapabilities().run_controls_enabled) {
            return getReadOnlyErrorResponse();
        }
        const auth = assertRunAuth(request);
        if (auth) return auth;
        const body = (await request.json().catch(() => ({}))) as {
            kind?: unknown;
            mode?: unknown;
            custom?: unknown;
            config?: unknown;
        };
        if (body.kind === "custom" || body.mode === "custom" || body.custom || body.config) {
            return NextResponse.json(
                startCustomRunEnvelope(body.custom ?? body.config),
                { status: 202 },
            );
        }
        const mode = parseCanonicalMode(body.mode);
        return NextResponse.json(startRunEnvelope(mode), { status: 202 });
    }
    if (segments.length === 2 && head === "run" && id === "cancel") {
        if (!getDeploymentCapabilities().run_controls_enabled) {
            return getReadOnlyErrorResponse();
        }
        const auth = assertRunAuth(request);
        if (auth) return auth;
        const body = (await request.json().catch(() => ({}))) as { run_id?: string };
        return NextResponse.json(cancelRunEnvelope(body.run_id ?? null));
    }
    if (segments.length === 2 && head === "run" && id === "resume") {
        if (!getDeploymentCapabilities().run_controls_enabled) {
            return getReadOnlyErrorResponse();
        }
        const auth = assertRunAuth(request);
        if (auth) return auth;
        const body = (await request.json().catch(() => ({}))) as { mode?: unknown };
        const mode = parseCanonicalMode(body.mode);
        return NextResponse.json(resumeRunEnvelope(mode), { status: 202 });
    }

    // ----- hypothesis proposals (advisory; mutations require auth + write-enabled deployment) -----
    if (segments.length === 1 && head === "hypothesis-proposals") {
        const blocked = await gateProposalMutation(request);
        if (blocked) return blocked;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const env = proposeBaselineUpdateEnvelope(body);
        return NextResponse.json(env, { status: env.ok ? 201 : 400 });
    }
    if (segments.length === 3 && head === "hypothesis-proposals" && id && segments[2] === "accept") {
        const blocked = await gateProposalMutation(request);
        if (blocked) return blocked;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const env = acceptHypothesisProposalEnvelope(id, body);
        return NextResponse.json(env, { status: env.ok ? 200 : 400 });
    }
    if (segments.length === 3 && head === "hypothesis-proposals" && id && segments[2] === "reject") {
        const blocked = await gateProposalMutation(request);
        if (blocked) return blocked;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const env = rejectHypothesisProposalEnvelope(id, body);
        return NextResponse.json(env, { status: env.ok ? 200 : 400 });
    }

    return NextResponse.json({ error: "Not found." }, { status: 404 });
};

export async function GET(request: Request, context: RouteContext) {
    try {
        const segments = await resolveSegments(context);
        return await dispatchGet(request, segments);
    } catch (error) {
        return handleError(error);
    }
}

export async function POST(request: Request, context: RouteContext) {
    try {
        const segments = await resolveSegments(context);
        return await dispatchPost(request, segments);
    } catch (error) {
        return handleError(error);
    }
}

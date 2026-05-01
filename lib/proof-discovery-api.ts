/**
 * API surface for the proof-discovery layer:
 *   - experiment reviews
 *   - model comparisons
 *   - candidate lemmas
 *   - baseline hypotheses
 *   - proof-discovery index
 *   - hypothesis proposals
 *
 * Every function returns a uniform envelope:
 *
 *   {
 *     ok: boolean,
 *     schema_version: string,
 *     run_id: string | null,
 *     data: T,
 *     warnings: string[],
 *     errors: string[],
 *     plain_language_summary: string
 *   }
 *
 * Run-id resolution: when run_id is omitted, the latest run is resolved from
 * public/current.json (or the latest-run resolver). Experiment lookups accept
 * stable_id (EXP_2B), display_id (P2-2), or any of the existing alias forms.
 */

import fs from "fs";
import path from "path";
import {
    BaselineHypothesis,
    REQUIRED_EXPERIMENT_IDS,
    getBaselineForExperiment,
    listBaselineHypotheses,
} from "./hypothesis-registry";
import {
    ExperimentReview,
    ModelComparison,
    ProofDiscoveryIndex,
    listExperimentReviews,
    listModelComparisons,
    readExperimentReview,
    readLemmaMarkdown,
    readModelComparison,
    readProofDiscoveryIndex,
    readProofDiscoveryMarkdown,
} from "./lemma-generator";
import {
    HypothesisProposal,
    ProposalStatus,
    acceptProposal,
    getProposal,
    getProposalAudit,
    listProposals,
    proposeBaselineUpdate,
    rejectProposal,
} from "./hypothesis-proposals";

export const PROOF_DISCOVERY_API_SCHEMA_VERSION = "2026.05.proof-discovery-api.v1";

export interface ProofDiscoveryEnvelope<T> {
    ok: boolean;
    schema_version: string;
    run_id: string | null;
    data: T;
    warnings: string[];
    errors: string[];
    plain_language_summary: string;
}

// ---------------------------------------------------------------------------
// Run id resolution
// ---------------------------------------------------------------------------

interface CurrentJson {
    latest_run_id?: string | null;
    engine_status?: string | null;
}

function readCurrentJson(repoRoot: string): CurrentJson {
    const fp = path.join(repoRoot, "public", "current.json");
    if (!fs.existsSync(fp)) return {};
    try {
        return JSON.parse(fs.readFileSync(fp, "utf-8"));
    } catch {
        return {};
    }
}

export function resolveRunId(
    runIdParam: string | null | undefined,
    repoRoot: string = process.cwd(),
): string | null {
    if (runIdParam && runIdParam.trim()) return runIdParam.trim();
    const current = readCurrentJson(repoRoot);
    return current.latest_run_id || null;
}

// ---------------------------------------------------------------------------
// Experiment id normalization
// ---------------------------------------------------------------------------

const ALIAS_TO_STABLE: Record<string, string> = {
    "ZETA-0": "EXP_0",
    "POLAR": "EXP_0",
    "POLAR-TRACE": "EXP_0",
    "TRANS-1": "EXP_10",
    "TRANSPORT": "EXP_10",
    "ZETA-TRANSPORT": "EXP_10",
    "CORE-1": "EXP_1",
    "HARMONIC": "EXP_1",
    "HARMONIC-CONVERTER": "EXP_1",
    "CONVERTER": "EXP_1",
    "CTRL-1": "EXP_1B",
    "OPERATOR-CONTROL": "EXP_1B",
    "OPERATOR-SCALING-CONTROL": "EXP_1B",
    "NOTE-1": "EXP_1C",
    "ZERO-REUSE": "EXP_1C",
    "ZERO-REUSE-NOTE": "EXP_1C",
    "P2-1": "EXP_2",
    "ROGUE-CENTRIFUGE": "EXP_2",
    "P2-2": "EXP_2B",
    "ROGUE-ISOLATION": "EXP_2B",
    "CTRL-2": "EXP_3",
    "BETA-CONTROL": "EXP_3",
    "BETA-COUNTERFACTUAL": "EXP_3",
    "PATH-1": "EXP_4",
    "TRANSLATION-DILATION": "EXP_4",
    "PATH-2": "EXP_5",
    "ZERO-CORRESPONDENCE": "EXP_5",
    "VAL-1": "EXP_6",
    "BETA-STABILITY": "EXP_6",
    "BETA-VALIDATION": "EXP_6",
    "P2-3": "EXP_7",
    "CALIBRATED-AMPLIFICATION": "EXP_7",
    "WIT-1": "EXP_8",
    "ZERO-SCALING-WITNESS": "EXP_8",
    "REG-1": "EXP_8",
    "SCALED-ZETA-REGRESSION": "EXP_8",
    "DEMO-1": "EXP_9",
    "BOUNDED-VIEW": "EXP_9",
};

const STABLE_ID_PATTERN = /^EXP_[0-9]+[A-Z]?$/;
const COMPACT_STABLE_PATTERN = /^EXP[0-9]+[A-Z]?$/;

export class ProofDiscoveryApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export function normalizeExperimentIdLoose(value: string | null | undefined): string {
    if (!value || !String(value).trim()) {
        throw new ProofDiscoveryApiError(400, "experiment id is required");
    }
    const raw = String(value).trim().toUpperCase();
    if (STABLE_ID_PATTERN.test(raw)) return raw;
    if (COMPACT_STABLE_PATTERN.test(raw)) return raw.replace(/^EXP/, "EXP_");
    const key = raw.replace(/_/g, "-").replace(/\s+/g, "-");
    const alias = ALIAS_TO_STABLE[key];
    if (alias) return alias;
    throw new ProofDiscoveryApiError(400, `Invalid experiment id: ${value}`);
}

// ---------------------------------------------------------------------------
// Envelope helper
// ---------------------------------------------------------------------------

function envelope<T>(
    runId: string | null,
    data: T,
    summary: string,
    warnings: string[] = [],
    errors: string[] = [],
    ok: boolean = true,
): ProofDiscoveryEnvelope<T> {
    return {
        ok: ok && errors.length === 0,
        schema_version: PROOF_DISCOVERY_API_SCHEMA_VERSION,
        run_id: runId,
        data,
        warnings,
        errors,
        plain_language_summary: summary,
    };
}

// ---------------------------------------------------------------------------
// Baseline hypotheses
// ---------------------------------------------------------------------------

export function listBaselineHypothesesEnvelope(
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<{ baselines: BaselineHypothesis[]; coverage: { covered: boolean; missing: string[]; total: number } }> {
    const all = listBaselineHypotheses(repoRoot);
    const present = new Set(all.flatMap((h) => h.experiment_ids));
    const missing = REQUIRED_EXPERIMENT_IDS.filter((id) => !present.has(id));
    const coverage = { covered: missing.length === 0, missing, total: present.size };
    return envelope(
        null,
        { baselines: all, coverage },
        `Listed ${all.length} baseline hypotheses (${coverage.covered ? "all required experiments covered" : `${missing.length} missing`}).`,
    );
}

export function getBaselineHypothesisEnvelope(
    experimentIdInput: string,
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<BaselineHypothesis | null> {
    const expId = normalizeExperimentIdLoose(experimentIdInput);
    const baseline = getBaselineForExperiment(expId, repoRoot);
    if (!baseline) {
        return envelope(
            null,
            null,
            `No baseline hypothesis registered for ${expId}.`,
            [],
            [`unknown experiment id: ${experimentIdInput}`],
            false,
        );
    }
    return envelope(
        null,
        baseline,
        `Baseline hypothesis ${baseline.hypothesis_id} for ${expId} (${baseline.display_id}, role=${baseline.role}, program=${baseline.program}).`,
    );
}

// ---------------------------------------------------------------------------
// Experiment reviews
// ---------------------------------------------------------------------------

export function listExperimentReviewsEnvelope(
    runIdParam: string | null,
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<{ run_id: string | null; reviews: ExperimentReview[] }> {
    const runId = resolveRunId(runIdParam, repoRoot);
    if (!runId) {
        return envelope(
            null,
            { run_id: null, reviews: [] },
            "No current run resolved; experiment reviews unavailable.",
            ["no run id available — pass run_id or create a current run"],
            [],
        );
    }
    const reviews = listExperimentReviews(runId, repoRoot);
    return envelope(
        runId,
        { run_id: runId, reviews },
        `Listed ${reviews.length} experiment reviews for run ${runId}.`,
    );
}

export function getExperimentReviewEnvelope(
    experimentIdInput: string,
    runIdParam: string | null,
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<ExperimentReview | null> {
    const runId = resolveRunId(runIdParam, repoRoot);
    if (!runId) {
        return envelope(
            null,
            null,
            "No current run resolved; experiment review unavailable.",
            ["no run id available — pass run_id or create a current run"],
            [],
            false,
        );
    }
    const expId = normalizeExperimentIdLoose(experimentIdInput);
    const review = readExperimentReview(runId, expId, repoRoot);
    if (!review) {
        return envelope(
            runId,
            null,
            `No experiment review for ${expId} in run ${runId}.`,
            [],
            [`review not found for ${expId} in run ${runId}`],
            false,
        );
    }
    const summary = `Run ${runId} — ${review.display_id} (${review.experiment_id}): baseline ${review.model_comparison.baseline_status}, scoped ${review.scoped_consequence}.`;
    return envelope(runId, review, summary);
}

export function getExperimentRawDataEnvelope(
    experimentIdInput: string,
    runIdParam: string | null,
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<{ baseline_hypothesis: BaselineHypothesis | null; raw_observations: Record<string, unknown>; verifier_signal: ExperimentReview["verifier_signal"]; observations: ModelComparison["observations"] | null } | null> {
    const review = getExperimentReviewEnvelope(experimentIdInput, runIdParam, repoRoot);
    if (!review.ok || !review.data) {
        return envelope(review.run_id, null, review.plain_language_summary, review.warnings, review.errors, false);
    }
    const r = review.data;
    const mc = r.experiment_id && review.run_id
        ? readModelComparison(review.run_id, r.experiment_id, repoRoot)
        : null;
    const baseline = getBaselineForExperiment(r.experiment_id, repoRoot);
    return envelope(
        review.run_id,
        {
            baseline_hypothesis: baseline,
            raw_observations: r.raw_observations,
            verifier_signal: r.verifier_signal,
            observations: mc?.observations ?? null,
        },
        `Raw observations for ${r.display_id} (${r.experiment_id}) in run ${review.run_id}.`,
    );
}

// ---------------------------------------------------------------------------
// Model comparisons
// ---------------------------------------------------------------------------

export function listModelComparisonsEnvelope(
    runIdParam: string | null,
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<{ run_id: string | null; comparisons: ModelComparison[] }> {
    const runId = resolveRunId(runIdParam, repoRoot);
    if (!runId) {
        return envelope(
            null,
            { run_id: null, comparisons: [] },
            "No current run resolved; model comparisons unavailable.",
            ["no run id available"],
            [],
        );
    }
    const comparisons = listModelComparisons(runId, repoRoot);
    return envelope(
        runId,
        { run_id: runId, comparisons },
        `Listed ${comparisons.length} model comparisons for run ${runId}.`,
    );
}

export function getModelComparisonEnvelope(
    experimentIdInput: string,
    runIdParam: string | null,
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<ModelComparison | null> {
    const runId = resolveRunId(runIdParam, repoRoot);
    if (!runId) {
        return envelope(null, null, "No current run resolved.", ["no run id available"], [], false);
    }
    const expId = normalizeExperimentIdLoose(experimentIdInput);
    const mc = readModelComparison(runId, expId, repoRoot);
    if (!mc) {
        return envelope(runId, null, `No model comparison for ${expId} in run ${runId}.`, [], [`not found: ${expId}`], false);
    }
    return envelope(
        runId,
        mc,
        `Model comparison for ${mc.display_id} (${mc.experiment_id}) — baseline ${mc.fit_result.baseline_status}, priority ${mc.agent_review_priority}.`,
    );
}

// ---------------------------------------------------------------------------
// Candidate lemmas
// ---------------------------------------------------------------------------

export interface CandidateLemmaPayload {
    experiment_id: string;
    display_id: string;
    program: BaselineHypothesis["program"];
    role: BaselineHypothesis["role"];
    baseline_status: ExperimentReview["model_comparison"]["baseline_status"];
    scoped_consequence: ExperimentReview["scoped_consequence"];
    candidate_lemmas: ExperimentReview["candidate_lemmas"];
    intended_inference_if_passed: string[];
    actual_run_inference: string[];
    disallowed_conclusions: string[];
    next_hypotheses: string[];
    markdown: string | null;
}

function reviewToLemmaPayload(
    review: ExperimentReview,
    markdown: string | null,
): CandidateLemmaPayload {
    return {
        experiment_id: review.experiment_id,
        display_id: review.display_id,
        program: review.program,
        role: review.role,
        baseline_status: review.model_comparison.baseline_status,
        scoped_consequence: review.scoped_consequence,
        candidate_lemmas: review.candidate_lemmas,
        intended_inference_if_passed: review.intended_inference_if_passed,
        actual_run_inference: review.actual_run_inference,
        disallowed_conclusions: review.disallowed_conclusions,
        next_hypotheses: review.next_hypotheses,
        markdown,
    };
}

export function listCandidateLemmasEnvelope(
    runIdParam: string | null,
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<{ run_id: string | null; lemmas: CandidateLemmaPayload[] }> {
    const runId = resolveRunId(runIdParam, repoRoot);
    if (!runId) {
        return envelope(null, { run_id: null, lemmas: [] }, "No current run resolved.", ["no run id available"], []);
    }
    const reviews = listExperimentReviews(runId, repoRoot);
    const out = reviews.map((r) => reviewToLemmaPayload(r, readLemmaMarkdown(runId, r.experiment_id, repoRoot)));
    return envelope(runId, { run_id: runId, lemmas: out }, `Listed ${out.length} candidate lemmas / notes for run ${runId}.`);
}

export function getCandidateLemmaEnvelope(
    experimentIdInput: string,
    runIdParam: string | null,
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<CandidateLemmaPayload | null> {
    const runId = resolveRunId(runIdParam, repoRoot);
    if (!runId) {
        return envelope(null, null, "No current run resolved.", ["no run id available"], [], false);
    }
    const expId = normalizeExperimentIdLoose(experimentIdInput);
    const review = readExperimentReview(runId, expId, repoRoot);
    if (!review) {
        return envelope(runId, null, `No candidate lemma for ${expId} in run ${runId}.`, [], [`not found: ${expId}`], false);
    }
    const md = readLemmaMarkdown(runId, expId, repoRoot);
    return envelope(
        runId,
        reviewToLemmaPayload(review, md),
        `Candidate lemma / note for ${review.display_id} (${review.experiment_id}) in run ${runId} — baseline ${review.model_comparison.baseline_status}.`,
    );
}

// ---------------------------------------------------------------------------
// Proof discovery index
// ---------------------------------------------------------------------------

export function getProofDiscoveryEnvelope(
    runIdParam: string | null,
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<{ run_id: string | null; index: ProofDiscoveryIndex | null; markdown: string | null }> {
    const runId = resolveRunId(runIdParam, repoRoot);
    if (!runId) {
        return envelope(null, { run_id: null, index: null, markdown: null }, "No current run resolved.", ["no run id available"], []);
    }
    const index = readProofDiscoveryIndex(runId, repoRoot);
    const md = readProofDiscoveryMarkdown(runId, repoRoot);
    if (!index) {
        return envelope(runId, { run_id: runId, index: null, markdown: md }, `No proof-discovery index for run ${runId}.`, [`index not found for run ${runId}`], [], false);
    }
    return envelope(
        runId,
        { run_id: runId, index, markdown: md },
        `Proof-discovery for run ${runId}: ${index.totals.experiments_reviewed} reviews, ${index.formalization_targets.length} formalization targets, ${index.totals.failed_or_incomplete} failed/incomplete baselines.`,
    );
}

// ---------------------------------------------------------------------------
// Hypothesis proposals
// ---------------------------------------------------------------------------

export function listHypothesisProposalsEnvelope(
    runIdParam: string | null,
    statusFilter: string | null,
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<{ run_id: string | null; proposals: HypothesisProposal[] }> {
    const runId = resolveRunId(runIdParam, repoRoot);
    if (!runId) {
        return envelope(null, { run_id: null, proposals: [] }, "No current run resolved.", ["no run id available"], []);
    }
    const status = (statusFilter && ["PROPOSED", "ACCEPTED", "REJECTED"].includes(statusFilter.toUpperCase()))
        ? (statusFilter.toUpperCase() as ProposalStatus)
        : undefined;
    const proposals = listProposals(runId, repoRoot, status);
    return envelope(runId, { run_id: runId, proposals }, `Listed ${proposals.length} hypothesis proposals for run ${runId}${status ? ` (status=${status})` : ""}.`);
}

export function getHypothesisProposalEnvelope(
    proposalId: string,
    runIdParam: string | null,
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<{ proposal: HypothesisProposal | null; audit: ReturnType<typeof getProposalAudit> | null }> {
    const runId = resolveRunId(runIdParam, repoRoot);
    if (!runId) {
        return envelope(null, { proposal: null, audit: null }, "No current run resolved.", ["no run id available"], [], false);
    }
    const proposal = getProposal(runId, proposalId, repoRoot);
    const audit = getProposalAudit(runId, proposalId, repoRoot);
    if (!proposal) {
        return envelope(runId, { proposal: null, audit: null }, `No proposal ${proposalId} in run ${runId}.`, [], [`not found: ${proposalId}`], false);
    }
    return envelope(
        runId,
        { proposal, audit },
        `Proposal ${proposalId} for ${proposal.experiment_id} — status ${proposal.status} (source ${proposal.source_agent}).`,
    );
}

export function proposeBaselineUpdateEnvelope(
    body: Record<string, unknown>,
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<HypothesisProposal | null> {
    const runIdRaw = typeof body.run_id === "string" ? body.run_id : null;
    const runId = resolveRunId(runIdRaw, repoRoot);
    if (!runId) {
        return envelope(null, null, "No current run resolved.", ["no run id available"], [], false);
    }
    try {
        const proposal = proposeBaselineUpdate(
            runId,
            {
                source_agent: String(body.source_agent ?? ""),
                experiment_id: normalizeExperimentIdLoose(String(body.experiment_id ?? "")),
                proposed_baseline: (body.proposed_baseline as Record<string, unknown>) ?? {},
                reason: String(body.reason ?? ""),
                evidence: Array.isArray(body.evidence) ? body.evidence : [],
                recommended_next_experiment: typeof body.recommended_next_experiment === "string" ? body.recommended_next_experiment : null,
            },
            repoRoot,
        );
        return envelope(
            runId,
            proposal,
            `Proposed baseline update ${proposal.proposal_id} for ${proposal.experiment_id} — status PROPOSED, awaiting human acceptance.`,
            ["canonical hypotheses do not mutate until proposal is explicitly accepted"],
        );
    } catch (err) {
        return envelope(runId, null, "Proposal rejected.", [], [(err as Error).message], false);
    }
}

export function acceptHypothesisProposalEnvelope(
    proposalId: string,
    body: Record<string, unknown>,
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<HypothesisProposal | null> {
    const runIdRaw = typeof body.run_id === "string" ? body.run_id : null;
    const runId = resolveRunId(runIdRaw, repoRoot);
    if (!runId) {
        return envelope(null, null, "No current run resolved.", ["no run id available"], [], false);
    }
    const acceptedBy = String(body.accepted_by ?? "");
    const note = typeof body.note === "string" ? body.note : null;
    try {
        const proposal = acceptProposal(runId, proposalId, acceptedBy, note, repoRoot);
        return envelope(
            runId,
            proposal,
            `Accepted proposal ${proposalId} (${proposal.experiment_id}); overlay applied. Audit recorded under decided_by=${acceptedBy}.`,
        );
    } catch (err) {
        return envelope(runId, null, "Acceptance failed.", [], [(err as Error).message], false);
    }
}

export function rejectHypothesisProposalEnvelope(
    proposalId: string,
    body: Record<string, unknown>,
    repoRoot: string = process.cwd(),
): ProofDiscoveryEnvelope<HypothesisProposal | null> {
    const runIdRaw = typeof body.run_id === "string" ? body.run_id : null;
    const runId = resolveRunId(runIdRaw, repoRoot);
    if (!runId) {
        return envelope(null, null, "No current run resolved.", ["no run id available"], [], false);
    }
    const rejectedBy = String(body.rejected_by ?? "");
    const reason = typeof body.reason === "string" ? body.reason : null;
    try {
        const proposal = rejectProposal(runId, proposalId, rejectedBy, reason, repoRoot);
        return envelope(
            runId,
            proposal,
            `Rejected proposal ${proposalId} (${proposal.experiment_id}). Audit recorded under decided_by=${rejectedBy}.`,
        );
    } catch (err) {
        return envelope(runId, null, "Rejection failed.", [], [(err as Error).message], false);
    }
}

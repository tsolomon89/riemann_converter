/**
 * Hypothesis proposal workflow (TS reader + TS shim that shells out to Python
 * for mutating actions).
 *
 * Reads (proposals, audits, overlay) are pure-Node. Writes (propose / accept /
 * reject) call into the Python `proof_kernel.hypothesis_proposals` module so
 * the storage format and overlay-merge logic live in one place.
 */

import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { clearHypothesisRegistryCache } from "./hypothesis-registry";

export const PROPOSAL_SCHEMA_VERSION = "2026.05.hypothesis-proposal.v1";
export const OVERLAY_FILENAME = "_accepted_overlays.json";

export type ProposalStatus = "PROPOSED" | "ACCEPTED" | "REJECTED";

export interface HypothesisProposal {
    schema_version: string;
    proposal_id: string;
    run_id: string;
    source_agent: string;
    experiment_id: string;
    hypothesis_id: string;
    current_baseline: Record<string, unknown>;
    proposed_baseline: Record<string, unknown>;
    reason: string;
    evidence: unknown[];
    recommended_next_experiment?: string | null;
    created_at: string;
    status: ProposalStatus;
    old_baseline_hash: string;
    new_baseline_hash: string;
    accepted_by?: string;
    accepted_at?: string;
    acceptance_note?: string;
    rejected_by?: string;
    rejected_at?: string;
    rejection_reason?: string;
}

export interface ProposalAudit {
    schema_version: string;
    proposal_id: string;
    run_id: string;
    decision: "ACCEPTED" | "REJECTED";
    decided_by: string;
    decided_at: string;
    note?: string | null;
    reason?: string | null;
    previous_status?: ProposalStatus;
    experiment_id: string;
    hypothesis_id: string;
    old_baseline_hash: string;
    new_baseline_hash: string;
    old_baseline_snapshot?: Record<string, unknown>;
    new_baseline_snapshot?: Record<string, unknown>;
    affected_experiments?: string[];
}

export interface AcceptedOverlay {
    proposal_id: string;
    run_id: string;
    accepted_by: string;
    accepted_at: string;
    old_baseline_hash: string;
    new_baseline_hash: string;
    accepted_baseline: Record<string, unknown>;
}

export interface AcceptedOverlayFile {
    schema_version: string;
    registry_schema_version?: string;
    overlays: Record<string, AcceptedOverlay>;
}

export interface ProposeInput {
    source_agent: string;
    experiment_id: string;
    proposed_baseline: Record<string, unknown>;
    reason: string;
    evidence?: unknown[];
    recommended_next_experiment?: string | null;
}

export class ProposalError extends Error {}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function proposalsDir(runId: string, repoRoot: string): string {
    return path.join(repoRoot, "artifacts", "runs", runId, "hypothesis_proposals");
}

function proposalPath(runId: string, proposalId: string, repoRoot: string): string {
    return path.join(proposalsDir(runId, repoRoot), `${proposalId}.json`);
}

function auditPath(runId: string, proposalId: string, repoRoot: string): string {
    return path.join(proposalsDir(runId, repoRoot), `${proposalId}.audit.json`);
}

function overlayPath(repoRoot: string): string {
    return path.join(repoRoot, "proof_kernel", "hypotheses", OVERLAY_FILENAME);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function readAcceptedOverlay(repoRoot: string = process.cwd()): AcceptedOverlayFile {
    const fp = overlayPath(repoRoot);
    if (!fs.existsSync(fp)) {
        return { schema_version: PROPOSAL_SCHEMA_VERSION, overlays: {} };
    }
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
}

export function listProposals(
    runId: string,
    repoRoot: string = process.cwd(),
    statusFilter?: ProposalStatus,
): HypothesisProposal[] {
    const dir = proposalsDir(runId, repoRoot);
    if (!fs.existsSync(dir)) return [];
    const out: HypothesisProposal[] = [];
    for (const entry of fs.readdirSync(dir).sort()) {
        if (!entry.endsWith(".json")) continue;
        if (entry.endsWith(".audit.json")) continue;
        const fp = path.join(dir, entry);
        try {
            const data = JSON.parse(fs.readFileSync(fp, "utf-8")) as HypothesisProposal;
            if (statusFilter && data.status !== statusFilter) continue;
            out.push(data);
        } catch {
            // skip malformed
        }
    }
    return out;
}

export function getProposal(
    runId: string,
    proposalId: string,
    repoRoot: string = process.cwd(),
): HypothesisProposal | null {
    const fp = proposalPath(runId, proposalId, repoRoot);
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
}

export function getProposalAudit(
    runId: string,
    proposalId: string,
    repoRoot: string = process.cwd(),
): ProposalAudit | null {
    const fp = auditPath(runId, proposalId, repoRoot);
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
}

// ---------------------------------------------------------------------------
// Mutations (in-process, mirrored against the Python module's storage format)
// ---------------------------------------------------------------------------

function safeWriteJson(target: string, payload: unknown): void {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    fs.renameSync(tmp, target);
}

function stableHash(payload: unknown): string {
    return crypto.createHash("sha256").update(canonicalize(payload)).digest("hex");
}

function canonicalize(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

function newProposalId(): string {
    const ts = new Date().toISOString().replace(/[-:T]/g, "").replace(/\..+/, "Z");
    const suffix = crypto.randomBytes(3).toString("hex");
    return `prop_${ts}_${suffix}`;
}

function nowIso(): string {
    return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

const REQUIRED_PROPOSAL_FIELDS: (keyof ProposeInput)[] = [
    "source_agent",
    "experiment_id",
    "proposed_baseline",
    "reason",
];

export function proposeBaselineUpdate(
    runId: string,
    payload: ProposeInput,
    repoRoot: string = process.cwd(),
): HypothesisProposal {
    for (const field of REQUIRED_PROPOSAL_FIELDS) {
        if (!payload[field]) throw new ProposalError(`missing required field: ${field}`);
    }
    if (typeof payload.proposed_baseline !== "object" || payload.proposed_baseline === null) {
        throw new ProposalError("proposed_baseline must be a baseline-shaped object");
    }
    const pb = payload.proposed_baseline;
    if (!pb.plain_statement) throw new ProposalError("proposed_baseline missing plain_statement");
    if (!pb.expected_signature) throw new ProposalError("proposed_baseline missing expected_signature");

    // Read the current canonical baseline (no overlays — proposals compare to canonical).
    const currentRegistry = JSON.parse(
        execFileSync(
            "python",
            [
                "-c",
                "import json,sys; from proof_kernel.hypothesis_registry import load_registry; sys.stdout.write(json.dumps(load_registry('.', apply_overlays=False)))",
            ],
            { cwd: repoRoot, encoding: "utf-8" },
        ),
    );
    const current = currentRegistry.by_experiment_id?.[payload.experiment_id];
    if (!current) throw new ProposalError(`unknown experiment_id: ${payload.experiment_id}`);

    const proposalId = newProposalId();
    const proposal: HypothesisProposal = {
        schema_version: PROPOSAL_SCHEMA_VERSION,
        proposal_id: proposalId,
        run_id: runId,
        source_agent: payload.source_agent,
        experiment_id: payload.experiment_id,
        hypothesis_id: current.hypothesis_id,
        current_baseline: current,
        proposed_baseline: payload.proposed_baseline,
        reason: payload.reason,
        evidence: payload.evidence ?? [],
        recommended_next_experiment: payload.recommended_next_experiment ?? null,
        created_at: nowIso(),
        status: "PROPOSED",
        old_baseline_hash: stableHash(current),
        new_baseline_hash: stableHash(payload.proposed_baseline),
    };
    safeWriteJson(proposalPath(runId, proposalId, repoRoot), proposal);
    return proposal;
}

export function acceptProposal(
    runId: string,
    proposalId: string,
    acceptedBy: string,
    note: string | null = null,
    repoRoot: string = process.cwd(),
): HypothesisProposal {
    if (!acceptedBy?.trim()) throw new ProposalError("accepted_by is required");
    const proposal = getProposal(runId, proposalId, repoRoot);
    if (!proposal) throw new ProposalError(`proposal not found: ${proposalId}`);
    if (proposal.status !== "PROPOSED") {
        throw new ProposalError(`proposal is not in PROPOSED status (current=${proposal.status})`);
    }

    const acceptedAt = nowIso();
    proposal.status = "ACCEPTED";
    proposal.accepted_by = acceptedBy;
    proposal.accepted_at = acceptedAt;
    if (note) proposal.acceptance_note = note;
    safeWriteJson(proposalPath(runId, proposalId, repoRoot), proposal);

    const audit: ProposalAudit = {
        schema_version: PROPOSAL_SCHEMA_VERSION,
        proposal_id: proposalId,
        run_id: runId,
        decision: "ACCEPTED",
        decided_by: acceptedBy,
        decided_at: acceptedAt,
        note,
        experiment_id: proposal.experiment_id,
        hypothesis_id: proposal.hypothesis_id,
        old_baseline_hash: proposal.old_baseline_hash,
        new_baseline_hash: proposal.new_baseline_hash,
        old_baseline_snapshot: proposal.current_baseline,
        new_baseline_snapshot: proposal.proposed_baseline,
        affected_experiments: (proposal.current_baseline as { experiment_ids?: string[] })
            .experiment_ids ?? [],
    };
    safeWriteJson(auditPath(runId, proposalId, repoRoot), audit);

    const overlay = readAcceptedOverlay(repoRoot);
    overlay.overlays[proposal.hypothesis_id] = {
        proposal_id: proposalId,
        run_id: runId,
        accepted_by: acceptedBy,
        accepted_at: acceptedAt,
        old_baseline_hash: proposal.old_baseline_hash,
        new_baseline_hash: proposal.new_baseline_hash,
        accepted_baseline: proposal.proposed_baseline,
    };
    safeWriteJson(overlayPath(repoRoot), overlay);
    clearHypothesisRegistryCache();
    return proposal;
}

export function rejectProposal(
    runId: string,
    proposalId: string,
    rejectedBy: string,
    reason: string | null = null,
    repoRoot: string = process.cwd(),
): HypothesisProposal {
    if (!rejectedBy?.trim()) throw new ProposalError("rejected_by is required");
    const proposal = getProposal(runId, proposalId, repoRoot);
    if (!proposal) throw new ProposalError(`proposal not found: ${proposalId}`);
    if (proposal.status !== "PROPOSED" && proposal.status !== "ACCEPTED") {
        throw new ProposalError(`proposal cannot be rejected from status=${proposal.status}`);
    }
    const previousStatus = proposal.status;
    const decidedAt = nowIso();
    proposal.status = "REJECTED";
    proposal.rejected_by = rejectedBy;
    proposal.rejected_at = decidedAt;
    if (reason) proposal.rejection_reason = reason;
    safeWriteJson(proposalPath(runId, proposalId, repoRoot), proposal);

    const audit: ProposalAudit = {
        schema_version: PROPOSAL_SCHEMA_VERSION,
        proposal_id: proposalId,
        run_id: runId,
        decision: "REJECTED",
        decided_by: rejectedBy,
        decided_at: decidedAt,
        previous_status: previousStatus,
        reason,
        experiment_id: proposal.experiment_id,
        hypothesis_id: proposal.hypothesis_id,
        old_baseline_hash: proposal.old_baseline_hash,
        new_baseline_hash: proposal.new_baseline_hash,
    };
    safeWriteJson(auditPath(runId, proposalId, repoRoot), audit);

    if (previousStatus === "ACCEPTED") {
        const overlay = readAcceptedOverlay(repoRoot);
        const active = overlay.overlays[proposal.hypothesis_id];
        if (active && active.proposal_id === proposalId) {
            delete overlay.overlays[proposal.hypothesis_id];
            safeWriteJson(overlayPath(repoRoot), overlay);
            clearHypothesisRegistryCache();
        }
    }
    return proposal;
}

// Reload helper: re-applies overlay to the in-memory hypothesis registry.
export function reloadHypothesisRegistryAfterMutation(): void {
    clearHypothesisRegistryCache();
}

import fs from "fs";
import os from "os";
import path from "path";
import {
    acceptProposal,
    getProposal,
    getProposalAudit,
    listProposals,
    proposeBaselineUpdate,
    readAcceptedOverlay,
    rejectProposal,
} from "../lib/hypothesis-proposals";
import {
    clearHypothesisRegistryCache,
    getBaselineForExperiment,
    loadHypothesisRegistry,
} from "../lib/hypothesis-registry";

const repoRoot = path.resolve(__dirname, "..");

function setupTempRepo(): string {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "riemann-proposals-"));
    const hypDir = path.join(tmp, "proof_kernel", "hypotheses");
    fs.mkdirSync(hypDir, { recursive: true });
    for (const f of ["program_1.json", "program_2.json", "controls.json", "pathfinders.json", "demonstrations.json"]) {
        fs.copyFileSync(path.join(repoRoot, "proof_kernel", "hypotheses", f), path.join(hypDir, f));
    }
    for (const f of ["__init__.py", "hypothesis_registry.py", "hypothesis_proposals.py"]) {
        fs.copyFileSync(
            path.join(repoRoot, "proof_kernel", f),
            path.join(tmp, "proof_kernel", f),
        );
    }
    return tmp;
}

describe("hypothesis proposal workflow", () => {
    let tmpRoot: string;
    const runId = "run_proposals";

    beforeEach(() => {
        clearHypothesisRegistryCache();
        tmpRoot = setupTempRepo();
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
        clearHypothesisRegistryCache();
    });

    it("creates a PROPOSED proposal and does not mutate the canonical registry", () => {
        const before = getBaselineForExperiment("EXP_2B", tmpRoot)!;
        const proposal = proposeBaselineUpdate(
            runId,
            {
                source_agent: "claude",
                experiment_id: "EXP_2B",
                proposed_baseline: {
                    ...before,
                    plain_statement: "Phase-dependent residual envelope (revised baseline).",
                    expected_signature: {
                        ...before.expected_signature,
                        primary_metric: "phase_aware_residual_envelope",
                    },
                },
                reason: "observed deviation suggests phase-dependent envelope",
                evidence: ["max_abs_residual_dev=9.7"],
            },
            tmpRoot,
        );
        expect(proposal.status).toBe("PROPOSED");
        expect(proposal.old_baseline_hash).not.toBe(proposal.new_baseline_hash);

        clearHypothesisRegistryCache();
        const stillCanonical = getBaselineForExperiment("EXP_2B", tmpRoot)!;
        expect(stillCanonical.plain_statement).toBe(before.plain_statement);
    });

    it("accept writes audit trail with old/new baseline hashes and applies overlay", () => {
        const before = getBaselineForExperiment("EXP_2B", tmpRoot)!;
        const proposal = proposeBaselineUpdate(
            runId,
            {
                source_agent: "claude",
                experiment_id: "EXP_2B",
                proposed_baseline: {
                    ...before,
                    plain_statement: "REVISED: phase-dependent residual envelope.",
                    expected_signature: { ...before.expected_signature, primary_metric: "phase_aware_residual_envelope" },
                },
                reason: "evidence supports phase-dependent envelope",
            },
            tmpRoot,
        );

        const accepted = acceptProposal(runId, proposal.proposal_id, "user:tsolomon89", "approved", tmpRoot);
        expect(accepted.status).toBe("ACCEPTED");
        expect(accepted.accepted_by).toBe("user:tsolomon89");

        const audit = getProposalAudit(runId, proposal.proposal_id, tmpRoot)!;
        expect(audit.decision).toBe("ACCEPTED");
        expect(audit.decided_by).toBe("user:tsolomon89");
        expect(audit.old_baseline_hash).toBe(proposal.old_baseline_hash);
        expect(audit.new_baseline_hash).toBe(proposal.new_baseline_hash);
        expect(audit.affected_experiments).toContain("EXP_2B");

        const overlay = readAcceptedOverlay(tmpRoot);
        expect(overlay.overlays[proposal.hypothesis_id]).toBeDefined();
        expect(overlay.overlays[proposal.hypothesis_id].proposal_id).toBe(proposal.proposal_id);

        // After accept, the registry should reflect the new baseline.
        clearHypothesisRegistryCache();
        const after = getBaselineForExperiment("EXP_2B", tmpRoot)!;
        expect(after.plain_statement).toMatch(/REVISED/);
        // Provenance is attached.
        expect((after as { _overlay_provenance?: unknown })._overlay_provenance).toBeTruthy();
    });

    it("rejecting an accepted proposal removes the overlay", () => {
        const before = getBaselineForExperiment("EXP_2B", tmpRoot)!;
        const proposal = proposeBaselineUpdate(
            runId,
            {
                source_agent: "claude",
                experiment_id: "EXP_2B",
                proposed_baseline: { ...before, plain_statement: "REVISED-TEMPORARY" },
                reason: "rolling back",
            },
            tmpRoot,
        );
        acceptProposal(runId, proposal.proposal_id, "user:tsolomon89", null, tmpRoot);
        clearHypothesisRegistryCache();
        expect(getBaselineForExperiment("EXP_2B", tmpRoot)!.plain_statement).toMatch(/REVISED/);

        rejectProposal(runId, proposal.proposal_id, "user:tsolomon89", "decided otherwise", tmpRoot);
        const overlay = readAcceptedOverlay(tmpRoot);
        expect(overlay.overlays[proposal.hypothesis_id]).toBeUndefined();
        clearHypothesisRegistryCache();
        expect(getBaselineForExperiment("EXP_2B", tmpRoot)!.plain_statement).toBe(before.plain_statement);
    });

    it("rejects unknown experiment ids", () => {
        expect(() =>
            proposeBaselineUpdate(
                runId,
                {
                    source_agent: "claude",
                    experiment_id: "EXP_999",
                    proposed_baseline: { plain_statement: "x", expected_signature: {} },
                    reason: "test",
                },
                tmpRoot,
            ),
        ).toThrow();
    });

    it("requires accepted_by", () => {
        const before = getBaselineForExperiment("EXP_2B", tmpRoot)!;
        const p = proposeBaselineUpdate(
            runId,
            {
                source_agent: "claude",
                experiment_id: "EXP_2B",
                proposed_baseline: { ...before, plain_statement: "REVISED" },
                reason: "x",
            },
            tmpRoot,
        );
        expect(() => acceptProposal(runId, p.proposal_id, "", null, tmpRoot)).toThrow();
    });

    it("listProposals filters by status", () => {
        const before = getBaselineForExperiment("EXP_2B", tmpRoot)!;
        const a = proposeBaselineUpdate(
            runId,
            { source_agent: "claude", experiment_id: "EXP_2B", proposed_baseline: { ...before, plain_statement: "A" }, reason: "x" },
            tmpRoot,
        );
        const b = proposeBaselineUpdate(
            runId,
            { source_agent: "claude", experiment_id: "EXP_2B", proposed_baseline: { ...before, plain_statement: "B" }, reason: "y" },
            tmpRoot,
        );
        rejectProposal(runId, a.proposal_id, "user:tsolomon89", null, tmpRoot);
        const proposed = listProposals(runId, tmpRoot, "PROPOSED");
        const rejected = listProposals(runId, tmpRoot, "REJECTED");
        expect(proposed.map((p) => p.proposal_id)).toEqual([b.proposal_id]);
        expect(rejected.map((p) => p.proposal_id)).toEqual([a.proposal_id]);
    });

    it("loads canonical-only registry when overlays exist (Python load_registry apply_overlays=False)", () => {
        const before = getBaselineForExperiment("EXP_2B", tmpRoot)!;
        const p = proposeBaselineUpdate(
            runId,
            { source_agent: "claude", experiment_id: "EXP_2B", proposed_baseline: { ...before, plain_statement: "OVERLAY-WIN" }, reason: "x" },
            tmpRoot,
        );
        acceptProposal(runId, p.proposal_id, "user:tsolomon89", null, tmpRoot);
        clearHypothesisRegistryCache();
        // With overlays applied, baseline reflects overlay.
        const overlaid = getBaselineForExperiment("EXP_2B", tmpRoot)!;
        expect(overlaid.plain_statement).toBe("OVERLAY-WIN");

        // listing the registry returns the overlay-aware view; canonical files unchanged.
        const reg = loadHypothesisRegistry(tmpRoot);
        expect(reg.byExperimentId["EXP_2B"].plain_statement).toBe("OVERLAY-WIN");
        const canonicalFile = JSON.parse(fs.readFileSync(path.join(tmpRoot, "proof_kernel", "hypotheses", "program_2.json"), "utf-8"));
        const canonicalEntry = canonicalFile.hypotheses.find((h: { display_id: string }) => h.display_id === "P2-2");
        expect(canonicalEntry.plain_statement).not.toBe("OVERLAY-WIN");
    });
});

"""Tests for proof_kernel.hypothesis_proposals — propose / accept / reject lifecycle.

Mirrors __tests__/hypothesis-proposals.test.ts on the Python side. Each test
operates in an isolated tmp_path so canonical hypothesis JSONs in the repo are
never mutated.
"""

import json
import os
import shutil
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from proof_kernel.hypothesis_proposals import (  # noqa: E402
    OVERLAY_FILENAME,
    PROPOSAL_SCHEMA_VERSION,
    ProposalError,
    accept_proposal,
    apply_overlays_to_registry,
    get_accepted_overlay,
    get_proposal,
    get_proposal_audit,
    list_proposals,
    propose_baseline_update,
    reject_proposal,
)
from proof_kernel.hypothesis_registry import (  # noqa: E402
    REQUIRED_EXPERIMENT_IDS,
    get_baseline_for_experiment,
    load_registry,
)


REPO_ROOT = os.path.dirname(os.path.dirname(__file__))


def _mirror_repo(tmp_path) -> str:
    """Mirror the canonical hypothesis registry + module sources into tmp_path
    so each test runs against an isolated copy of the repo."""
    hyp_dir = tmp_path / "proof_kernel" / "hypotheses"
    hyp_dir.mkdir(parents=True)
    for f in ["program_1.json", "program_2.json", "controls.json", "pathfinders.json", "demonstrations.json"]:
        shutil.copyfile(os.path.join(REPO_ROOT, "proof_kernel", "hypotheses", f), hyp_dir / f)
    for f in ["__init__.py", "hypothesis_registry.py", "hypothesis_proposals.py"]:
        shutil.copyfile(os.path.join(REPO_ROOT, "proof_kernel", f), tmp_path / "proof_kernel" / f)
    return str(tmp_path)


@pytest.fixture
def repo(tmp_path):
    return _mirror_repo(tmp_path)


@pytest.fixture
def revised_baseline_payload(repo):
    """A valid revised-baseline payload referencing EXP_2B."""
    current = get_baseline_for_experiment("EXP_2B", repo)
    assert current is not None
    return {
        **current,
        "plain_statement": "REVISED phase-dependent residual envelope.",
        "expected_signature": {
            **current["expected_signature"],
            "primary_metric": "phase_aware_residual_envelope",
        },
    }


# ---------------------------------------------------------------------------
# Propose
# ---------------------------------------------------------------------------


class TestPropose:
    def test_creates_proposed_status_and_does_not_mutate_canonical(self, repo, revised_baseline_payload):
        before = get_baseline_for_experiment("EXP_2B", repo)
        proposal = propose_baseline_update(
            "run_test",
            {
                "source_agent": "claude",
                "experiment_id": "EXP_2B",
                "proposed_baseline": revised_baseline_payload,
                "reason": "evidence supports phase-dependent envelope",
                "evidence": ["max_abs_residual_dev=9.7"],
            },
            repo=repo,
        )
        assert proposal["status"] == "PROPOSED"
        assert proposal["proposal_id"].startswith("prop_")
        assert proposal["schema_version"] == PROPOSAL_SCHEMA_VERSION
        assert proposal["old_baseline_hash"] != proposal["new_baseline_hash"]

        # Canonical baseline UNCHANGED (no overlay applied yet).
        after = get_baseline_for_experiment("EXP_2B", repo)
        assert after["plain_statement"] == before["plain_statement"]

    def test_persists_to_disk_at_expected_path(self, repo, revised_baseline_payload):
        proposal = propose_baseline_update(
            "run_test",
            {
                "source_agent": "claude",
                "experiment_id": "EXP_2B",
                "proposed_baseline": revised_baseline_payload,
                "reason": "x",
            },
            repo=repo,
        )
        proposal_path = os.path.join(
            repo, "artifacts", "runs", "run_test", "hypothesis_proposals", f"{proposal['proposal_id']}.json"
        )
        assert os.path.exists(proposal_path)
        with open(proposal_path) as h:
            on_disk = json.load(h)
        assert on_disk["proposal_id"] == proposal["proposal_id"]
        assert on_disk["status"] == "PROPOSED"

    def test_rejects_unknown_experiment_id(self, repo):
        with pytest.raises(ProposalError, match="unknown experiment_id"):
            propose_baseline_update(
                "run_test",
                {
                    "source_agent": "claude",
                    "experiment_id": "EXP_999",
                    "proposed_baseline": {
                        "plain_statement": "x",
                        "expected_signature": {"primary_metric": "x"},
                    },
                    "reason": "x",
                },
                repo=repo,
            )

    @pytest.mark.parametrize("missing", ["source_agent", "experiment_id", "proposed_baseline", "reason"])
    def test_rejects_missing_required_fields(self, repo, revised_baseline_payload, missing):
        payload = {
            "source_agent": "claude",
            "experiment_id": "EXP_2B",
            "proposed_baseline": revised_baseline_payload,
            "reason": "x",
        }
        del payload[missing]
        with pytest.raises(ProposalError, match="missing"):
            propose_baseline_update("run_test", payload, repo=repo)

    def test_rejects_proposed_baseline_missing_required_fields(self, repo):
        with pytest.raises(ProposalError, match="proposed_baseline missing"):
            propose_baseline_update(
                "run_test",
                {
                    "source_agent": "claude",
                    "experiment_id": "EXP_2B",
                    "proposed_baseline": {"plain_statement": "x"},  # missing expected_signature
                    "reason": "x",
                },
                repo=repo,
            )


# ---------------------------------------------------------------------------
# Accept
# ---------------------------------------------------------------------------


class TestAccept:
    def test_writes_audit_and_applies_overlay(self, repo, revised_baseline_payload):
        proposal = propose_baseline_update(
            "run_test",
            {
                "source_agent": "claude",
                "experiment_id": "EXP_2B",
                "proposed_baseline": revised_baseline_payload,
                "reason": "evidence supports phase-dependent envelope",
            },
            repo=repo,
        )
        accepted = accept_proposal(
            "run_test",
            proposal["proposal_id"],
            "user:tsolomon89",
            note="approved",
            repo=repo,
        )
        assert accepted["status"] == "ACCEPTED"
        assert accepted["accepted_by"] == "user:tsolomon89"
        assert accepted["acceptance_note"] == "approved"

        audit = get_proposal_audit("run_test", proposal["proposal_id"], repo=repo)
        assert audit is not None
        assert audit["decision"] == "ACCEPTED"
        assert audit["decided_by"] == "user:tsolomon89"
        assert audit["old_baseline_hash"] == proposal["old_baseline_hash"]
        assert audit["new_baseline_hash"] == proposal["new_baseline_hash"]
        assert "EXP_2B" in audit["affected_experiments"]
        assert audit["old_baseline_snapshot"]["plain_statement"] == proposal["current_baseline"]["plain_statement"]
        assert audit["new_baseline_snapshot"]["plain_statement"] == revised_baseline_payload["plain_statement"]

        overlay = get_accepted_overlay(repo)
        active = overlay["overlays"].get(proposal["hypothesis_id"])
        assert active is not None
        assert active["proposal_id"] == proposal["proposal_id"]
        assert active["accepted_by"] == "user:tsolomon89"

        # Canonical files on disk are untouched.
        canonical_path = os.path.join(repo, "proof_kernel", "hypotheses", "program_2.json")
        with open(canonical_path) as h:
            canonical = json.load(h)
        canonical_p2_2 = next(h for h in canonical["hypotheses"] if h["display_id"] == "P2-2")
        assert canonical_p2_2["plain_statement"] != revised_baseline_payload["plain_statement"]

        # Loader, applying overlay, returns the revised baseline.
        registry = load_registry(repo)
        merged = registry["by_experiment_id"]["EXP_2B"]
        assert merged["plain_statement"] == revised_baseline_payload["plain_statement"]
        assert merged["_overlay_provenance"]["accepted_by"] == "user:tsolomon89"

    def test_apply_overlays_to_registry_is_idempotent(self, repo, revised_baseline_payload):
        proposal = propose_baseline_update(
            "run_test",
            {
                "source_agent": "claude",
                "experiment_id": "EXP_2B",
                "proposed_baseline": revised_baseline_payload,
                "reason": "x",
            },
            repo=repo,
        )
        accept_proposal("run_test", proposal["proposal_id"], "user:test", repo=repo)
        canonical = load_registry(repo, apply_overlays=False)
        once = apply_overlays_to_registry(canonical, repo)
        twice = apply_overlays_to_registry(once, repo)
        assert twice["by_experiment_id"]["EXP_2B"]["plain_statement"] == once["by_experiment_id"]["EXP_2B"]["plain_statement"]

    def test_canonical_only_load_skips_overlay(self, repo, revised_baseline_payload):
        before = get_baseline_for_experiment("EXP_2B", repo)
        proposal = propose_baseline_update(
            "run_test",
            {
                "source_agent": "claude",
                "experiment_id": "EXP_2B",
                "proposed_baseline": revised_baseline_payload,
                "reason": "x",
            },
            repo=repo,
        )
        accept_proposal("run_test", proposal["proposal_id"], "user:test", repo=repo)
        canonical = load_registry(repo, apply_overlays=False)
        # apply_overlays=False must return the unchanged canonical baseline.
        assert canonical["by_experiment_id"]["EXP_2B"]["plain_statement"] == before["plain_statement"]

    def test_rejects_empty_accepted_by(self, repo, revised_baseline_payload):
        proposal = propose_baseline_update(
            "run_test",
            {
                "source_agent": "claude",
                "experiment_id": "EXP_2B",
                "proposed_baseline": revised_baseline_payload,
                "reason": "x",
            },
            repo=repo,
        )
        with pytest.raises(ProposalError, match="accepted_by is required"):
            accept_proposal("run_test", proposal["proposal_id"], "", repo=repo)

    def test_cannot_accept_already_accepted_proposal(self, repo, revised_baseline_payload):
        proposal = propose_baseline_update(
            "run_test",
            {
                "source_agent": "claude",
                "experiment_id": "EXP_2B",
                "proposed_baseline": revised_baseline_payload,
                "reason": "x",
            },
            repo=repo,
        )
        accept_proposal("run_test", proposal["proposal_id"], "user:test", repo=repo)
        with pytest.raises(ProposalError, match="not in PROPOSED status"):
            accept_proposal("run_test", proposal["proposal_id"], "user:test", repo=repo)

    def test_rejects_unknown_proposal_id(self, repo):
        with pytest.raises(ProposalError, match="proposal not found"):
            accept_proposal("run_test", "prop_does_not_exist", "user:test", repo=repo)


# ---------------------------------------------------------------------------
# Reject
# ---------------------------------------------------------------------------


class TestReject:
    def test_reject_proposed_writes_audit_and_no_overlay(self, repo, revised_baseline_payload):
        proposal = propose_baseline_update(
            "run_test",
            {
                "source_agent": "claude",
                "experiment_id": "EXP_2B",
                "proposed_baseline": revised_baseline_payload,
                "reason": "x",
            },
            repo=repo,
        )
        rejected = reject_proposal(
            "run_test",
            proposal["proposal_id"],
            "user:test",
            reason="not aligned with route",
            repo=repo,
        )
        assert rejected["status"] == "REJECTED"
        assert rejected["rejected_by"] == "user:test"
        assert rejected["rejection_reason"] == "not aligned with route"

        audit = get_proposal_audit("run_test", proposal["proposal_id"], repo=repo)
        assert audit["decision"] == "REJECTED"
        assert audit["previous_status"] == "PROPOSED"
        assert audit["reason"] == "not aligned with route"

        # Overlay has no entry for this hypothesis.
        overlay = get_accepted_overlay(repo)
        assert proposal["hypothesis_id"] not in overlay.get("overlays", {})

    def test_reject_accepted_proposal_removes_overlay(self, repo, revised_baseline_payload):
        before = get_baseline_for_experiment("EXP_2B", repo)
        proposal = propose_baseline_update(
            "run_test",
            {
                "source_agent": "claude",
                "experiment_id": "EXP_2B",
                "proposed_baseline": revised_baseline_payload,
                "reason": "x",
            },
            repo=repo,
        )
        accept_proposal("run_test", proposal["proposal_id"], "user:test", repo=repo)
        # Sanity: registry now reflects revision.
        assert get_baseline_for_experiment("EXP_2B", repo)["plain_statement"] == revised_baseline_payload["plain_statement"]

        reject_proposal(
            "run_test",
            proposal["proposal_id"],
            "user:test",
            reason="rolling back",
            repo=repo,
        )
        overlay = get_accepted_overlay(repo)
        assert proposal["hypothesis_id"] not in overlay.get("overlays", {})
        # Registry now reflects canonical baseline again.
        assert get_baseline_for_experiment("EXP_2B", repo)["plain_statement"] == before["plain_statement"]

        audit = get_proposal_audit("run_test", proposal["proposal_id"], repo=repo)
        assert audit["previous_status"] == "ACCEPTED"

    def test_rejects_empty_rejected_by(self, repo, revised_baseline_payload):
        proposal = propose_baseline_update(
            "run_test",
            {
                "source_agent": "claude",
                "experiment_id": "EXP_2B",
                "proposed_baseline": revised_baseline_payload,
                "reason": "x",
            },
            repo=repo,
        )
        with pytest.raises(ProposalError, match="rejected_by is required"):
            reject_proposal("run_test", proposal["proposal_id"], "", repo=repo)

    def test_cannot_reject_already_rejected_proposal(self, repo, revised_baseline_payload):
        proposal = propose_baseline_update(
            "run_test",
            {
                "source_agent": "claude",
                "experiment_id": "EXP_2B",
                "proposed_baseline": revised_baseline_payload,
                "reason": "x",
            },
            repo=repo,
        )
        reject_proposal("run_test", proposal["proposal_id"], "user:test", repo=repo)
        with pytest.raises(ProposalError, match="cannot be rejected from status=REJECTED"):
            reject_proposal("run_test", proposal["proposal_id"], "user:test", repo=repo)


# ---------------------------------------------------------------------------
# Listing + getters
# ---------------------------------------------------------------------------


class TestListAndGet:
    def test_list_filters_by_status(self, repo, revised_baseline_payload):
        a = propose_baseline_update(
            "run_test",
            {"source_agent": "claude", "experiment_id": "EXP_2B", "proposed_baseline": {**revised_baseline_payload, "plain_statement": "A"}, "reason": "x"},
            repo=repo,
        )
        b = propose_baseline_update(
            "run_test",
            {"source_agent": "claude", "experiment_id": "EXP_2B", "proposed_baseline": {**revised_baseline_payload, "plain_statement": "B"}, "reason": "x"},
            repo=repo,
        )
        reject_proposal("run_test", a["proposal_id"], "user:test", repo=repo)

        proposed = list_proposals("run_test", repo=repo, status="PROPOSED")
        rejected = list_proposals("run_test", repo=repo, status="REJECTED")
        assert [p["proposal_id"] for p in proposed] == [b["proposal_id"]]
        assert [p["proposal_id"] for p in rejected] == [a["proposal_id"]]

    def test_list_excludes_audit_files(self, repo, revised_baseline_payload):
        proposal = propose_baseline_update(
            "run_test",
            {
                "source_agent": "claude",
                "experiment_id": "EXP_2B",
                "proposed_baseline": revised_baseline_payload,
                "reason": "x",
            },
            repo=repo,
        )
        reject_proposal("run_test", proposal["proposal_id"], "user:test", repo=repo)
        items = list_proposals("run_test", repo=repo)
        # Listing should return exactly one entry — the proposal — not the audit file.
        assert len(items) == 1
        assert items[0]["proposal_id"] == proposal["proposal_id"]

    def test_get_proposal_returns_none_for_unknown(self, repo):
        assert get_proposal("run_test", "prop_unknown", repo=repo) is None
        assert get_proposal_audit("run_test", "prop_unknown", repo=repo) is None


# ---------------------------------------------------------------------------
# Cross-cutting: every required experiment is proposable
# ---------------------------------------------------------------------------


class TestCrossCutting:
    @pytest.mark.parametrize("exp_id", REQUIRED_EXPERIMENT_IDS)
    def test_every_registered_experiment_can_receive_a_proposal(self, repo, exp_id):
        current = get_baseline_for_experiment(exp_id, repo)
        assert current is not None, f"{exp_id} has no canonical baseline"
        proposal = propose_baseline_update(
            "run_test",
            {
                "source_agent": "claude",
                "experiment_id": exp_id,
                "proposed_baseline": {
                    **current,
                    "plain_statement": f"REVISED probe for {exp_id}",
                },
                "reason": "coverage probe",
            },
            repo=repo,
        )
        assert proposal["experiment_id"] == exp_id
        assert proposal["status"] == "PROPOSED"
        assert proposal["hypothesis_id"] == current["hypothesis_id"]

    def test_overlay_filename_constant_is_used(self, repo, revised_baseline_payload):
        proposal = propose_baseline_update(
            "run_test",
            {
                "source_agent": "claude",
                "experiment_id": "EXP_2B",
                "proposed_baseline": revised_baseline_payload,
                "reason": "x",
            },
            repo=repo,
        )
        accept_proposal("run_test", proposal["proposal_id"], "user:test", repo=repo)
        assert os.path.exists(os.path.join(repo, "proof_kernel", "hypotheses", OVERLAY_FILENAME))

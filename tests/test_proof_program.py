"""Tests for the proof-ladder computation in verifier._build_proof_program().

Covers the six load-bearing assertions from the proof-target plan (Phase D.1):
  1. Topological ordering is respected.
  2. Cycles raise ValueError.
  3. Unmet depends_on -> BLOCKED with the prereq in blocked_by.
  4. GAP.blocker_for -> BLOCKED with the gap id in blocked_by.
  5. WITNESSED requires both AUTHORITATIVE fidelity AND SIGNED_OFF mapping.
  6. CONJECTURAL is the default.

Run with:  pytest tests/test_proof_program.py
"""

from __future__ import annotations

import copy
import os
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import verifier  # noqa: E402


def _fixture_template(obligations, open_gaps=None):
    """Build a minimal PROOF_PROGRAM_TEMPLATE-shaped dict for testing."""
    return {
        "theorem_candidate": {
            "formal_statement": "test",
            "plain_language": "test",
            "non_claims": [],
            "working_gauge": {"base": "tau", "unique": False},
        },
        "obligations": obligations,
        "open_gaps": open_gaps or [],
    }


def _obl(oid, depends_on=None, program="PROGRAM_1"):
    return {
        "id": oid,
        "title": oid,
        "statement": "test",
        "status": "CONJECTURAL",
        "witnesses": [],
        "depends_on": depends_on or [],
        "program": program,
        "inference": {
            "inference_scope": "test",
            "allowed_conclusion": [],
            "disallowed_conclusion": ["This obligation alone proves the theorem candidate."],
        },
    }


def _witness_entry(obligation_id, outcome="CONSISTENT", provisional=False):
    return {
        "function": "PROOF_OBLIGATION_WITNESS",
        "outcome": outcome,
        "obligation_id": obligation_id,
        "provisional": provisional,
    }


def _build(template, experiments, fidelity, signed_off, has_proof=None):
    with patch.object(verifier, "PROOF_PROGRAM_TEMPLATE", template):
        return verifier._build_proof_program(
            experiments,
            fidelity,
            witness_map_review_status="SIGNED_OFF" if signed_off else "PENDING_SIGNOFF",
            has_formal_proof_artifact=has_proof,
        )


# 1. Topological ordering is respected.
def test_topological_order_resolves_upstream_before_downstream():
    # A (foundation) -> B (depends on A) -> C (depends on B).
    # B is WITNESSED at AUTHORITATIVE + SIGNED_OFF. C must therefore compute
    # against a resolved B and, since A is still CONJECTURAL, C should be
    # BLOCKED with "A" in blocked_by — not BLOCKED with "B" which is already
    # WITNESSED.
    template = _fixture_template([
        _obl("C", depends_on=["A", "B"]),
        _obl("B", depends_on=["A"]),
        _obl("A"),
    ])
    experiments = {"EXP_B": _witness_entry("B")}
    prog = _build(template, experiments, fidelity="AUTHORITATIVE", signed_off=True)
    by_id = {o["id"]: o for o in prog["obligations"]}
    assert by_id["A"]["status"] == "CONJECTURAL"
    assert by_id["B"]["status"] == "WITNESSED"
    assert by_id["C"]["status"] == "BLOCKED"
    assert "A" in by_id["C"]["blocked_by"]
    assert "B" not in by_id["C"]["blocked_by"]


# 2. Cycles raise.
def test_cycle_in_depends_on_raises():
    template = _fixture_template([
        _obl("A", depends_on=["B"]),
        _obl("B", depends_on=["A"]),
    ])
    with pytest.raises(ValueError, match="cycle"):
        _build(template, {}, fidelity="AUTHORITATIVE", signed_off=True)


# 3. Unmet depends_on -> BLOCKED.
def test_unmet_prereq_marks_blocked():
    template = _fixture_template([
        _obl("FOUNDATION"),
        _obl("DOWNSTREAM", depends_on=["FOUNDATION"]),
    ])
    prog = _build(template, {}, fidelity="AUTHORITATIVE", signed_off=True)
    by_id = {o["id"]: o for o in prog["obligations"]}
    assert by_id["FOUNDATION"]["status"] == "CONJECTURAL"
    assert by_id["DOWNSTREAM"]["status"] == "BLOCKED"
    assert by_id["DOWNSTREAM"]["blocked_by"] == ["FOUNDATION"]


# 4. GAP blocker -> BLOCKED even with depends_on satisfied.
def test_open_gap_blocker_forces_blocked():
    template = _fixture_template(
        [_obl("X")],
        open_gaps=[
            {
                "id": "GAP_FORMAL_PROOF",
                "title": "test",
                "description": "test",
                "blocker_for": ["X"],
            }
        ],
    )
    prog = _build(template, {}, fidelity="AUTHORITATIVE", signed_off=True)
    by_id = {o["id"]: o for o in prog["obligations"]}
    assert by_id["X"]["status"] == "BLOCKED"
    assert "GAP_FORMAL_PROOF" in by_id["X"]["blocked_by"]


# 5a. WITNESSED requires AUTHORITATIVE fidelity.
def test_witnessed_requires_authoritative_fidelity():
    template = _fixture_template([_obl("A")])
    experiments = {"EXP_A": _witness_entry("A")}
    prog = _build(template, experiments, fidelity="STANDARD", signed_off=True)
    by_id = {o["id"]: o for o in prog["obligations"]}
    assert by_id["A"]["status"] != "WITNESSED"
    assert by_id["A"]["status"] == "CONJECTURAL"


# 5b. WITNESSED requires SIGNED_OFF witness-map review.
def test_witnessed_requires_signed_off_mapping():
    template = _fixture_template([_obl("A")])
    experiments = {"EXP_A": _witness_entry("A")}
    prog = _build(template, experiments, fidelity="AUTHORITATIVE", signed_off=False)
    by_id = {o["id"]: o for o in prog["obligations"]}
    assert by_id["A"]["status"] != "WITNESSED"


# 5c. Both together (and only then) -> WITNESSED.
def test_witnessed_when_both_conditions_hold():
    template = _fixture_template([_obl("A")])
    experiments = {"EXP_A": _witness_entry("A")}
    prog = _build(template, experiments, fidelity="AUTHORITATIVE", signed_off=True)
    by_id = {o["id"]: o for o in prog["obligations"]}
    assert by_id["A"]["status"] == "WITNESSED"
    assert by_id["A"]["blocked_by"] == []


# 6. CONJECTURAL is the default.
def test_conjectural_is_default_when_nothing_blocks_or_witnesses():
    template = _fixture_template([_obl("A")])
    prog = _build(template, {}, fidelity="AUTHORITATIVE", signed_off=True)
    by_id = {o["id"]: o for o in prog["obligations"]}
    assert by_id["A"]["status"] == "CONJECTURAL"
    assert by_id["A"]["blocked_by"] == []


# Bonus: PROVEN takes precedence over WITNESSED.
def test_formal_proof_artifact_takes_precedence_over_witness():
    template = _fixture_template([_obl("A")])
    experiments = {"EXP_A": _witness_entry("A")}
    prog = _build(
        template,
        experiments,
        fidelity="AUTHORITATIVE",
        signed_off=True,
        has_proof=lambda oid: oid == "A",
    )
    by_id = {o["id"]: o for o in prog["obligations"]}
    assert by_id["A"]["status"] == "PROVEN"


# Integration: the real PROOF_PROGRAM_TEMPLATE resolves without error and the
# load-bearing OBL_EXACT_RH_TRANSPORT is BLOCKED in the current repo state
# (PENDING witness-map sign-off + GAP_RH_PREDICATE_TRANSPORT).
def test_real_template_yields_expected_initial_statuses():
    prog = verifier._build_proof_program({}, fidelity_tier="AUTHORITATIVE")
    by_id = {o["id"]: o for o in prog["obligations"]}
    # OBL_EXACT_RH_TRANSPORT has a GAP_RH_PREDICATE_TRANSPORT blocker AND unmet
    # prereqs; either way it must be BLOCKED.
    assert by_id["OBL_EXACT_RH_TRANSPORT"]["status"] == "BLOCKED"
    assert "GAP_RH_PREDICATE_TRANSPORT" in by_id["OBL_EXACT_RH_TRANSPORT"]["blocked_by"]
    # The foundation obligation has no depends_on and no referencing gap.
    assert by_id["OBL_COORD_RECONSTRUCTION_COVARIANCE"]["status"] == "CONJECTURAL"

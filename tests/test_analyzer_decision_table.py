"""Decision-table: rule selection."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from analyzer.decision_table import Severity, evaluate_headline  # noqa: E402
from analyzer.decompose import decompose_run  # noqa: E402
from analyzer.obligation_diff import ObligationMovement  # noqa: E402


def _exp(function, program="PROGRAM_1", outcome="CONSISTENT", status="PASS", **extra):
    base = {
        "function": function,
        "program": program,
        "outcome": outcome,
        "status": status,
        "epistemic_level": "EMPIRICAL",
        "stage": "gauge",
        "metrics": {},
        "interpretation": "",
        "inference": {"allowed_conclusion": [], "disallowed_conclusion": []},
    }
    base.update(extra)
    return base


def _decompose(experiments, **summary_extra):
    summary = {
        "engine_status": "OK",
        "schema_version": "2026.05.0",
        "fidelity_tier": "AUTHORITATIVE",
        "overall": "FAIL",
        "experiments": experiments,
        "stage_verdicts": {},
        "proof_program": {"obligations": []},
    }
    summary.update(summary_extra)
    return decompose_run({"meta": {}, "summary": summary})


def _no_movement(total=23):
    return ObligationMovement(
        total_runs=total,
        runs_with_movement=0,
        current_diff={},
        prior_timestamp=None,
        current_timestamp=None,
    )


def test_rule_1_broken_control_blocks_everything():
    # Even a clean theorem-positive cannot override a broken control.
    d = _decompose({
        "EXP_1B": _exp("CONTROL", outcome="IMPLEMENTATION_BROKEN", status="FAIL"),
        "EXP_6": _exp("PROOF_OBLIGATION_WITNESS", outcome="CONSISTENT"),
    })
    h = evaluate_headline(d, _no_movement())
    assert h.rule_id == 1
    assert h.severity == Severity.BLOCKING
    assert "EXP_1B" in h.headline


def test_rule_2_engine_status_not_ok():
    d = _decompose({}, engine_status="DEGRADED")
    h = evaluate_headline(d, _no_movement())
    assert h.rule_id == 2
    assert h.severity == Severity.BLOCKING


def test_rule_3_decisive_negative():
    d = _decompose(
        {
            "EXP_6": _exp(
                "PROOF_OBLIGATION_WITNESS",
                outcome="INCONSISTENT",
                status="FAIL",
                obligation_id="OBL_BETA_INVARIANCE",
                # No mapping_provisional, no provisional.
            ),
        },
        proof_program={
            "obligations": [{"id": "OBL_BETA_INVARIANCE", "status": "BLOCKED"}],
            "witness_map_review": {"status": "SIGNED_OFF"},
        },
    )
    h = evaluate_headline(d, _no_movement())
    assert h.rule_id == 3
    assert h.severity == Severity.DECISIVE_NEGATIVE


def test_rule_4_non_decisive_due_to_mapping_provisional_matches_current_run():
    # This is the scenario the user complained about: EXP_6 is INCONSISTENT
    # but the witness mapping is not signed off.
    d = _decompose(
        {
            "EXP_6": _exp(
                "PROOF_OBLIGATION_WITNESS",
                outcome="INCONSISTENT",
                status="FAIL",
                obligation_id="OBL_BETA_INVARIANCE",
                mapping_provisional=True,
            ),
        },
        proof_program={
            "obligations": [],
            "witness_map_review": {"status": "PENDING_SIGNOFF"},
        },
    )
    h = evaluate_headline(d, _no_movement())
    assert h.rule_id == 4
    assert h.severity == Severity.NON_DECISIVE_NEGATIVE
    assert "EXP_6" in h.headline
    assert "PENDING_SIGNOFF" in h.headline


def test_rule_4_non_decisive_due_to_smoke_tier_provisional():
    d = _decompose(
        {
            "EXP_6": _exp(
                "PROOF_OBLIGATION_WITNESS",
                outcome="INCONSISTENT",
                status="FAIL",
                obligation_id="OBL_BETA_INVARIANCE",
                provisional=True,
            ),
        },
        fidelity_tier="STANDARD",
    )
    h = evaluate_headline(d, _no_movement())
    assert h.rule_id == 4
    assert "fidelity-provisional" in h.headline


def test_rule_5_status_quo_when_no_movement_and_no_negative():
    d = _decompose({
        "EXP_1": _exp("COHERENCE_WITNESS", outcome="CONSISTENT"),
        "EXP_1B": _exp("CONTROL", outcome="IMPLEMENTATION_OK"),
    })
    h = evaluate_headline(d, _no_movement())
    assert h.rule_id == 5
    assert h.severity == Severity.STATUS_QUO


def test_rule_6_decisive_positive_requires_signed_off_mapping():
    d = _decompose(
        {
            "EXP_6": _exp(
                "PROOF_OBLIGATION_WITNESS",
                outcome="CONSISTENT",
                status="PASS",
                obligation_id="OBL_BETA_INVARIANCE",
            ),
        },
        proof_program={
            "obligations": [{"id": "OBL_BETA_INVARIANCE", "status": "WITNESSED"}],
            "witness_map_review": {"status": "SIGNED_OFF"},
        },
    )
    h = evaluate_headline(d, _no_movement())
    assert h.rule_id == 6
    assert h.severity == Severity.POSITIVE


def test_rule_6_does_not_fire_when_mapping_pending():
    # Same as above but witness map review is PENDING_SIGNOFF -> falls through
    # to rule 5 (status quo).
    d = _decompose(
        {
            "EXP_6": _exp(
                "PROOF_OBLIGATION_WITNESS",
                outcome="CONSISTENT",
                status="PASS",
                obligation_id="OBL_BETA_INVARIANCE",
            ),
        },
        proof_program={
            "obligations": [{"id": "OBL_BETA_INVARIANCE", "status": "WITNESSED"}],
            "witness_map_review": {"status": "PENDING_SIGNOFF"},
        },
    )
    h = evaluate_headline(d, _no_movement())
    assert h.rule_id == 5  # falls through

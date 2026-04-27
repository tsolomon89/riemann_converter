"""Decomposition: bucket experiments by canonical axes."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from analyzer.decompose import (  # noqa: E402
    consistency_check,
    decompose_run,
    _normalize_stage_verdicts,
)


def _exp(function, program="PROGRAM_1", outcome="CONSISTENT", status="PASS", **extra):
    base = {
        "function": function,
        "program": program,
        "outcome": outcome,
        "status": status,
        "epistemic_level": "EMPIRICAL",
        "stage": "gauge",
        "metrics": {},
        "interpretation": "test",
        "inference": {"allowed_conclusion": [], "disallowed_conclusion": []},
    }
    base.update(extra)
    return base


def _run(experiments, **summary_extra):
    summary = {
        "engine_status": "OK",
        "schema_version": "2026.05.0",
        "fidelity_tier": "AUTHORITATIVE",
        "fidelity_zeros": 20000,
        "fidelity_dps": 80,
        "overall": "FAIL",
        "experiments": experiments,
        "stage_verdicts": {},
        "proof_program": {"obligations": []},
    }
    summary.update(summary_extra)
    return {"meta": {}, "summary": summary}


def test_buckets_by_function_and_program():
    run = _run({
        "EXP_1": _exp("COHERENCE_WITNESS"),
        "EXP_1B": _exp("CONTROL", outcome="IMPLEMENTATION_OK"),
        "EXP_2": _exp("EXPLORATORY", program="PROGRAM_2", outcome="INCONSISTENT", status="FAIL"),
        "EXP_6": _exp("PROOF_OBLIGATION_WITNESS", outcome="INCONSISTENT", status="FAIL",
                      obligation_id="OBL_BETA_INVARIANCE", mapping_provisional=True),
    })
    d = decompose_run(run)

    assert {r.exp_id for r in d.by_function["COHERENCE_WITNESS"]} == {"EXP_1"}
    assert {r.exp_id for r in d.by_function["PROOF_OBLIGATION_WITNESS"]} == {"EXP_6"}
    assert {r.exp_id for r in d.by_function["CONTROL"]} == {"EXP_1B"}
    assert {r.exp_id for r in d.by_program["PROGRAM_2"]} == {"EXP_2"}


def test_mapping_provisional_surfaces_on_witness():
    run = _run({
        "EXP_6": _exp("PROOF_OBLIGATION_WITNESS", outcome="INCONSISTENT", status="FAIL",
                      obligation_id="OBL_BETA_INVARIANCE", mapping_provisional=True),
    })
    d = decompose_run(run)
    [exp6] = d.experiments
    assert exp6.mapping_provisional is True
    assert exp6.obligation_id == "OBL_BETA_INVARIANCE"


def test_iteration_order_is_canonical():
    run = _run({
        # Insertion order intentionally reversed.
        "EXP_8": _exp("REGRESSION_CHECK", outcome="IMPLEMENTATION_OK"),
        "EXP_1": _exp("COHERENCE_WITNESS"),
        "EXP_6": _exp("PROOF_OBLIGATION_WITNESS"),
    })
    d = decompose_run(run)
    ids = [r.exp_id for r in d.experiments]
    assert ids == ["EXP_1", "EXP_6", "EXP_8"]


def test_normalize_stage_verdicts_handles_dict_and_string_shapes():
    raw = {
        "old_string_form": "REFUTES",
        "rich_object_form": {"status": "REFUTES", "reason": "...", "members": []},
        "missing_status": {"reason": "no status field"},
    }
    out = _normalize_stage_verdicts(raw)
    assert out == {"old_string_form": "REFUTES", "rich_object_form": "REFUTES"}


def test_consistency_check_clean_run_returns_no_warnings():
    run = _run({"EXP_1": _exp("COHERENCE_WITNESS")})
    assert consistency_check(run, []) == []


def test_consistency_check_flags_fingerprint_mismatch():
    run = {
        "meta": {"code_fingerprint": {"verifier.py": "AAA", "run_exp1.py": "BBB"}},
        "summary": {
            "engine_status": "OK",
            "schema_version": "2026.05.0",
            "fidelity_tier": "AUTHORITATIVE",
            "experiments": {},
            "stage_verdicts": {},
            "proof_program": {"obligations": []},
        },
    }
    history = [
        {"timestamp": "t1", "code_fingerprint": {"verifier.py": "ZZZ", "run_exp1.py": "BBB"}}
    ]
    warnings = consistency_check(run, history)
    assert any("verifier.py" in w for w in warnings)


def test_consistency_check_flags_unmapped_witness():
    run = {
        "meta": {},
        "summary": {
            "engine_status": "OK",
            "schema_version": "2026.05.0",
            "fidelity_tier": "AUTHORITATIVE",
            "experiments": {
                "EXP_6": _exp("PROOF_OBLIGATION_WITNESS",
                              obligation_id="OBL_NONEXISTENT"),
            },
            "stage_verdicts": {},
            "proof_program": {"obligations": [{"id": "OBL_OTHER", "status": "BLOCKED"}]},
        },
    }
    warnings = consistency_check(run, [])
    assert any("OBL_NONEXISTENT" in w for w in warnings)


def test_obligation_statuses_extracted_from_proof_program():
    run = _run(
        {"EXP_1": _exp("COHERENCE_WITNESS")},
        proof_program={
            "obligations": [
                {"id": "OBL_A", "status": "BLOCKED"},
                {"id": "OBL_B", "status": "CONJECTURAL"},
            ],
        },
    )
    d = decompose_run(run)
    assert d.obligation_statuses == {"OBL_A": "BLOCKED", "OBL_B": "CONJECTURAL"}

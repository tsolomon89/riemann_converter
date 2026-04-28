"""Render a synthetic Rule-4 run end-to-end and diff against a checked-in
golden Markdown fixture. The fixture is small and human-reviewable; if
intentional changes to render.py make the golden out of date, regenerate it
with `python -m analyzer --run <synthetic_run.json> --stdout` (or by
re-running this module with REGEN=1)."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from analyzer.decision_table import evaluate_headline  # noqa: E402
from analyzer.decompose import attach_history_timestamp, decompose_run  # noqa: E402
from analyzer.obligation_diff import obligation_movement  # noqa: E402
from analyzer.render import Report, render_report  # noqa: E402

GOLDEN_PATH = os.path.join(
    os.path.dirname(__file__), "fixtures", "analyzer", "golden", "run-rule4.md"
)


def _exp(function, **extra):
    base = {
        "function": function,
        "program": "PROGRAM_1",
        "outcome": "CONSISTENT",
        "status": "PASS",
        "epistemic_level": "EMPIRICAL",
        "stage": "gauge",
        "metrics": {},
        "interpretation": "",
        "inference": {
            "allowed_conclusion": [],
            "disallowed_conclusion": ["The theorem candidate is proved."],
        },
    }
    base.update(extra)
    return base


def _build_rule4_run():
    return {
        "meta": {"run_timestamp": "2099-01-01T00:00:00Z"},
        "summary": {
            "engine_status": "OK",
            "schema_version": "2026.05.0",
            "fidelity_tier": "AUTHORITATIVE",
            "fidelity_zeros": 20000,
            "fidelity_dps": 80,
            "overall": "FAIL",
            "experiments": {
                "EXP_1": _exp("COHERENCE_WITNESS", stage="gauge",
                              interpretation="Gauge isometry exact.",
                              metrics={"max_drift": 0.0}),
                "EXP_1B": _exp("CONTROL", outcome="IMPLEMENTATION_OK",
                               stage="gauge", interpretation="Falsifier armed."),
                "EXP_1C": _exp("COHERENCE_WITNESS", outcome="INCONSISTENT",
                               status="FAIL", stage="lattice",
                               interpretation="Zero-scaling missed tolerance."),
                "EXP_3": _exp("CONTROL", outcome="IMPLEMENTATION_OK",
                              stage="control",
                              interpretation="Beta=Pi diverged as expected."),
                "EXP_6": _exp(
                    "PROOF_OBLIGATION_WITNESS",
                    outcome="INCONSISTENT",
                    status="FAIL",
                    stage="gauge",
                    obligation_id="OBL_BETA_INVARIANCE",
                    mapping_provisional=True,
                    metrics={"beta_hat": 0.57, "drift": 0.07},
                    interpretation="Beta drift detected.",
                    inference={
                        "allowed_conclusion": ["beta_hat=1/2 on tested k."],
                        "disallowed_conclusion": [
                            "OBL_BETA_INVARIANCE is formally proven.",
                            "The theorem candidate is proved.",
                        ],
                    },
                ),
            },
            "stage_verdicts": {
                "gauge": "REFUTES",
                "lattice": "REFUTES",
                "control": "SUPPORTS",
            },
            "proof_program": {
                "obligations": [{"id": "OBL_BETA_INVARIANCE", "status": "BLOCKED"}],
                "witness_map_review": {"status": "PENDING_SIGNOFF"},
            },
        },
    }


def _render_rule4():
    run = _build_rule4_run()
    history = [
        {
            "timestamp": "2099-01-01T00:00:00Z",
            "obligation_statuses": {"OBL_BETA_INVARIANCE": "BLOCKED"},
        }
    ]
    d = attach_history_timestamp(decompose_run(run), history)
    m = obligation_movement(history)
    h = evaluate_headline(d, m)
    return render_report(Report(run=d, movement=m, headline=h))


def test_rule4_render_matches_golden():
    actual = _render_rule4()
    if os.environ.get("REGEN") == "1":
        with open(GOLDEN_PATH, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(actual)
        return
    with open(GOLDEN_PATH, "r", encoding="utf-8") as fh:
        expected = fh.read()
    assert actual == expected, (
        "Rendered Markdown differs from golden fixture. If the change is "
        "intentional, regenerate via REGEN=1 python -m pytest "
        "tests/test_analyzer_render_golden.py."
    )


def test_rule4_render_contains_required_sections():
    """Even if the golden is regenerated, these sections must always exist."""
    md = _render_rule4()
    for section in (
        "## Headline",
        "## Theorem-Relevant Findings",
        "## Coherence Panel",
        "## Controls",
        "## Pathfinders",
        "## Contradiction Track - Formalization Incomplete",
        "## Stage Cross-Check",
        "## Obligation Movement",
        "## Caveats",
        "## Raw Per-Experiment Table",
    ):
        assert section in md, f"missing section: {section}"


def test_rule4_render_flags_mapping_provisional_in_headline():
    md = _render_rule4()
    assert "Rule 4" in md
    assert "NON_DECISIVE_NEGATIVE" in md
    assert "PENDING_SIGNOFF" in md
    assert "EXP_6" in md

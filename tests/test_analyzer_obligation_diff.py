"""Obligation-movement counter and current-vs-prior diff."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from analyzer.obligation_diff import obligation_movement  # noqa: E402


def _entry(ts, **statuses):
    return {"timestamp": ts, "obligation_statuses": statuses}


def test_empty_history():
    m = obligation_movement([])
    assert m.total_runs == 0
    assert m.runs_with_movement == 0
    assert m.current_diff == {}


def test_no_movement_across_three_identical_runs():
    history = [
        _entry("t1", OBL_A="BLOCKED", OBL_B="CONJECTURAL"),
        _entry("t2", OBL_A="BLOCKED", OBL_B="CONJECTURAL"),
        _entry("t3", OBL_A="BLOCKED", OBL_B="CONJECTURAL"),
    ]
    m = obligation_movement(history)
    assert m.total_runs == 3
    assert m.runs_with_movement == 0
    assert m.current_diff == {}


def test_movement_detected():
    history = [
        _entry("t1", OBL_A="BLOCKED"),
        _entry("t2", OBL_A="WITNESSED"),
    ]
    m = obligation_movement(history)
    assert m.runs_with_movement == 1
    assert m.current_diff == {"OBL_A": ("BLOCKED", "WITNESSED")}
    assert m.prior_timestamp == "t1"
    assert m.current_timestamp == "t2"


def test_legacy_entries_without_obligation_block_treated_as_empty():
    # Old schema entries lack obligation_statuses; this MUST NOT spuriously
    # report movement when transitioning between schema versions.
    history = [
        {"timestamp": "t1"},  # no obligation_statuses key at all
        _entry("t2", OBL_A="BLOCKED"),
        _entry("t3", OBL_A="BLOCKED"),
    ]
    m = obligation_movement(history)
    # t1 -> t2 IS a movement (empty -> {OBL_A: BLOCKED}). t2 -> t3 is not.
    assert m.runs_with_movement == 1
    assert m.current_diff == {}  # t2 vs t3 (latest pair) — unchanged

from __future__ import annotations

import copy
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import verifier  # noqa: E402


def _isolate_history(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(verifier, "HISTORY_FILE", str(tmp_path / "verdict_history.jsonl"))


def _base_artifact() -> dict:
    return {
        "meta": {
            "schema_version": "2026.05.0",
            "zeros": 2000,
            "dps": 50,
            "zero_source_info": {"declared_decimals": 9},
        },
        "experiment_8": {
            "per_k": {
                "0": {
                    "scale": 1.0,
                    "metrics": {
                        "p99_abs_dev": 1.0e-9,
                        "p95_residual": 1.2e-9,
                    },
                },
                "2": {
                    "scale": 39.47841760435743,  # tau^2
                    "metrics": {
                        "p99_abs_dev": 2.0e-8,
                        "p95_residual": 1.4e-9,
                    },
                },
            }
        },
    }


def test_exp8_passes_with_scale_normalized_source_limited_tolerance(monkeypatch, tmp_path) -> None:
    _isolate_history(monkeypatch, tmp_path)
    data = _base_artifact()
    out = verifier.run_verification(copy.deepcopy(data))
    assert out is not None
    exp8 = out["summary"]["experiments"]["EXP_8"]
    assert exp8["status"] == "PASS"
    assert exp8["outcome"] == "IMPLEMENTATION_OK"
    assert exp8["metrics"]["worst_p99_abs_dev_normalized"] <= exp8["metrics"]["tol_zero"]
    assert exp8["metrics"]["tol_residual"] >= exp8["metrics"]["tol_residual_source"]


def test_exp8_fails_when_normalized_deviation_exceeds_tol_zero(monkeypatch, tmp_path) -> None:
    _isolate_history(monkeypatch, tmp_path)
    data = _base_artifact()
    data["experiment_8"]["per_k"]["2"]["metrics"]["p99_abs_dev"] = 8.0e-7
    out = verifier.run_verification(copy.deepcopy(data))
    assert out is not None
    exp8 = out["summary"]["experiments"]["EXP_8"]
    assert exp8["status"] == "FAIL"
    assert exp8["outcome"] == "IMPLEMENTATION_BROKEN"
    assert exp8["metrics"]["worst_p99_abs_dev_normalized"] > exp8["metrics"]["tol_zero"]

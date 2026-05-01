"""Reset active run artifacts to an explicit no-current-run state.

This intentionally does not touch canonical mathematical assets under data/
or the data migration audit report under public/data_migration_report.json.
"""

from __future__ import annotations

import glob
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import riemann_math  # noqa: E402
import verifier  # noqa: E402


def _assert_inside_repo(path: Path) -> Path:
    resolved = path.resolve()
    resolved.relative_to(REPO_ROOT)
    return resolved


def _remove_path(path: Path) -> None:
    resolved = _assert_inside_repo(path)
    if not resolved.exists():
        return
    if resolved.is_dir():
        shutil.rmtree(resolved)
    else:
        resolved.unlink()


def _fingerprints() -> dict[str, str]:
    files = sorted(glob.glob("run_exp*.py") + ["riemann_math.py", "experiment_engine.py", "verifier.py"])
    out: dict[str, str] = {}
    for name in files:
        path = REPO_ROOT / name
        if not path.exists():
            continue
        out[name] = hashlib.md5(path.read_bytes()).hexdigest()
    return out


def _empty_artifact() -> dict:
    proof_program = verifier._build_proof_program({}, fidelity_tier="SMOKE")
    code_fingerprint = _fingerprints()
    experiment_classification = verifier._build_experiment_classification()
    return {
        "run_id": None,
        "created_at": None,
        "schema_version": verifier.EXPECTED_SCHEMA_VERSION,
        "source_artifact_hash": None,
        "code_fingerprint": code_fingerprint,
        "artifact_kind": "experiments",
        "engine_status": "NO_CURRENT_RUN",
        "overall": "SKIP",
        "stage_verdicts": {},
        "history_state": {},
        "meta": {
            "dps": 0,
            "zeros": 0,
            "tau": float(riemann_math.TAU),
            "schema_version": verifier.EXPECTED_SCHEMA_VERSION,
            "code_fingerprint": code_fingerprint,
            "zero_source_info": {},
            "prime_source_info": {},
            "run_config": {},
            "experiment_classification": experiment_classification,
            "reset_reason": "legacy run data cleared; no current evidence run has been executed",
            "proof_program_template": "retained",
        },
        "summary": {
            "engine_status": "NO_CURRENT_RUN",
            "overall": "SKIP",
            "schema_version": verifier.EXPECTED_SCHEMA_VERSION,
            "compute_fidelity": "SMOKE",
            "data_fidelity": "READY_WITH_WARNINGS",
            "certificate_fidelity": "BLOCKED",
            "fidelity": {
                "compute_fidelity": "SMOKE",
                "data_fidelity": "READY_WITH_WARNINGS",
                "certificate_fidelity": "BLOCKED",
                "warnings": [],
            },
            "experiments": {},
            "stage_verdicts": {},
            "implementation_health": {},
            "program_2_summary": {},
            "proof_program": proof_program,
        },
        "experiment_0": {},
        "experiment_1": {},
        "experiment_1b": {"variants": {"gamma_scaled": {}, "rho_scaled": {}}},
        "experiment_1c": {},
        "experiment_2": {"2A": [], "2B": []},
        "experiment_2b": [],
        "experiment_3": {"3A": [], "3B": [], "TruePi": []},
        "experiment_4": {},
        "experiment_5": {},
        "experiment_6": {},
        "experiment_7": {"calibrated": []},
        "experiment_8": {"per_k": {}},
        "experiment_9": {},
        "experiment_10": {},
    }


def _data_assets_status() -> str:
    manifest_path = REPO_ROOT / "data" / "manifest.json"
    if not manifest_path.exists():
        return "NEEDS_CHECK"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        kinds = {
            asset.get("kind")
            for asset in manifest.get("assets", [])
            if isinstance(asset, dict) and asset.get("valid") is True
        }
        return "AVAILABLE" if {"tau", "nontrivial_zeta_zeros", "primes"}.issubset(kinds) else "NEEDS_CHECK"
    except Exception:
        return "NEEDS_CHECK"


def _current_state() -> dict:
    return {
        "engine_status": "NO_CURRENT_RUN",
        "reason": "historical run artifacts cleared during active development",
        "latest_run_id": None,
        "current_experiments_path": None,
        "current_certificate_path": None,
        "certificate_status": "NOT_BUILT",
        "data_assets_status": _data_assets_status(),
        "historical_comparison_enabled": False,
        "next_action": "run clean Program 1 critical suite",
    }


def main() -> int:
    os.chdir(REPO_ROOT)

    public_dir = REPO_ROOT / "public"
    public_dir.mkdir(exist_ok=True)

    artifact_path = public_dir / "experiments.json"
    artifact_path.write_text(json.dumps(_empty_artifact(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (public_dir / "current.json").write_text(json.dumps(_current_state(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (public_dir / "verdict_history.jsonl").write_text("", encoding="utf-8")
    _remove_path(public_dir / "same_object_certificate.json")

    for stale_public in (
        "riemann_high_res.json",
        "riemann_research_data.json",
        "sample_prime_data.json",
    ):
        _remove_path(public_dir / stale_public)

    reports_dir = REPO_ROOT / "reports"
    reports_dir.mkdir(exist_ok=True)
    _remove_path(reports_dir / "latest.md")
    for report in reports_dir.glob("run-*.md"):
        _remove_path(report)

    _remove_path(REPO_ROOT / "artifacts" / "runs")
    _remove_path(REPO_ROOT / ".runtime" / "runs")
    _remove_path(REPO_ROOT / ".runtime" / "checkpoints")
    _remove_path(REPO_ROOT / ".runtime" / "critical-path")
    _remove_path(REPO_ROOT / ".runtime" / "critical-path-20k")
    _remove_path(REPO_ROOT / ".runtime" / "critical-path-20k-r100")
    _remove_path(REPO_ROOT / "dashboard")

    print("reset public/experiments.json to NO_CURRENT_RUN")
    print("wrote public/current.json NO_CURRENT_RUN")
    print("cleared public/verdict_history.jsonl")
    print("removed stale public certificate, run artifacts, checkpoints, reports, runtime logs, and legacy dashboard artifacts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

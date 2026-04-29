from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from proof_kernel.data_assets import migrate_legacy_assets, write_data_manifest  # noqa: E402
from proof_kernel.data_planner import check_data_sufficiency  # noqa: E402
from proof_kernel.experiment_requirements import experiment_requirement_catalog  # noqa: E402


def _asset(kind: str, **overrides):
    payload = {
        "asset_id": f"{kind}_test",
        "kind": kind,
        "source_path": f"data/{kind}.jsonl",
        "generator": "test",
        "count": None,
        "max_value": None,
        "stored_dps": None,
        "usable_dps": None,
        "guard_dps": None,
        "strictly_increasing": None,
        "hash": "hash",
        "created_at": "2026-04-29T00:00:00Z",
        "valid": True,
        "warnings": [],
        "errors": [],
    }
    payload.update(overrides)
    return payload


def _write_assets(root: Path, assets):
    write_data_manifest(root, list(assets))


def test_agent_context_data_is_not_canonical(tmp_path: Path) -> None:
    manifest = write_data_manifest(tmp_path, [])
    assert manifest["canonical_root"] == "data"
    assert manifest["agent_context_is_canonical"] is False


def test_valid_old_prime_file_migrates_to_data_primes(tmp_path: Path) -> None:
    agent_context = tmp_path / "agent_context"
    agent_context.mkdir()
    (agent_context / "primes.csv").write_text("2\n3\n5\n7\n11\n", encoding="utf-8")

    report = migrate_legacy_assets(tmp_path)

    assert report["status"] == "COMPLETE"
    assert (tmp_path / "data" / "primes" / "primes.count_7000000.jsonl").exists()
    prime_asset = next(asset for asset in report["migrated_assets"] if asset["kind"] == "primes")
    assert prime_asset["count"] == 5
    assert prime_asset["max_prime"] == 11
    assert prime_asset["valid"] is True
    assert report["deprecated_sources"][0]["source_path"] == "agent_context/primes.csv"


def test_invalid_old_prime_file_is_marked_deprecated_invalid(tmp_path: Path) -> None:
    agent_context = tmp_path / "agent_context"
    agent_context.mkdir()
    (agent_context / "primes.csv").write_text("2\nbad\n3\n2\n", encoding="utf-8")

    report = migrate_legacy_assets(tmp_path)

    prime_source = next(src for src in report["deprecated_sources"] if src["source_path"] == "agent_context/primes.csv")
    assert prime_source["deprecated"] is True
    assert prime_source["valid"] is False
    assert prime_source["canonical_replacement"] is None


def test_7m_prime_asset_is_canonical_static_asset(tmp_path: Path) -> None:
    _write_assets(tmp_path, [
        _asset(
            "primes",
            asset_id="primes_count_7000000",
            role="canonical_static_asset",
            count=7_000_000,
            max_prime=122_949_823,
            max_value=122_949_823,
        )
    ])
    manifest = json.loads((tmp_path / "data" / "manifest.json").read_text(encoding="utf-8"))
    prime_asset = next(asset for asset in manifest["assets"] if asset["kind"] == "primes")
    assert prime_asset["role"] == "canonical_static_asset"
    assert prime_asset["count"] == 7_000_000


def test_prime_planner_ready_when_count_and_max_cover_run(tmp_path: Path) -> None:
    _write_assets(tmp_path, [
        _asset("tau", stored_dps=100, usable_dps=100),
        _asset("nontrivial_zeta_zeros", count=100_000, stored_dps=100, usable_dps=100, strictly_increasing=True),
        _asset("primes", role="canonical_static_asset", count=7_000_000, max_prime=122_949_823, max_value=122_949_823, strictly_increasing=True),
    ])

    plan = check_data_sufficiency({"experiments": ["EXP_1"], "requested_dps": 80, "requested_zero_count": 100_000}, tmp_path)

    assert plan["status"] == "READY"


def test_zero_planner_ready_when_count_and_guard_dps_sufficient(tmp_path: Path) -> None:
    _write_assets(tmp_path, [
        _asset("tau", stored_dps=100, usable_dps=100),
        _asset("nontrivial_zeta_zeros", count=100_000, stored_dps=100, usable_dps=100, strictly_increasing=True),
    ])

    plan = check_data_sufficiency({"experiments": ["EXP_8"], "requested_dps": 80, "requested_zero_count": 100_000, "n_test": 100_000}, tmp_path)

    assert plan["status"] == "READY"


def test_zero_planner_needs_generation_when_count_insufficient(tmp_path: Path) -> None:
    _write_assets(tmp_path, [
        _asset("tau", stored_dps=100, usable_dps=100),
        _asset("nontrivial_zeta_zeros", count=80_000, stored_dps=100, usable_dps=100, strictly_increasing=True),
    ])

    plan = check_data_sufficiency({"experiments": ["EXP_8"], "requested_dps": 80, "requested_zero_count": 100_000, "n_test": 100_000}, tmp_path)

    assert plan["status"] == "NEEDS_GENERATION"
    assert plan["next_action"] == "generate_nontrivial_zeros"


def test_zero_planner_insufficient_when_precision_insufficient(tmp_path: Path) -> None:
    _write_assets(tmp_path, [
        _asset("tau", stored_dps=100, usable_dps=100),
        _asset("nontrivial_zeta_zeros", count=100_000, stored_dps=80, usable_dps=80, strictly_increasing=True),
    ])

    plan = check_data_sufficiency({"experiments": ["EXP_8"], "requested_dps": 80, "requested_zero_count": 100_000, "n_test": 100_000}, tmp_path)

    assert plan["status"] == "INSUFFICIENT"
    assert any(item["reason"] == "INSUFFICIENT_PRECISION" for item in plan["insufficient_assets"])


def test_tau_planner_enforces_dps_plus_guard(tmp_path: Path) -> None:
    _write_assets(tmp_path, [
        _asset("tau", stored_dps=80, usable_dps=80),
        _asset("nontrivial_zeta_zeros", count=100_000, stored_dps=100, usable_dps=100, strictly_increasing=True),
    ])

    plan = check_data_sufficiency({"experiments": ["EXP_8"], "requested_dps": 80, "requested_zero_count": 100_000, "n_test": 100_000}, tmp_path)

    assert plan["status"] == "INSUFFICIENT"
    assert any(item["kind"] == "tau" for item in plan["insufficient_assets"])


def test_trivial_zeros_are_formulaic_and_do_not_require_table(tmp_path: Path) -> None:
    _write_assets(tmp_path, [
        _asset("tau", stored_dps=100, usable_dps=100),
        _asset("nontrivial_zeta_zeros", count=100_000, stored_dps=100, usable_dps=100, strictly_increasing=True),
        _asset("primes", role="canonical_static_asset", count=7_000_000, max_prime=122_949_823, max_value=122_949_823, strictly_increasing=True),
    ])

    plan = check_data_sufficiency({"experiments": ["EXP_1"], "requested_dps": 80, "requested_zero_count": 100_000}, tmp_path)
    trivial = next(item for item in plan["available_assets"] if item["required"]["kind"] == "trivial_zeta_zeros")

    assert trivial["available"]["generator"] == "formula"
    assert trivial["available"]["formula"] == "s = -2n"


def test_experiments_declare_data_requirements() -> None:
    catalog = experiment_requirement_catalog()
    for exp_id in ["EXP_1", "EXP_6", "EXP_8", "EXP_9"]:
        assert exp_id in catalog
        assert "requirements" in catalog[exp_id]

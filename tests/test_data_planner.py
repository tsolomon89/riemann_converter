from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from proof_kernel.data_assets import migrate_legacy_assets, write_data_manifest  # noqa: E402
from proof_kernel.data_planner import check_data_sufficiency, run_preflight  # noqa: E402
from proof_kernel.experiment_requirements import experiment_requirement_catalog  # noqa: E402
from proof_kernel.run_presets import resolve_run_preset  # noqa: E402


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


def _write_zero_file(root: Path, rel: str, values: list[str]) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(values) + "\n", encoding="utf-8")


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


def test_overkill_selects_100_dps_generated_zero_asset_over_9_decimal_source(tmp_path: Path) -> None:
    generated_path = "data/zeros/nontrivial/zeros.generated.dps_100.jsonl"
    reference_path = "data/zeros/nontrivial/zeros_100K_three_ten_power_neg_nine.jsonl"
    values = ["14.13472514173469379045", "21.02203963877155499262", "25.01085758014568876321"]
    _write_zero_file(tmp_path, generated_path, values)
    _write_zero_file(tmp_path, reference_path, ["14.134725142", "21.022039639", "25.010857580"])
    _write_assets(tmp_path, [
        _asset("tau", stored_dps=100, usable_dps=100),
        _asset("nontrivial_zeta_zeros", asset_id="generated_100", source_path=generated_path, generator="python-flint.acb.zeta_zeros", count=3, stored_dps=100, usable_dps=100, strictly_increasing=True),
        _asset("nontrivial_zeta_zeros", asset_id="reference_9", source_path=reference_path, generator="existing_file_migration", count=3, stored_dps=9, usable_dps=9, strictly_increasing=True),
    ])

    plan = check_data_sufficiency({"preset": "overkill", "experiments": ["EXP_8"], "requested_zero_count": 3, "n_test": 3}, tmp_path)

    selected = plan["selected_assets"]["zero"]
    assert plan["status"] == "READY"
    assert selected["asset"]["source_path"] == generated_path
    assert selected["asset"]["stored_dps"] == 100
    assert selected["validation"]["status"] == "PASS"


def test_ready_overkill_preflight_uses_generic_next_research_step(tmp_path: Path) -> None:
    generated_path = "data/zeros/nontrivial/zeros.generated.dps_100.jsonl"
    reference_path = "data/zeros/nontrivial/zeros_100K_three_ten_power_neg_nine.jsonl"
    values = ["14.13472514173469379045", "21.02203963877155499262", "25.01085758014568876321"]
    _write_zero_file(tmp_path, generated_path, values)
    _write_zero_file(tmp_path, reference_path, ["14.134725142", "21.022039639", "25.010857580"])
    _write_assets(tmp_path, [
        _asset("tau", stored_dps=100, usable_dps=100),
        _asset("nontrivial_zeta_zeros", asset_id="generated_100", source_path=generated_path, generator="python-flint.acb.zeta_zeros", count=3, stored_dps=100, usable_dps=100, strictly_increasing=True),
        _asset("nontrivial_zeta_zeros", asset_id="reference_9", source_path=reference_path, generator="existing_file_migration", count=3, stored_dps=9, usable_dps=9, strictly_increasing=True),
    ])

    preflight = run_preflight({"preset": "overkill", "experiments": ["EXP_8"], "requested_zero_count": 3, "n_test": 3}, tmp_path)

    assert preflight["status"] == "READY"
    assert preflight["next_action"] == "run_next_research_step"


def test_overkill_blocks_when_no_zero_asset_satisfies_guard_dps(tmp_path: Path) -> None:
    weak_path = "data/zeros/nontrivial/zeros_100K_three_ten_power_neg_nine.jsonl"
    _write_zero_file(tmp_path, weak_path, ["14.134725142", "21.022039639", "25.010857580"])
    _write_assets(tmp_path, [
        _asset("tau", stored_dps=100, usable_dps=100),
        _asset("nontrivial_zeta_zeros", asset_id="reference_9", source_path=weak_path, generator="existing_file_migration", count=3, stored_dps=9, usable_dps=9, strictly_increasing=True),
    ])

    preflight = run_preflight({"preset": "overkill", "experiments": ["EXP_8"], "requested_zero_count": 3, "n_test": 3}, tmp_path)

    assert preflight["status"] == "BLOCKED"
    assert "only 9 declared decimals" in preflight["reason"]


def test_overkill_blocks_when_high_dps_generated_asset_has_fewer_than_60k_zeros(tmp_path: Path) -> None:
    generated_path = "data/zeros/nontrivial/zeros.generated.dps_100.jsonl"
    _write_zero_file(tmp_path, generated_path, ["14.13472514173469379045", "21.02203963877155499262"])
    _write_assets(tmp_path, [
        _asset("tau", stored_dps=100, usable_dps=100),
        _asset(
            "nontrivial_zeta_zeros",
            asset_id="generated_100_partial",
            source_path=generated_path,
            generator="python-flint.acb.zeta_zeros",
            count=59_999,
            stored_dps=100,
            usable_dps=80,
            guard_dps=20,
            strictly_increasing=True,
        ),
    ])

    preflight = run_preflight({"preset": "overkill", "experiments": ["EXP_8"], "n_test": 60_000}, tmp_path)

    assert preflight["status"] == "BLOCKED"
    assert preflight["requested_zero_count"] == 60_000
    assert preflight["next_action"] == "EXTEND_ZERO_ASSET_TO_60000"
    assert "INSUFFICIENT_COUNT" in preflight["blocking_reasons"]
    command = preflight["data_sufficiency"]["generation_plan"][0]["command"]
    assert "--count 60000" in command
    assert "--count 100000" not in command


def test_overkill_blocks_when_reference_validation_is_unavailable(tmp_path: Path) -> None:
    generated_path = "data/zeros/nontrivial/zeros.generated.dps_100.jsonl"
    _write_zero_file(tmp_path, generated_path, ["14.13472514173469379045", "21.02203963877155499262"])
    _write_assets(tmp_path, [
        _asset("tau", stored_dps=100, usable_dps=100),
        _asset(
            "nontrivial_zeta_zeros",
            asset_id="generated_100",
            source_path=generated_path,
            generator="python-flint.acb.zeta_zeros",
            count=60_000,
            stored_dps=100,
            usable_dps=80,
            guard_dps=20,
            strictly_increasing=True,
        ),
    ])

    preflight = run_preflight({"preset": "overkill", "experiments": ["EXP_8"]}, tmp_path)

    assert preflight["status"] == "BLOCKED"
    assert preflight["zero_validation_status"] == "NOT_AVAILABLE"
    assert preflight["next_action"] == "VALIDATE_GENERATED_ZEROS_AGAINST_ODLYZKO"


def test_overkill_blocks_when_odlyzko_crosscheck_fails(tmp_path: Path) -> None:
    generated_path = "data/zeros/nontrivial/zeros.generated.dps_100.jsonl"
    reference_path = "data/zeros/nontrivial/zeros_100K_three_ten_power_neg_nine.jsonl"
    _write_zero_file(tmp_path, generated_path, ["14.13472515173469379045", "21.02203963877155499262", "25.01085758014568876321"])
    _write_zero_file(tmp_path, reference_path, ["14.134725142", "21.022039639", "25.010857580"])
    _write_assets(tmp_path, [
        _asset("tau", stored_dps=100, usable_dps=100),
        _asset("nontrivial_zeta_zeros", asset_id="generated_100", source_path=generated_path, generator="python-flint.acb.zeta_zeros", count=3, stored_dps=100, usable_dps=100, strictly_increasing=True),
        _asset("nontrivial_zeta_zeros", asset_id="reference_9", source_path=reference_path, generator="existing_file_migration", count=3, stored_dps=9, usable_dps=9, strictly_increasing=True),
    ])

    preflight = run_preflight({"preset": "overkill", "experiments": ["EXP_8"], "requested_zero_count": 3, "n_test": 3}, tmp_path)

    assert preflight["status"] == "BLOCKED"
    assert preflight["selected_assets"]["zero"]["validation"]["status"] == "FAIL"
    failure = preflight["selected_assets"]["zero"]["validation"]["failed_details"][0]
    assert failure["index"] == 1
    assert failure["generated_value"] == "14.13472515173469379045"
    assert failure["reference_value"] == "14.134725142"
    assert failure["tolerance"] == "5e-9"
    assert "first failed index 1" in preflight["reason"]


def test_validation_tolerance_uses_reference_declared_decimals(tmp_path: Path) -> None:
    generated_path = "data/zeros/nontrivial/zeros.generated.dps_100.jsonl"
    reference_path = "data/zeros/nontrivial/zeros_100K_three_ten_power_neg_nine.jsonl"
    _write_zero_file(tmp_path, generated_path, ["14.134725148"])
    _write_zero_file(tmp_path, reference_path, ["14.134725142"])
    _write_assets(tmp_path, [
        _asset("tau", stored_dps=100, usable_dps=100),
        _asset("nontrivial_zeta_zeros", asset_id="generated_100", source_path=generated_path, generator="python-flint.acb.zeta_zeros", count=1, stored_dps=100, usable_dps=80, guard_dps=20, strictly_increasing=True),
        _asset("nontrivial_zeta_zeros", asset_id="reference_9", source_path=reference_path, generator="existing_file_migration", count=1, stored_dps=9, usable_dps=9, strictly_increasing=True),
    ])

    preflight = run_preflight({"preset": "overkill", "experiments": ["EXP_8"], "requested_zero_count": 1, "n_test": 1}, tmp_path)

    validation = preflight["selected_assets"]["zero"]["validation"]
    assert validation["reference_declared_decimals"] == 9
    assert validation["tolerance"] == "5e-9"
    assert validation["status"] == "FAIL"


def test_standard_preset_warns_when_using_lower_precision_fallback(tmp_path: Path) -> None:
    weak_path = "data/zeros/nontrivial/zeros_100K_three_ten_power_neg_nine.jsonl"
    _write_zero_file(tmp_path, weak_path, ["14.134725142", "21.022039639", "25.010857580"])
    _write_assets(tmp_path, [
        _asset("tau", stored_dps=60, usable_dps=60),
        _asset("nontrivial_zeta_zeros", asset_id="reference_9", source_path=weak_path, generator="existing_file_migration", count=3, stored_dps=9, usable_dps=9, strictly_increasing=True),
    ])

    plan = check_data_sufficiency({"preset": "standard", "experiments": ["EXP_8"], "requested_zero_count": 3, "n_test": 3}, tmp_path)

    assert plan["status"] == "READY"
    assert any("fallback" in warning for warning in plan["warnings"])


def test_resolve_run_preset_returns_stable_overkill_contract() -> None:
    contract = resolve_run_preset("overkill")

    assert contract["preset"] == "overkill"
    assert contract["requested_dps"] == 80
    assert contract["requested_zero_count"] == 60000
    assert contract["zero_policy"]["allow_lower_precision_fallback"] is False
    assert contract["zero_policy"]["require_odlyzko_crosscheck"] is True
    assert contract["runtime_policy"]["prime_target_count"] == 7_000_000


def test_overkill_full_remains_explicit_100k_opt_in() -> None:
    contract = resolve_run_preset("overkill_full")

    assert contract["preset"] == "overkill_full"
    assert contract["requested_zero_count"] == 100000


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

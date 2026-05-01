import json
from pathlib import Path

from proof_kernel.data_assets import write_data_manifest
from proof_kernel.run_artifacts import write_run_artifacts
from proof_kernel.same_object_certificate import build_certificate


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
        "created_at": "2026-05-01T00:00:00Z",
        "valid": True,
        "warnings": [],
        "errors": [],
    }
    payload.update(overrides)
    return payload


def test_selected_sources_flow_into_run_current_and_certificate(tmp_path: Path) -> None:
    selected_sources = {
        "zero": {
            "asset": {
                "asset_id": "nontrivial_zeros_count_100000_dps_100",
                "source_path": "data/zeros/nontrivial/zeros.generated.dps_100.jsonl",
                "stored_dps": 100,
                "count": 100000,
            },
            "validation": {
                "status": "PASS",
                "reference_asset_id": "nontrivial_zeros_count_2001052_dps_9",
                "validated_count": 100000,
            },
        },
        "tau": {
            "asset": {
                "asset_id": "tau_dps_100",
                "source_path": "data/constants/tau/tau.dps_100.txt",
                "stored_dps": 100,
            },
        },
        "prime": {
            "asset": {
                "asset_id": "primes_count_7000000",
                "source_path": "data/primes/primes.count_7000000.jsonl",
                "count": 7000000,
            },
        },
    }
    write_data_manifest(tmp_path, [
        _asset("tau", asset_id="tau_dps_100", source_path="data/constants/tau/tau.dps_100.txt", stored_dps=100, usable_dps=100),
        _asset(
            "nontrivial_zeta_zeros",
            asset_id="nontrivial_zeros_count_100000_dps_100",
            source_path="data/zeros/nontrivial/zeros.generated.dps_100.jsonl",
            generator="python-flint.acb.zeta_zeros",
            count=100000,
            stored_dps=100,
            usable_dps=100,
            strictly_increasing=True,
        ),
        _asset(
            "primes",
            asset_id="primes_count_7000000",
            source_path="data/primes/primes.count_7000000.jsonl",
            role="canonical_static_asset",
            count=7000000,
            max_prime=122949823,
            max_value=122949823,
            strictly_increasing=True,
        ),
    ])
    data = {
        "meta": {
            "run_id": "run_selected_asset_metadata",
            "dps": 80,
            "zeros": 100000,
            "selected_data_sources": selected_sources,
        },
        "summary": {
            "overall": "PASS",
            "fidelity_tier": "AUTHORITATIVE",
            "experiments": {},
        },
    }

    run_dir = write_run_artifacts(data, run_id="run_selected_asset_metadata", root=tmp_path)

    experiments = json.loads((run_dir / "experiments.json").read_text(encoding="utf-8"))
    assert experiments["meta"]["selected_data_sources"]["zero"]["asset"]["source_path"] == "data/zeros/nontrivial/zeros.generated.dps_100.jsonl"

    current = json.loads((tmp_path / "public" / "current.json").read_text(encoding="utf-8"))
    assert current["selected_data_sources"]["zero"]["asset"]["stored_dps"] == 100

    certificate = build_certificate(str(run_dir / "experiments.json"))
    assert certificate["selected_data_sources"]["zero"]["asset"]["source_path"] == "data/zeros/nontrivial/zeros.generated.dps_100.jsonl"
    assert certificate["zero_asset_validation"]["status"] == "PASS"
    assert certificate["fidelity"]["selected_zero_stored_dps"] == 100

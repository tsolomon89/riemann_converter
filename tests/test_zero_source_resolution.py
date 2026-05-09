"""Tests for the data planner's zero-source preference + the engine's
no-preset resolution helper.

These pin down the structural fix for the live-run warning:
    "Generated 60K zero source is accepted for this baseline run but
     remains below dps+guard certificate preference."
The fix has two layers:
    1. The data planner prefers the highest-stored_dps generated asset that
       satisfies (count >= required, stored_dps >= required+guard).
    2. The engine consults the planner even without --preset and threads its
       chosen path into args.zero_source unless an explicit --zero-source or
       RIEMANN_ZEROS_FILE env var overrides it.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from proof_kernel.data_planner import check_data_sufficiency  # noqa: E402

import experiment_engine  # noqa: E402


REPO_ROOT = Path(os.path.dirname(os.path.dirname(__file__)))


# ---------------------------------------------------------------------------
# Fixture: a tmp repo with a synthetic data/manifest.json and dummy zero files
# ---------------------------------------------------------------------------


def _write_zero_jsonl(path: Path, count: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as h:
        for i in range(count):
            # Strictly-increasing dummy ordinates; format mirrors what the
            # planner / engine read (one float per line).
            h.write(f"{14.0 + 0.001 * i}\n")


def _write_tau_payload(tmp: Path, dps: int) -> Path:
    payload = {
        "decimal_string": (
            "1.6180339887498948482045868343656381177203091798057628621354486227052604628189024497072072041893911374"[: dps + 2]
        ),
        "stored_dps": dps,
        "metadata": {"generator": "tests/synthetic"},
    }
    path = tmp / "data" / "tau" / f"tau.dps_{dps}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _write_primes_jsonl(tmp: Path, count: int = 10000) -> Path:
    path = tmp / "data" / "primes" / "primes.generated.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    primes = []
    n = 2
    while len(primes) < count:
        if all(n % p != 0 for p in primes if p * p <= n):
            primes.append(n)
        n += 1
    with path.open("w", encoding="utf-8") as h:
        for p in primes:
            h.write(f"{p}\n")
    return path


@pytest.fixture
def repo_with_two_generated_zero_assets(tmp_path: Path) -> Path:
    """Tmp repo whose manifest carries BOTH a dps_75 and a dps_100 generated
    zero asset. Both backing files exist on disk. Mirrors the live-repo state
    that produced the warning."""
    # Files
    dps75_path = tmp_path / "data" / "zeros" / "nontrivial" / "zeros.generated.jsonl"
    dps100_path = tmp_path / "data" / "zeros" / "nontrivial" / "zeros.generated.dps_100.jsonl"
    _write_zero_jsonl(dps75_path, 68100)
    _write_zero_jsonl(dps100_path, 100000)
    tau_path = _write_tau_payload(tmp_path, dps=100)
    primes_path = _write_primes_jsonl(tmp_path)

    manifest = {
        "agent_context_is_canonical": False,
        "assets": [
            {
                "asset_id": "nontrivial_zeros_count_68100_dps_75",
                "count": 68100,
                "kind": "nontrivial_zeta_zeros",
                "generator": "mpmath.zetazero",
                "source_path": str(dps75_path.relative_to(tmp_path)).replace("\\", "/"),
                "stored_dps": 75,
                "usable_dps": 75,
                "guard_dps": 20,
                "valid": True,
                "valid_for_overkill": False,
                "validated_count": 68100,
                "strictly_increasing": True,
                "warnings": [],
                "errors": [],
            },
            {
                "asset_id": "nontrivial_zeros_count_100000_dps_100",
                "count": 100000,
                "kind": "nontrivial_zeta_zeros",
                "generator": "python-flint.acb.zeta_zeros",
                "source_path": str(dps100_path.relative_to(tmp_path)).replace("\\", "/"),
                "stored_dps": 100,
                "usable_dps": 80,
                "guard_dps": 20,
                "valid": True,
                "valid_for_overkill": True,
                "validated_count": 60000,
                "validation_status": "PASS",
                "strictly_increasing": True,
                "warnings": [],
                "errors": [],
            },
            {
                "asset_id": "tau_dps_100",
                "kind": "tau",
                "stored_dps": 100,
                "source_path": str(tau_path.relative_to(tmp_path)).replace("\\", "/"),
                "valid": True,
                "warnings": [],
                "errors": [],
            },
            {
                "asset_id": "primes_count_10000",
                "kind": "primes",
                "count": 10000,
                "source_path": str(primes_path.relative_to(tmp_path)).replace("\\", "/"),
                "valid": True,
                "warnings": [],
                "errors": [],
            },
        ],
    }
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    (tmp_path / "data" / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return tmp_path


@pytest.fixture
def repo_with_only_dps75_asset(tmp_path: Path) -> Path:
    """Tmp repo with only the dps_75 asset registered (the dps_100 file does
    not exist on disk and is not in the manifest). Used to verify the planner
    falls back gracefully and the engine still picks the available asset."""
    dps75_path = tmp_path / "data" / "zeros" / "nontrivial" / "zeros.generated.jsonl"
    _write_zero_jsonl(dps75_path, 68100)
    tau_path = _write_tau_payload(tmp_path, dps=80)
    primes_path = _write_primes_jsonl(tmp_path)
    manifest = {
        "agent_context_is_canonical": False,
        "assets": [
            {
                "asset_id": "nontrivial_zeros_count_68100_dps_75",
                "count": 68100,
                "kind": "nontrivial_zeta_zeros",
                "generator": "mpmath.zetazero",
                "source_path": str(dps75_path.relative_to(tmp_path)).replace("\\", "/"),
                "stored_dps": 75,
                "usable_dps": 75,
                "guard_dps": 20,
                "valid": True,
                "validated_count": 68100,
                "strictly_increasing": True,
                "warnings": [],
                "errors": [],
            },
            {
                "asset_id": "tau_dps_80",
                "kind": "tau",
                "stored_dps": 80,
                "source_path": str(tau_path.relative_to(tmp_path)).replace("\\", "/"),
                "valid": True,
                "warnings": [],
                "errors": [],
            },
            {
                "asset_id": "primes_count_10000",
                "kind": "primes",
                "count": 10000,
                "source_path": str(primes_path.relative_to(tmp_path)).replace("\\", "/"),
                "valid": True,
                "warnings": [],
                "errors": [],
            },
        ],
    }
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    (tmp_path / "data" / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return tmp_path


# ---------------------------------------------------------------------------
# Planner-contract tests
# ---------------------------------------------------------------------------


class TestPlannerZeroAssetPreference:
    def test_prefers_dps_100_over_dps_75_when_both_satisfy_count(self, repo_with_two_generated_zero_assets: Path) -> None:
        """The fix this test pins: when both the dps_75 and dps_100 generated
        assets satisfy (count >= 60000), the planner must select dps_100
        because it satisfies stored_dps >= required (80 + 20 = 100)."""
        plan = check_data_sufficiency(
            {"dps": 80, "zero_count": 60000},
            root=repo_with_two_generated_zero_assets,
        )
        zero = ((plan.get("selected_assets") or {}).get("zero") or {}).get("asset") or {}
        assert zero.get("asset_id") == "nontrivial_zeros_count_100000_dps_100", (
            f"planner picked the wrong asset: {zero.get('asset_id')!r}"
        )
        assert zero.get("source_path", "").endswith("zeros.generated.dps_100.jsonl")
        assert int(zero.get("stored_dps") or 0) == 100

    def test_falls_back_to_dps_75_when_dps_100_missing(self, repo_with_only_dps75_asset: Path) -> None:
        plan = check_data_sufficiency(
            {"dps": 80, "zero_count": 60000},
            root=repo_with_only_dps75_asset,
        )
        zero = ((plan.get("selected_assets") or {}).get("zero") or {}).get("asset") or {}
        assert zero.get("asset_id") == "nontrivial_zeros_count_68100_dps_75"


# ---------------------------------------------------------------------------
# Engine helper tests — resolve_no_preset_zero_source
# ---------------------------------------------------------------------------


class TestEngineNoPresetResolution:
    def _run_with_cwd(self, tmp_path: Path, dps: int = 80, zero_count: int = 60000, run_arg: str = "all", explicit: bool = False, env_override: str | None = None):
        original = Path.cwd()
        os.chdir(tmp_path)
        try:
            return experiment_engine.resolve_no_preset_zero_source(
                dps=dps,
                zero_count=zero_count,
                run_arg=run_arg,
                explicit_zero_source=explicit,
                env_override=env_override,
            )
        finally:
            os.chdir(original)

    def test_picks_dps_100_path_when_both_assets_registered(self, repo_with_two_generated_zero_assets: Path) -> None:
        selected, override = self._run_with_cwd(repo_with_two_generated_zero_assets)
        assert override is not None, "engine helper returned no override despite a high-dps asset existing"
        assert override.startswith("file:")
        assert override.endswith("zeros.generated.dps_100.jsonl")
        assert selected is not None
        assert ((selected.get("zero") or {}).get("asset") or {}).get("asset_id") == "nontrivial_zeros_count_100000_dps_100"

    def test_explicit_zero_source_skips_planner(self, repo_with_two_generated_zero_assets: Path) -> None:
        selected, override = self._run_with_cwd(repo_with_two_generated_zero_assets, explicit=True)
        assert override is None, "explicit --zero-source must take precedence over the planner"
        assert selected is None, "selected_assets should not be populated when planner is skipped"

    def test_env_override_skips_planner(self, repo_with_two_generated_zero_assets: Path) -> None:
        selected, override = self._run_with_cwd(repo_with_two_generated_zero_assets, env_override="/tmp/some/path.jsonl")
        assert override is None, "RIEMANN_ZEROS_FILE env var must take precedence over the planner"
        assert selected is None

    def test_falls_back_when_only_dps_75_registered(self, repo_with_only_dps75_asset: Path) -> None:
        selected, override = self._run_with_cwd(repo_with_only_dps75_asset)
        # The dps_75 asset doesn't satisfy stored_dps >= required (100), so the
        # planner won't return a "strong" selection. The engine helper must
        # not crash and must not fabricate a path that doesn't exist.
        # It may return None (graceful fallback) or a path — either is fine
        # so long as we don't lie about what's there.
        if override is not None:
            assert override.startswith("file:")
            backing_path = override[len("file:"):]
            assert os.path.exists(backing_path), (
                f"engine helper returned a planner path that doesn't exist on disk: {backing_path}"
            )

    def test_planner_failure_does_not_crash(self, tmp_path: Path) -> None:
        # No data/manifest.json at all → planner errors internally; helper
        # must swallow and return (None, None) without raising.
        original = Path.cwd()
        os.chdir(tmp_path)
        try:
            selected, override = experiment_engine.resolve_no_preset_zero_source(
                dps=80,
                zero_count=60000,
                run_arg="all",
                explicit_zero_source=False,
                env_override=None,
            )
            assert override is None
            # selected may be None or an empty plan; what matters is no exception.
        finally:
            os.chdir(original)

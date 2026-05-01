"""Research run preset contracts.

Presets declare intent and policy. They do not name concrete data files;
the data planner resolves the strongest valid assets at preflight time.
"""

from __future__ import annotations

import copy
import json
from typing import Any, Dict, List


RUN_PRESET_IDS = ("smoke", "standard", "authoritative", "overkill", "overkill_full")


_BASE_POLICIES: Dict[str, Any] = {
    "zero_policy": {
        "selection": "highest_available",
        "allow_lower_precision_fallback": True,
        "require_odlyzko_crosscheck": False,
    },
    "tau_policy": {
        "selection": "highest_available",
        "require_dps_plus_guard": True,
    },
    "prime_policy": {
        "selection": "canonical_7m",
        "require_sufficient_max_prime": True,
    },
    "certificate_policy": {
        "require_raw_high_precision_artifacts": False,
    },
    "runtime_policy": {
        "run": "all",
        "quick": False,
        "resolution": 500,
        "x_start": None,
        "x_end": None,
        "k_values": "0,1,2",
        "n_test": 500,
        "prime_min_count": 0,
        "prime_target_count": 0,
    },
}


def _contract(
    *,
    preset: str,
    requested_dps: int,
    requested_zero_count: int,
    guard_dps: int,
    allow_lower_precision_fallback: bool,
    require_odlyzko_crosscheck: bool,
    require_raw_high_precision_artifacts: bool,
    runtime_policy: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    out = copy.deepcopy(_BASE_POLICIES)
    out.update({
        "preset": preset,
        "requested_dps": int(requested_dps),
        "requested_zero_count": int(requested_zero_count),
        "guard_dps": int(guard_dps),
    })
    out["zero_policy"]["allow_lower_precision_fallback"] = bool(allow_lower_precision_fallback)
    out["zero_policy"]["require_odlyzko_crosscheck"] = bool(require_odlyzko_crosscheck)
    out["certificate_policy"]["require_raw_high_precision_artifacts"] = bool(
        require_raw_high_precision_artifacts
    )
    if runtime_policy:
        out["runtime_policy"].update(runtime_policy)
    return out


_PRESETS: Dict[str, Dict[str, Any]] = {
    "smoke": _contract(
        preset="smoke",
        requested_dps=30,
        requested_zero_count=100,
        guard_dps=0,
        allow_lower_precision_fallback=True,
        require_odlyzko_crosscheck=False,
        require_raw_high_precision_artifacts=False,
        runtime_policy={"quick": True},
    ),
    "standard": _contract(
        preset="standard",
        requested_dps=40,
        requested_zero_count=2000,
        guard_dps=20,
        allow_lower_precision_fallback=True,
        require_odlyzko_crosscheck=False,
        require_raw_high_precision_artifacts=False,
    ),
    "authoritative": _contract(
        preset="authoritative",
        requested_dps=80,
        requested_zero_count=100000,
        guard_dps=20,
        allow_lower_precision_fallback=False,
        require_odlyzko_crosscheck=True,
        require_raw_high_precision_artifacts=True,
        runtime_policy={"prime_min_count": 1000000, "prime_target_count": 1000000},
    ),
    "overkill": _contract(
        preset="overkill",
        requested_dps=80,
        requested_zero_count=100000,
        guard_dps=20,
        allow_lower_precision_fallback=False,
        require_odlyzko_crosscheck=True,
        require_raw_high_precision_artifacts=True,
        runtime_policy={"prime_min_count": 1000000, "prime_target_count": 1000000},
    ),
    # Back-compat extension retained for existing UI/API callers. The preset
    # contract is the same as overkill except for requesting the full prime file.
    "overkill_full": _contract(
        preset="overkill_full",
        requested_dps=80,
        requested_zero_count=100000,
        guard_dps=20,
        allow_lower_precision_fallback=False,
        require_odlyzko_crosscheck=True,
        require_raw_high_precision_artifacts=True,
        runtime_policy={
            "prime_min_count": 1000000,
            "prime_target_count": 7000000,
            "x_start": 2,
            "x_end": 50,
        },
    ),
}


def is_run_preset(value: Any) -> bool:
    return str(value or "").lower() in _PRESETS


def resolve_run_preset(preset: str = "standard", **overrides: Any) -> Dict[str, Any]:
    preset_id = str(preset or "standard").lower()
    if preset_id not in _PRESETS:
        raise ValueError(f"Unknown run preset: {preset}")
    contract = copy.deepcopy(_PRESETS[preset_id])
    for key in ("requested_dps", "requested_zero_count", "guard_dps"):
        if key in overrides and overrides[key] is not None:
            contract[key] = int(overrides[key])
    for policy_key in ("zero_policy", "tau_policy", "prime_policy", "certificate_policy", "runtime_policy"):
        patch = overrides.get(policy_key)
        if isinstance(patch, dict):
            contract[policy_key].update(copy.deepcopy(patch))
    return contract


def get_run_presets() -> List[Dict[str, Any]]:
    return [resolve_run_preset(preset_id) for preset_id in RUN_PRESET_IDS]


if __name__ == "__main__":
    print(json.dumps({"presets": get_run_presets()}, indent=2, sort_keys=True))

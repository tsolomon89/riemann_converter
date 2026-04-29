"""Precision policy for research data and certificates."""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, Optional


DEFAULT_PRECISION_POLICY: Dict[str, Any] = {
    "default_guard_dps": 20,
    "authoritative_min_dps": 80,
    "asset_required_dps_rule": "experiment_dps + guard_dps",
    "tau_required_dps_rule": "experiment_dps + guard_dps",
    "zero_required_dps_rule": "experiment_dps + guard_dps",
    "display_float_policy": "allowed_for_ui_only",
    "certificate_policy": "prefer_raw_high_precision_artifacts",
}


@dataclass(frozen=True)
class PrecisionCheck:
    requested_dps: int
    guard_dps: int
    required_stored_dps: int
    available_stored_dps: Optional[int]
    status: str
    warning: Optional[str] = None
    blocks_authoritative_certificate: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def get_precision_policy() -> Dict[str, Any]:
    return dict(DEFAULT_PRECISION_POLICY)


def required_stored_dps(requested_dps: int, guard_dps: Optional[int] = None) -> int:
    guard = DEFAULT_PRECISION_POLICY["default_guard_dps"] if guard_dps is None else int(guard_dps)
    return int(requested_dps) + guard


def check_asset_precision(
    available_stored_dps: Optional[int],
    requested_dps: int,
    guard_dps: Optional[int] = None,
) -> PrecisionCheck:
    """Classify an asset against requested experiment precision plus guard."""

    guard = DEFAULT_PRECISION_POLICY["default_guard_dps"] if guard_dps is None else int(guard_dps)
    required = required_stored_dps(requested_dps, guard)
    available = None if available_stored_dps is None else int(available_stored_dps)

    if available is None:
        return PrecisionCheck(
            requested_dps=int(requested_dps),
            guard_dps=guard,
            required_stored_dps=required,
            available_stored_dps=None,
            status="MISSING",
            blocks_authoritative_certificate=True,
        )

    if available >= required:
        return PrecisionCheck(
            requested_dps=int(requested_dps),
            guard_dps=guard,
            required_stored_dps=required,
            available_stored_dps=available,
            status="READY",
        )

    if available >= int(requested_dps):
        return PrecisionCheck(
            requested_dps=int(requested_dps),
            guard_dps=guard,
            required_stored_dps=required,
            available_stored_dps=available,
            status="NO_GUARD_PRECISION",
            warning="Asset meets requested experiment dps but has no guard precision.",
            blocks_authoritative_certificate=False,
        )

    return PrecisionCheck(
        requested_dps=int(requested_dps),
        guard_dps=guard,
        required_stored_dps=required,
        available_stored_dps=available,
        status="BELOW_EXPERIMENT_DPS",
        warning="Asset precision is below the requested experiment dps.",
        blocks_authoritative_certificate=True,
    )


if __name__ == "__main__":
    import json

    print(json.dumps(get_precision_policy(), indent=2))

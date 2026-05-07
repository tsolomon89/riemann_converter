"""Cross-check generated zero assets against reference zero assets."""

from __future__ import annotations

import gzip
import json
import os
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

from .data_assets import ROOT, hash_file, relpath, utc_now, write_json

DEFAULT_ZERO_REFERENCE_TOLERANCE = "5e-9"
OVERKILL_VALIDATION_COUNT = 60000
OVERKILL_REQUIRED_STORED_DPS = 100


def _asset_path(asset: Dict[str, Any], root: Path = ROOT) -> Optional[Path]:
    source_path = asset.get("source_path")
    if not source_path:
        return None
    path = Path(str(source_path))
    return path if path.is_absolute() else root / path


def _validation_path(asset: Dict[str, Any], root: Path = ROOT) -> Path:
    path = _asset_path(asset, root)
    if path is None:
        asset_id = str(asset.get("asset_id") or "unknown_zero_asset")
        return root / "data" / "zeros" / "nontrivial" / f"{asset_id}.validation.json"
    name = path.name
    for suffix in (".jsonl.gz", ".txt.gz", ".jsonl", ".txt", ".gz"):
        if name.endswith(suffix):
            return path.with_name(name[: -len(suffix)] + ".validation.json")
    return path.with_suffix(".validation.json")


def _iter_lines(path: Path) -> Iterator[str]:
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8", errors="replace") as handle:
            yield from handle
        return
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        yield from handle


def _numeric_token(line: str) -> Optional[str]:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None
    parts = stripped.split()
    if not parts:
        return None
    token = parts[-1].strip().strip('"').strip("'")
    try:
        Decimal(token)
    except (InvalidOperation, ValueError):
        return None
    return token


def _iter_zero_values(path: Path) -> Iterator[Decimal]:
    for line in _iter_lines(path):
        token = _numeric_token(line)
        if token is not None:
            yield Decimal(token)


def _iter_zero_tokens(path: Path) -> Iterator[Tuple[str, Decimal]]:
    for line in _iter_lines(path):
        token = _numeric_token(line)
        if token is not None:
            yield token, Decimal(token)


def reference_declared_decimals(reference_asset: Optional[Dict[str, Any]]) -> Optional[int]:
    if not isinstance(reference_asset, dict):
        return None
    for key in ("stored_dps", "usable_dps", "declared_decimals"):
        value = reference_asset.get(key)
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            continue
        if parsed > 0:
            return parsed
    return None


def tolerance_for_reference_asset(reference_asset: Optional[Dict[str, Any]]) -> str:
    declared = reference_declared_decimals(reference_asset)
    if declared is None:
        return DEFAULT_ZERO_REFERENCE_TOLERANCE
    return f"5e-{declared}"


def _percentile(sorted_values: List[Decimal], pct: Decimal) -> Decimal:
    if not sorted_values:
        return Decimal(0)
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (Decimal(len(sorted_values) - 1) * pct) / Decimal(100)
    lower = int(rank.to_integral_value(rounding="ROUND_FLOOR"))
    upper = int(rank.to_integral_value(rounding="ROUND_CEILING"))
    if lower == upper:
        return sorted_values[lower]
    fraction = rank - Decimal(lower)
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * fraction


def _not_available(
    asset: Dict[str, Any],
    reference_asset: Optional[Dict[str, Any]],
    tolerance: str,
    reason: str,
    root: Path,
    max_count: Optional[int] = None,
) -> Dict[str, Any]:
    asset_path = _asset_path(asset, root)
    reference_path = _asset_path(reference_asset, root) if isinstance(reference_asset, dict) else None
    payload = {
        "asset_id": asset.get("asset_id"),
        "generated_asset_path": relpath(asset_path, root) if asset_path else None,
        "reference_asset_id": reference_asset.get("asset_id") if isinstance(reference_asset, dict) else None,
        "reference_asset_path": relpath(reference_path, root) if reference_path else None,
        "validated_count": 0,
        "reference_declared_decimals": reference_declared_decimals(reference_asset),
        "generated_stored_dps": asset.get("stored_dps"),
        "tolerance": str(tolerance),
        "max_deviation": None,
        "p95_deviation": None,
        "failed_indices": [],
        "failed_details": [],
        "status": "NOT_AVAILABLE",
        "valid_for_overkill": False,
        "valid_for_authoritative": False,
        "validation_limit": int(max_count) if max_count is not None else None,
        "created_at": utc_now(),
        "reason": reason,
    }
    write_json(_validation_path(asset, root), payload)
    return payload


def _cached_validation_is_current(
    cached: Dict[str, Any],
    asset: Dict[str, Any],
    reference_asset: Dict[str, Any],
    tolerance: str,
    max_count: Optional[int] = None,
) -> bool:
    if max_count is not None and int(cached.get("validation_limit") or 0) != int(max_count):
        return False
    return (
        cached.get("asset_id") == asset.get("asset_id")
        and cached.get("reference_asset_id") == reference_asset.get("asset_id")
        and str(cached.get("tolerance")) == str(tolerance)
        and cached.get("asset_hash") == asset.get("hash")
        and cached.get("reference_asset_hash") == reference_asset.get("hash")
        and cached.get("status") in {"PASS", "FAIL"}
    )


def validate_zero_asset_against_reference(
    asset: Dict[str, Any],
    reference_asset: Optional[Dict[str, Any]],
    tolerance: str | Decimal = DEFAULT_ZERO_REFERENCE_TOLERANCE,
    root: Path = ROOT,
    max_count: Optional[int] = None,
) -> Dict[str, Any]:
    """Compare overlapping zero indices and persist a validation artifact."""

    tolerance_text = str(tolerance)
    try:
        tol = Decimal(tolerance_text)
    except InvalidOperation:
        tol = Decimal(DEFAULT_ZERO_REFERENCE_TOLERANCE)
        tolerance_text = DEFAULT_ZERO_REFERENCE_TOLERANCE

    asset_path = _asset_path(asset, root)
    if asset_path is None or not asset_path.exists():
        return _not_available(asset, reference_asset, tolerance_text, "asset file is unavailable", root, max_count)
    if not reference_asset:
        return _not_available(asset, reference_asset, tolerance_text, "reference zero asset is unavailable", root, max_count)
    reference_path = _asset_path(reference_asset, root)
    if reference_path is None or not reference_path.exists():
        return _not_available(asset, reference_asset, tolerance_text, "reference zero asset is unavailable", root, max_count)

    validation_path = _validation_path(asset, root)
    if validation_path.exists():
        try:
            cached = json.loads(validation_path.read_text(encoding="utf-8"))
            if _cached_validation_is_current(cached, asset, reference_asset, tolerance_text, max_count):
                return cached
        except Exception:
            pass

    deviations: List[Decimal] = []
    failed_indices: List[int] = []
    failed_details: List[Dict[str, Any]] = []
    max_deviation = Decimal(0)
    count = 0

    for candidate_pair, reference_pair in zip(_iter_zero_tokens(asset_path), _iter_zero_tokens(reference_path)):
        if max_count is not None and count >= int(max_count):
            break
        candidate_text, candidate = candidate_pair
        reference_text, reference = reference_pair
        count += 1
        deviation = abs(candidate - reference)
        deviations.append(deviation)
        if deviation > max_deviation:
            max_deviation = deviation
        if deviation > tol:
            failed_indices.append(count)
            if len(failed_details) < 20:
                failed_details.append({
                    "index": int(count),
                    "generated_value": candidate_text,
                    "reference_value": reference_text,
                    "deviation": str(deviation),
                    "tolerance": tolerance_text,
                })

    if count == 0:
        return _not_available(asset, reference_asset, tolerance_text, "no overlapping zero indices", root, max_count)

    sorted_deviations = sorted(deviations)
    p95_deviation = _percentile(sorted_deviations, Decimal(95))
    status = "PASS" if not failed_indices else "FAIL"
    generated_stored_dps = asset.get("stored_dps")
    try:
        generated_stored_dps_int = int(generated_stored_dps)
    except (TypeError, ValueError):
        generated_stored_dps_int = 0
    valid_for_overkill = (
        status == "PASS"
        and int(count) >= OVERKILL_VALIDATION_COUNT
        and generated_stored_dps_int >= OVERKILL_REQUIRED_STORED_DPS
    )
    payload = {
        "asset_id": asset.get("asset_id"),
        "reference_asset_id": reference_asset.get("asset_id"),
        "asset_path": relpath(asset_path, root),
        "generated_asset_path": relpath(asset_path, root),
        "reference_asset_path": relpath(reference_path, root),
        "asset_hash": asset.get("hash") or hash_file(asset_path),
        "reference_asset_hash": reference_asset.get("hash") or hash_file(reference_path),
        "validated_count": int(count),
        "reference_declared_decimals": reference_declared_decimals(reference_asset),
        "generated_stored_dps": generated_stored_dps,
        "tolerance": tolerance_text,
        "max_deviation": str(max_deviation),
        "p95_deviation": str(p95_deviation),
        "failed_indices": failed_indices,
        "failed_details": failed_details,
        "status": status,
        "valid_for_overkill": valid_for_overkill,
        "valid_for_authoritative": status == "PASS",
        "validation_limit": int(max_count) if max_count is not None else None,
        "created_at": utc_now(),
        "reason": None if status == "PASS" else f"{len(failed_indices)} zero ordinates exceeded tolerance",
    }
    write_json(validation_path, payload)
    return payload


def load_zero_validation_artifacts(root: Path = ROOT) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    validation_root = root / "data" / "zeros" / "nontrivial"
    if not validation_root.exists():
        return out
    for path in sorted(validation_root.glob("*.validation.json")):
        try:
            parsed = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(parsed, dict):
                parsed.setdefault("path", relpath(path, root))
                out.append(parsed)
        except Exception:
            continue
    return out


if __name__ == "__main__":
    print(json.dumps({"validations": load_zero_validation_artifacts()}, indent=2, sort_keys=True))

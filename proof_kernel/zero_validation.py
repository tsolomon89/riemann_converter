"""Cross-check generated zero assets against reference zero assets."""

from __future__ import annotations

import gzip
import json
import os
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

from .data_assets import ROOT, hash_file, relpath, write_json

DEFAULT_ZERO_REFERENCE_TOLERANCE = "3e-9"


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
    stem_path = path.with_suffix("")
    if stem_path.suffix == ".jsonl" and path.suffix == ".gz":
        stem_path = stem_path.with_suffix("")
    return stem_path.with_suffix(".validation.json")


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
) -> Dict[str, Any]:
    payload = {
        "asset_id": asset.get("asset_id"),
        "reference_asset_id": reference_asset.get("asset_id") if isinstance(reference_asset, dict) else None,
        "validated_count": 0,
        "tolerance": str(tolerance),
        "max_deviation": None,
        "p95_deviation": None,
        "failed_indices": [],
        "status": "NOT_AVAILABLE",
        "valid_for_authoritative": False,
        "reason": reason,
    }
    write_json(_validation_path(asset, root), payload)
    return payload


def _cached_validation_is_current(
    cached: Dict[str, Any],
    asset: Dict[str, Any],
    reference_asset: Dict[str, Any],
    tolerance: str,
) -> bool:
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
        return _not_available(asset, reference_asset, tolerance_text, "asset file is unavailable", root)
    if not reference_asset:
        return _not_available(asset, reference_asset, tolerance_text, "reference zero asset is unavailable", root)
    reference_path = _asset_path(reference_asset, root)
    if reference_path is None or not reference_path.exists():
        return _not_available(asset, reference_asset, tolerance_text, "reference zero asset is unavailable", root)

    validation_path = _validation_path(asset, root)
    if validation_path.exists():
        try:
            cached = json.loads(validation_path.read_text(encoding="utf-8"))
            if _cached_validation_is_current(cached, asset, reference_asset, tolerance_text):
                return cached
        except Exception:
            pass

    deviations: List[Decimal] = []
    failed_indices: List[int] = []
    max_deviation = Decimal(0)
    count = 0

    for count, (candidate, reference) in enumerate(
        zip(_iter_zero_values(asset_path), _iter_zero_values(reference_path)),
        start=1,
    ):
        deviation = abs(candidate - reference)
        deviations.append(deviation)
        if deviation > max_deviation:
            max_deviation = deviation
        if deviation > tol:
            failed_indices.append(count)

    if count == 0:
        return _not_available(asset, reference_asset, tolerance_text, "no overlapping zero indices", root)

    sorted_deviations = sorted(deviations)
    p95_deviation = _percentile(sorted_deviations, Decimal(95))
    status = "PASS" if not failed_indices else "FAIL"
    payload = {
        "asset_id": asset.get("asset_id"),
        "reference_asset_id": reference_asset.get("asset_id"),
        "asset_path": relpath(asset_path, root),
        "reference_asset_path": relpath(reference_path, root),
        "asset_hash": asset.get("hash") or hash_file(asset_path),
        "reference_asset_hash": reference_asset.get("hash") or hash_file(reference_path),
        "validated_count": int(count),
        "tolerance": tolerance_text,
        "max_deviation": str(max_deviation),
        "p95_deviation": str(p95_deviation),
        "failed_indices": failed_indices,
        "status": status,
        "valid_for_authoritative": status == "PASS",
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

"""Generate canonical nontrivial zeta-zero ordinate assets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, Optional

import mpmath

from .data_assets import (
    ROOT,
    build_zero_asset_manifest,
    hash_file,
    load_data_manifest,
    relpath,
    utc_now,
    validate_zero_file,
    write_data_manifest,
    write_json,
)


def _zero_dir(root: Path) -> Path:
    return root / "data" / "zeros" / "nontrivial"


def _zero_asset_path(root: Path, stored_dps: int) -> Path:
    return _zero_dir(root) / f"zeros.generated.dps_{int(stored_dps)}.jsonl"


def _zero_manifest_path(root: Path, stored_dps: int) -> Path:
    return _zero_dir(root) / f"zeros.generated.dps_{int(stored_dps)}.manifest.json"


def _existing_sufficient_zero_asset(root: Path, count: int, stored_dps: int) -> Optional[Dict[str, Any]]:
    for asset in load_data_manifest(root).get("assets", []):
        if not isinstance(asset, dict):
            continue
        if asset.get("kind") != "nontrivial_zeta_zeros" or asset.get("valid") is not True:
            continue
        if int(asset.get("count") or 0) >= int(count) and int(asset.get("stored_dps") or 0) >= int(stored_dps):
            return asset
    return None


def _same_precision_extendable_asset(root: Path, stored_dps: int) -> Optional[Dict[str, Any]]:
    candidates = []
    for asset in load_data_manifest(root).get("assets", []):
        if not isinstance(asset, dict):
            continue
        if asset.get("kind") != "nontrivial_zeta_zeros" or asset.get("valid") is not True:
            continue
        if int(asset.get("stored_dps") or 0) == int(stored_dps):
            candidates.append(asset)
    if not candidates:
        return None
    return sorted(candidates, key=lambda item: int(item.get("count") or 0), reverse=True)[0]


def _read_existing_count(path: Path) -> int:
    if not path.exists():
        return 0
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        return sum(1 for line in handle if line.strip())


def ensure_nontrivial_zeros_asset(
    count: int,
    stored_dps: int,
    root: Path = ROOT,
    progress_every: int = 50,
) -> Dict[str, Any]:
    requested_count = int(count)
    dps = int(stored_dps)
    existing = _existing_sufficient_zero_asset(root, requested_count, dps)
    if existing:
        return existing

    extendable = _same_precision_extendable_asset(root, dps)
    if extendable and extendable.get("source_path"):
        path = root / str(extendable["source_path"])
    else:
        path = _zero_asset_path(root, dps)

    path.parent.mkdir(parents=True, exist_ok=True)
    current_count = _read_existing_count(path)
    mpmath.mp.dps = dps + 10

    with open(path, "a", encoding="utf-8", newline="\n") as handle:
        for i in range(current_count + 1, requested_count + 1):
            gamma = mpmath.zetazero(i).imag
            handle.write(mpmath.nstr(gamma, n=dps + 8, strip_zeros=False))
            handle.write("\n")
            if progress_every and i % progress_every == 0:
                handle.flush()

    validation = validate_zero_file(path)
    validation["hash"] = hash_file(path)
    now = utc_now()
    manifest = build_zero_asset_manifest(
        f"nontrivial_zeros_count_{validation.get('count')}_dps_{dps}",
        path,
        {
            **validation,
            "stored_dps": dps,
            "usable_dps": dps,
        },
        source_path=relpath(path, root),
        generator="mpmath.zetazero",
        created_at=now,
        root=root,
    )
    write_json(_zero_manifest_path(root, dps), manifest)
    write_data_manifest(root)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate canonical nontrivial zeta zero ordinates.")
    parser.add_argument("--count", type=int, required=True)
    parser.add_argument("--stored-dps", type=int, required=True)
    parser.add_argument("--repo-root", default=str(ROOT))
    args = parser.parse_args()
    print(json.dumps(
        ensure_nontrivial_zeros_asset(args.count, args.stored_dps, Path(args.repo_root).resolve()),
        indent=2,
    ))

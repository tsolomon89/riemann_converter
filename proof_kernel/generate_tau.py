"""Generate canonical high-precision tau assets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, Optional

import mpmath

from .data_assets import ROOT, hash_file, load_data_manifest, relpath, utc_now, write_data_manifest, write_json


def _tau_dir(root: Path) -> Path:
    return root / "data" / "constants" / "tau"


def _tau_asset_path(root: Path, stored_dps: int) -> Path:
    return _tau_dir(root) / f"tau.dps_{int(stored_dps)}.txt"


def _tau_manifest_path(root: Path, stored_dps: int) -> Path:
    return _tau_dir(root) / f"tau.dps_{int(stored_dps)}.manifest.json"


def _existing_sufficient_tau(root: Path, stored_dps: int) -> Optional[Dict[str, Any]]:
    for asset in load_data_manifest(root).get("assets", []):
        if not isinstance(asset, dict):
            continue
        if asset.get("kind") != "tau" or asset.get("valid") is not True:
            continue
        if int(asset.get("stored_dps") or 0) >= int(stored_dps):
            return asset
    return None


def ensure_tau_asset(stored_dps: int, root: Path = ROOT) -> Dict[str, Any]:
    existing = _existing_sufficient_tau(root, stored_dps)
    if existing:
        return existing

    dps = int(stored_dps)
    mpmath.mp.dps = dps + 10
    tau = 2 * mpmath.pi
    tau_text = mpmath.nstr(tau, n=dps + 2, strip_zeros=False)
    path = _tau_asset_path(root, dps)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(tau_text)
        handle.write("\n")
    tmp.replace(path)

    now = utc_now()
    manifest = {
        "asset_id": f"tau_dps_{dps}",
        "kind": "tau",
        "source_path": relpath(path, root),
        "generator": "mpmath.pi",
        "count": None,
        "max_value": None,
        "stored_dps": dps,
        "usable_dps": dps,
        "guard_dps": None,
        "strictly_increasing": None,
        "hash": hash_file(path),
        "created_at": now,
        "valid": True,
        "warnings": [],
        "errors": [],
    }
    write_json(_tau_manifest_path(root, dps), manifest)
    write_data_manifest(root)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a canonical tau asset.")
    parser.add_argument("--stored-dps", type=int, required=True)
    parser.add_argument("--repo-root", default=str(ROOT))
    args = parser.parse_args()
    print(json.dumps(ensure_tau_asset(args.stored_dps, Path(args.repo_root).resolve()), indent=2))

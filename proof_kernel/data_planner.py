"""Data sufficiency planner for research runs."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from .data_assets import ROOT, load_data_manifest
from .experiment_requirements import default_run_config, requirements_for_experiments


def _valid_assets_by_kind(manifest: Dict[str, Any], kind: str) -> List[Dict[str, Any]]:
    assets = manifest.get("assets", [])
    return [
        asset for asset in assets
        if isinstance(asset, dict) and asset.get("kind") == kind and asset.get("valid") is True
    ]


def _best_by_count_dps(assets: Iterable[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    candidates = list(assets)
    if not candidates:
        return None
    return sorted(
        candidates,
        key=lambda asset: (int(asset.get("count") or 0), int(asset.get("stored_dps") or 0)),
        reverse=True,
    )[0]


def _best_prime(assets: Iterable[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    candidates = list(assets)
    if not candidates:
        return None
    return sorted(
        candidates,
        key=lambda asset: (
            1 if asset.get("role") == "canonical_static_asset" else 0,
            int(asset.get("count") or 0),
            int(asset.get("max_prime") or asset.get("max_value") or 0),
        ),
        reverse=True,
    )[0]


def _asset_ref(asset: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not asset:
        return None
    keys = [
        "asset_id",
        "kind",
        "role",
        "source_path",
        "generator",
        "formula",
        "count",
        "max_prime",
        "max_value",
        "stored_dps",
        "usable_dps",
        "guard_dps",
        "strictly_increasing",
        "valid",
        "warnings",
        "errors",
    ]
    return {key: asset.get(key) for key in keys if key in asset}


def _status_from_findings(missing: List[Dict[str, Any]], insufficient: List[Dict[str, Any]]) -> str:
    if any(item.get("status") in {"INVALID", "BLOCKED"} for item in insufficient):
        return "BLOCKED"
    if any(item.get("reason") == "INSUFFICIENT_PRECISION" for item in insufficient):
        return "INSUFFICIENT"
    if missing or insufficient:
        return "NEEDS_GENERATION"
    return "READY"


def check_data_sufficiency(input_payload: Dict[str, Any] | None = None, root: Path = ROOT) -> Dict[str, Any]:
    payload = dict(input_payload or {})
    experiments = payload.get("experiments") or ["EXP_1", "EXP_6", "EXP_8"]
    if isinstance(experiments, str):
        experiments = [part.strip() for part in experiments.split(",") if part.strip()]

    requested_dps = int(payload.get("requested_dps") or payload.get("dps") or 80)
    requested_zero_count = int(payload.get("requested_zero_count") or payload.get("zeros") or payload.get("zero_count") or 100000)
    guard_dps = int(payload.get("guard_dps") or 20)

    run = default_run_config(
        requested_dps=requested_dps,
        requested_zero_count=requested_zero_count,
        guard_dps=guard_dps,
        **{
            k: v
            for k, v in payload.items()
            if k not in {"experiments", "requested_dps", "dps", "requested_zero_count", "zeros", "zero_count", "guard_dps"}
        },
    )
    requirements = requirements_for_experiments(experiments, run)
    manifest = load_data_manifest(root)

    available_assets: List[Dict[str, Any]] = []
    missing_assets: List[Dict[str, Any]] = []
    insufficient_assets: List[Dict[str, Any]] = []
    generation_plan: List[Dict[str, Any]] = []
    warnings: List[str] = []
    errors: List[str] = []

    for required in requirements["required_assets"]:
        kind = required["kind"]
        assets = _valid_assets_by_kind(manifest, kind)

        if kind == "tau":
            best = _best_by_count_dps(assets)
            available_assets.append({"required": required, "available": _asset_ref(best)})
            if not best:
                missing_assets.append({"kind": kind, "required": required})
                generation_plan.append({
                    "action": "generate_tau",
                    "command": f"python -m proof_kernel.generate_tau --stored-dps {required['stored_dps']}",
                })
            elif int(best.get("stored_dps") or 0) < int(required["stored_dps"]):
                insufficient_assets.append({
                    "kind": kind,
                    "reason": "INSUFFICIENT_PRECISION",
                    "required": required,
                    "available": _asset_ref(best),
                    "status": "INSUFFICIENT_PRECISION",
                })
                generation_plan.append({
                    "action": "generate_tau",
                    "command": f"python -m proof_kernel.generate_tau --stored-dps {required['stored_dps']}",
                })
            continue

        if kind == "nontrivial_zeta_zeros":
            best = _best_by_count_dps(assets)
            available_assets.append({"required": required, "available": _asset_ref(best)})
            if not best:
                missing_assets.append({"kind": kind, "required": required})
                generation_plan.append({
                    "action": "generate_nontrivial_zeros",
                    "command": (
                        "python -m proof_kernel.generate_zeros "
                        f"--count {required['count']} --stored-dps {required['stored_dps']}"
                    ),
                })
            else:
                available_count = int(best.get("count") or 0)
                available_dps = int(best.get("stored_dps") or 0)
                if available_count < int(required["count"]):
                    insufficient_assets.append({
                        "kind": kind,
                        "reason": "INSUFFICIENT_COUNT",
                        "required": required,
                        "available": _asset_ref(best),
                        "status": "NEEDS_EXTENSION",
                    })
                    generation_plan.append({
                        "action": "generate_nontrivial_zeros",
                        "command": (
                            "python -m proof_kernel.generate_zeros "
                            f"--count {required['count']} --stored-dps {required['stored_dps']}"
                        ),
                    })
                if available_dps < int(required["stored_dps"]):
                    insufficient_assets.append({
                        "kind": kind,
                        "reason": "INSUFFICIENT_PRECISION",
                        "required": required,
                        "available": _asset_ref(best),
                        "status": "INSUFFICIENT_PRECISION",
                    })
                    generation_plan.append({
                        "action": "generate_nontrivial_zeros",
                        "command": (
                            "python -m proof_kernel.generate_zeros "
                            f"--count {required['count']} --stored-dps {required['stored_dps']}"
                        ),
                    })
            continue

        if kind == "trivial_zeta_zeros":
            best = _best_by_count_dps(assets)
            available_assets.append({"required": required, "available": _asset_ref(best)})
            if not best:
                missing_assets.append({"kind": kind, "required": required})
                errors.append("Trivial zero formula asset is missing from data/manifest.json.")
            continue

        if kind == "primes":
            best = _best_prime(assets)
            available_assets.append({"required": required, "available": _asset_ref(best)})
            if not best:
                missing_assets.append({"kind": kind, "required": required})
                generation_plan.append({
                    "action": "generate_primes_fallback",
                    "command": (
                        "python -m proof_kernel.generate_primes "
                        f"--required-count {required.get('count') or 0} "
                        f"--required-max-prime {required.get('max_prime') or 2}"
                    ),
                })
            else:
                count_ok = int(best.get("count") or 0) >= int(required.get("count") or 0)
                max_ok = int(best.get("max_prime") or best.get("max_value") or 0) >= int(required.get("max_prime") or 0)
                if not count_ok or not max_ok:
                    insufficient_assets.append({
                        "kind": kind,
                        "reason": "INSUFFICIENT_COVERAGE",
                        "required": required,
                        "available": _asset_ref(best),
                        "status": "INSUFFICIENT_COVERAGE",
                    })
                    generation_plan.append({
                        "action": "generate_primes_fallback",
                        "command": (
                            "python -m proof_kernel.generate_primes "
                            f"--required-count {required.get('count') or 0} "
                            f"--required-max-prime {required.get('max_prime') or 2}"
                        ),
                    })

    # Deduplicate identical generation commands.
    seen = set()
    deduped_plan = []
    for step in generation_plan:
        key = (step.get("action"), step.get("command"))
        if key in seen:
            continue
        seen.add(key)
        deduped_plan.append(step)

    status = _status_from_findings(missing_assets, insufficient_assets)
    next_action = None
    if deduped_plan:
        next_action = deduped_plan[0]["action"]
    elif status == "READY":
        next_action = "run_next_research_step"

    return {
        "status": status,
        "mode": payload.get("mode", "same_object_certificate"),
        "required_assets": requirements["required_assets"],
        "available_assets": available_assets,
        "missing_assets": missing_assets,
        "insufficient_assets": insufficient_assets,
        "generation_plan": deduped_plan,
        "warnings": warnings,
        "errors": errors,
        "next_action": next_action,
        "requirements": requirements,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Check data sufficiency for a research run.")
    parser.add_argument("--mode", default="same_object_certificate")
    parser.add_argument("--experiments", default="EXP_1,EXP_6,EXP_8")
    parser.add_argument("--dps", type=int, default=80)
    parser.add_argument("--zeros", type=int, default=100000)
    parser.add_argument("--guard-dps", type=int, default=20)
    args = parser.parse_args()
    payload = {
        "mode": args.mode,
        "experiments": args.experiments.split(","),
        "requested_dps": args.dps,
        "requested_zero_count": args.zeros,
        "guard_dps": args.guard_dps,
    }
    print(json.dumps(check_data_sufficiency(payload), indent=2))

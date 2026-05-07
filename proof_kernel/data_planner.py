"""Data sufficiency planner for research runs."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from .data_assets import ROOT, load_data_manifest
from .experiment_requirements import default_run_config, requirements_for_experiments
from .run_presets import is_run_preset, resolve_run_preset
from .zero_validation import (
    DEFAULT_ZERO_REFERENCE_TOLERANCE,
    OVERKILL_VALIDATION_COUNT,
    load_zero_validation_artifacts,
    tolerance_for_reference_asset,
    validate_zero_asset_against_reference,
)


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


def _asset_sort_key(asset: Dict[str, Any]) -> tuple[int, int, str]:
    return (
        int(asset.get("stored_dps") or 0),
        int(asset.get("count") or 0),
        str(asset.get("asset_id") or ""),
    )


def _is_generated_zero_asset(asset: Dict[str, Any]) -> bool:
    text = " ".join(
        str(asset.get(key) or "")
        for key in ("asset_id", "source_path", "source_original_path", "generator")
    ).lower()
    if "generated" in text:
        return True
    generator = str(asset.get("generator") or "").lower()
    return any(token in generator for token in ("python-flint", "mpmath", "siegelz", "zetazero"))


def _is_reference_zero_asset(asset: Dict[str, Any]) -> bool:
    if _is_generated_zero_asset(asset):
        return False
    text = " ".join(
        str(asset.get(key) or "")
        for key in ("asset_id", "source_path", "source_original_path", "generator", "role")
    ).lower()
    return any(token in text for token in ("odlyzko", "reference", "zeros_"))


def _best_reference_zero_asset(
    assets: Iterable[Dict[str, Any]],
    required_count: int,
) -> Optional[Dict[str, Any]]:
    candidates = [
        asset for asset in assets
        if _is_reference_zero_asset(asset) and int(asset.get("count") or 0) >= int(required_count)
    ]
    if not candidates:
        return None
    return sorted(candidates, key=_asset_sort_key, reverse=True)[0]


def _zero_selection_reason(asset: Optional[Dict[str, Any]], reason: str) -> Dict[str, Any]:
    return {
        "asset": _asset_ref(asset),
        "reason": reason,
    }


def _best_for_required_asset(
    assets: Iterable[Dict[str, Any]],
    required: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    candidates = list(assets)
    if not candidates:
        return None
    required_count = int(required.get("count") or 0)
    required_dps = int(required.get("stored_dps") or 0)
    return sorted(
        candidates,
        key=lambda asset: (
            1 if int(asset.get("stored_dps") or 0) >= required_dps else 0,
            1 if int(asset.get("count") or 0) >= required_count else 0,
            int(asset.get("stored_dps") or 0),
            int(asset.get("count") or 0),
        ),
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
        "validation_artifact_path",
        "validation_status",
        "reference_asset_id",
        "reference_asset_path",
        "valid_for_overkill",
        "warnings",
        "errors",
    ]
    return {key: asset.get(key) for key in keys if key in asset}


def _select_zero_asset(
    assets: Iterable[Dict[str, Any]],
    required: Dict[str, Any],
    zero_policy: Dict[str, Any],
    root: Path,
) -> Dict[str, Any]:
    candidates = list(assets)
    required_count = int(required.get("count") or 0)
    required_dps = int(required.get("stored_dps") or 0)
    allow_fallback = bool(zero_policy.get("allow_lower_precision_fallback"))
    require_crosscheck = bool(zero_policy.get("require_odlyzko_crosscheck"))
    strict_block = bool(zero_policy.get("block_on_policy_failure") or (require_crosscheck and not allow_fallback))
    configured_tolerance = zero_policy.get("crosscheck_tolerance")

    strong_generated = [
        asset for asset in candidates
        if (
            _is_generated_zero_asset(asset)
            and int(asset.get("count") or 0) >= required_count
            and int(asset.get("stored_dps") or 0) >= required_dps
        )
    ]
    incomplete_generated = [
        asset for asset in candidates
        if (
            _is_generated_zero_asset(asset)
            and int(asset.get("count") or 0) < required_count
            and int(asset.get("stored_dps") or 0) >= required_dps
        )
    ]
    strong_reference = [
        asset for asset in candidates
        if (
            _is_reference_zero_asset(asset)
            and int(asset.get("count") or 0) >= required_count
            and int(asset.get("stored_dps") or 0) >= required_dps
        )
    ]
    reference_asset = _best_reference_zero_asset(candidates, required_count)
    warnings: List[str] = []
    blockers: List[Dict[str, Any]] = []
    validation: Optional[Dict[str, Any]] = None

    if strong_generated:
        sorted_generated = sorted(strong_generated, key=_asset_sort_key, reverse=True)
        selected = sorted_generated[0]
        reason = "highest valid generated high-dps asset satisfying count + dps + guard"
        if require_crosscheck:
            for candidate in sorted_generated:
                selected = candidate
                tolerance = str(configured_tolerance or tolerance_for_reference_asset(reference_asset))
                if not reference_asset:
                    validation = validate_zero_asset_against_reference(
                        candidate,
                        None,
                        tolerance,
                        root,
                        max_count=required_count,
                    )
                    blockers.append({
                        "kind": "nontrivial_zeta_zeros",
                        "reason": "ODLYZKO_REFERENCE_UNAVAILABLE",
                        "status": "BLOCKED",
                        "required": required,
                        "available": _asset_ref(candidate),
                        "validation": validation,
                    })
                    continue
                validation = validate_zero_asset_against_reference(
                    candidate,
                    reference_asset,
                    tolerance,
                    root,
                    max_count=required_count,
                )
                if validation.get("status") == "PASS" and int(validation.get("validated_count") or 0) >= required_count:
                    return {
                        "selected": candidate,
                        "reason": reason,
                        "validation": validation,
                        "reference_asset": reference_asset,
                        "warnings": warnings,
                        "blockers": [],
                    }
                if validation.get("status") != "PASS":
                    blockers.append({
                        "kind": "nontrivial_zeta_zeros",
                        "reason": "ODLYZKO_CROSSCHECK_FAILED",
                        "status": "BLOCKED",
                        "required": required,
                        "available": _asset_ref(candidate),
                        "validation": validation,
                    })
                else:
                    blockers.append({
                        "kind": "nontrivial_zeta_zeros",
                        "reason": "ODLYZKO_CROSSCHECK_INCOMPLETE",
                        "status": "BLOCKED",
                        "required": required,
                        "available": _asset_ref(candidate),
                        "validation": validation,
                    })
            if strong_reference:
                selected_reference = sorted(strong_reference, key=_asset_sort_key, reverse=True)[0]
                validation = {
                    "asset_id": selected_reference.get("asset_id"),
                    "reference_asset_id": selected_reference.get("asset_id"),
                    "validated_count": int(selected_reference.get("count") or 0),
                    "tolerance": "self",
                    "max_deviation": "0",
                    "p95_deviation": "0",
                    "failed_indices": [],
                    "status": "PASS",
                    "valid_for_overkill": (
                        int(selected_reference.get("count") or 0) >= 60000
                        and int(selected_reference.get("stored_dps") or 0) >= 100
                    ),
                    "valid_for_authoritative": True,
                    "reason": "selected reference asset",
                }
                return {
                    "selected": selected_reference,
                    "reason": "highest valid Odlyzko/reference asset satisfying count + precision",
                    "validation": validation,
                    "reference_asset": selected_reference,
                    "warnings": warnings,
                    "blockers": [],
                }
        else:
            return {
                "selected": selected,
                "reason": reason,
                "validation": validation,
                "reference_asset": reference_asset,
                "warnings": warnings,
                "blockers": blockers,
            }
        return {
            "selected": selected,
            "reason": reason,
            "validation": validation,
            "reference_asset": reference_asset,
            "warnings": warnings,
            "blockers": blockers,
        }

    if incomplete_generated and not allow_fallback:
        selected = sorted(incomplete_generated, key=_asset_sort_key, reverse=True)[0]
        return {
            "selected": selected,
            "reason": "generated high-dps zero source requires extension to requested count",
            "validation": None,
            "reference_asset": reference_asset,
            "warnings": warnings,
            "blockers": blockers,
            "precision_fallback": False,
        }

    if strong_reference:
        selected = sorted(strong_reference, key=_asset_sort_key, reverse=True)[0]
        validation = {
            "asset_id": selected.get("asset_id"),
            "reference_asset_id": selected.get("asset_id"),
            "validated_count": int(selected.get("count") or 0),
            "tolerance": "self",
            "max_deviation": "0",
            "p95_deviation": "0",
            "failed_indices": [],
            "status": "PASS",
            "valid_for_authoritative": True,
            "reason": "selected reference asset",
        }
        return {
            "selected": selected,
            "reason": "highest valid Odlyzko/reference asset satisfying count + precision",
            "validation": validation,
            "reference_asset": selected,
            "warnings": warnings,
            "blockers": blockers,
        }

    fallback_candidates = [
        asset for asset in candidates
        if int(asset.get("count") or 0) >= required_count
    ]
    fallback = _best_by_count_dps(fallback_candidates) or _best_by_count_dps(candidates)
    if fallback and allow_fallback:
        warnings.append(
            "Selected lower-precision nontrivial zero source because the preset allows fallback."
        )
        return {
            "selected": fallback,
            "reason": "lower-precision fallback allowed by preset",
            "validation": None,
            "reference_asset": reference_asset,
            "warnings": warnings,
            "blockers": blockers,
            "precision_fallback": True,
        }

    if fallback and int(fallback.get("count") or 0) < required_count and int(fallback.get("stored_dps") or 0) >= required_dps:
        return {
            "selected": fallback,
            "reason": "best available zero source requires count extension",
            "validation": None,
            "reference_asset": reference_asset,
            "warnings": warnings,
            "blockers": blockers,
            "precision_fallback": False,
        }

    selected_ref = _asset_ref(fallback)
    available_dps = selected_ref.get("stored_dps") if selected_ref else None
    blockers.append({
        "kind": "nontrivial_zeta_zeros",
        "reason": "INSUFFICIENT_PRECISION",
        "status": "BLOCKED" if strict_block else "INSUFFICIENT_PRECISION",
        "required": required,
        "available": selected_ref,
    })
    if fallback:
        blockers[-1]["message"] = (
            f"Run blocked. Preset requires nontrivial zero asset with >={required_dps} stored dps "
            f"and Odlyzko cross-check PASS. Selected source has only {available_dps} declared decimals."
        )
    return {
        "selected": fallback,
        "reason": "no acceptable zero source satisfies count + dps + guard",
        "validation": None,
        "reference_asset": reference_asset,
        "warnings": warnings,
        "blockers": blockers,
        "precision_fallback": False,
    }


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
    preset_name = payload.get("preset")
    if preset_name is None and is_run_preset(payload.get("mode")):
        preset_name = payload.get("mode")
    contract = resolve_run_preset(str(preset_name)) if preset_name else None

    experiments = payload.get("experiments") or ["EXP_1", "EXP_6", "EXP_8"]
    if isinstance(experiments, str):
        experiments = [part.strip() for part in experiments.split(",") if part.strip()]

    requested_dps = int(
        payload.get("requested_dps")
        or payload.get("dps")
        or (contract or {}).get("requested_dps")
        or 80
    )
    requested_zero_count = int(
        payload.get("requested_zero_count")
        or payload.get("zeros")
        or payload.get("zero_count")
        or (contract or {}).get("requested_zero_count")
        or 100000
    )
    guard_dps = int(payload.get("guard_dps") or (contract or {}).get("guard_dps") or 20)

    runtime_defaults = {}
    if isinstance((contract or {}).get("runtime_policy"), dict):
        runtime_defaults.update((contract or {}).get("runtime_policy") or {})
    runtime_overrides = {
        k: v
        for k, v in payload.items()
        if k not in {
            "experiments",
            "requested_dps",
            "dps",
            "requested_zero_count",
            "zeros",
            "zero_count",
            "guard_dps",
            "preset",
            "zero_policy",
            "tau_policy",
            "prime_policy",
            "certificate_policy",
            "runtime_policy",
        }
    }
    run = default_run_config(
        requested_dps=requested_dps,
        requested_zero_count=requested_zero_count,
        guard_dps=guard_dps,
        **{**runtime_defaults, **runtime_overrides},
    )
    requirements = requirements_for_experiments(experiments, run)
    manifest = load_data_manifest(root)

    available_assets: List[Dict[str, Any]] = []
    missing_assets: List[Dict[str, Any]] = []
    insufficient_assets: List[Dict[str, Any]] = []
    generation_plan: List[Dict[str, Any]] = []
    warnings: List[str] = []
    errors: List[str] = []
    selected_assets: Dict[str, Any] = {}

    zero_policy = {
        "selection": "highest_available",
        "allow_lower_precision_fallback": False,
        "require_odlyzko_crosscheck": False,
    }
    tau_policy = {"selection": "highest_available", "require_dps_plus_guard": True}
    prime_policy = {"selection": "canonical_7m", "require_sufficient_max_prime": True}
    certificate_policy = {"require_raw_high_precision_artifacts": False}
    if contract:
        zero_policy.update(contract.get("zero_policy") or {})
        tau_policy.update(contract.get("tau_policy") or {})
        prime_policy.update(contract.get("prime_policy") or {})
        certificate_policy.update(contract.get("certificate_policy") or {})
    zero_policy.update(payload.get("zero_policy") or {})
    tau_policy.update(payload.get("tau_policy") or {})
    prime_policy.update(payload.get("prime_policy") or {})
    certificate_policy.update(payload.get("certificate_policy") or {})

    for required in requirements["required_assets"]:
        kind = required["kind"]
        assets = _valid_assets_by_kind(manifest, kind)

        if kind == "tau":
            best = _best_for_required_asset(assets, required)
            available_assets.append({"required": required, "available": _asset_ref(best)})
            selected_assets["tau"] = {
                "asset": _asset_ref(best),
                "reason": "highest valid tau asset satisfying dps + guard",
            }
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
            selection = _select_zero_asset(assets, required, zero_policy, root)
            best = selection.get("selected")
            available_assets.append({"required": required, "available": _asset_ref(best)})
            selected_assets["zero"] = {
                "asset": _asset_ref(best),
                "reason": selection.get("reason"),
                "reference_asset": _asset_ref(selection.get("reference_asset")),
                "validation": selection.get("validation"),
                "policy": zero_policy,
            }
            warnings.extend(selection.get("warnings") or [])
            insufficient_assets.extend(selection.get("blockers") or [])
            if not best:
                missing_assets.append({"kind": kind, "required": required})
                generation_plan.append({
                    "action": "generate_nontrivial_zeros",
                    "command": (
                        "python -m proof_kernel.generate_zeros "
                        f"--count {required['count']} --stored-dps {required['stored_dps']}"
                    ),
                })
            elif not selection.get("blockers"):
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
                if available_dps < int(required["stored_dps"]) and not selection.get("precision_fallback"):
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
            selected_assets["trivial_zeros"] = {
                "asset": _asset_ref(best),
                "reason": "formulaic trivial zeros",
            }
            if not best:
                missing_assets.append({"kind": kind, "required": required})
                errors.append("Trivial zero formula asset is missing from data/manifest.json.")
            continue

        if kind == "primes":
            best = _best_prime(assets)
            available_assets.append({"required": required, "available": _asset_ref(best)})
            selected_assets["prime"] = {
                "asset": _asset_ref(best),
                "reason": "canonical 7M prime asset" if best and best.get("role") == "canonical_static_asset" else "highest valid prime asset",
                "policy": prime_policy,
            }
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
        "preset": contract.get("preset") if contract else None,
        "run_contract": contract,
        "required_assets": requirements["required_assets"],
        "selected_assets": selected_assets,
        "available_assets": available_assets,
        "missing_assets": missing_assets,
        "insufficient_assets": insufficient_assets,
        "generation_plan": deduped_plan,
        "warnings": warnings,
        "errors": errors,
        "next_action": next_action,
        "requirements": requirements,
        "policies": {
            "zero_policy": zero_policy,
            "tau_policy": tau_policy,
            "prime_policy": prime_policy,
            "certificate_policy": certificate_policy,
        },
    }


def _block_reason(plan: Dict[str, Any]) -> str:
    if plan.get("status") == "READY":
        return "Run status: READY"
    insufficient = plan.get("insufficient_assets") or []
    if insufficient:
        first = insufficient[0]
        if first.get("message"):
            return str(first["message"])
        kind = first.get("kind")
        reason = first.get("reason")
        required = first.get("required") or {}
        available = first.get("available") or {}
        if reason == "ODLYZKO_CROSSCHECK_FAILED":
            validation = first.get("validation") or {}
            details = validation.get("failed_details") or []
            if details:
                failed = details[0]
                return (
                    f"Run blocked. Preset {plan.get('preset')} requires Odlyzko cross-check PASS; "
                    f"first failed index {failed.get('index')}: generated={failed.get('generated_value')}, "
                    f"reference={failed.get('reference_value')}, deviation={failed.get('deviation')}, "
                    f"tolerance={failed.get('tolerance')}."
                )
            return (
                f"Run blocked. Preset {plan.get('preset')} requires Odlyzko cross-check PASS; "
                f"validation status is {validation.get('status')}."
            )
        if reason == "ODLYZKO_REFERENCE_UNAVAILABLE":
            return (
                f"Run blocked. Preset {plan.get('preset')} requires an Odlyzko/reference zero asset "
                "for cross-check, but none is available."
            )
        if reason == "ODLYZKO_CROSSCHECK_INCOMPLETE":
            validation = first.get("validation") or {}
            required = first.get("required") or {}
            return (
                f"Run blocked. Preset {plan.get('preset')} requires Odlyzko cross-check over "
                f"{required.get('count')} zeros; validation covered {validation.get('validated_count')}."
            )
        if kind == "nontrivial_zeta_zeros" and reason == "INSUFFICIENT_PRECISION":
            return (
                f"Run blocked. Preset {plan.get('preset')} requires nontrivial zero asset with "
                f">={required.get('stored_dps')} stored dps and Odlyzko cross-check PASS. "
                f"Selected source has only {available.get('stored_dps')} declared decimals."
            )
        return f"Run blocked. Required {kind} asset failed policy: {reason}."
    missing = plan.get("missing_assets") or []
    if missing:
        first = missing[0]
        return f"Run blocked. Required {first.get('kind')} asset is missing."
    errors = plan.get("errors") or []
    if errors:
        return f"Run blocked. {errors[0]}"
    return "Run blocked. Data preflight failed."


def _next_action_for_preflight(plan: Dict[str, Any]) -> Optional[str]:
    if plan.get("status") == "READY":
        return "run_next_research_step"
    selected_zero = ((plan.get("selected_assets") or {}).get("zero") or {}).get("asset") or {}
    required = next(
        (
            asset for asset in plan.get("required_assets") or []
            if asset.get("kind") == "nontrivial_zeta_zeros"
        ),
        {},
    )
    selected_dps = int(selected_zero.get("stored_dps") or 0)
    required_dps = int(required.get("stored_dps") or 0)
    if selected_zero and selected_dps < required_dps:
        high_dps_assets = [
            item for item in plan.get("available_assets") or []
            if (
                (item.get("available") or {}).get("kind") == "nontrivial_zeta_zeros"
                and int((item.get("available") or {}).get("stored_dps") or 0) >= required_dps
            )
        ]
        if high_dps_assets:
            return "fix_preset_source_resolver"
        return "generate_high_dps_zero_asset"
    reasons = {item.get("reason") for item in plan.get("insufficient_assets") or []}
    if "INSUFFICIENT_COUNT" in reasons:
        return "EXTEND_ZERO_ASSET_TO_60000" if plan.get("preset") == "overkill" else "extend_zero_asset"
    if "ODLYZKO_CROSSCHECK_FAILED" in reasons:
        return "INVESTIGATE_ZERO_MISMATCH"
    if {"ODLYZKO_REFERENCE_UNAVAILABLE", "ODLYZKO_CROSSCHECK_INCOMPLETE"} & reasons:
        return "VALIDATE_GENERATED_ZEROS_AGAINST_ODLYZKO"
    return plan.get("next_action") or "fix_data_preflight"


def run_preflight(input_payload: Dict[str, Any] | None = None, root: Path = ROOT) -> Dict[str, Any]:
    payload = dict(input_payload or {})
    preset = payload.get("preset") or (payload.get("mode") if is_run_preset(payload.get("mode")) else "standard")
    contract = resolve_run_preset(str(preset))
    plan = check_data_sufficiency({**contract, **payload, "preset": contract["preset"]}, root)
    status = "READY" if plan.get("status") == "READY" else "BLOCKED"
    zero_selection = (plan.get("selected_assets") or {}).get("zero") or {}
    zero_asset = zero_selection.get("asset") or {}
    zero_validation = zero_selection.get("validation") or {}
    reference_asset = zero_selection.get("reference_asset") or {}
    blocking_reasons = [
        item.get("reason")
        for item in plan.get("insufficient_assets") or []
        if item.get("reason")
    ]
    return {
        "preset": contract["preset"],
        "requested_zero_count": contract["requested_zero_count"],
        "requested_dps": contract["requested_dps"],
        "guard_dps": contract["guard_dps"],
        "required_stored_dps": int(contract["requested_dps"]) + int(contract["guard_dps"]),
        "selected_zero_source": zero_asset.get("source_path"),
        "zero_validation_status": zero_validation.get("status") or "NOT_AVAILABLE",
        "reference_source": reference_asset.get("source_path"),
        "status": status,
        "run_status": status,
        "blocking_reasons": blocking_reasons,
        "reason": _block_reason(plan) if status != "READY" else "highest valid assets satisfy preset policies",
        "contract": contract,
        "selected_assets": plan.get("selected_assets") or {},
        "data_sufficiency": plan,
        "warnings": plan.get("warnings") or [],
        "errors": plan.get("errors") or [],
        "next_action": _next_action_for_preflight(plan),
    }


def get_selected_data_source(input_payload: Dict[str, Any] | None = None, root: Path = ROOT) -> Dict[str, Any]:
    preflight = run_preflight(input_payload, root)
    return {
        "preset": preflight["preset"],
        "status": preflight["status"],
        "reason": preflight["reason"],
        "selected_assets": preflight["selected_assets"],
        "zero_source": ((preflight["selected_assets"].get("zero") or {}).get("asset") or {}).get("source_path"),
        "tau_source": ((preflight["selected_assets"].get("tau") or {}).get("asset") or {}).get("asset_id"),
        "prime_source": ((preflight["selected_assets"].get("prime") or {}).get("asset") or {}).get("source_path"),
        "odlyzko_crosscheck": (((preflight["selected_assets"].get("zero") or {}).get("validation") or {}).get("status")),
    }


def validate_zero_assets(root: Path = ROOT) -> Dict[str, Any]:
    manifest = load_data_manifest(root)
    zeros = _valid_assets_by_kind(manifest, "nontrivial_zeta_zeros")
    reference = _best_reference_zero_asset(zeros, 1)
    validations = []
    for asset in zeros:
        if not _is_generated_zero_asset(asset):
            continue
        tolerance = tolerance_for_reference_asset(reference)
        validations.append(
            validate_zero_asset_against_reference(
                asset,
                reference,
                tolerance,
                root,
                max_count=OVERKILL_VALIDATION_COUNT,
            )
        )
    return {
        "reference_asset": _asset_ref(reference),
        "validations": validations,
        "existing_validation_artifacts": load_zero_validation_artifacts(root),
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

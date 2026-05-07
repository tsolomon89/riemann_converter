"""Combine data readiness, experiment results, and certificate state."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from .data_planner import check_data_sufficiency
from .research_plan import build_research_plan


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _is_generated_zero_source(info: Dict[str, Any]) -> bool:
    source_kind = str(info.get("source_kind") or "")
    source_path = str(info.get("source_path") or "")
    return "generated" in source_kind or "zeros.generated" in source_path


def _overkill_60k_baseline_artifact(experiment_summary: Dict[str, Any] | None) -> bool:
    meta = (experiment_summary or {}).get("meta") if isinstance(experiment_summary, dict) else {}
    if not isinstance(meta, dict):
        return False
    info = meta.get("zero_source_info") if isinstance(meta.get("zero_source_info"), dict) else {}
    requested = _as_int(info.get("requested_count"), _as_int(meta.get("zeros")))
    loaded = _as_int(info.get("loaded_count"), _as_int(meta.get("zeros")))
    declared = _as_int(info.get("declared_decimals"), 75)
    return (
        _as_int(meta.get("dps")) == 80
        and requested == 60000
        and loaded >= 60000
        and info.get("valid") is not False
        and _is_generated_zero_source(info)
        and declared >= 75
    )


def _overkill_60k_run_completed(experiment_summary: Dict[str, Any] | None) -> bool:
    if _overkill_60k_baseline_artifact(experiment_summary):
        return True

    meta = (experiment_summary or {}).get("meta") if isinstance(experiment_summary, dict) else {}
    if not isinstance(meta, dict):
        return False
    contract = meta.get("run_contract") if isinstance(meta.get("run_contract"), dict) else {}
    selected_zero = (((meta.get("selected_data_sources") or {}).get("zero") or {}))
    validation = selected_zero.get("validation") or {}
    asset = selected_zero.get("asset") or {}
    return (
        contract.get("preset") == "overkill"
        and int(contract.get("requested_zero_count") or 0) == 60000
        and int(contract.get("requested_dps") or 0) == 80
        and int(contract.get("guard_dps") or 20) == 20
        and validation.get("status") == "PASS"
        and int(validation.get("validated_count") or 0) >= 60000
        and int(asset.get("stored_dps") or 0) >= 100
    )


def _blocked_data_next_action(ds: Dict[str, Any]) -> str:
    reasons = {item.get("reason") for item in ds.get("insufficient_assets") or []}
    if "ODLYZKO_CROSSCHECK_FAILED" in reasons:
        return "INVESTIGATE_ZERO_MISMATCH"
    if {"ODLYZKO_REFERENCE_UNAVAILABLE", "ODLYZKO_CROSSCHECK_INCOMPLETE"} & reasons:
        return "VALIDATE_GENERATED_ZEROS_AGAINST_ODLYZKO"
    if "INSUFFICIENT_COUNT" in reasons and ds.get("preset") == "overkill":
        return "EXTEND_ZERO_ASSET_TO_60000"
    step = (ds.get("generation_plan") or [{}])[0]
    return str(step.get("action") or ds.get("next_action") or "FIX_DATA").upper()


def build_next_action(
    data_sufficiency: Dict[str, Any] | None = None,
    experiment_summary: Dict[str, Any] | None = None,
    certificate: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    ds = data_sufficiency or check_data_sufficiency()
    plan = build_research_plan(ds, experiment_summary or {}, certificate)
    meta = (experiment_summary or {}).get("meta") if isinstance(experiment_summary, dict) else {}
    if isinstance(meta, dict):
        contract = meta.get("run_contract") if isinstance(meta.get("run_contract"), dict) else {}
        preset = contract.get("preset")
        selected_zero = (((meta.get("selected_data_sources") or {}).get("zero") or {}).get("asset") or {})
        declared = selected_zero.get("stored_dps") or (meta.get("zero_source_info") or {}).get("declared_decimals")
        required = int(contract.get("requested_dps") or meta.get("dps") or 0) + int(contract.get("guard_dps") or 20)
        planner_zero = (((ds.get("selected_assets") or {}).get("zero") or {}).get("asset") or {})
        planner_has_stronger = int(planner_zero.get("stored_dps") or 0) >= required
        if declared is not None and int(declared) < required and (
            not _overkill_60k_baseline_artifact(experiment_summary)
            and (preset in {"overkill", "authoritative", "overkill_full"} or planner_has_stronger)
        ):
            return {
                "next_action": "FIX_PRESET_SOURCE_RESOLVER",
                "command": None,
                "why": (
                    f"{'Preset ' + preset if preset else 'Run'} used a zero source with {declared} declared decimals; "
                    f"required >={required}. Fix preset/source resolver before proof work."
                ),
                "blocks": ["DATA_PREFLIGHT"],
                "data_sufficiency": ds,
                "research_plan": plan,
            }

    if ds.get("status") != "READY":
        step = (ds.get("generation_plan") or [{}])[0]
        return {
            "next_action": _blocked_data_next_action(ds),
            "command": step.get("command"),
            "why": _data_why(ds),
            "blocks": [item for item in plan.get("blocked_nodes", [])],
            "data_sufficiency": ds,
            "research_plan": plan,
        }

    if ds.get("preset") == "overkill" and not _overkill_60k_run_completed(experiment_summary):
        return {
            "next_action": "RERUN_OVERKILL_60K_WITH_VALIDATED_HIGH_DPS_ZEROS",
            "command": "python experiment_engine.py --preset overkill --zero-count 60000 --dps 80",
            "why": "Overkill 60K preflight is ready; a clean overkill 60K run has not completed yet.",
            "blocks": ["RUN_OVERKILL_60K"],
            "data_sufficiency": ds,
            "research_plan": plan,
        }

    recommended = str(plan.get("recommended_next_action") or "NO_ACTION")
    command = (plan.get("commands") or [None])[0]
    if recommended == "RECOMMEND_NC3_NC4_FORMALIZATION":
        return {
            "next_action": "WRITE_FORMAL_LEMMA",
            "target": "NC3/NC4",
            "command": None,
            "why": plan.get("why"),
            "blocks": ["FORMAL_PROOF_CLOSURE"],
            "data_sufficiency": ds,
            "research_plan": plan,
        }

    return {
        "next_action": recommended,
        "command": command,
        "why": plan.get("why"),
        "blocks": plan.get("blocked_nodes", []),
        "data_sufficiency": ds,
        "research_plan": plan,
    }


def _data_why(ds: Dict[str, Any]) -> str:
    insufficient = ds.get("insufficient_assets") or []
    missing = ds.get("missing_assets") or []
    if missing:
        first = missing[0]
        return f"Required {first.get('kind')} asset is missing for the requested run."
    if insufficient:
        first = insufficient[0]
        kind = first.get("kind")
        reason = first.get("reason")
        required = first.get("required") or {}
        available = first.get("available") or {}
        if reason == "INSUFFICIENT_PRECISION":
            return (
                f"Requested run requires {kind} stored_dps >= {required.get('stored_dps')}; "
                f"current asset has stored_dps={available.get('stored_dps')}."
            )
        if reason == "INSUFFICIENT_COUNT":
            return (
                f"Requested run requires {required.get('count')} {kind}; "
                f"current asset has count={available.get('count')}."
            )
        return f"Required {kind} asset is insufficient: {reason}."
    return "Data preflight is not ready."


def explain_why_this_experiment_next(action: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "structured": action,
        "explanation": action.get("why"),
        "blocked_by": action.get("blocks", []),
        "recommended_next_action": action.get("next_action"),
    }


def explain_why_stop_experimenting(action: Dict[str, Any]) -> Dict[str, Any]:
    plan = action.get("research_plan") or {}
    stop = action.get("next_action") == "WRITE_FORMAL_LEMMA"
    return {
        "structured": action,
        "explanation": (
            plan.get("stop_condition")
            if stop
            else "Do not stop empirical testing yet; a data, experiment, or certificate blocker remains."
        ),
        "blocked_by": action.get("blocks", []),
        "recommended_next_action": action.get("next_action"),
    }


if __name__ == "__main__":
    print(json.dumps(build_next_action(), indent=2))

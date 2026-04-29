"""Combine data readiness, experiment results, and certificate state."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from .data_planner import check_data_sufficiency
from .research_plan import build_research_plan


def build_next_action(
    data_sufficiency: Dict[str, Any] | None = None,
    experiment_summary: Dict[str, Any] | None = None,
    certificate: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    ds = data_sufficiency or check_data_sufficiency()
    plan = build_research_plan(ds, experiment_summary or {}, certificate)

    if ds.get("status") != "READY":
        step = (ds.get("generation_plan") or [{}])[0]
        action = str(step.get("action") or ds.get("next_action") or "FIX_DATA").upper()
        return {
            "next_action": action,
            "command": step.get("command"),
            "why": _data_why(ds),
            "blocks": [item for item in plan.get("blocked_nodes", [])],
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

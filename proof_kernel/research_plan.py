"""Research pathfinding DAG for the Same-Object Certificate program."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from .data_planner import check_data_sufficiency


PASS_OUTCOMES = {"CONSISTENT", "IMPLEMENTATION_OK"}
PASS_STATUSES = {"PASS"}


def _experiment_passed(summary: Dict[str, Any], exp_id: str) -> bool:
    exp = (summary.get("experiments") or {}).get(exp_id, {})
    if not isinstance(exp, dict):
        return False
    return exp.get("outcome") in PASS_OUTCOMES or exp.get("status") in PASS_STATUSES


def _experiment_failed(summary: Dict[str, Any], exp_id: str) -> bool:
    exp = (summary.get("experiments") or {}).get(exp_id, {})
    if not isinstance(exp, dict):
        return False
    return exp.get("outcome") in {"INCONSISTENT", "IMPLEMENTATION_BROKEN"} or exp.get("status") == "FAIL"


def _certificate_status(certificate: Dict[str, Any] | None) -> str:
    if not isinstance(certificate, dict):
        return "NOT_READY"
    return str(certificate.get("status") or "NOT_READY")


def _certificate_authoritative(certificate: Dict[str, Any] | None) -> bool:
    if not isinstance(certificate, dict):
        return False
    fidelity = certificate.get("fidelity") or {}
    if not isinstance(fidelity, dict):
        return False
    return fidelity.get("tier") == "AUTHORITATIVE"


def build_research_plan(
    data_sufficiency: Dict[str, Any] | None = None,
    experiment_summary: Dict[str, Any] | None = None,
    certificate: Dict[str, Any] | None = None,
    contradiction_route: bool = False,
) -> Dict[str, Any]:
    ds = data_sufficiency or check_data_sufficiency()
    summary = experiment_summary or {}
    completed_nodes: List[str] = []
    blocked_nodes: List[str] = []
    commands: List[str] = []
    expected_artifacts: List[str] = []
    proof_work_recommended = False

    if ds.get("status") != "READY":
        blocked_nodes.extend(["RUN_CORE_1", "RUN_EXP_8", "RUN_EXP_6", "BUILD_SAME_OBJECT_CERTIFICATE"])
        commands = [step.get("command") for step in ds.get("generation_plan", []) if step.get("command")]
        return {
            "current_node": "DATA_PREFLIGHT",
            "completed_nodes": completed_nodes,
            "blocked_nodes": blocked_nodes,
            "recommended_next_action": ds.get("next_action") or "FIX_DATA",
            "why": "Data preflight is not ready; the next logically necessary step is to fix data coverage or precision.",
            "commands": commands,
            "expected_artifacts": ["data/manifest.json", "public/data_migration_report.json"],
            "stop_condition": "Data assets satisfy count, coverage, and requested_dps + guard_dps.",
            "proof_work_recommended": False,
        }

    completed_nodes.append("DATA_PREFLIGHT")

    if _experiment_failed(summary, "EXP_1"):
        return {
            "current_node": "RUN_CORE_1",
            "completed_nodes": completed_nodes,
            "blocked_nodes": ["RUN_EXP_8", "RUN_EXP_6", "BUILD_SAME_OBJECT_CERTIFICATE"],
            "recommended_next_action": "DIAGNOSE_CONVERTER_FORMALIZATION",
            "why": "CORE-1 failed, so downstream zero and predicate checks are not the next blocker.",
            "commands": [],
            "expected_artifacts": [],
            "stop_condition": "CORE-1 is repaired and passes at the requested fidelity.",
            "proof_work_recommended": False,
        }

    if not _experiment_passed(summary, "EXP_1"):
        return {
            "current_node": "RUN_CORE_1",
            "completed_nodes": completed_nodes,
            "blocked_nodes": ["RUN_EXP_8", "RUN_EXP_6", "BUILD_SAME_OBJECT_CERTIFICATE"],
            "recommended_next_action": "RUN_CORE_1",
            "why": "Data is ready and CORE-1 has not passed yet.",
            "commands": ["python experiment_engine.py --run exp1"],
            "expected_artifacts": ["public/experiments.json", "artifacts/runs/<run_id>/raw.json"],
            "stop_condition": "CORE-1 passes or exposes a converter formalization defect.",
            "proof_work_recommended": False,
        }

    completed_nodes.append("RUN_CORE_1")

    exp8_pass = _experiment_passed(summary, "EXP_8")
    exp6_pass = _experiment_passed(summary, "EXP_6")
    if _experiment_failed(summary, "EXP_8"):
        return {
            "current_node": "RUN_EXP_8",
            "completed_nodes": completed_nodes,
            "blocked_nodes": ["ZERO_CORRESPONDENCE_READY", "BUILD_SAME_OBJECT_CERTIFICATE"],
            "recommended_next_action": "DIAGNOSE_ZERO_CORRESPONDENCE",
            "why": "WIT-1 failed; zero correspondence must be diagnosed before certificate assembly.",
            "commands": [],
            "expected_artifacts": [],
            "stop_condition": "WIT-1 either passes or is scoped as a certificate-blocking failure.",
            "proof_work_recommended": False,
        }
    if _experiment_failed(summary, "EXP_6"):
        return {
            "current_node": "RUN_EXP_6",
            "completed_nodes": completed_nodes,
            "blocked_nodes": ["PREDICATE_PROXY_READY", "BUILD_SAME_OBJECT_CERTIFICATE"],
            "recommended_next_action": "DIAGNOSE_PREDICATE_TRANSPORT",
            "why": "VAL-1 failed; predicate transport is the current certificate blocker.",
            "commands": [],
            "expected_artifacts": [],
            "stop_condition": "VAL-1 passes or predicate transport is scoped as failed.",
            "proof_work_recommended": False,
        }

    if not exp8_pass:
        return {
            "current_node": "RUN_EXP_8",
            "completed_nodes": completed_nodes,
            "blocked_nodes": ["ZERO_CORRESPONDENCE_READY", "BUILD_SAME_OBJECT_CERTIFICATE"],
            "recommended_next_action": "RUN_EXP_8",
            "why": "CORE-1 passes. Zero correspondence has not been tested at matching fidelity.",
            "commands": ["python experiment_engine.py --run exp8"],
            "expected_artifacts": ["public/experiments.json", "artifacts/runs/<run_id>/raw.json"],
            "stop_condition": "WIT-1 passes or identifies a zero-correspondence defect.",
            "proof_work_recommended": False,
        }

    completed_nodes.append("RUN_EXP_8")

    if not exp6_pass:
        return {
            "current_node": "RUN_EXP_6",
            "completed_nodes": completed_nodes,
            "blocked_nodes": ["PREDICATE_PROXY_READY", "BUILD_SAME_OBJECT_CERTIFICATE"],
            "recommended_next_action": "RUN_EXP_6",
            "why": "CORE-1 and WIT-1 pass. Predicate preservation has not been tested at matching fidelity.",
            "commands": ["python experiment_engine.py --run exp6"],
            "expected_artifacts": ["public/experiments.json", "artifacts/runs/<run_id>/raw.json"],
            "stop_condition": "VAL-1 passes or identifies a predicate-transport defect.",
            "proof_work_recommended": False,
        }

    completed_nodes.extend(["RUN_EXP_6", "ZERO_CORRESPONDENCE_READY", "PREDICATE_PROXY_READY"])

    status = _certificate_status(certificate)
    if status == "SAME_OBJECT_FAILED":
        return {
            "current_node": "BUILD_SAME_OBJECT_CERTIFICATE",
            "completed_nodes": completed_nodes,
            "blocked_nodes": ["RECOMMEND_NC3_NC4_FORMALIZATION"],
            "recommended_next_action": "DIAGNOSE_CERTIFICATE_FAILURE",
            "why": "The Same-Object Certificate failed; more random experiments are lower value than diagnosing the failed section.",
            "commands": [],
            "expected_artifacts": ["public/same_object_certificate.json"],
            "stop_condition": "Certificate failure is scoped to reconstruction, zeros, predicate, or controls.",
            "proof_work_recommended": False,
        }
    if status == "INCONCLUSIVE":
        return {
            "current_node": "BUILD_SAME_OBJECT_CERTIFICATE",
            "completed_nodes": completed_nodes,
            "blocked_nodes": [],
            "recommended_next_action": "RECOMMEND_HIGHER_FIDELITY_OR_SPECIFIC_RERUN",
            "why": "The certificate is inconclusive, so only targeted reruns that raise fidelity or isolate the inconclusive section are justified.",
            "commands": [],
            "expected_artifacts": ["public/same_object_certificate.json"],
            "stop_condition": "Certificate reaches SAME_OBJECT_CANDIDATE or SAME_OBJECT_FAILED.",
            "proof_work_recommended": False,
        }
    if status != "SAME_OBJECT_CANDIDATE":
        return {
            "current_node": "BUILD_SAME_OBJECT_CERTIFICATE",
            "completed_nodes": completed_nodes,
            "blocked_nodes": [],
            "recommended_next_action": "BUILD_SAME_OBJECT_CERTIFICATE",
            "why": "The critical experiments pass; assemble the Same-Object Certificate before running more tests.",
            "commands": ["python -m proof_kernel.same_object_certificate"],
            "expected_artifacts": ["public/same_object_certificate.json", "artifacts/runs/<run_id>/certificate.json"],
            "stop_condition": "Certificate reaches SAME_OBJECT_CANDIDATE, SAME_OBJECT_FAILED, or INCONCLUSIVE.",
            "proof_work_recommended": False,
        }

    completed_nodes.append("BUILD_SAME_OBJECT_CERTIFICATE")
    if _certificate_authoritative(certificate):
        proof_work_recommended = True
        completed_nodes.append("SAME_OBJECT_CANDIDATE")
        return {
            "current_node": "WRITE_NC3_NC4",
            "completed_nodes": completed_nodes,
            "blocked_nodes": ["FORMAL_PROOF_CLOSURE"],
            "recommended_next_action": "RECOMMEND_NC3_NC4_FORMALIZATION",
            "why": "Same-Object Certificate passes at AUTHORITATIVE fidelity. Further empirical tests are lower priority than formalizing the same-case criterion and predicate transport.",
            "commands": [],
            "expected_artifacts": ["proof artifact for NC3/NC4", "proof assembly update"],
            "stop_condition": "Stop running more empirical tests unless increasing fidelity or targeting a named blocker.",
            "proof_work_recommended": proof_work_recommended,
        }

    return {
        "current_node": "BUILD_SAME_OBJECT_CERTIFICATE",
        "completed_nodes": completed_nodes,
        "blocked_nodes": [],
        "recommended_next_action": "RECOMMEND_HIGHER_FIDELITY_OR_SPECIFIC_RERUN",
        "why": "The certificate is a candidate but not at AUTHORITATIVE fidelity, so the next empirical work must raise fidelity rather than add unrelated tests.",
        "commands": [],
        "expected_artifacts": ["public/same_object_certificate.json"],
        "stop_condition": "Reach AUTHORITATIVE fidelity or identify a named blocker.",
        "proof_work_recommended": False,
    }


def optional_program_2_branch(selected: bool) -> Dict[str, Any]:
    return {
        "node": "RUN_PROGRAM_2_CONTRADICTION_TRACK",
        "enabled": bool(selected),
        "why": "Program 2 remains optional unless the contradiction route or NC6 investigation is selected.",
    }


if __name__ == "__main__":
    print(json.dumps(build_research_plan(), indent=2))

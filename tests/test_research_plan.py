from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from proof_kernel.research_plan import build_research_plan, optional_program_2_branch  # noqa: E402
from proof_kernel.next_action import build_next_action  # noqa: E402


READY = {
    "status": "READY",
    "generation_plan": [],
    "warnings": [],
    "next_action": "run_next_research_step",
}


def _summary(*passed: str):
    return {
        "experiments": {
            exp_id: {"outcome": "CONSISTENT", "status": "PASS"}
            for exp_id in passed
        }
    }


def test_research_dag_recommends_core_after_data_readiness() -> None:
    plan = build_research_plan(READY, _summary(), None)
    assert plan["recommended_next_action"] == "RUN_CORE_1"


def test_research_dag_recommends_exp8_after_core_pass() -> None:
    plan = build_research_plan(READY, _summary("EXP_1"), None)
    assert plan["recommended_next_action"] == "RUN_EXP_8"


def test_research_dag_recommends_exp6_after_exp8_pass() -> None:
    plan = build_research_plan(READY, _summary("EXP_1", "EXP_8"), None)
    assert plan["recommended_next_action"] == "RUN_EXP_6"


def test_research_dag_recommends_certificate_after_exp8_exp6_pass() -> None:
    plan = build_research_plan(READY, _summary("EXP_1", "EXP_8", "EXP_6"), None)
    assert plan["recommended_next_action"] == "BUILD_SAME_OBJECT_CERTIFICATE"


def test_research_dag_recommends_nc3_nc4_after_authoritative_candidate() -> None:
    cert = {"status": "SAME_OBJECT_CANDIDATE", "fidelity": {"tier": "AUTHORITATIVE"}}
    plan = build_research_plan(READY, _summary("EXP_1", "EXP_8", "EXP_6"), cert)
    assert plan["recommended_next_action"] == "RECOMMEND_NC3_NC4_FORMALIZATION"
    assert plan["proof_work_recommended"] is True


def test_program_2_remains_optional_unless_selected() -> None:
    assert optional_program_2_branch(False)["enabled"] is False
    assert optional_program_2_branch(True)["enabled"] is True


def test_next_action_explains_stop_experimenting_after_authoritative_candidate() -> None:
    cert = {"status": "SAME_OBJECT_CANDIDATE", "fidelity": {"tier": "AUTHORITATIVE"}}
    action = build_next_action(READY, _summary("EXP_1", "EXP_8", "EXP_6"), cert)
    assert action["next_action"] == "WRITE_FORMAL_LEMMA"
    assert action["target"] == "NC3/NC4"

"""
Scoped failure classification and proof assembly.

Integrates the proof-kernel's necessary-condition semantics into the
verifier pipeline. Provides:

  1. FailureScope — what dies if a condition fails (theory / formalization / route).
  2. ProofAssembly — claim-down report of what the evidence supports.
  3. Certificate integration — trigger certificate rebuild after verification.

Usage:
    from proof_kernel.scoped_failure import FailureScope, build_proof_assembly
    assembly = build_proof_assembly(summary_experiments, fidelity_tier, certificate)
"""

import json
import os
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Failure Scope enum
# ---------------------------------------------------------------------------

class FailureScope:
    """What dies if this necessary condition fails."""
    KILL_THEORY = "KILL_THEORY"
    KILL_FORMALIZATION = "KILL_FORMALIZATION"
    KILL_ROUTE = "KILL_ROUTE"
    KILL_INSTRUMENT = "KILL_INSTRUMENT"
    NO_KILL = "NO_KILL"


# ---------------------------------------------------------------------------
# Necessary Condition → Failure Scope map
# ---------------------------------------------------------------------------

NECESSARY_CONDITIONS = {
    "NC1": {
        "name": "Object definition",
        "description": "Well-defined mathematical object O exists.",
        "failure_scope": FailureScope.KILL_FORMALIZATION,
        "status_key": "object_definition",
        "bearing_experiments": ["EXP_1", "EXP_8"],
    },
    "NC2": {
        "name": "Gauge definition",
        "description": "The gauge T_c is a well-defined group action.",
        "failure_scope": FailureScope.KILL_FORMALIZATION,
        "status_key": "gauge_definition",
        "bearing_experiments": ["EXP_1B"],
    },
    "NC3": {
        "name": "Same-case criterion",
        "description": "A criterion C exists s.t. C(O, T_c(O)) = true defines 'same analytic case'.",
        "failure_scope": FailureScope.KILL_FORMALIZATION,
        "status_key": "same_case_criterion",
        "bearing_experiments": [],  # depends on criterion choice
    },
    "NC4": {
        "name": "Predicate transport",
        "description": "Re(rho) = 1/2 iff Re(T_c(rho)) = 1/2. THE theory-killing condition.",
        "failure_scope": FailureScope.KILL_THEORY,
        "status_key": "predicate_transport",
        "bearing_experiments": ["EXP_6"],
    },
    "NC5": {
        "name": "Bounded-view reduction",
        "description": "Iteration maps any ordinate into a computable bounded window.",
        "failure_scope": FailureScope.KILL_ROUTE,
        "status_key": "bounded_view",
        "bearing_experiments": ["EXP_9"],
    },
    "NC6": {
        "name": "No hiding under compression",
        "description": "Off-line zeros produce detectable signatures after compression.",
        "failure_scope": FailureScope.KILL_ROUTE,
        "status_key": "no_hiding",
        "bearing_experiments": ["EXP_2", "EXP_2B", "EXP_7"],
    },
    "NC7": {
        "name": "Contradiction closure",
        "description": "NC5 + NC6 + Odlyzko verification → off-line zero → contradiction.",
        "failure_scope": FailureScope.KILL_ROUTE,
        "status_key": "contradiction_closure",
        "bearing_experiments": [],
    },
}


def classify_experiment_failure(exp_id, status, function):
    """Given an experiment failure, determine the scope of damage.

    Returns (scope, nc_id, description) if a necessary condition is threatened,
    or (NO_KILL, None, ...) for non-bearing experiments.
    """
    if status not in ("FAIL", "IMPLEMENTATION_BROKEN"):
        return FailureScope.NO_KILL, None, "Not a failure"

    for nc_id, nc in NECESSARY_CONDITIONS.items():
        if exp_id in nc["bearing_experiments"]:
            scope = nc["failure_scope"]
            desc = (
                f"{exp_id} failure threatens {nc_id} ({nc['name']}). "
                f"Scope: {scope}."
            )
            return scope, nc_id, desc

    # Non-bearing experiments — failure is informational or instrumental
    if function in ("CONTROL", "REGRESSION_CHECK"):
        return FailureScope.KILL_INSTRUMENT, None, f"{exp_id} control failure — instrument health issue"
    if function in ("PATHFINDER", "RESEARCH_NOTE", "DEMONSTRATION", "VISUALIZATION"):
        return FailureScope.NO_KILL, None, f"{exp_id} failure is non-theory-bearing"

    return FailureScope.NO_KILL, None, f"{exp_id} failure has no mapped necessary condition"


# ---------------------------------------------------------------------------
# Proof Assembly — claim-down report
# ---------------------------------------------------------------------------

def _nc_status_from_experiments(nc_id, nc, experiments, fidelity_tier):
    """Determine the status of a necessary condition from experiment results."""
    bearing = nc["bearing_experiments"]
    if not bearing:
        # No bearing experiments — status depends on formalization state
        return "UNFORMALIZED", []

    evidence = []
    for exp_id in bearing:
        exp = experiments.get(exp_id)
        if not exp:
            continue
        evidence.append({
            "exp_id": exp_id,
            "outcome": exp.get("outcome", "NOT_RUN"),
            "status": exp.get("status", "NOT_RUN"),
            "function": exp.get("function", "UNKNOWN"),
        })

    if not evidence:
        return "NOT_TESTED", evidence

    # Check for any failure
    failures = [e for e in evidence if e["outcome"] in ("INCONSISTENT", "IMPLEMENTATION_BROKEN")]
    if failures:
        return "FAILED", evidence

    # Check for consistent evidence
    consistent = [e for e in evidence if e["outcome"] == "CONSISTENT"]
    if consistent:
        if fidelity_tier == "AUTHORITATIVE":
            return "WITNESSED", evidence
        return "WITNESSED_PROVISIONAL", evidence

    inconclusive = [e for e in evidence if e["outcome"] == "INCONCLUSIVE"]
    if inconclusive:
        return "INCONCLUSIVE", evidence

    # Controls / instruments
    impl_ok = [e for e in evidence if e["outcome"] == "IMPLEMENTATION_OK"]
    if impl_ok:
        return "INSTRUMENT_ARMED", evidence

    return "NOT_TESTED", evidence


def build_proof_assembly(experiments, fidelity_tier, certificate=None):
    """Build the claim-down proof assembly report.

    This is the inverse of the experiment-up ontology: instead of asking
    'what do experiments say?', it asks 'what does the claim need, and
    which conditions are met?'

    Returns a dict suitable for embedding in summary.proof_assembly.
    """
    assembly = {
        "approach": "CLAIM_DOWN",
        "description": (
            "Proof assembly evaluates each necessary condition against available "
            "evidence. Only NC4 (predicate transport) can kill the theory; all "
            "others kill the formalization or the route."
        ),
        "conditions": {},
        "theory_alive": True,
        "formalization_alive": True,
        "direct_route_alive": True,
        "contradiction_route_alive": True,
        "overall_status": "CANDIDATE",
        "certificate_status": None,
        "failure_events": [],
    }

    for nc_id, nc in NECESSARY_CONDITIONS.items():
        status, evidence = _nc_status_from_experiments(
            nc_id, nc, experiments, fidelity_tier
        )
        condition_entry = {
            "nc_id": nc_id,
            "name": nc["name"],
            "description": nc["description"],
            "failure_scope": nc["failure_scope"],
            "status": status,
            "evidence": evidence,
        }

        # Classify impact of failures
        if status == "FAILED":
            scope = nc["failure_scope"]
            event = {
                "nc_id": nc_id,
                "name": nc["name"],
                "scope": scope,
                "evidence": evidence,
            }
            assembly["failure_events"].append(event)

            if scope == FailureScope.KILL_THEORY:
                assembly["theory_alive"] = False
                assembly["overall_status"] = "DISCREDITED"
            elif scope == FailureScope.KILL_FORMALIZATION:
                assembly["formalization_alive"] = False
                if assembly["overall_status"] != "DISCREDITED":
                    assembly["overall_status"] = "FORMALIZATION_BROKEN"
            elif scope == FailureScope.KILL_ROUTE:
                assembly["contradiction_route_alive"] = False
                # Route failure doesn't kill overall status

        assembly["conditions"][nc_id] = condition_entry

    # Certificate integration
    if certificate:
        cert_status = certificate.get("status", "NOT_READY")
        assembly["certificate_status"] = cert_status
        if cert_status == "SAME_OBJECT_FAILED":
            assembly["overall_status"] = "SAME_OBJECT_FAILED"

    # Compute remaining steps
    remaining = []
    for nc_id, cond in assembly["conditions"].items():
        if cond["status"] in ("UNFORMALIZED", "NOT_TESTED"):
            remaining.append({
                "nc_id": nc_id,
                "name": cond["name"],
                "what_is_needed": "Formal proof or formalization",
                "scope": cond["failure_scope"],
            })
    assembly["remaining_steps"] = remaining

    return assembly


def load_certificate():
    """Load the pre-built Same-Object Certificate if it exists."""
    cert_path = os.path.join("public", "same_object_certificate.json")
    if not os.path.exists(cert_path):
        return None
    try:
        with open(cert_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

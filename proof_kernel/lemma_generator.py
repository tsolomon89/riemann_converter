"""Per-run experiment review, model comparison, and candidate-lemma generator.

For every experiment that ran, this module produces:

  artifacts/runs/<run_id>/experiment_reviews/<exp_id>.json
  artifacts/runs/<run_id>/model_comparisons/<exp_id>.json
  artifacts/runs/<run_id>/lemmas/<exp_id>.md
  artifacts/runs/<run_id>/proof_discovery_index.json
  artifacts/runs/<run_id>/proof_discovery.md

The review is generated from actual run data, not from static registry text. The
hypothesis registry supplies the baseline; the run supplies what was observed.

Critical separations enforced here:

- intended_inference_if_passed (from registry, what *would* be allowed)
- actual_run_inference (data-driven, what this run actually shows)
- disallowed_conclusions (always, both passed and failed runs)
- scoped_consequence (THEORY / FORMALIZATION / WITNESS / ROUTE /
  IMPLEMENTATION / BASELINE_MODEL / NONE)

Failed experiments do NOT produce theory verdicts — they produce candidate
lemmas, alternative-hypothesis suggestions, and baseline-revision proposals.
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .hypothesis_registry import load_registry

SCHEMA_VERSION = "2026.05.experiment-review.v1"


# ---------------------------------------------------------------------------
# Status mapping: run outcome → baseline_status, scoped_consequence
# ---------------------------------------------------------------------------

def _baseline_status_from_outcome(outcome: str, role: str) -> str:
    """Map a run's outcome to a baseline-aware status.

    Roles invert some conventions:
      - controls: a CONSISTENT outcome means the falsifier is *armed*, not that
        the theory is supported. We still call that CONFIRMED for the control
        baseline, but downstream consumers must see role=control.
    """
    o = (outcome or "").upper()
    if o in ("CONSISTENT", "IMPLEMENTATION_OK"):
        return "CONFIRMED"
    if o in ("INCONSISTENT", "IMPLEMENTATION_BROKEN"):
        return "FAILED"
    if o == "INCONCLUSIVE":
        return "INCONCLUSIVE"
    if o == "DIRECTIONAL":
        return "INCOMPLETE"
    if o == "INFORMATIONAL":
        return "NOT_APPLICABLE"
    if not o:
        return "INCOMPLETE"
    return "INCONCLUSIVE"


def _scoped_consequence(role: str, baseline_status: str, scoped_status: Optional[str]) -> str:
    """Determine the scoped consequence of this experiment's result.

    Returns one of:
      THEORY | FORMALIZATION | WITNESS | ROUTE | IMPLEMENTATION |
      BASELINE_MODEL | NONE

    The scoping is intentionally conservative: a Program 2 baseline failure
    scopes to BASELINE_MODEL by default, not to THEORY. Theory consequence is
    reserved for cases where a necessary condition with KILL_THEORY scope is
    explicitly threatened — and that determination happens elsewhere
    (scoped_failure.py + necessary_conditions.md), not here.
    """
    if baseline_status == "CONFIRMED":
        return "NONE"
    if baseline_status == "NOT_APPLICABLE":
        return "NONE"

    if role == "control":
        return "IMPLEMENTATION"
    if role in ("pathfinder", "exploratory", "visualization", "demonstration"):
        return "NONE" if baseline_status == "INCONCLUSIVE" else "BASELINE_MODEL"

    # witness role
    if baseline_status == "FAILED":
        # Per spec: failed witness baselines first scope to baseline-or-route.
        # The specific verifier may already classify scoped_status to ROUTE_NEGATIVE
        # etc. We honor that hint when present.
        if scoped_status and "ROUTE" in scoped_status.upper():
            return "ROUTE"
        if scoped_status and "WITNESS" in scoped_status.upper():
            return "WITNESS"
        return "BASELINE_MODEL"
    if baseline_status == "INCOMPLETE":
        return "BASELINE_MODEL"
    return "BASELINE_MODEL"


# ---------------------------------------------------------------------------
# Raw observation extraction
# ---------------------------------------------------------------------------

def _extract_raw_observations(exp: Dict[str, Any]) -> Dict[str, Any]:
    """Pull the actual observed metrics out of the verifier output.

    We keep this generic: include the verifier's `metrics` block plus the
    `interpretation`, `theory_fit`, and any per-stage detail. We do NOT include
    `inference.allowed_conclusion` here — that field mixes intended-if-passed
    text with run state and is the source of the bug we are fixing.
    """
    metrics = exp.get("metrics") or {}
    out: Dict[str, Any] = {
        "metrics": metrics,
    }
    if exp.get("interpretation"):
        out["verifier_interpretation"] = exp.get("interpretation")
    if exp.get("theory_fit"):
        out["theory_fit"] = exp.get("theory_fit")
    if exp.get("stage_verdicts"):
        out["stage_verdicts"] = exp.get("stage_verdicts")
    return out


def _summary_metric(exp: Dict[str, Any]) -> Optional[float]:
    """Best-effort numeric summary metric for the run."""
    metrics = exp.get("metrics") or {}
    main = metrics.get("main_metrics") if isinstance(metrics, dict) else None
    if isinstance(main, dict):
        for key, value in main.items():
            if isinstance(value, (int, float)):
                return float(value)
    for key, value in (metrics or {}).items():
        if isinstance(value, (int, float)):
            return float(value)
    return None


# ---------------------------------------------------------------------------
# Actual run inference (data-driven)
# ---------------------------------------------------------------------------

def _build_actual_run_inference(
    exp: Dict[str, Any],
    baseline: Dict[str, Any],
    baseline_status: str,
) -> List[str]:
    """Generate the actual run inference from current data.

    This MUST NOT echo the static intended-if-passed conclusions when the
    baseline is not confirmed. It must describe what the data actually showed
    and scope the consequence to baseline / route / witness / implementation.
    """
    role = baseline["role"]
    display_id = baseline["display_id"]
    plain = baseline["plain_statement"]

    if baseline_status == "CONFIRMED":
        if role == "control":
            return [
                f"{display_id}: the falsifier described by this control is armed in this run.",
                "This is a statement about instrument health, not theory support.",
            ]
        if role in ("visualization", "demonstration"):
            return [
                f"{display_id}: the descriptive baseline is consistent with this run's output.",
                "No theoretical conclusion follows.",
            ]
        if role in ("pathfinder", "exploratory"):
            return [
                f"{display_id}: the pathfinder / guardrail behaved as declared on this run's window.",
                "This is a direction note, not theory support.",
            ]
        # witness
        return [
            f"{display_id}: the finite/proxy baseline was confirmed on this run's window.",
            f"What was tested: {plain}",
            "This preserves the route the experiment witnesses; it does not prove the base claim or any necessary condition.",
        ]

    if baseline_status == "FAILED":
        if role == "control":
            return [
                f"{display_id}: the control did not produce its expected divergence on this run.",
                "Implementation health is in question; results from related experiments may be unreliable until fixed.",
                "This is not a statement about the theory.",
            ]
        if role in ("visualization", "demonstration"):
            return [
                f"{display_id}: the descriptive / demonstration baseline did not match this run.",
                "The visualization or mapping needs review; this does not refute the theory.",
            ]
        if role in ("pathfinder", "exploratory"):
            return [
                f"{display_id}: the pathfinder / guardrail did not give a decisive signal on this run.",
                "The direction note is inconclusive; the theory is not refuted.",
            ]
        # witness
        return [
            f"{display_id}: the current baseline was not confirmed on this run.",
            f"Baseline tested: {plain}",
            "The raw data may still contain structured behavior — see candidate lemma and alternative-hypothesis suggestions.",
            "This run does not, by itself, refute the base claim.",
        ]

    if baseline_status == "INCONCLUSIVE":
        return [
            f"{display_id}: the run was inconclusive against this baseline.",
            "More precision, a wider window, or a revised metric may be needed to decide.",
        ]
    if baseline_status == "INCOMPLETE":
        return [
            f"{display_id}: the run produced partial / directional information against this baseline.",
            "Strengthening the metric or extending the window is the natural next step.",
        ]
    return [
        f"{display_id}: status not determinable from this run.",
        "This is an instrument / coverage gap, not a theory result.",
    ]


# ---------------------------------------------------------------------------
# Candidate-lemma generation
# ---------------------------------------------------------------------------

def _build_candidate_lemmas(
    baseline: Dict[str, Any],
    baseline_status: str,
    summary_metric: Optional[float],
) -> List[Dict[str, Any]]:
    name = baseline.get("candidate_lemma_name") or f"{baseline['display_id']} Candidate Note"
    lemmas: List[Dict[str, Any]] = []

    if baseline_status == "CONFIRMED":
        lemmas.append({
            "name": name,
            "status": "SUGGESTED_FROM_PASS",
            "statement": (
                f"On this run's window, {baseline['plain_statement'].rstrip('.')} held within tolerance. "
                "Formalizing this as a finite/proxy lemma is the next research step."
            ),
            "scope": "finite/proxy",
            "what_it_does_not_prove": baseline.get("disallowed_conclusions", []),
        })
        return lemmas

    if baseline_status == "FAILED":
        lemmas.append({
            "name": name + " (failure-direction)",
            "status": "SUGGESTED_FROM_FAILURE",
            "statement": (
                f"The current baseline ({baseline['plain_statement'].rstrip('.')}) was not confirmed on this run. "
                "A revised lemma should account for the observed deviation, possibly via one of the alternative hypotheses below."
            ),
            "scope": "baseline-revision",
            "alternative_directions": baseline.get("possible_alternative_hypotheses", []),
            "what_it_does_not_prove": baseline.get("disallowed_conclusions", []),
        })
        return lemmas

    if baseline_status in ("INCONCLUSIVE", "INCOMPLETE"):
        lemmas.append({
            "name": name + " (deferred)",
            "status": "DEFERRED",
            "statement": (
                f"This run was {baseline_status.lower()} against the current baseline. "
                "No candidate lemma is suggested until the baseline is confirmed or definitively failed."
            ),
            "scope": "deferred",
            "what_it_does_not_prove": baseline.get("disallowed_conclusions", []),
        })
        return lemmas

    # NOT_APPLICABLE / other
    lemmas.append({
        "name": name + " (no-lemma)",
        "status": "NO_LEMMA_SUGGESTED",
        "statement": (
            f"This experiment is {baseline['role']}-typed; no candidate lemma is suggested from this run."
        ),
        "scope": baseline["role"],
        "what_it_does_not_prove": baseline.get("disallowed_conclusions", []),
    })
    return lemmas


def _build_next_hypotheses(
    baseline: Dict[str, Any],
    baseline_status: str,
) -> List[str]:
    if baseline_status == "FAILED":
        return list(baseline.get("possible_alternative_hypotheses", []))
    if baseline_status == "CONFIRMED":
        # natural next-tests sharpen the result
        return [
            f"Extend the tested window for {baseline['display_id']} to confirm robustness.",
            f"Tighten the tolerance on {baseline['expected_signature']['primary_metric']} and re-run.",
        ]
    if baseline_status in ("INCONCLUSIVE", "INCOMPLETE"):
        return [
            f"Increase precision and re-run {baseline['display_id']}.",
            f"Re-examine the metric {baseline['expected_signature']['primary_metric']} for sensitivity.",
        ]
    return []


# ---------------------------------------------------------------------------
# Per-experiment review and model comparison
# ---------------------------------------------------------------------------

def build_experiment_review(
    run_id: str,
    exp_id: str,
    exp: Dict[str, Any],
    baseline: Dict[str, Any],
) -> Dict[str, Any]:
    outcome = exp.get("outcome") or exp.get("status") or ""
    scoped_status = exp.get("scoped_status")
    role = baseline["role"]
    baseline_status = _baseline_status_from_outcome(outcome, role)
    raw = _extract_raw_observations(exp)
    summary_metric = _summary_metric(exp)
    actual = _build_actual_run_inference(exp, baseline, baseline_status)
    candidate_lemmas = _build_candidate_lemmas(baseline, baseline_status, summary_metric)
    next_hyps = _build_next_hypotheses(baseline, baseline_status)
    scoped = _scoped_consequence(role, baseline_status, scoped_status)

    intended = baseline.get("intended_inference_if_passed", []) or []
    disallowed = list(baseline.get("disallowed_conclusions", []) or [])
    # Always preserve any additional disallowed conclusions surfaced by the verifier
    verifier_disallowed = (exp.get("inference") or {}).get("disallowed_conclusion") or []
    if isinstance(verifier_disallowed, list):
        for item in verifier_disallowed:
            if item not in disallowed:
                disallowed.append(item)

    review = {
        "schema_version": SCHEMA_VERSION,
        "run_id": run_id,
        "experiment_id": exp_id,
        "display_id": baseline["display_id"],
        "program": baseline["program"],
        "role": role,
        "baseline_hypothesis": {
            "id": baseline["hypothesis_id"],
            "plain_statement": baseline["plain_statement"],
            "object_under_test": baseline["object_under_test"],
            "expected_signature": baseline["expected_signature"],
            "why_this_matters": baseline.get("why_this_matters", ""),
        },
        "raw_observations": raw,
        "model_comparison": {
            "baseline_status": baseline_status,
            "fit_metrics": {"summary_metric": summary_metric} if summary_metric is not None else {},
            "failed_metrics": _failed_metric_names(exp, baseline) if baseline_status == "FAILED" else [],
            "alternative_model_candidates": (
                baseline.get("possible_alternative_hypotheses", []) if baseline_status == "FAILED" else []
            ),
        },
        "intended_inference_if_passed": intended,
        "actual_run_inference": actual,
        "candidate_lemmas": candidate_lemmas,
        "next_hypotheses": next_hyps,
        "scoped_consequence": scoped,
        "disallowed_conclusions": disallowed,
        "verifier_signal": {
            "outcome": outcome,
            "status": exp.get("status"),
            "scoped_status": scoped_status,
            "epistemic_level": exp.get("epistemic_level"),
            "function": exp.get("function"),
        },
    }
    return review


def build_model_comparison(
    run_id: str,
    exp_id: str,
    exp: Dict[str, Any],
    baseline: Dict[str, Any],
) -> Dict[str, Any]:
    outcome = exp.get("outcome") or exp.get("status") or ""
    role = baseline["role"]
    baseline_status = _baseline_status_from_outcome(outcome, role)
    summary_metric = _summary_metric(exp)
    series_refs = _extract_series_refs(exp)

    failed_metrics: List[str] = []
    if baseline_status == "FAILED":
        failed_metrics = _failed_metric_names(exp, baseline)

    if baseline_status == "CONFIRMED":
        priority = "LOW"
    elif baseline_status == "FAILED":
        priority = "HIGH" if role == "witness" else "MEDIUM"
    else:
        priority = "MEDIUM"

    return {
        "schema_version": SCHEMA_VERSION,
        "run_id": run_id,
        "experiment_id": exp_id,
        "display_id": baseline["display_id"],
        "baseline_hypothesis_id": baseline["hypothesis_id"],
        "baseline_prediction": {
            "metric": baseline["expected_signature"]["primary_metric"],
            "expected": baseline["expected_signature"]["expected_value"],
            "tolerance": baseline["expected_signature"]["tolerance"],
            "pass_rule": baseline["expected_signature"]["pass_rule"],
        },
        "observations": {
            "series_refs": series_refs,
            "summary_metrics": {"summary_metric": summary_metric} if summary_metric is not None else {},
        },
        "fit_result": {
            "baseline_status": baseline_status,
            "reason": _baseline_status_reason(exp, baseline_status, baseline),
            "failed_metrics": failed_metrics,
        },
        "alternative_model_candidates": (
            baseline.get("possible_alternative_hypotheses", []) if baseline_status == "FAILED" else []
        ),
        "agent_review_priority": priority,
    }


def _failed_metric_names(exp: Dict[str, Any], baseline: Dict[str, Any]) -> List[str]:
    """Best-effort list of which metrics failed.

    Falls back to the baseline's primary_metric when the verifier output does
    not break out per-metric pass/fail.
    """
    metrics = exp.get("metrics") or {}
    failed: List[str] = []
    pass_fail = metrics.get("metric_pass_fail") if isinstance(metrics, dict) else None
    if isinstance(pass_fail, dict):
        for name, ok in pass_fail.items():
            if ok is False:
                failed.append(name)
    if not failed:
        primary = baseline.get("expected_signature", {}).get("primary_metric")
        if primary:
            failed.append(primary)
    return failed


def _baseline_status_reason(exp: Dict[str, Any], baseline_status: str, baseline: Dict[str, Any]) -> str:
    interp = exp.get("interpretation") or ""
    if baseline_status == "CONFIRMED":
        return "Run outcome consistent with the declared baseline; pass rule satisfied."
    if baseline_status == "FAILED":
        return interp or "Run outcome violated the declared baseline pass rule."
    if baseline_status == "INCONCLUSIVE":
        return interp or "Run did not produce evidence sufficient to confirm or fail the baseline."
    if baseline_status == "INCOMPLETE":
        return interp or "Run produced partial / directional evidence relative to the baseline."
    return interp or "Baseline status not applicable to this experiment."


def _extract_series_refs(exp: Dict[str, Any]) -> List[str]:
    """Extract any pointers to time-series / per-k data the run produced."""
    refs: List[str] = []
    metrics = exp.get("metrics") or {}
    main = metrics.get("main_metrics") if isinstance(metrics, dict) else None
    if isinstance(main, dict):
        for key, value in main.items():
            if "curve_key" in key or "series_key" in key:
                if isinstance(value, str):
                    refs.append(value)
    return refs


# ---------------------------------------------------------------------------
# Lemma markdown
# ---------------------------------------------------------------------------

def render_lemma_markdown(review: Dict[str, Any]) -> str:
    baseline = review["baseline_hypothesis"]
    candidate = review["candidate_lemmas"][0] if review["candidate_lemmas"] else {}
    name = candidate.get("name", review["display_id"])
    status = review["model_comparison"]["baseline_status"]
    role = review["role"]

    sections = [
        f"# Candidate Lemma / Note: {name}",
        "",
        "## Run",
        review["run_id"],
        "",
        "## Experiment",
        f"{review['experiment_id']} ({review['display_id']})",
        "",
        "## Role",
        role,
        "",
        "## Baseline Hypothesis",
        baseline["plain_statement"],
        "",
        "## Observed Pattern",
    ]
    raw = review.get("raw_observations", {})
    interp = raw.get("verifier_interpretation")
    if interp:
        sections.append(str(interp))
    metric_summary = review["model_comparison"].get("fit_metrics", {})
    if metric_summary:
        sections.append("")
        sections.append("Metric summary:")
        sections.append("```json")
        sections.append(json.dumps(metric_summary, indent=2, sort_keys=True, default=str))
        sections.append("```")
    sections.extend([
        "",
        "## Result Against Baseline",
        status,
        "",
        "## Candidate Lemma or Research Note",
        candidate.get("statement", "No candidate lemma suggested for this run."),
        "",
        "## Why It Matters",
        baseline.get("why_this_matters", ""),
        "",
        "## What It Does Not Prove",
    ])
    for item in review.get("disallowed_conclusions", []):
        sections.append(f"- {item}")
    sections.extend([
        "",
        "## Required Next Test",
    ])
    for item in review.get("next_hypotheses", []) or ["No specific next test recommended."]:
        sections.append(f"- {item}")
    sections.extend([
        "",
        "## Formalization Target",
        _formalization_target_text(review),
        "",
        "## Scoped Consequence",
        review["scoped_consequence"],
        "",
        "## Actual Run Inference (this run only)",
    ])
    for item in review.get("actual_run_inference", []):
        sections.append(f"- {item}")
    sections.extend([
        "",
        "## Intended Inference If Baseline Is Confirmed (do not read as run conclusion)",
    ])
    for item in review.get("intended_inference_if_passed", []) or ["(not declared)"]:
        sections.append(f"- {item}")
    sections.append("")
    return "\n".join(sections)


def _formalization_target_text(review: Dict[str, Any]) -> str:
    role = review["role"]
    status = review["model_comparison"]["baseline_status"]
    if role == "witness" and status == "CONFIRMED":
        return (
            "Lift this finite/proxy result to a formal lemma in the proof program. "
            "See PROOF_PROGRAM_SPEC.md for the obligation index."
        )
    if role == "witness" and status == "FAILED":
        return (
            "No formalization target until the baseline is revised or re-tested. "
            "Consider one of the alternative hypotheses listed above."
        )
    if role == "control":
        return "Controls do not produce formal proof obligations; they gate other experiments."
    return "No formalization target suggested by this experiment."


# ---------------------------------------------------------------------------
# Proof-discovery index
# ---------------------------------------------------------------------------

def build_proof_discovery_index(
    run_id: str,
    reviews: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Aggregate reviews into a proof-discovery index for the run."""

    def by_program_role(program: Optional[str], role: Optional[str]) -> List[Dict[str, Any]]:
        return [
            r for r in reviews
            if (program is None or r["program"] == program)
            and (role is None or r["role"] == role)
        ]

    def lemma_entries(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out = []
        for r in items:
            for lemma in r.get("candidate_lemmas", []):
                out.append({
                    "experiment_id": r["experiment_id"],
                    "display_id": r["display_id"],
                    "lemma_name": lemma.get("name"),
                    "lemma_status": lemma.get("status"),
                    "baseline_status": r["model_comparison"]["baseline_status"],
                    "scoped_consequence": r["scoped_consequence"],
                    "statement": lemma.get("statement"),
                    "what_it_does_not_prove": lemma.get("what_it_does_not_prove", []),
                })
        return out

    program_1 = by_program_role("PROGRAM_1", "witness")
    program_2 = by_program_role("PROGRAM_2", "witness")
    controls = by_program_role(None, "control")
    pathfinders = (
        by_program_role(None, "pathfinder")
        + by_program_role(None, "exploratory")
    )
    demos = (
        by_program_role(None, "demonstration")
        + by_program_role(None, "visualization")
    )

    failed_or_incomplete = [
        r for r in reviews
        if r["model_comparison"]["baseline_status"] in ("FAILED", "INCOMPLETE", "INCONCLUSIVE")
    ]

    alt_hypotheses: List[Dict[str, Any]] = []
    for r in failed_or_incomplete:
        alts = r["model_comparison"].get("alternative_model_candidates", [])
        if alts:
            alt_hypotheses.append({
                "experiment_id": r["experiment_id"],
                "display_id": r["display_id"],
                "alternatives": alts,
            })

    formalization_targets: List[Dict[str, Any]] = []
    for r in program_1:
        if r["model_comparison"]["baseline_status"] == "CONFIRMED":
            formalization_targets.append({
                "experiment_id": r["experiment_id"],
                "display_id": r["display_id"],
                "candidate_lemma_name": (
                    r["candidate_lemmas"][0].get("name") if r["candidate_lemmas"] else None
                ),
                "scope": "finite/proxy",
            })

    must_not = []
    for r in reviews:
        for d in r.get("disallowed_conclusions", []):
            if d not in must_not:
                must_not.append(d)

    next_experiments: List[Dict[str, Any]] = []
    for r in failed_or_incomplete:
        if r["next_hypotheses"]:
            next_experiments.append({
                "experiment_id": r["experiment_id"],
                "display_id": r["display_id"],
                "next_hypotheses": r["next_hypotheses"],
            })

    return {
        "schema_version": SCHEMA_VERSION,
        "run_id": run_id,
        "totals": {
            "experiments_reviewed": len(reviews),
            "program_1_witnesses": len(program_1),
            "program_2_witnesses": len(program_2),
            "controls": len(controls),
            "pathfinders": len(pathfinders),
            "demonstrations": len(demos),
            "failed_or_incomplete": len(failed_or_incomplete),
        },
        "program_1_candidate_lemmas": lemma_entries([
            r for r in program_1
            if r["model_comparison"]["baseline_status"] == "CONFIRMED"
        ]),
        "program_1_witnesses": [
            {
                "experiment_id": r["experiment_id"],
                "display_id": r["display_id"],
                "baseline_status": r["model_comparison"]["baseline_status"],
            }
            for r in program_1
        ],
        "controls_and_instrument_lemmas": lemma_entries(controls),
        "pathfinding_notes": lemma_entries(pathfinders),
        "demonstrations": lemma_entries(demos),
        "program_2_contradiction_track_lemmas": lemma_entries(program_2),
        "failed_or_incomplete_baselines": [
            {
                "experiment_id": r["experiment_id"],
                "display_id": r["display_id"],
                "baseline_status": r["model_comparison"]["baseline_status"],
                "scoped_consequence": r["scoped_consequence"],
                "actual_run_inference": r["actual_run_inference"],
            }
            for r in failed_or_incomplete
        ],
        "alternative_hypotheses": alt_hypotheses,
        "formalization_targets": formalization_targets,
        "recommended_next_experiments": next_experiments,
        "what_must_not_be_concluded": must_not,
    }


def render_proof_discovery_markdown(index: Dict[str, Any]) -> str:
    lines: List[str] = [
        f"# Proof Discovery — {index['run_id']}",
        "",
        f"_schema {index['schema_version']}_",
        "",
        "## Totals",
        "```json",
        json.dumps(index["totals"], indent=2, sort_keys=True),
        "```",
        "",
        "## Program 1 Candidate Lemmas",
    ]
    if not index["program_1_candidate_lemmas"]:
        lines.append("_No Program 1 candidate lemmas suggested in this run._")
    for entry in index["program_1_candidate_lemmas"]:
        lines.append(f"- **{entry['display_id']}** — {entry['lemma_name']}: {entry['statement']}")
    lines.extend(["", "## Program 1 Witnesses"])
    for entry in index["program_1_witnesses"]:
        lines.append(f"- {entry['display_id']}: {entry['baseline_status']}")
    lines.extend(["", "## Controls / Instrument Lemmas"])
    if not index["controls_and_instrument_lemmas"]:
        lines.append("_No controls reported._")
    for entry in index["controls_and_instrument_lemmas"]:
        lines.append(f"- {entry['display_id']}: {entry['lemma_name']} ({entry['baseline_status']})")
    lines.extend(["", "## Pathfinding Notes"])
    for entry in index["pathfinding_notes"]:
        lines.append(f"- {entry['display_id']}: {entry['lemma_name']} ({entry['baseline_status']})")
    lines.extend(["", "## Program 2 Contradiction-Track Lemmas"])
    for entry in index["program_2_contradiction_track_lemmas"]:
        lines.append(f"- {entry['display_id']}: {entry['lemma_name']} ({entry['baseline_status']})")
    lines.extend(["", "## Failed or Incomplete Baselines"])
    if not index["failed_or_incomplete_baselines"]:
        lines.append("_All baselines confirmed in this run._")
    for entry in index["failed_or_incomplete_baselines"]:
        lines.append(
            f"- **{entry['display_id']}** — {entry['baseline_status']} "
            f"(scoped: {entry['scoped_consequence']})"
        )
        for ar in entry.get("actual_run_inference", []):
            lines.append(f"  - {ar}")
    lines.extend(["", "## Alternative Hypotheses"])
    if not index["alternative_hypotheses"]:
        lines.append("_None suggested._")
    for entry in index["alternative_hypotheses"]:
        lines.append(f"- **{entry['display_id']}**:")
        for alt in entry["alternatives"]:
            lines.append(f"  - {alt}")
    lines.extend(["", "## Formalization Targets"])
    if not index["formalization_targets"]:
        lines.append("_No new formalization targets from this run._")
    for entry in index["formalization_targets"]:
        lines.append(f"- {entry['display_id']}: {entry['candidate_lemma_name']} ({entry['scope']})")
    lines.extend(["", "## Recommended Next Proof Work"])
    for entry in index["formalization_targets"]:
        lines.append(f"- Formalize {entry['candidate_lemma_name']} as a finite/proxy lemma.")
    lines.extend(["", "## Recommended Next Experiments"])
    if not index["recommended_next_experiments"]:
        lines.append("_No specific follow-up experiments suggested._")
    for entry in index["recommended_next_experiments"]:
        lines.append(f"- **{entry['display_id']}**:")
        for nh in entry["next_hypotheses"]:
            lines.append(f"  - {nh}")
    lines.extend(["", "## What Must Not Be Concluded"])
    for item in index["what_must_not_be_concluded"]:
        lines.append(f"- {item}")
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Pipeline entry point
# ---------------------------------------------------------------------------

def write_run_reviews(
    run_id: str,
    summary: Dict[str, Any],
    out_dir: Path,
    repo: Path | str = ".",
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Write all per-experiment reviews, model comparisons, lemmas, and the
    proof-discovery index for a run.

    Returns (reviews, proof_discovery_index).
    """
    out_dir = Path(out_dir)
    reviews_dir = out_dir / "experiment_reviews"
    mc_dir = out_dir / "model_comparisons"
    lemmas_dir = out_dir / "lemmas"
    for d in (reviews_dir, mc_dir, lemmas_dir):
        d.mkdir(parents=True, exist_ok=True)

    registry = load_registry(repo)
    by_exp = registry["by_experiment_id"]
    experiments = summary.get("experiments") or {}
    if not isinstance(experiments, dict):
        experiments = {}

    reviews: List[Dict[str, Any]] = []
    for exp_id, exp in experiments.items():
        if not isinstance(exp, dict):
            continue
        baseline = by_exp.get(exp_id)
        if baseline is None:
            # Unknown experiment — skip with a marker file so the gap is visible.
            (reviews_dir / f"{exp_id}.no_baseline.json").write_text(
                json.dumps({
                    "run_id": run_id,
                    "experiment_id": exp_id,
                    "error": "no baseline hypothesis registered for this experiment",
                }, indent=2, sort_keys=True),
                encoding="utf-8",
            )
            continue

        review = build_experiment_review(run_id, exp_id, exp, baseline)
        mc = build_model_comparison(run_id, exp_id, exp, baseline)
        lemma_md = render_lemma_markdown(review)

        (reviews_dir / f"{exp_id}.json").write_text(
            json.dumps(review, indent=2, sort_keys=True, default=str),
            encoding="utf-8",
        )
        (mc_dir / f"{exp_id}.json").write_text(
            json.dumps(mc, indent=2, sort_keys=True, default=str),
            encoding="utf-8",
        )
        (lemmas_dir / f"{exp_id}.md").write_text(lemma_md, encoding="utf-8")
        reviews.append(review)

    index = build_proof_discovery_index(run_id, reviews)
    (out_dir / "proof_discovery_index.json").write_text(
        json.dumps(index, indent=2, sort_keys=True, default=str),
        encoding="utf-8",
    )
    (out_dir / "proof_discovery.md").write_text(
        render_proof_discovery_markdown(index),
        encoding="utf-8",
    )
    return reviews, index

"""Markdown rendering of a run analysis. No I/O."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from analyzer.decision_table import HeadlineRow
from analyzer.decompose import ExperimentRecord, RunDecomposition, stage_members
from analyzer.obligation_diff import ObligationMovement


PROGRAM2_BANNER = (
    "Per PROOF_PROGRAM_SPEC.md Decision Log #2, EXP_2 / EXP_2B / EXP_7 are "
    "the Contradiction Track. They formalize rogue detectability, no-hiding "
    "under compression, and contradiction closure. Until those obligations are "
    "closed by formal artifacts, their outcomes are informational only and MUST "
    "NOT contribute to the theorem-candidate verdict."
)

CONTROL_BANNER = (
    "A control's job is to ARM the falsifier. `IMPLEMENTATION_OK` here means "
    "the falsifier fired as expected — it does NOT mean the theory is supported. "
    "(The legacy `theory_fit = SUPPORTS` field on a passing control is a category "
    "error retained only for one-release backwards compatibility.)"
)


# Function priority for "dominant member" in a stage cross-check.
_FUNCTION_PRIORITY = {
    "CORE_CALCULATION": 0,  # backward-compat only; now PROOF_OBLIGATION_WITNESS in verifier
    "PROOF_OBLIGATION_WITNESS": 1,
    "COHERENCE_WITNESS": 2,
    "PATHFINDER": 3,
    "EXPLORATORY": 4,
    "CONTROL": 5,
    "REGRESSION_CHECK": 6,  # backward-compat only; EXP_8 is now PROOF_OBLIGATION_WITNESS
    "RESEARCH_NOTE": 7,
    "DEMONSTRATION": 8,
}


@dataclass(frozen=True)
class Report:
    run: RunDecomposition
    movement: ObligationMovement
    headline: HeadlineRow


def _format_metrics(metrics: dict[str, Any]) -> str:
    if not metrics:
        return "—"
    parts = []
    for k, v in metrics.items():
        if isinstance(v, float):
            parts.append(f"`{k}`={v:.6g}")
        else:
            parts.append(f"`{k}`={v}")
    return ", ".join(parts)


def _flag_chips(rec: ExperimentRecord) -> str:
    chips: list[str] = []
    if rec.provisional:
        chips.append("`provisional`")
    if rec.mapping_provisional:
        chips.append("`mapping_provisional`")
    if not chips:
        return ""
    return " " + " ".join(chips)


def _theorem_relevant(run: RunDecomposition) -> list[ExperimentRecord]:
    return run.by_function.get("PROOF_OBLIGATION_WITNESS", [])


def _core_calculations(run: RunDecomposition) -> list[ExperimentRecord]:
    return run.by_function.get("CORE_CALCULATION", [])


def _coherence(run: RunDecomposition) -> list[ExperimentRecord]:
    return run.by_function.get("COHERENCE_WITNESS", [])


def _controls(run: RunDecomposition) -> list[ExperimentRecord]:
    return run.by_function.get("CONTROL", [])


def _pathfinders(run: RunDecomposition) -> list[ExperimentRecord]:
    return run.by_function.get("PATHFINDER", [])


def _regressions(run: RunDecomposition) -> list[ExperimentRecord]:
    return run.by_function.get("REGRESSION_CHECK", [])


def _program2(run: RunDecomposition) -> list[ExperimentRecord]:
    return [r for r in run.experiments if r.program == "PROGRAM_2"]


def _research_notes(run: RunDecomposition) -> list[ExperimentRecord]:
    return run.by_function.get("RESEARCH_NOTE", [])


def _demonstrations(run: RunDecomposition) -> list[ExperimentRecord]:
    return run.by_function.get("DEMONSTRATION", [])


def _dominant(records: list[ExperimentRecord]) -> ExperimentRecord | None:
    if not records:
        return None
    return min(records, key=lambda r: _FUNCTION_PRIORITY.get(r.function, 99))


def _stage_cross_check(run: RunDecomposition) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    by_id = {r.exp_id: r for r in run.experiments}
    for stage, label in run.stage_verdicts.items():
        members_ids = stage_members(stage)
        members = [by_id[m] for m in members_ids if m in by_id]
        theorem_members = [
            r
            for r in members
            if r.program == "PROGRAM_1"
            and r.function in ("PROOF_OBLIGATION_WITNESS", "COHERENCE_WITNESS")
        ]
        dominant = _dominant(theorem_members) if theorem_members else _dominant(members)
        mismatch = (
            dominant is not None
            and label in ("REFUTES", "FAIL")
            and dominant.outcome == "CONSISTENT"
        )
        # A stage with no Program-1 theorem members cannot license a
        # theorem-level verdict, no matter what its label says.
        no_theorem_members = len(theorem_members) == 0
        rows.append(
            {
                "stage": stage,
                "label": label,
                "members": members,
                "dominant": dominant,
                "mismatch": mismatch,
                "no_theorem_members": no_theorem_members,
            }
        )
    return rows


def _disallowed_caveats(run: RunDecomposition) -> list[str]:
    seen: dict[str, None] = {}
    for r in run.experiments:
        for c in r.inference.get("disallowed_conclusion") or []:
            seen.setdefault(str(c), None)
    return list(seen.keys())


def render_report(report: Report) -> str:
    run = report.run
    movement = report.movement
    headline = report.headline

    lines: list[str] = []
    ts = run.timestamp or "<unknown>"
    lines.append(f"# Run {ts} — Deterministic Interpretation")
    lines.append(
        "> Generated by `analyzer` (no LLM). "
        f"Source: `public/experiments.json` (schema {run.schema_version}), "
        "`public/verdict_history.jsonl`."
    )
    lines.append("")

    # 1. Headline
    lines.append("## Headline")
    lines.append("")
    lines.append(f"**Rule {headline.rule_id} ({headline.severity.value}).** {headline.headline}")
    lines.append("")
    lines.append(
        f"Reported `summary.overall = {run.overall}` at fidelity tier "
        f"**{run.fidelity_tier}** (zeros={run.fidelity_zeros}, dps={run.fidelity_dps}). "
        f"Witness map review: **{run.witness_map_review_status}**."
    )
    lines.append("")

    # Artifact Consistency (only rendered if there are warnings)
    if run.consistency_warnings:
        lines.append("## Artifact Consistency")
        lines.append("")
        lines.append("The following inconsistencies were detected; results may be unreliable until resolved:")
        lines.append("")
        for w in run.consistency_warnings:
            lines.append(f"- {w}")
        lines.append("")

    core = _core_calculations(run)
    if core:
        lines.append("## Core Calculation")
        lines.append("")
        lines.append(
            "EXP_1 is the main Riemann Converter calculation. Other experiments "
            "validate, control, diagnose, or demonstrate this calculation."
        )
        lines.append("")
        lines.append("| Exp | Stage | Outcome | Metrics | Interpretation |")
        lines.append("|---|---|---|---|---|")
        for r in core:
            lines.append(
                f"| {r.exp_id} | {r.stage} | {r.outcome} | "
                f"{_format_metrics(r.metrics)} | {r.interpretation} |"
            )
        lines.append("")

    # 2. Theorem-relevant
    lines.append("## Theorem-Relevant Findings")
    lines.append("")
    tr = _theorem_relevant(run)
    if not tr:
        lines.append("_No PROOF_OBLIGATION_WITNESS experiments in this run._")
    else:
        lines.append(
            "| Exp | Obligation | Outcome | Tier | Flags | Metrics | Interpretation |"
        )
        lines.append("|---|---|---|---|---|---|---|")
        for r in tr:
            flags = _flag_chips(r).strip() or "—"
            lines.append(
                f"| {r.exp_id} | {r.obligation_id or '—'} | {r.outcome} | {r.fidelity_tier} | "
                f"{flags} | {_format_metrics(r.metrics)} | {r.interpretation} |"
            )
    lines.append("")

    # 3. Coherence panel
    lines.append("## Coherence Panel")
    lines.append("")
    coh = _coherence(run)
    if not coh:
        lines.append("_No COHERENCE_WITNESS experiments._")
    else:
        lines.append(
            "Coherence witnesses establish that the apparatus behaves as expected; "
            "they do **not** discharge proof obligations."
        )
        lines.append("")
        lines.append("| Exp | Stage | Outcome | Metrics | Interpretation |")
        lines.append("|---|---|---|---|---|")
        for r in coh:
            lines.append(
                f"| {r.exp_id} | {r.stage} | {r.outcome} | "
                f"{_format_metrics(r.metrics)} | {r.interpretation} |"
            )
    lines.append("")

    # 4. Controls
    lines.append("## Controls")
    lines.append("")
    lines.append(CONTROL_BANNER)
    lines.append("")
    ctrls = _controls(run)
    if not ctrls:
        lines.append("_No CONTROL experiments._")
    else:
        lines.append("| Exp | Outcome | Armed? | Interpretation |")
        lines.append("|---|---|---|---|")
        for r in ctrls:
            armed = "yes" if r.outcome == "IMPLEMENTATION_OK" else (
                "no — falsifier did not fire" if r.outcome == "IMPLEMENTATION_BROKEN" else "?"
            )
            lines.append(f"| {r.exp_id} | {r.outcome} | {armed} | {r.interpretation} |")
    lines.append("")

    # 5. Pathfinders
    lines.append("## Pathfinders")
    lines.append("")
    lines.append(
        "Pathfinder experiments produce *direction*, not *verdict*. "
        "A `DIRECTIONAL` outcome rules in or out a sub-path; an `INCONCLUSIVE` "
        "outcome means the data cannot resolve the comparison at this fidelity."
    )
    lines.append("")
    pf = _pathfinders(run)
    if not pf:
        lines.append("_No PATHFINDER experiments._")
    else:
        lines.append("| Exp | Outcome | Direction | Interpretation |")
        lines.append("|---|---|---|---|")
        for r in pf:
            lines.append(
                f"| {r.exp_id} | {r.outcome} | {r.direction or '—'} | {r.interpretation} |"
            )
    lines.append("")

    # 5b. Research Notes (engineering / optimization questions; not witnesses)
    rns = _research_notes(run)
    if rns:
        lines.append("## Research Notes")
        lines.append("")
        lines.append(
            "RESEARCH_NOTE experiments answer engineering / optimization questions "
            "(e.g., compute reuse). They are **not** witnesses for any proof "
            "obligation; their pass/fail status does not affect the theorem verdict."
        )
        lines.append("")
        lines.append("| Exp | Status | Outcome | Interpretation |")
        lines.append("|---|---|---|---|")
        for r in rns:
            lines.append(
                f"| {r.exp_id} | {r.status} | {r.outcome} | {r.interpretation} |"
            )
        lines.append("")

    # 5c. Demonstrations (corollary mechanics; not witnesses)
    demos = _demonstrations(run)
    if demos:
        lines.append("## Demonstrations")
        lines.append("")
        lines.append(
            "DEMONSTRATION experiments show what the corollary's mechanics produce "
            "**if** transport holds. They are not witnesses for any obligation."
        )
        lines.append("")
        lines.append("| Exp | Status | Outcome | Interpretation |")
        lines.append("|---|---|---|---|")
        for r in demos:
            lines.append(
                f"| {r.exp_id} | {r.status} | {r.outcome} | {r.interpretation} |"
            )
        lines.append("")

    # 6. Contradiction Track
    lines.append("## Contradiction Track - Formalization Incomplete")
    lines.append(PROGRAM2_BANNER)
    lines.append("")
    p2 = _program2(run)
    if not p2:
        lines.append("_No Contradiction Track experiments in this run._")
    else:
        lines.append("| Exp | Function | Outcome | Interpretation |")
        lines.append("|---|---|---|---|")
        for r in p2:
            lines.append(
                f"| {r.exp_id} | {r.function} | {r.outcome} | {r.interpretation} |"
            )
    lines.append("")

    # 7. Stage cross-check
    lines.append("## Stage Cross-Check")
    lines.append("")
    lines.append(
        "For each stage label in `summary.stage_verdicts`, this section lists the "
        "experiments mapped to the stage and flags any case where the stage label "
        "disagrees with the dominant theorem-relevant member's outcome."
    )
    lines.append("")
    for row in _stage_cross_check(run):
        markers = []
        if row["mismatch"]:
            markers.append("MISMATCH")
        if row["no_theorem_members"]:
            markers.append("NO PROGRAM-1 THEOREM MEMBERS")
        marker = f"  [{' / '.join(markers)}]" if markers else ""
        lines.append(f"### Stage: `{row['stage']}` -> label: `{row['label']}`{marker}")
        lines.append("")
        if row["dominant"]:
            d = row["dominant"]
            lines.append(
                f"Dominant member: **{d.exp_id}** "
                f"(`{d.function}`, outcome=`{d.outcome}`)."
            )
        if row["mismatch"]:
            lines.append("")
            lines.append(
                "> The stage label reads as a refutation, but the dominant "
                "theorem-relevant member is consistent. The label is being "
                "driven by a non-dominant or non-theorem-relevant member."
            )
        if row["no_theorem_members"]:
            lines.append("")
            lines.append(
                "> This stage has no Program-1 PROOF_OBLIGATION_WITNESS or "
                "COHERENCE_WITNESS members. Whatever this stage's label says, "
                "it cannot license a theorem-level conclusion."
            )
        lines.append("")
        if not row["members"]:
            lines.append("_No members for this stage in the registry._")
        else:
            lines.append("| Exp | Function | Program | Outcome |")
            lines.append("|---|---|---|---|")
            for m in row["members"]:
                lines.append(
                    f"| {m.exp_id} | {m.function} | {m.program} | {m.outcome} |"
                )
        lines.append("")

    # 8. Obligation movement
    lines.append("## Obligation Movement")
    lines.append("")
    lines.append(
        f"Across **{movement.total_runs}** historical runs on file, "
        f"obligation statuses moved **{movement.runs_with_movement}** times."
    )
    lines.append("")
    if movement.current_diff:
        lines.append("Current run vs. prior run — changed obligations:")
        lines.append("")
        lines.append("| Obligation | Prior | Current |")
        lines.append("|---|---|---|")
        for oid, (prev, curr) in sorted(movement.current_diff.items()):
            lines.append(f"| {oid} | {prev or '—'} | {curr or '—'} |")
    else:
        lines.append(
            "Current run vs. prior run: **no obligation status changed.** "
            "Whatever the headline `overall` says, the proof program is in the "
            "same theorem-state it was in last run."
        )
    lines.append("")
    if run.obligation_statuses:
        lines.append("**Current obligation block:**")
        lines.append("")
        lines.append("| Obligation | Status |")
        lines.append("|---|---|")
        for oid, st in run.obligation_statuses.items():
            lines.append(f"| {oid} | {st} |")
        lines.append("")

    # 9. Caveats
    lines.append("## Caveats (verbatim from `inference.disallowed_conclusion`)")
    lines.append("")
    caveats = _disallowed_caveats(run)
    if not caveats:
        lines.append("_None._")
    else:
        for c in caveats:
            lines.append(f"- {c}")
    lines.append("")

    # 10. Raw table
    lines.append("## Raw Per-Experiment Table")
    lines.append("")
    lines.append(
        "| Exp | Function | Program | Outcome | Status | Provisional | Mapping-Prov. | Tier |"
    )
    lines.append("|---|---|---|---|---|---|---|---|")
    for r in run.experiments:
        lines.append(
            f"| {r.exp_id} | {r.function} | {r.program} | {r.outcome} | {r.status} | "
            f"{'yes' if r.provisional else 'no'} | "
            f"{'yes' if r.mapping_provisional else 'no'} | {r.fidelity_tier} |"
        )
    lines.append("")

    return "\n".join(lines)

"""Top-down rule table that picks a deterministic headline for a run.

First match wins. Each rule is a (predicate, builder) pair; the builder
returns a `HeadlineRow` with the rule id, headline text, and severity.

The table encodes how the user wants the result presented:
- Control armament always wins over witness signals (rule 1).
- Engine/schema problems suppress all interpretation (rule 2).
- A clean theorem-relevant negative requires AUTHORITATIVE tier AND signed-off
  witness mapping AND no provisional flags (rule 3). Anything weaker falls
  through to rule 4.
- Status-quo (rule 5) is the default outcome on a "no obligation moved" run
  with no theorem-relevant negatives.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from analyzer.decompose import RunDecomposition
from analyzer.obligation_diff import ObligationMovement


class Severity(str, Enum):
    BLOCKING = "BLOCKING"
    DECISIVE_NEGATIVE = "DECISIVE_NEGATIVE"
    NON_DECISIVE_NEGATIVE = "NON_DECISIVE_NEGATIVE"
    STATUS_QUO = "STATUS_QUO"
    POSITIVE = "POSITIVE"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True)
class HeadlineRow:
    rule_id: int
    headline: str
    severity: Severity


def _broken_controls(run: RunDecomposition) -> list[str]:
    return [
        r.exp_id
        for r in run.experiments
        if r.function == "CONTROL" and r.outcome == "IMPLEMENTATION_BROKEN"
    ]


def _theorem_witnesses(run: RunDecomposition):
    return [r for r in run.experiments if r.function == "PROOF_OBLIGATION_WITNESS"]


def _inconsistent_witnesses(run: RunDecomposition):
    return [r for r in _theorem_witnesses(run) if r.outcome == "INCONSISTENT"]


def _consistent_witnesses(run: RunDecomposition):
    return [r for r in _theorem_witnesses(run) if r.outcome == "CONSISTENT"]


def evaluate_headline(
    run: RunDecomposition,
    movement: ObligationMovement,
) -> HeadlineRow:
    """Pick the first matching headline rule. Top-down."""

    # Rule 1 — Falsifier integrity
    broken = _broken_controls(run)
    if broken:
        return HeadlineRow(
            rule_id=1,
            headline=(
                f"Falsifier integrity issue: control(s) {', '.join(broken)} did not arm. "
                "All theorem-relevant claims are suspended until controls are reseated."
            ),
            severity=Severity.BLOCKING,
        )

    # Rule 2 — Engine / schema fault
    if run.engine_status != "OK":
        return HeadlineRow(
            rule_id=2,
            headline=f"Engine status {run.engine_status}; verification skipped.",
            severity=Severity.BLOCKING,
        )
    if not run.schema_match:
        return HeadlineRow(
            rule_id=2,
            headline=(
                f"Schema version mismatch (run={run.schema_version!r}); "
                "verification suspended until artifact re-emitted on current schema."
            ),
            severity=Severity.BLOCKING,
        )

    # Rule 3 — Decisive theorem-relevant negative
    inconsistent = _inconsistent_witnesses(run)
    decisive = [
        r
        for r in inconsistent
        if not r.provisional
        and not r.mapping_provisional
        and r.fidelity_tier == "AUTHORITATIVE"
    ]
    if decisive:
        ids = ", ".join(r.exp_id for r in decisive)
        obls = ", ".join(sorted({r.obligation_id for r in decisive if r.obligation_id}))
        return HeadlineRow(
            rule_id=3,
            headline=(
                f"Theorem-relevant negative signal from {ids} "
                f"(obligation(s): {obls or 'unmapped'}); "
                "witness mapping is signed off, no provisional caveats apply."
            ),
            severity=Severity.DECISIVE_NEGATIVE,
        )

    # Rule 4 — Non-decisive theorem-relevant negative (provisional or unmapped)
    if inconsistent:
        ids = ", ".join(r.exp_id for r in inconsistent)
        flags: list[str] = []
        if any(r.provisional for r in inconsistent):
            flags.append("fidelity-provisional")
        if any(r.mapping_provisional for r in inconsistent):
            flags.append(
                f"witness mapping not signed off "
                f"(WITNESS_MAP_REVIEW_STATUS={run.witness_map_review_status})"
            )
        sub_authoritative = [
            r for r in inconsistent if r.fidelity_tier != "AUTHORITATIVE"
        ]
        if sub_authoritative:
            flags.append(
                f"sub-AUTHORITATIVE tier ({run.fidelity_tier})"
            )
        flag_text = "; ".join(flags) if flags else "non-decisive"
        return HeadlineRow(
            rule_id=4,
            headline=(
                f"Theorem-relevant negative signal from {ids}, BUT {flag_text}. "
                "The mapped obligation cannot be refuted while these caveats stand."
            ),
            severity=Severity.NON_DECISIVE_NEGATIVE,
        )

    # Rule 6 — Decisive theorem-relevant positive (checked before rule 5)
    consistent = _consistent_witnesses(run)
    decisive_pos = [
        r
        for r in consistent
        if not r.provisional
        and not r.mapping_provisional
        and r.fidelity_tier == "AUTHORITATIVE"
        and run.witness_map_review_status == "SIGNED_OFF"
    ]
    if decisive_pos:
        ids = ", ".join(r.exp_id for r in decisive_pos)
        return HeadlineRow(
            rule_id=6,
            headline=(
                f"Theorem-relevant positive witness from {ids}; "
                "all caveat gates clear."
            ),
            severity=Severity.POSITIVE,
        )

    # Rule 5 — Status quo (no obligation moved, no theorem-relevant negative)
    if movement.runs_with_movement == 0:
        n = max(movement.total_runs, 1)
        return HeadlineRow(
            rule_id=5,
            headline=(
                f"No theorem-level progress across {n} runs on record. "
                "Coherence and instrumentation status as below; "
                "the proof program has neither advanced nor been refuted."
            ),
            severity=Severity.STATUS_QUO,
        )

    # Rule 7 — Fallback
    return HeadlineRow(
        rule_id=7,
        headline=(
            "Inconclusive run; no decision-table rule applied. "
            "Read the raw per-experiment table directly."
        ),
        severity=Severity.UNKNOWN,
    )

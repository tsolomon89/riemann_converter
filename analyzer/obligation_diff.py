"""Compute current-vs-prior obligation status diffs and full-history movement
counters from `verdict_history.jsonl`.

The motivating observation: across every run on file, no obligation has ever
moved from BLOCKED/CONJECTURAL to WITNESSED/REFUTED (or vice versa). The
analyzer surfaces that fact prominently so a reader does not mistake stage
verdict churn for theorem-program progress.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ObligationMovement:
    total_runs: int
    runs_with_movement: int
    current_diff: dict[str, tuple[str | None, str | None]]
    prior_timestamp: str | None
    current_timestamp: str | None
    history_obligation_ids: list[str] = field(default_factory=list)


def _statuses_from_entry(entry: dict[str, Any]) -> dict[str, str]:
    """Extract a flat {obligation_id: status} dict from a history entry.

    Older history entries (schema 2026.04.x) lack `obligation_statuses`
    entirely. We treat those as empty so they cannot pollute the
    current-vs-prior diff."""
    statuses = entry.get("obligation_statuses")
    if isinstance(statuses, dict):
        return {str(k): str(v) for k, v in statuses.items()}
    return {}


def obligation_movement(history: list[dict[str, Any]]) -> ObligationMovement:
    """Walk `history` (oldest -> newest) and report movement.

    - `runs_with_movement`: number of pairwise transitions that changed any
      obligation's status.
    - `current_diff`: map of {obligation_id: (prior, current)} for the latest
      pair where the values differ. Only obligation_ids present in EITHER side
      with mismatched values appear.
    """
    if not history:
        return ObligationMovement(
            total_runs=0,
            runs_with_movement=0,
            current_diff={},
            prior_timestamp=None,
            current_timestamp=None,
            history_obligation_ids=[],
        )

    moved = 0
    seen_ids: set[str] = set()
    for prev, curr in zip(history, history[1:]):
        prev_st = _statuses_from_entry(prev)
        curr_st = _statuses_from_entry(curr)
        seen_ids.update(prev_st.keys())
        seen_ids.update(curr_st.keys())
        if any(prev_st.get(k) != curr_st.get(k) for k in set(prev_st) | set(curr_st)):
            moved += 1

    last_entry = history[-1]
    last_statuses = _statuses_from_entry(last_entry)
    prior_entry = history[-2] if len(history) >= 2 else None
    prior_statuses = _statuses_from_entry(prior_entry) if prior_entry else {}

    diff: dict[str, tuple[str | None, str | None]] = {}
    for oid in sorted(set(prior_statuses) | set(last_statuses)):
        a = prior_statuses.get(oid)
        b = last_statuses.get(oid)
        if a != b:
            diff[oid] = (a, b)

    return ObligationMovement(
        total_runs=len(history),
        runs_with_movement=moved,
        current_diff=diff,
        prior_timestamp=(prior_entry or {}).get("timestamp"),
        current_timestamp=last_entry.get("timestamp"),
        history_obligation_ids=sorted(seen_ids),
    )

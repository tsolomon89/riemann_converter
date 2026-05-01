"""Baseline hypothesis registry.

Each experiment in the suite must declare the baseline hypothesis it is testing.
The registry is the single source of truth for:

- what hypothesis an experiment is testing,
- what its expected signature is,
- what its failure does and does not mean,
- what alternative hypotheses are admissible,
- what candidate lemma the experiment may suggest.

The registry is split across role-based files in proof_kernel/hypotheses/. The
canonical baseline is read-only here; agent-proposed revisions go through the
hypothesis_proposals workflow and never silently mutate this registry.

See PROOF_PROGRAM_SPEC.md for the rationale.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

SCHEMA_VERSION = "2026.05.hypothesis-registry.v1"

REGISTRY_FILES = (
    "program_1.json",
    "program_2.json",
    "controls.json",
    "pathfinders.json",
    "demonstrations.json",
)

REQUIRED_EXPERIMENT_IDS = (
    "EXP_0",
    "EXP_1",
    "EXP_1B",
    "EXP_1C",
    "EXP_2",
    "EXP_2B",
    "EXP_3",
    "EXP_4",
    "EXP_5",
    "EXP_6",
    "EXP_7",
    "EXP_8",
    "EXP_9",
    "EXP_10",
)

VALID_ROLES = {"witness", "control", "pathfinder", "demonstration", "exploratory", "visualization"}
VALID_PROGRAMS = {"PROGRAM_1", "PROGRAM_2", "NONE"}


def _registry_dir(repo: Path | str = ".") -> Path:
    return Path(repo) / "proof_kernel" / "hypotheses"


def load_registry(repo: Path | str = ".", apply_overlays: bool = True) -> Dict[str, Any]:
    """Load and merge the baseline hypothesis registry.

    By default applies any accepted hypothesis proposals on top of the canonical
    JSON files. Pass apply_overlays=False to read the canonical-only registry
    (used by the proposal workflow itself, to compare current vs proposed).

    Returns a dict with:
      - by_hypothesis_id: { hypothesis_id -> entry }
      - by_experiment_id: { experiment_id -> entry }
      - by_display_id:    { display_id -> entry }
      - all:              [ entry, ... ]
      - sources:          [ filename, ... ]
    """
    base = _registry_dir(repo)
    by_hyp: Dict[str, Dict[str, Any]] = {}
    by_exp: Dict[str, Dict[str, Any]] = {}
    by_disp: Dict[str, Dict[str, Any]] = {}
    all_entries: List[Dict[str, Any]] = []
    sources: List[str] = []

    for filename in REGISTRY_FILES:
        path = base / filename
        if not path.exists():
            continue
        sources.append(filename)
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise RuntimeError(f"failed to parse {path}: {exc}") from exc
        for entry in payload.get("hypotheses", []):
            hyp_id = entry.get("hypothesis_id")
            if not hyp_id:
                raise RuntimeError(f"{filename}: hypothesis missing hypothesis_id: {entry}")
            if hyp_id in by_hyp:
                raise RuntimeError(f"duplicate hypothesis_id: {hyp_id}")
            program = entry.get("program")
            if program not in VALID_PROGRAMS:
                raise RuntimeError(f"{hyp_id}: invalid program {program!r}")
            role = entry.get("role")
            if role not in VALID_ROLES:
                raise RuntimeError(f"{hyp_id}: invalid role {role!r}")
            by_hyp[hyp_id] = entry
            all_entries.append(entry)
            disp = entry.get("display_id")
            if disp:
                by_disp[disp] = entry
            for exp_id in entry.get("experiment_ids", []):
                if exp_id in by_exp:
                    raise RuntimeError(
                        f"experiment {exp_id} mapped to multiple hypotheses: "
                        f"{by_exp[exp_id].get('hypothesis_id')} and {hyp_id}"
                    )
                by_exp[exp_id] = entry

    base = {
        "schema_version": SCHEMA_VERSION,
        "by_hypothesis_id": by_hyp,
        "by_experiment_id": by_exp,
        "by_display_id": by_disp,
        "all": all_entries,
        "sources": sources,
    }
    if not apply_overlays:
        return base
    # Deferred import to avoid a cycle: hypothesis_proposals imports load_registry.
    from .hypothesis_proposals import apply_overlays_to_registry
    return apply_overlays_to_registry(base, repo)


def get_baseline_for_experiment(exp_id: str, repo: Path | str = ".") -> Optional[Dict[str, Any]]:
    return load_registry(repo)["by_experiment_id"].get(exp_id)


def list_baselines(repo: Path | str = ".") -> List[Dict[str, Any]]:
    return load_registry(repo)["all"]


def coverage_report(repo: Path | str = ".") -> Dict[str, Any]:
    """Verify every required experiment has a baseline hypothesis.

    Returns { covered: bool, missing: [...], extra: [...], total: int }.
    """
    reg = load_registry(repo)
    by_exp = reg["by_experiment_id"]
    missing = [exp for exp in REQUIRED_EXPERIMENT_IDS if exp not in by_exp]
    extra = [exp for exp in by_exp if exp not in REQUIRED_EXPERIMENT_IDS]
    return {
        "covered": not missing,
        "missing": missing,
        "extra": extra,
        "total": len(by_exp),
        "required": list(REQUIRED_EXPERIMENT_IDS),
    }


def baselines_by_role(repo: Path | str = ".") -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = {role: [] for role in VALID_ROLES}
    for entry in load_registry(repo)["all"]:
        out.setdefault(entry["role"], []).append(entry)
    return out


def baselines_by_program(repo: Path | str = ".") -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = {prog: [] for prog in VALID_PROGRAMS}
    for entry in load_registry(repo)["all"]:
        out.setdefault(entry["program"], []).append(entry)
    return out


def expected_baseline_status_values() -> Iterable[str]:
    return (
        "CONFIRMED",
        "FAILED",
        "INCOMPLETE",
        "INCONCLUSIVE",
        "NOT_APPLICABLE",
    )

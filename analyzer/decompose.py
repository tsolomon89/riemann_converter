"""Bucket per-experiment results from a run artifact along the canonical axes
(function / program / epistemic_level) so downstream rendering can present them
without conflating categories.

We read fields the verifier already populates in `summary.experiments[*]`:
- function (verifier.FUNCTION_MAP)
- program (verifier.PROGRAM_MAP)
- outcome (verifier._outcome_from_status)
- epistemic_level (verifier.EPISTEMIC_LEVEL_MAP)
- inference.allowed_conclusion / inference.disallowed_conclusion
- obligation_id, mapping_provisional, provisional, direction
- status, metrics, interpretation, stage

No new derivations; we just reorganize and surface flags that the dashboard
currently buries.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import glob
import hashlib
import os

import verifier


@dataclass(frozen=True)
class ExperimentRecord:
    exp_id: str
    function: str
    program: str
    outcome: str
    status: str
    epistemic_level: str
    stage: str
    obligation_id: str | None
    mapping_provisional: bool
    provisional: bool
    direction: str | None
    fidelity_tier: str
    metrics: dict[str, Any]
    interpretation: str
    inference: dict[str, Any]


@dataclass(frozen=True)
class RunDecomposition:
    timestamp: str | None
    schema_version: str | None
    schema_match: bool
    engine_status: str
    overall: str
    fidelity_tier: str
    fidelity_zeros: int | None
    fidelity_dps: int | None
    stage_verdicts: dict[str, str]
    obligation_statuses: dict[str, str]
    witness_map_review_status: str
    experiments: list[ExperimentRecord]
    consistency_warnings: list[str] = field(default_factory=list)
    by_function: dict[str, list[ExperimentRecord]] = field(default_factory=dict)
    by_program: dict[str, list[ExperimentRecord]] = field(default_factory=dict)
    certificate_status: str | None = None
    proof_assembly: dict[str, Any] | None = None


def _derive_timestamp(run: dict[str, Any]) -> str | None:
    meta = run.get("meta") or {}
    ts = meta.get("run_timestamp") or meta.get("timestamp")
    if ts:
        return ts
    summary = run.get("summary") or {}
    return summary.get("timestamp")


def _normalize_stage_verdicts(raw: Any) -> dict[str, str]:
    """`summary.stage_verdicts` is a dict whose values are EITHER a status
    string (older schemas) OR a rich object `{status, reason, members, ...}`
    (current schema). Normalize to `{stage: status_string}`."""
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for stage, value in raw.items():
        if isinstance(value, str):
            out[stage] = value
        elif isinstance(value, dict):
            status = value.get("status")
            if isinstance(status, str):
                out[stage] = status
    return out


def _obligation_statuses(run: dict[str, Any]) -> dict[str, str]:
    summary = run.get("summary") or {}
    pp = summary.get("proof_program") or {}
    obls = pp.get("obligations") or []
    out: dict[str, str] = {}
    for o in obls:
        oid = o.get("id")
        status = o.get("status")
        if oid and status:
            out[oid] = status
    return out


def _witness_map_review_status(run: dict[str, Any]) -> str:
    summary = run.get("summary") or {}
    wmr = (summary.get("proof_program") or {}).get("witness_map_review") or {}
    status = wmr.get("status")
    if isinstance(status, str) and status:
        return status
    return verifier.WITNESS_MAP_REVIEW_STATUS


def _current_code_fingerprint() -> dict[str, str]:
    files = sorted(glob.glob("run_exp*.py") + ["riemann_math.py", "experiment_engine.py", "verifier.py"])
    out: dict[str, str] = {}
    for fname in files:
        if not os.path.exists(fname):
            continue
        with open(fname, "rb") as fh:
            out[fname] = hashlib.md5(fh.read()).hexdigest()
    return out


def consistency_check(
    run: dict[str, Any], history: list[dict[str, Any]] | None = None
) -> list[str]:
    """Cross-check the artifact against itself and (optionally) the latest
    history line. Returns a list of human-readable warnings; empty list means
    no inconsistencies found.

    Cases covered:
    - schema_version != EXPECTED_SCHEMA_VERSION
    - meta.code_fingerprint differs from the latest history line's
      code_fingerprint (artifact stale or history appended out-of-band)
    - PROOF_OBLIGATION_WITNESS exists but its mapped obligation_id is missing
      from summary.proof_program.obligations
    """
    warnings: list[str] = []
    summary = run.get("summary") or {}
    meta = run.get("meta") or {}

    sv = summary.get("schema_version")
    if sv and sv != verifier.EXPECTED_SCHEMA_VERSION:
        warnings.append(
            f"Schema version drift: artifact={sv!r}, "
            f"verifier expects {verifier.EXPECTED_SCHEMA_VERSION!r}."
        )

    if history:
        last = history[-1] if history else None
        run_fp = (meta.get("code_fingerprint") or {})
        hist_fp = (last or {}).get("code_fingerprint") or {}
        if run_fp and hist_fp:
            mismatched = [
                k for k in run_fp
                if k in hist_fp and run_fp[k] != hist_fp[k]
            ]
            if mismatched:
                warnings.append(
                    "code_fingerprint differs between experiments.json and "
                    f"the latest verdict_history line for: {', '.join(sorted(mismatched))}. "
                    "Artifact may be stale or history was appended out-of-band."
                )

    run_fp = meta.get("code_fingerprint") or {}
    if run_fp:
        current_fp = _current_code_fingerprint()
        mismatched_current = [
            k for k, v in current_fp.items()
            if run_fp.get(k) != v
        ]
        if mismatched_current:
            warnings.append(
                "code_fingerprint differs between experiments.json and the "
                "current working tree for: "
                f"{', '.join(sorted(mismatched_current))}. "
                "Artifact was generated by older code and should not be treated as current."
            )

    obls_in_block = {o.get("id") for o in (summary.get("proof_program") or {}).get("obligations", [])}
    for exp_id, entry in (summary.get("experiments") or {}).items():
        if entry.get("function") != "PROOF_OBLIGATION_WITNESS":
            continue
        oid = entry.get("obligation_id")
        if oid and oid not in obls_in_block:
            warnings.append(
                f"{exp_id} maps to obligation {oid!r}, but that obligation "
                "is not present in summary.proof_program.obligations."
            )

    return warnings


def _extract_certificate_status(summary: dict[str, Any]) -> str | None:
    """Extract certificate status from proof_assembly or standalone certificate."""
    pa = summary.get("proof_assembly") or {}
    cert = pa.get("certificate_status")
    if cert:
        return cert
    # Fallback: try reading from the certificate JSON on disk
    import json
    import os
    cert_path = os.path.join("public", "same_object_certificate.json")
    if os.path.exists(cert_path):
        try:
            with open(cert_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("status")
        except Exception:
            pass
    return None


def decompose_run(
    run: dict[str, Any],
    history: list[dict[str, Any]] | None = None,
) -> RunDecomposition:
    """Produce a `RunDecomposition` from a full run artifact.

    If `history` is supplied, cross-artifact consistency warnings are
    populated from `consistency_check`."""
    summary = run.get("summary") or {}
    raw_experiments = summary.get("experiments") or {}
    schema_version = summary.get("schema_version")
    schema_match = schema_version == verifier.EXPECTED_SCHEMA_VERSION

    records: list[ExperimentRecord] = []
    for exp_id in verifier.VERIFICATION_EXPERIMENT_IDS:
        entry = raw_experiments.get(exp_id)
        if not entry:
            continue
        records.append(
            ExperimentRecord(
                exp_id=exp_id,
                function=entry.get("function", "EXPLORATORY"),
                program=entry.get("program", verifier.PROGRAM_MAP.get(exp_id, "PROGRAM_1")),
                outcome=entry.get("outcome", "INCONCLUSIVE"),
                status=entry.get("status", "INCONCLUSIVE"),
                epistemic_level=entry.get("epistemic_level", "EMPIRICAL"),
                stage=entry.get("stage", verifier.STAGE_MAP.get(exp_id, "unknown")),
                obligation_id=entry.get("obligation_id"),
                mapping_provisional=bool(entry.get("mapping_provisional", False)),
                provisional=bool(entry.get("provisional", False)),
                direction=entry.get("direction"),
                fidelity_tier=summary.get("fidelity_tier", "UNKNOWN"),
                metrics=entry.get("metrics") or {},
                interpretation=entry.get("interpretation") or "",
                inference=entry.get("inference") or {},
            )
        )

    by_function: dict[str, list[ExperimentRecord]] = {}
    by_program: dict[str, list[ExperimentRecord]] = {}
    for r in records:
        by_function.setdefault(r.function, []).append(r)
        by_program.setdefault(r.program, []).append(r)

    return RunDecomposition(
        timestamp=_derive_timestamp(run),
        schema_version=schema_version,
        schema_match=schema_match,
        engine_status=summary.get("engine_status", "UNKNOWN"),
        overall=summary.get("overall", "UNKNOWN"),
        fidelity_tier=summary.get("fidelity_tier", "UNKNOWN"),
        fidelity_zeros=summary.get("fidelity_zeros"),
        fidelity_dps=summary.get("fidelity_dps"),
        stage_verdicts=_normalize_stage_verdicts(summary.get("stage_verdicts")),
        consistency_warnings=consistency_check(run, history),
        obligation_statuses=_obligation_statuses(run),
        witness_map_review_status=_witness_map_review_status(run),
        experiments=records,
        by_function=by_function,
        by_program=by_program,
        certificate_status=_extract_certificate_status(summary),
        proof_assembly=summary.get("proof_assembly"),
    )


def stage_members(stage: str) -> list[str]:
    """Experiments mapped to the given stage in `verifier.STAGE_MAP`."""
    return [eid for eid, st in verifier.STAGE_MAP.items() if st == stage]


def attach_history_timestamp(decomposition: RunDecomposition, history: list[dict[str, Any]]) -> RunDecomposition:
    """If the run artifact has no embedded timestamp, fall back to the latest
    history entry's timestamp (the verifier writes both atomically, so the
    last history line corresponds to the current artifact)."""
    if decomposition.timestamp or not history:
        return decomposition
    last = history[-1]
    ts = last.get("timestamp")
    if not ts:
        return decomposition
    # `dataclass(frozen=True)` — rebuild instead of mutating.
    from dataclasses import replace
    return replace(decomposition, timestamp=ts)

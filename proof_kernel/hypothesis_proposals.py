"""Hypothesis proposal workflow.

Agents may propose revisions to baseline hypotheses. Canonical hypotheses do
not mutate silently. Acceptance requires an explicit `accept` call that records
who accepted, when, the old/new hashes, and the affected experiments.

Storage layout:

  artifacts/runs/<run_id>/hypothesis_proposals/<proposal_id>.json
      The proposal itself. Status transitions PROPOSED → ACCEPTED | REJECTED.

  artifacts/runs/<run_id>/hypothesis_proposals/<proposal_id>.audit.json
      Audit record written on accept/reject.

  proof_kernel/hypotheses/_accepted_overlays.json
      Active accepted overlays. Loader merges these on top of the canonical
      files at runtime. This keeps canonical JSON files clean in git while
      allowing accepted proposals to take effect immediately.

The overlay layer is intentionally simple: the latest accepted proposal for a
given hypothesis_id wins. Rejecting an active overlay also removes it.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import os
import re
import secrets
from pathlib import Path
from typing import Any, Dict, List, Optional

from .hypothesis_registry import (
    REGISTRY_FILES,
    SCHEMA_VERSION as REGISTRY_SCHEMA_VERSION,
    load_registry,
)

PROPOSAL_SCHEMA_VERSION = "2026.05.hypothesis-proposal.v1"
OVERLAY_FILENAME = "_accepted_overlays.json"

VALID_STATUS = {"PROPOSED", "ACCEPTED", "REJECTED"}


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

def _proposals_dir(run_id: str, repo: Path | str = ".") -> Path:
    return Path(repo) / "artifacts" / "runs" / run_id / "hypothesis_proposals"


def _proposal_path(run_id: str, proposal_id: str, repo: Path | str = ".") -> Path:
    return _proposals_dir(run_id, repo) / f"{proposal_id}.json"


def _audit_path(run_id: str, proposal_id: str, repo: Path | str = ".") -> Path:
    return _proposals_dir(run_id, repo) / f"{proposal_id}.audit.json"


def _overlay_path(repo: Path | str = ".") -> Path:
    return Path(repo) / "proof_kernel" / "hypotheses" / OVERLAY_FILENAME


# ---------------------------------------------------------------------------
# IDs and hashing
# ---------------------------------------------------------------------------

def _new_proposal_id() -> str:
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    suffix = secrets.token_hex(3)
    return f"prop_{ts}_{suffix}"


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def _hash_baseline(payload: Any) -> str:
    """Stable SHA-256 over a baseline-shaped object."""
    raw = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _safe_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(tmp, path)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

class ProposalError(Exception):
    pass


REQUIRED_PROPOSAL_FIELDS = (
    "source_agent",
    "experiment_id",
    "proposed_baseline",
    "reason",
)


def _validate_proposal_input(payload: Dict[str, Any]) -> None:
    missing = [f for f in REQUIRED_PROPOSAL_FIELDS if not payload.get(f)]
    if missing:
        raise ProposalError(f"missing required fields: {missing}")
    if not isinstance(payload.get("proposed_baseline"), dict):
        raise ProposalError("proposed_baseline must be a baseline-shaped object")
    pb = payload["proposed_baseline"]
    for f in ("plain_statement", "expected_signature"):
        if not pb.get(f):
            raise ProposalError(f"proposed_baseline missing {f}")


# ---------------------------------------------------------------------------
# Overlay management
# ---------------------------------------------------------------------------

def _load_overlay(repo: Path | str = ".") -> Dict[str, Any]:
    path = _overlay_path(repo)
    if not path.exists():
        return {
            "schema_version": PROPOSAL_SCHEMA_VERSION,
            "registry_schema_version": REGISTRY_SCHEMA_VERSION,
            "overlays": {},
        }
    return json.loads(path.read_text(encoding="utf-8"))


def _save_overlay(overlay: Dict[str, Any], repo: Path | str = ".") -> None:
    _safe_json(_overlay_path(repo), overlay)


def get_accepted_overlay(repo: Path | str = ".") -> Dict[str, Any]:
    return _load_overlay(repo)


def apply_overlays_to_registry(
    base_registry: Dict[str, Any],
    repo: Path | str = ".",
) -> Dict[str, Any]:
    """Merge the accepted-overlays file on top of a freshly-loaded registry.

    Returns a new registry-shape dict with the same keys as load_registry().
    """
    overlay = _load_overlay(repo)
    overlays = overlay.get("overlays") or {}
    if not overlays:
        return base_registry

    by_hyp = dict(base_registry["by_hypothesis_id"])
    by_exp = dict(base_registry["by_experiment_id"])
    by_disp = dict(base_registry["by_display_id"])
    all_entries = list(base_registry["all"])

    for hyp_id, ov in overlays.items():
        accepted = ov.get("accepted_baseline")
        if not isinstance(accepted, dict):
            continue
        merged = {**by_hyp.get(hyp_id, {}), **accepted}
        merged["_overlay_provenance"] = {
            "from_proposal_id": ov.get("proposal_id"),
            "accepted_by": ov.get("accepted_by"),
            "accepted_at": ov.get("accepted_at"),
            "old_baseline_hash": ov.get("old_baseline_hash"),
            "new_baseline_hash": ov.get("new_baseline_hash"),
        }
        by_hyp[hyp_id] = merged
        # Refresh by_experiment / by_display lookups for this hypothesis.
        for exp_id in merged.get("experiment_ids", []) or []:
            by_exp[exp_id] = merged
        if merged.get("display_id"):
            by_disp[merged["display_id"]] = merged
        # Replace in all_entries (or append if not present).
        replaced = False
        for i, entry in enumerate(all_entries):
            if entry.get("hypothesis_id") == hyp_id:
                all_entries[i] = merged
                replaced = True
                break
        if not replaced:
            all_entries.append(merged)

    return {
        **base_registry,
        "by_hypothesis_id": by_hyp,
        "by_experiment_id": by_exp,
        "by_display_id": by_disp,
        "all": all_entries,
    }


# ---------------------------------------------------------------------------
# Public proposal API
# ---------------------------------------------------------------------------

def propose_baseline_update(
    run_id: str,
    payload: Dict[str, Any],
    repo: Path | str = ".",
) -> Dict[str, Any]:
    """Create a new PROPOSED hypothesis proposal.

    payload requires: source_agent, experiment_id, proposed_baseline, reason.
    Optional: evidence, recommended_next_experiment.
    """
    _validate_proposal_input(payload)
    registry = load_registry(repo)
    exp_id = payload["experiment_id"]
    current = registry["by_experiment_id"].get(exp_id)
    if current is None:
        raise ProposalError(f"unknown experiment_id: {exp_id}")

    proposal_id = _new_proposal_id()
    proposal = {
        "schema_version": PROPOSAL_SCHEMA_VERSION,
        "proposal_id": proposal_id,
        "run_id": run_id,
        "source_agent": payload["source_agent"],
        "experiment_id": exp_id,
        "hypothesis_id": current["hypothesis_id"],
        "current_baseline": current,
        "proposed_baseline": payload["proposed_baseline"],
        "reason": payload["reason"],
        "evidence": payload.get("evidence", []) or [],
        "recommended_next_experiment": payload.get("recommended_next_experiment"),
        "created_at": _now_iso(),
        "status": "PROPOSED",
        "old_baseline_hash": _hash_baseline(current),
        "new_baseline_hash": _hash_baseline(payload["proposed_baseline"]),
    }
    _safe_json(_proposal_path(run_id, proposal_id, repo), proposal)
    return proposal


def list_proposals(
    run_id: str,
    repo: Path | str = ".",
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    d = _proposals_dir(run_id, repo)
    if not d.exists():
        return []
    out: List[Dict[str, Any]] = []
    for entry in sorted(d.iterdir()):
        if not entry.is_file() or entry.suffix != ".json":
            continue
        if entry.name.endswith(".audit.json"):
            continue
        try:
            data = json.loads(entry.read_text(encoding="utf-8"))
        except Exception:
            continue
        if status and data.get("status") != status:
            continue
        out.append(data)
    return out


def get_proposal(
    run_id: str,
    proposal_id: str,
    repo: Path | str = ".",
) -> Optional[Dict[str, Any]]:
    p = _proposal_path(run_id, proposal_id, repo)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def get_proposal_audit(
    run_id: str,
    proposal_id: str,
    repo: Path | str = ".",
) -> Optional[Dict[str, Any]]:
    p = _audit_path(run_id, proposal_id, repo)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def accept_proposal(
    run_id: str,
    proposal_id: str,
    accepted_by: str,
    note: Optional[str] = None,
    repo: Path | str = ".",
) -> Dict[str, Any]:
    if not accepted_by or not str(accepted_by).strip():
        raise ProposalError("accepted_by is required")
    proposal = get_proposal(run_id, proposal_id, repo)
    if proposal is None:
        raise ProposalError(f"proposal not found: {proposal_id}")
    if proposal.get("status") != "PROPOSED":
        raise ProposalError(f"proposal is not in PROPOSED status (current={proposal.get('status')})")

    accepted_at = _now_iso()
    proposal["status"] = "ACCEPTED"
    proposal["accepted_by"] = accepted_by
    proposal["accepted_at"] = accepted_at
    if note:
        proposal["acceptance_note"] = note
    _safe_json(_proposal_path(run_id, proposal_id, repo), proposal)

    # Write the audit record
    audit = {
        "schema_version": PROPOSAL_SCHEMA_VERSION,
        "proposal_id": proposal_id,
        "run_id": run_id,
        "decision": "ACCEPTED",
        "decided_by": accepted_by,
        "decided_at": accepted_at,
        "note": note,
        "experiment_id": proposal["experiment_id"],
        "hypothesis_id": proposal["hypothesis_id"],
        "old_baseline_hash": proposal["old_baseline_hash"],
        "new_baseline_hash": proposal["new_baseline_hash"],
        "old_baseline_snapshot": proposal["current_baseline"],
        "new_baseline_snapshot": proposal["proposed_baseline"],
        "affected_experiments": proposal["current_baseline"].get("experiment_ids", []),
    }
    _safe_json(_audit_path(run_id, proposal_id, repo), audit)

    # Merge into the accepted-overlays layer
    overlay = _load_overlay(repo)
    overlay["overlays"][proposal["hypothesis_id"]] = {
        "proposal_id": proposal_id,
        "run_id": run_id,
        "accepted_by": accepted_by,
        "accepted_at": accepted_at,
        "old_baseline_hash": proposal["old_baseline_hash"],
        "new_baseline_hash": proposal["new_baseline_hash"],
        "accepted_baseline": proposal["proposed_baseline"],
    }
    _save_overlay(overlay, repo)

    return proposal


def reject_proposal(
    run_id: str,
    proposal_id: str,
    rejected_by: str,
    reason: Optional[str] = None,
    repo: Path | str = ".",
) -> Dict[str, Any]:
    if not rejected_by or not str(rejected_by).strip():
        raise ProposalError("rejected_by is required")
    proposal = get_proposal(run_id, proposal_id, repo)
    if proposal is None:
        raise ProposalError(f"proposal not found: {proposal_id}")
    if proposal.get("status") not in ("PROPOSED", "ACCEPTED"):
        raise ProposalError(f"proposal cannot be rejected from status={proposal.get('status')}")

    decided_at = _now_iso()
    previous_status = proposal["status"]
    proposal["status"] = "REJECTED"
    proposal["rejected_by"] = rejected_by
    proposal["rejected_at"] = decided_at
    if reason:
        proposal["rejection_reason"] = reason
    _safe_json(_proposal_path(run_id, proposal_id, repo), proposal)

    audit = {
        "schema_version": PROPOSAL_SCHEMA_VERSION,
        "proposal_id": proposal_id,
        "run_id": run_id,
        "decision": "REJECTED",
        "decided_by": rejected_by,
        "decided_at": decided_at,
        "previous_status": previous_status,
        "reason": reason,
        "experiment_id": proposal["experiment_id"],
        "hypothesis_id": proposal["hypothesis_id"],
        "old_baseline_hash": proposal["old_baseline_hash"],
        "new_baseline_hash": proposal["new_baseline_hash"],
    }
    _safe_json(_audit_path(run_id, proposal_id, repo), audit)

    # If this proposal was active in the overlay, remove it.
    if previous_status == "ACCEPTED":
        overlay = _load_overlay(repo)
        active = overlay["overlays"].get(proposal["hypothesis_id"])
        if active and active.get("proposal_id") == proposal_id:
            overlay["overlays"].pop(proposal["hypothesis_id"], None)
            _save_overlay(overlay, repo)

    return proposal

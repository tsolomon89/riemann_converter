"""Raw run artifact writer.

The public experiment artifact is UI-friendly and may contain floats. This
writer snapshots raw and planning metadata under artifacts/runs/<run_id>/.
"""

from __future__ import annotations

import copy
import datetime
import glob
import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

from .data_planner import check_data_sufficiency
from .lemma_generator import write_run_reviews
from .research_plan import build_research_plan

SCHEMA_VERSION = "2026.05.run-artifact.v1"
CURRENT_SCHEMA_VERSION = "2026.05.current-run.v1"
RESET_NOTE = (
    "Historical run comparison is disabled during active development. "
    "Current reports reflect only the latest clean run."
)


def _safe_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(tmp, path)


def _sha256_json(payload: Any) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _sha256_file(path: Path) -> str | None:
    try:
        if not path.exists():
            return None
        h = hashlib.sha256()
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


def _code_fingerprint(repo: Path, data: Dict[str, Any]) -> Dict[str, Any]:
    meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
    existing = meta.get("code_fingerprint") if isinstance(meta, dict) else None
    if isinstance(existing, dict) and existing:
        return existing
    out: Dict[str, str] = {}
    for name in sorted(glob.glob(str(repo / "run_exp*.py")) + [str(repo / "riemann_math.py"), str(repo / "experiment_engine.py"), str(repo / "verifier.py")]):
        path = Path(name)
        if path.exists():
            out[path.name] = hashlib.md5(path.read_bytes()).hexdigest()
    return out


def _with_artifact_identity(
    payload: Dict[str, Any],
    *,
    run_id: str,
    created_at: str,
    source_hash: str,
    code_fingerprint: Dict[str, Any],
    artifact_kind: str,
) -> Dict[str, Any]:
    out = copy.deepcopy(payload)
    out.update({
        "run_id": run_id,
        "created_at": created_at,
        "schema_version": SCHEMA_VERSION,
        "source_artifact_hash": source_hash,
        "code_fingerprint": code_fingerprint,
        "artifact_kind": artifact_kind,
    })
    return out


def _path_for_public(repo: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(repo.resolve())).replace("\\", "/")
    except Exception:
        return str(path).replace("\\", "/")


def _compute_data_assets_status(repo: Path) -> str:
    manifest = repo / "data" / "manifest.json"
    if not manifest.exists():
        return "NEEDS_CHECK"
    try:
        payload = json.loads(manifest.read_text(encoding="utf-8"))
        assets = payload.get("assets") if isinstance(payload, dict) else []
        kinds = {
            asset.get("kind")
            for asset in assets
            if isinstance(asset, dict) and asset.get("valid") is True
        }
        if {"tau", "nontrivial_zeta_zeros", "primes"}.issubset(kinds):
            return "AVAILABLE"
    except Exception:
        pass
    return "NEEDS_CHECK"


def _program_2_route_status(summary: Dict[str, Any]) -> str:
    p2 = summary.get("program_2_summary") if isinstance(summary, dict) else {}
    if not isinstance(p2, dict) or not p2:
        return "ROUTE_NOT_RUN"
    outcomes = []
    for entry in p2.values():
        if isinstance(entry, dict):
            outcomes.extend((entry.get("outcomes") or {}).values())
    unique = {str(item) for item in outcomes if item}
    if not unique:
        return "ROUTE_NOT_RUN"
    if unique == {"CONSISTENT"} or unique == {"IMPLEMENTATION_OK"}:
        return "ROUTE_PASS"
    if any(item in unique for item in {"INCONSISTENT", "IMPLEMENTATION_BROKEN"}):
        return "ROUTE_NEGATIVE" if len(unique) == 1 else "ROUTE_MIXED"
    return "ROUTE_MIXED"


def _analysis_payload(
    data: Dict[str, Any],
    ds: Dict[str, Any],
    rp: Dict[str, Any],
    certificate: Optional[Dict[str, Any]],
    run_id: str,
) -> Dict[str, Any]:
    summary = data.get("summary") if isinstance(data.get("summary"), dict) else {}
    fidelity = summary.get("fidelity") if isinstance(summary.get("fidelity"), dict) else {}
    experiments = summary.get("experiments") if isinstance(summary.get("experiments"), dict) else {}
    program_1 = {
        key: value.get("scoped_status") or value.get("outcome") or value.get("status")
        for key, value in experiments.items()
        if isinstance(value, dict) and value.get("program", "PROGRAM_1") == "PROGRAM_1"
    }
    controls = {
        key: value.get("scoped_status") or value.get("outcome") or value.get("status")
        for key, value in experiments.items()
        if isinstance(value, dict) and value.get("function") == "CONTROL"
    }
    cert_status = certificate.get("status") if isinstance(certificate, dict) else "MISSING_FOR_RUN"
    return {
        "run_identity": {
            "run_id": run_id,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        },
        "data_and_precision": {
            "compute_fidelity": summary.get("compute_fidelity") or summary.get("fidelity_tier"),
            "data_fidelity": summary.get("data_fidelity") or fidelity.get("data_fidelity"),
            "certificate_fidelity": summary.get("certificate_fidelity") or fidelity.get("certificate_fidelity"),
            "warnings": fidelity.get("warnings", []),
            "data_sufficiency_status": ds.get("status"),
        },
        "program_1_proxy_witnesses": program_1,
        "controls": controls,
        "program_2_contradiction_track": {
            "status": _program_2_route_status(summary),
            "note": (
                "Program 2 is mixed and remains route-unresolved. This does not refute Program 1."
                if _program_2_route_status(summary) == "ROUTE_MIXED"
                else "Program 2 is reported separately from Program 1."
            ),
        },
        "same_object_certificate": {
            "status": cert_status,
            "message": "Certificate not built for this run." if certificate is None else None,
        },
        "proof_kernel_status": summary.get("proof_assembly", {}).get("overall_status") if isinstance(summary.get("proof_assembly"), dict) else "FORMAL_GAP_OPEN",
        "formal_gaps": summary.get("proof_program", {}).get("open_gaps", []) if isinstance(summary.get("proof_program"), dict) else [],
        "recommended_next_action": rp.get("recommended_next_action") or ds.get("next_action"),
        "what_this_shows": "Current-run proxy witnesses and controls only; no stale certificate data is used.",
        "what_this_does_not_show": "This does not prove RH and does not turn passing witnesses into proof.",
    }


def _analysis_markdown(payload: Dict[str, Any]) -> str:
    cert = payload.get("same_object_certificate", {})
    p2 = payload.get("program_2_contradiction_track", {})
    lines = [
        "---",
        f"run_id: {payload.get('run_id') or payload['run_identity']['run_id']}",
        f"created_at: {payload.get('created_at') or payload['run_identity'].get('created_at')}",
        f"schema_version: {payload.get('schema_version') or SCHEMA_VERSION}",
        f"source_artifact_hash: {payload.get('source_artifact_hash') or ''}",
        f"artifact_kind: {payload.get('artifact_kind') or 'analysis'}",
        "---",
        "",
        "# Run Identity",
        f"run_id: {payload['run_identity']['run_id']}",
        "",
        "# Data and Precision",
        json.dumps(payload.get("data_and_precision", {}), indent=2, sort_keys=True),
        "",
        "# Program 1 Proxy Witnesses",
        json.dumps(payload.get("program_1_proxy_witnesses", {}), indent=2, sort_keys=True),
        "",
        "# Controls",
        json.dumps(payload.get("controls", {}), indent=2, sort_keys=True),
        "",
        "# Program 2 Contradiction Track",
        str(p2.get("note") or "Program 2 was not run."),
        "",
        "# Same-Object Certificate",
        "Certificate not built for this run." if cert.get("status") in (None, "MISSING_FOR_RUN", "NOT_BUILT") else f"Status: {cert.get('status')}",
        "",
        "# Proof-Kernel Status",
        str(payload.get("proof_kernel_status") or "FORMAL_GAP_OPEN"),
        "",
        "# Formal Gaps",
        json.dumps(payload.get("formal_gaps", []), indent=2, sort_keys=True),
        "",
        "# Recommended Next Action",
        str(payload.get("recommended_next_action") or "run clean Program 1 critical suite"),
        "",
        "# What This Shows",
        str(payload.get("what_this_shows")),
        "",
        "# What This Does Not Show",
        str(payload.get("what_this_does_not_show")),
        "",
    ]
    return "\n".join(lines)


def _write_current_state(
    repo: Path,
    *,
    run_id: str,
    experiments_path: Path,
    certificate_path: Optional[Path],
    certificate_status: str,
    next_action: Optional[str],
    selected_data_sources: Optional[Dict[str, Any]] = None,
) -> None:
    payload = {
        "engine_status": "CURRENT_RUN",
        "latest_run_id": run_id,
        "current_experiments_path": _path_for_public(repo, experiments_path),
        "current_certificate_path": _path_for_public(repo, certificate_path) if certificate_path else None,
        "certificate_status": certificate_status,
        "data_assets_status": _compute_data_assets_status(repo),
        "historical_comparison_enabled": False,
        "next_action": next_action or "run clean Program 1 critical suite",
        "selected_data_sources": selected_data_sources,
        "note": RESET_NOTE,
        "schema_version": CURRENT_SCHEMA_VERSION,
    }
    _safe_json(repo / "public" / "current.json", payload)


def _selected_sources_for_current_state(meta: Dict[str, Any], ds: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    selected = meta.get("selected_data_sources") if isinstance(meta.get("selected_data_sources"), dict) else None
    if selected:
        return selected

    planned = ds.get("selected_assets") if isinstance(ds.get("selected_assets"), dict) else None
    if not planned:
        return None

    zero_info = meta.get("zero_source_info") if isinstance(meta.get("zero_source_info"), dict) else {}
    actual_zero_path = zero_info.get("source_path")
    planned_zero = ((planned.get("zero") or {}).get("asset") or {}) if isinstance(planned, dict) else {}
    planned_zero_path = planned_zero.get("source_path")
    if actual_zero_path and planned_zero_path and actual_zero_path != planned_zero_path:
        return None
    return planned


def write_run_artifacts(
    data: Dict[str, Any],
    run_id: Optional[str] = None,
    root: Path | str = ".",
    certificate: Optional[Dict[str, Any]] = None,
) -> Path:
    repo = Path(root)
    resolved_run_id = run_id or os.getenv("RIEMANN_RUN_ID") or time.strftime("run_%Y%m%dT%H%M%SZ", time.gmtime())
    out_dir = repo / "artifacts" / "runs" / resolved_run_id
    created_at = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    source_hash = _sha256_json(data)
    code_fingerprint = _code_fingerprint(repo, data)
    experiments = _with_artifact_identity(
        data,
        run_id=resolved_run_id,
        created_at=created_at,
        source_hash=source_hash,
        code_fingerprint=code_fingerprint,
        artifact_kind="experiments",
    )
    raw = {
        **_with_artifact_identity(
            {"source": "experiment_engine", "data": data},
            run_id=resolved_run_id,
            created_at=created_at,
            source_hash=source_hash,
            code_fingerprint=code_fingerprint,
            artifact_kind="experiments",
        ),
        "display_float_warning": "experiments.json is a display-oriented artifact; prefer raw decimal strings when available.",
    }
    summary = data.get("summary") if isinstance(data.get("summary"), dict) else {}
    meta = data.get("meta", {}) if isinstance(data.get("meta"), dict) else {}
    run_contract = meta.get("run_contract") if isinstance(meta.get("run_contract"), dict) else {}
    ds = check_data_sufficiency({
        "preset": run_contract.get("preset"),
        "requested_dps": data.get("meta", {}).get("dps", 80),
        "requested_zero_count": data.get("meta", {}).get("zeros", 100000),
    }, repo)
    rp = build_research_plan(ds, summary, certificate)

    _safe_json(out_dir / "experiments.json", experiments)
    _safe_json(out_dir / "raw.json", raw)
    _safe_json(out_dir / "summary.json", summary if isinstance(summary, dict) else {})
    _safe_json(out_dir / "data_sufficiency.json", _with_artifact_identity(
        ds,
        run_id=resolved_run_id,
        created_at=created_at,
        source_hash=_sha256_file(out_dir / "experiments.json") or source_hash,
        code_fingerprint=code_fingerprint,
        artifact_kind="data_sufficiency",
    ))
    _safe_json(out_dir / "research_plan.json", _with_artifact_identity(
        rp,
        run_id=resolved_run_id,
        created_at=created_at,
        source_hash=_sha256_file(out_dir / "experiments.json") or source_hash,
        code_fingerprint=code_fingerprint,
        artifact_kind="research_plan",
    ))
    cert_path = None
    cert_status = "MISSING_FOR_RUN"
    if certificate is not None:
        cert = {
            **certificate,
            "artifact_source_policy": {
                "built_from": "display_floats" if not certificate.get("artifact_source_policy") else certificate["artifact_source_policy"].get("built_from"),
                "warning": "Certificate was assembled from experiments.json display values unless raw high-precision fields are present.",
            },
        }
        cert = _with_artifact_identity(
            cert,
            run_id=resolved_run_id,
            created_at=created_at,
            source_hash=_sha256_file(out_dir / "experiments.json") or source_hash,
            code_fingerprint=code_fingerprint,
            artifact_kind="certificate",
        )
        cert_path = out_dir / "certificate.json"
        cert_status = "CURRENT"
        _safe_json(cert_path, cert)
    analysis = _analysis_payload(data, ds, rp, certificate, resolved_run_id)
    analysis_artifact = _with_artifact_identity(
        analysis,
        run_id=resolved_run_id,
        created_at=created_at,
        source_hash=_sha256_file(out_dir / "experiments.json") or source_hash,
        code_fingerprint=code_fingerprint,
        artifact_kind="analysis",
    )
    _safe_json(out_dir / "analysis.json", analysis_artifact)
    analysis_md = out_dir / "analysis.md"
    analysis_md.write_text(_analysis_markdown(analysis_artifact), encoding="utf-8")
    try:
        write_run_reviews(resolved_run_id, summary if isinstance(summary, dict) else {}, out_dir, repo=repo)
    except Exception as exc:
        # Reviews are non-fatal: failing to generate them must not break the run pipeline.
        _safe_json(out_dir / "proof_discovery_error.json", {
            "run_id": resolved_run_id,
            "error": str(exc),
            "error_type": type(exc).__name__,
        })
    _write_current_state(
        repo,
        run_id=resolved_run_id,
        experiments_path=out_dir / "experiments.json",
        certificate_path=cert_path,
        certificate_status=cert_status,
        next_action=rp.get("recommended_next_action") or ds.get("next_action"),
        selected_data_sources=_selected_sources_for_current_state(meta, ds),
    )
    return out_dir

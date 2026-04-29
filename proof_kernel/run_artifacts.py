"""Raw run artifact writer.

The public experiment artifact is UI-friendly and may contain floats. This
writer snapshots raw and planning metadata under artifacts/runs/<run_id>/.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

from .data_planner import check_data_sufficiency
from .research_plan import build_research_plan


def _safe_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(tmp, path)


def write_run_artifacts(
    data: Dict[str, Any],
    run_id: Optional[str] = None,
    root: Path | str = ".",
    certificate: Optional[Dict[str, Any]] = None,
) -> Path:
    repo = Path(root)
    resolved_run_id = run_id or os.getenv("RIEMANN_RUN_ID") or time.strftime("run_%Y%m%dT%H%M%SZ", time.gmtime())
    out_dir = repo / "artifacts" / "runs" / resolved_run_id
    raw = {
        "artifact_kind": "raw_research_run",
        "source": "experiment_engine",
        "display_float_warning": "public/experiments.json is a display artifact; prefer raw decimal strings when available.",
        "data": data,
    }
    summary = data.get("summary") if isinstance(data.get("summary"), dict) else {}
    ds = check_data_sufficiency({
        "requested_dps": data.get("meta", {}).get("dps", 80),
        "requested_zero_count": data.get("meta", {}).get("zeros", 100000),
    }, repo)
    rp = build_research_plan(ds, summary, certificate)

    _safe_json(out_dir / "raw.json", raw)
    _safe_json(out_dir / "summary.json", summary if isinstance(summary, dict) else {})
    _safe_json(out_dir / "data_sufficiency.json", ds)
    _safe_json(out_dir / "research_plan.json", rp)
    if certificate is not None:
        cert = {
            **certificate,
            "artifact_source_policy": {
                "built_from": "display_floats" if not certificate.get("artifact_source_policy") else certificate["artifact_source_policy"].get("built_from"),
                "warning": "Certificate was assembled from public/experiments.json display values unless raw high-precision fields are present.",
            },
        }
        _safe_json(out_dir / "certificate.json", cert)
    return out_dir

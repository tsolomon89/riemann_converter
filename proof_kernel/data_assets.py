"""Canonical mathematical data asset registry and legacy migration."""

from __future__ import annotations

import datetime as _dt
import gzip
import hashlib
import json
import os
import re
import shutil
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "data"
PUBLIC_ROOT = ROOT / "public"
MANIFEST_PATH = DATA_ROOT / "manifest.json"
MIGRATION_REPORT_PATH = PUBLIC_ROOT / "data_migration_report.json"

PRIME_TARGET = DATA_ROOT / "primes" / "primes.count_7000000.jsonl"
PRIME_TARGET_MANIFEST = DATA_ROOT / "primes" / "primes.count_7000000.manifest.json"
RUNTIME_ZERO_TARGET = DATA_ROOT / "zeros" / "nontrivial" / "zeros.generated.jsonl"

NUMERIC_TOKEN_RE = re.compile(r"^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$")
PRIME_TOKEN_RE = re.compile(r"^[+-]?\d[\d,]*(?:\.\d+)?$")


def utc_now() -> str:
    return _dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def relpath(path: Path, root: Path = ROOT) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def ensure_data_dirs(root: Path = ROOT) -> None:
    for part in [
        "data/constants/tau",
        "data/zeros/nontrivial",
        "data/zeros/trivial",
        "data/primes",
        "public",
    ]:
        (root / part).mkdir(parents=True, exist_ok=True)


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(tmp, path)


def read_json(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def _parse_prime_token(token: str) -> Optional[int]:
    candidate = token.strip().strip('"').strip("'")
    if not candidate or not PRIME_TOKEN_RE.match(candidate):
        return None
    candidate = candidate.replace(",", "")
    try:
        dec = Decimal(candidate)
    except (InvalidOperation, ValueError):
        return None
    if dec != dec.to_integral_value():
        return None
    value = int(dec)
    return value if value >= 2 else None


def parse_prime_line(line: str) -> Tuple[Optional[int], bool]:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None, False
    tokens = [stripped]
    parts = stripped.split()
    if parts and parts[-1] != stripped:
        tokens.append(parts[-1])
    for token in tokens:
        parsed = _parse_prime_token(token)
        if parsed is not None:
            return parsed, True
    return None, True


def _extract_numeric_token(line: str) -> Optional[str]:
    parts = line.strip().split()
    if not parts:
        return None
    token = parts[-1].strip().strip('"').strip("'")
    return token if NUMERIC_TOKEN_RE.match(token) else None


def decimal_places(token: str) -> int:
    tok = token.strip()
    if tok.startswith(("+", "-")):
        tok = tok[1:]
    if "e" in tok:
        tok = tok.split("e", 1)[0]
    if "E" in tok:
        tok = tok.split("E", 1)[0]
    if "." not in tok:
        return 0
    return len(tok.split(".", 1)[1])


def dominant_decimal_places(hist: Dict[int, int]) -> Optional[int]:
    if not hist:
        return None
    return sorted(hist.items(), key=lambda item: (item[1], item[0]), reverse=True)[0][0]


def iter_text_lines(path: Path) -> Iterator[str]:
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8", errors="replace") as handle:
            yield from handle
        return
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        yield from handle


def validate_prime_file(path: Path, expected_count: Optional[int] = None) -> Dict[str, Any]:
    count = 0
    line_count = 0
    bad_rows = 0
    strictly_increasing = True
    max_prime: Optional[int] = None
    previous: Optional[int] = None

    if not path.exists():
        return {
            "source_path": relpath(path),
            "count": 0,
            "max_prime": None,
            "bad_rows": 0,
            "strictly_increasing": None,
            "hash": None,
            "valid": False,
            "warnings": [],
            "errors": ["Prime file not found."],
        }

    for line in iter_text_lines(path):
        line_count += 1
        parsed, candidate = parse_prime_line(line)
        if parsed is None:
            if candidate:
                bad_rows += 1
            continue
        if previous is not None and parsed <= previous:
            strictly_increasing = False
            bad_rows += 1
            previous = parsed
            continue
        count += 1
        previous = parsed
        max_prime = parsed

    errors: List[str] = []
    warnings: List[str] = []
    if bad_rows:
        errors.append(f"{bad_rows} malformed or non-increasing prime rows.")
    if expected_count is not None and count != int(expected_count):
        warnings.append(f"Prime file count is {count}; expected {expected_count}.")

    return {
        "source_path": relpath(path),
        "count": int(count),
        "max_prime": int(max_prime) if max_prime is not None else None,
        "line_count": int(line_count),
        "bad_rows": int(bad_rows),
        "strictly_increasing": bool(strictly_increasing),
        "hash": hash_file(path),
        "valid": count > 0 and bad_rows == 0 and strictly_increasing,
        "warnings": warnings,
        "errors": errors,
    }


def normalize_prime_file(source: Path, target: Path) -> Dict[str, Any]:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".tmp")
    count = 0
    max_prime = None
    previous = None
    bad_rows = 0
    with open(tmp, "w", encoding="utf-8", newline="\n") as out:
        for line in iter_text_lines(source):
            parsed, candidate = parse_prime_line(line)
            if parsed is None:
                if candidate:
                    bad_rows += 1
                continue
            if previous is not None and parsed <= previous:
                bad_rows += 1
                previous = parsed
                continue
            out.write(f"{parsed}\n")
            count += 1
            max_prime = parsed
            previous = parsed
    os.replace(tmp, target)
    return {
        "count": count,
        "max_prime": max_prime,
        "bad_rows": bad_rows,
        "hash": hash_file(target),
    }


def validate_zero_file(path: Path) -> Dict[str, Any]:
    count = 0
    line_count = 0
    bad_rows = 0
    descents = 0
    duplicates = 0
    previous: Optional[Decimal] = None
    max_value: Optional[str] = None
    decimal_hist: Dict[int, int] = {}

    if not path.exists():
        return {
            "source_path": relpath(path),
            "count": 0,
            "max_value": None,
            "stored_dps": None,
            "strictly_increasing": None,
            "hash": None,
            "valid": False,
            "warnings": [],
            "errors": ["Zero file not found."],
        }

    for line in iter_text_lines(path):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        line_count += 1
        token = _extract_numeric_token(stripped)
        if token is None:
            bad_rows += 1
            continue
        try:
            value = Decimal(token)
        except InvalidOperation:
            bad_rows += 1
            continue
        if previous is not None:
            if value < previous:
                descents += 1
            elif value == previous:
                duplicates += 1
        previous = value
        count += 1
        max_value = token
        places = decimal_places(token)
        decimal_hist[places] = decimal_hist.get(places, 0) + 1

    strictly_increasing = descents == 0 and duplicates == 0
    errors: List[str] = []
    warnings: List[str] = []
    if bad_rows:
        errors.append(f"{bad_rows} malformed zero rows.")
    if not strictly_increasing and count > 0:
        errors.append("Zero ordinates are not strictly increasing.")

    stored_dps = dominant_decimal_places(decimal_hist)
    return {
        "source_path": relpath(path),
        "count": int(count),
        "line_count": int(line_count),
        "max_value": max_value,
        "stored_dps": stored_dps,
        "usable_dps": stored_dps,
        "guard_dps": None,
        "strictly_increasing": bool(strictly_increasing),
        "hash": hash_file(path),
        "valid": count > 0 and bad_rows == 0 and strictly_increasing,
        "warnings": warnings,
        "errors": errors,
    }


def copy_normalized_zero_file(source: Path, target: Path) -> Dict[str, Any]:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".tmp")
    count = 0
    with open(tmp, "w", encoding="utf-8", newline="\n") as out:
        for line in iter_text_lines(source):
            token = _extract_numeric_token(line.strip())
            if token is None:
                continue
            out.write(f"{token}\n")
            count += 1
    os.replace(tmp, target)
    stats = validate_zero_file(target)
    stats["count"] = count
    return stats


def formulaic_trivial_zero_asset(now: Optional[str] = None) -> Dict[str, Any]:
    return {
        "asset_id": "trivial_zeta_zeros_formula",
        "kind": "trivial_zeta_zeros",
        "source_path": None,
        "generator": "formula",
        "formula": "s = -2n",
        "count": None,
        "max_value": None,
        "stored_dps": None,
        "usable_dps": None,
        "guard_dps": None,
        "strictly_increasing": None,
        "hash": None,
        "created_at": now or utc_now(),
        "valid": True,
        "warnings": [],
        "errors": [],
    }


def asset_manifest_path(asset_path: Path) -> Path:
    suffixes = "".join(asset_path.suffixes)
    if suffixes:
        return Path(str(asset_path)[: -len(suffixes)] + ".manifest.json")
    return asset_path.with_suffix(".manifest.json")


def build_prime_asset_manifest(
    target: Path,
    validation: Dict[str, Any],
    source_path: str,
    migrated_at: Optional[str] = None,
    root: Path = ROOT,
) -> Dict[str, Any]:
    return {
        "asset_id": "primes_count_7000000",
        "kind": "primes",
        "role": "canonical_static_asset",
        "source_path": relpath(target, root),
        "generator": "existing_file_migration",
        "count": validation.get("count"),
        "max_prime": validation.get("max_prime"),
        "max_value": validation.get("max_prime"),
        "stored_dps": None,
        "usable_dps": None,
        "guard_dps": None,
        "strictly_increasing": validation.get("strictly_increasing"),
        "hash": validation.get("hash"),
        "created_at": migrated_at or utc_now(),
        "migrated_at": migrated_at or utc_now(),
        "valid": bool(validation.get("valid")),
        "source_original_path": source_path,
        "generation_required_for_current_suite": False,
        "warnings": list(validation.get("warnings", [])),
        "errors": list(validation.get("errors", [])),
    }


def build_zero_asset_manifest(
    asset_id: str,
    target: Path,
    validation: Dict[str, Any],
    source_path: str,
    generator: str = "existing_file_migration",
    created_at: Optional[str] = None,
    root: Path = ROOT,
) -> Dict[str, Any]:
    return {
        "asset_id": asset_id,
        "kind": "nontrivial_zeta_zeros",
        "source_path": relpath(target, root),
        "generator": generator,
        "count": validation.get("count"),
        "max_value": validation.get("max_value"),
        "stored_dps": validation.get("stored_dps"),
        "usable_dps": validation.get("usable_dps"),
        "guard_dps": validation.get("guard_dps"),
        "strictly_increasing": validation.get("strictly_increasing"),
        "hash": validation.get("hash"),
        "created_at": created_at or utc_now(),
        "migrated_at": created_at or utc_now(),
        "valid": bool(validation.get("valid")),
        "source_original_path": source_path,
        "warnings": list(validation.get("warnings", [])),
        "errors": list(validation.get("errors", [])),
    }


def discover_asset_manifests(root: Path = ROOT) -> List[Dict[str, Any]]:
    manifests: List[Dict[str, Any]] = []
    data_root = root / "data"
    if not data_root.exists():
        return [formulaic_trivial_zero_asset()]
    for path in sorted(data_root.rglob("*.manifest.json")):
        try:
            parsed = read_json(path)
            if "asset_id" in parsed and "kind" in parsed:
                manifests.append(parsed)
        except Exception:
            continue
    if not any(asset.get("kind") == "trivial_zeta_zeros" for asset in manifests):
        manifests.append(formulaic_trivial_zero_asset())
    return manifests


def write_data_manifest(root: Path = ROOT, assets: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    ensure_data_dirs(root)
    now = utc_now()
    asset_list = list(assets) if assets is not None else discover_asset_manifests(root)
    if not any(asset.get("kind") == "trivial_zeta_zeros" for asset in asset_list):
        asset_list.append(formulaic_trivial_zero_asset(now))
    payload = {
        "schema_version": "2026.05.data-assets.v1",
        "project": "riemann_converter",
        "created_at": now,
        "updated_at": now,
        "canonical_root": "data",
        "agent_context_is_canonical": False,
        "assets": sorted(asset_list, key=lambda item: str(item.get("asset_id", ""))),
    }
    write_json(root / "data" / "manifest.json", payload)
    return payload


def load_data_manifest(root: Path = ROOT) -> Dict[str, Any]:
    path = root / "data" / "manifest.json"
    if path.exists():
        return read_json(path)
    return write_data_manifest(root)


def get_data_assets(root: Path = ROOT) -> Dict[str, Any]:
    manifest = load_data_manifest(root)
    assets = manifest.get("assets", [])
    warnings: List[str] = []
    if any(str(asset.get("source_path", "")).startswith("agent_context/") for asset in assets):
        warnings.append("Registry contains agent_context paths; those are deprecated and not canonical.")
    return {
        "summary": summarize_assets(assets if isinstance(assets, list) else []),
        "manifest": manifest,
        "warnings": warnings,
    }


def summarize_assets(assets: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    by_kind: Dict[str, int] = {}
    for asset in assets:
        kind = str(asset.get("kind", "unknown"))
        by_kind[kind] = by_kind.get(kind, 0) + 1
    return {
        "asset_count": sum(by_kind.values()),
        "by_kind": by_kind,
        "agent_context_is_canonical": False,
    }


def find_best_asset(kind: str, root: Path = ROOT) -> Optional[Dict[str, Any]]:
    assets = load_data_manifest(root).get("assets", [])
    candidates = [
        asset for asset in assets
        if isinstance(asset, dict) and asset.get("kind") == kind and asset.get("valid") is True
    ]
    if not candidates:
        return None

    def score(asset: Dict[str, Any]) -> Tuple[int, int, int]:
        role_score = 1 if asset.get("role") == "canonical_static_asset" else 0
        count = int(asset.get("count") or 0)
        dps = int(asset.get("stored_dps") or 0)
        return (role_score, count, dps)

    return sorted(candidates, key=score, reverse=True)[0]


def _deprecated_source_entry(
    source: Path,
    replacement: Optional[Path],
    validation: Dict[str, Any],
    root: Path = ROOT,
) -> Dict[str, Any]:
    return {
        "source_path": relpath(source, root),
        "deprecated": True,
        "canonical_replacement": relpath(replacement, root) if replacement else None,
        "valid": bool(validation.get("valid")),
        "warnings": list(validation.get("warnings", [])),
        "errors": list(validation.get("errors", [])),
    }


def migrate_legacy_assets(root: Path = ROOT) -> Dict[str, Any]:
    ensure_data_dirs(root)
    now = utc_now()
    prime_target = root / "data" / "primes" / "primes.count_7000000.jsonl"
    prime_target_manifest = root / "data" / "primes" / "primes.count_7000000.manifest.json"
    runtime_zero_target = root / "data" / "zeros" / "nontrivial" / "zeros.generated.jsonl"
    report: Dict[str, Any] = {
        "status": "NOT_RUN",
        "migrated_assets": [],
        "deprecated_sources": [],
        "warnings": [],
        "errors": [],
        "next_action": None,
    }
    assets: List[Dict[str, Any]] = []

    try:
        prime_source = root / "agent_context" / "primes.csv"
        prime_validation = validate_prime_file(prime_source)
        if prime_validation.get("valid"):
            if not prime_target.exists():
                normalize_prime_file(prime_source, prime_target)
            target_validation = validate_prime_file(prime_target)
            prime_asset = build_prime_asset_manifest(
                prime_target,
                target_validation,
                relpath(prime_source),
                migrated_at=now,
                root=root,
            )
            write_json(prime_target_manifest, prime_asset)
            assets.append(prime_asset)
            report["migrated_assets"].append(prime_asset)
            report["deprecated_sources"].append(_deprecated_source_entry(prime_source, prime_target, prime_validation, root))
        else:
            report["deprecated_sources"].append(_deprecated_source_entry(prime_source, None, prime_validation, root))
            report["errors"].extend(prime_validation.get("errors", []))

        zero_sources = [
            root / "agent_context" / "zeros.dat",
            root / "agent_context" / "zeros.dat.bak",
            root / "agent_context" / "zeros_100K_three_ten_power_neg_nine.gz",
            root / "agent_context" / "zeros_2M_four_ten_power_neg_nine.gz",
        ]
        seen_targets: set[str] = set()
        for source in zero_sources:
            validation = validate_zero_file(source)
            target: Optional[Path] = None
            if validation.get("valid"):
                count = int(validation.get("count") or 0)
                dps = int(validation.get("stored_dps") or 0)
                stem = source.name.replace(".", "_")
                if source.name == "zeros.dat":
                    target = runtime_zero_target
                elif source.suffix == ".gz":
                    target = root / "data" / "zeros" / "nontrivial" / source.name
                else:
                    target = root / "data" / "zeros" / "nontrivial" / f"zeros.{stem}.jsonl"

                if target.suffix == ".gz":
                    if not target.exists():
                        shutil.copy2(source, target)
                    target_validation = validate_zero_file(target)
                else:
                    if not target.exists():
                        target_validation = copy_normalized_zero_file(source, target)
                    else:
                        target_validation = validate_zero_file(target)

                asset_id = f"nontrivial_zeros_count_{count}_dps_{dps}"
                if asset_id in seen_targets:
                    asset_id = f"{asset_id}_{source.stem.replace('.', '_')}"
                seen_targets.add(asset_id)
                zero_asset = build_zero_asset_manifest(
                    asset_id,
                    target,
                    target_validation,
                    relpath(source),
                    created_at=now,
                    root=root,
                )
                write_json(asset_manifest_path(target), zero_asset)
                assets.append(zero_asset)
                report["migrated_assets"].append(zero_asset)
                report["deprecated_sources"].append(_deprecated_source_entry(source, target, validation, root))
            else:
                report["deprecated_sources"].append(_deprecated_source_entry(source, None, validation, root))
                if source.exists():
                    report["warnings"].append(f"{relpath(source)} was inspected but is not a valid canonical asset.")

        assets.append(formulaic_trivial_zero_asset(now))
        write_data_manifest(root, assets)
        if report["errors"]:
            report["status"] = "PARTIAL" if report["migrated_assets"] else "FAILED"
            report["next_action"] = "inspect_invalid_legacy_assets"
        else:
            report["status"] = "COMPLETE"
            report["next_action"] = None
    except Exception as exc:
        report["status"] = "FAILED"
        report["errors"].append(str(exc))
        report["next_action"] = "inspect_migration_failure"

    write_json(root / "public" / "data_migration_report.json", report)
    return report


def load_migration_report(root: Path = ROOT) -> Dict[str, Any]:
    path = root / "public" / "data_migration_report.json"
    if not path.exists():
        return {
            "status": "NOT_RUN",
            "migrated_assets": [],
            "deprecated_sources": [],
            "warnings": [],
            "errors": [],
            "next_action": "run_data_migration",
        }
    return read_json(path)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Migrate legacy mathematical data assets into data/.")
    parser.add_argument("--repo-root", default=str(ROOT), help="Repository root")
    args = parser.parse_args()
    result = migrate_legacy_assets(Path(args.repo_root).resolve())
    print(json.dumps(result, indent=2))

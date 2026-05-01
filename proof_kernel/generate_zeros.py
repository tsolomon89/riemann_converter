"""Generate canonical nontrivial zeta-zero ordinate assets."""

from __future__ import annotations

import argparse
import json
import multiprocessing
import time
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, Optional, Tuple

import mpmath

from .data_assets import (
    ROOT,
    build_zero_asset_manifest,
    hash_file,
    iter_text_lines,
    load_data_manifest,
    relpath,
    utc_now,
    validate_zero_file,
    write_data_manifest,
    write_json,
)


def _zero_dir(root: Path) -> Path:
    return root / "data" / "zeros" / "nontrivial"


def _zero_asset_path(root: Path, stored_dps: int) -> Path:
    return _zero_dir(root) / f"zeros.generated.dps_{int(stored_dps)}.jsonl"


def _zero_manifest_path(root: Path, stored_dps: int) -> Path:
    return _zero_dir(root) / f"zeros.generated.dps_{int(stored_dps)}.manifest.json"


def _existing_sufficient_zero_asset(root: Path, count: int, stored_dps: int) -> Optional[Dict[str, Any]]:
    for asset in load_data_manifest(root).get("assets", []):
        if not isinstance(asset, dict):
            continue
        if asset.get("kind") != "nontrivial_zeta_zeros" or asset.get("valid") is not True:
            continue
        if int(asset.get("count") or 0) >= int(count) and int(asset.get("stored_dps") or 0) >= int(stored_dps):
            return asset
    return None


def _same_precision_extendable_asset(root: Path, stored_dps: int) -> Optional[Dict[str, Any]]:
    candidates = []
    for asset in load_data_manifest(root).get("assets", []):
        if not isinstance(asset, dict):
            continue
        if asset.get("kind") != "nontrivial_zeta_zeros" or asset.get("valid") is not True:
            continue
        if int(asset.get("stored_dps") or 0) == int(stored_dps):
            candidates.append(asset)
    if not candidates:
        return None
    return sorted(candidates, key=lambda item: int(item.get("count") or 0), reverse=True)[0]


def _lower_precision_refinement_source(root: Path, count: int, stored_dps: int) -> Optional[Dict[str, Any]]:
    candidates = []
    for asset in load_data_manifest(root).get("assets", []):
        if not isinstance(asset, dict):
            continue
        if asset.get("kind") != "nontrivial_zeta_zeros" or asset.get("valid") is not True:
            continue
        if int(asset.get("count") or 0) < int(count):
            continue
        asset_dps = int(asset.get("stored_dps") or 0)
        if 0 < asset_dps < int(stored_dps) and asset.get("source_path"):
            candidates.append(asset)
    if not candidates:
        return None
    return sorted(
        candidates,
        key=lambda item: (int(item.get("stored_dps") or 0), int(item.get("count") or 0)),
        reverse=True,
    )[0]


def _read_existing_count(path: Path) -> int:
    if not path.exists():
        return 0
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        return sum(1 for line in handle if line.strip())


def _numeric_token(line: str) -> Optional[str]:
    parts = line.strip().split()
    if not parts:
        return None
    token = parts[-1].strip().strip('"').strip("'")
    return token or None


def _refinement_tasks(source: Path, start_index: int, end_index: int, stored_dps: int) -> Iterator[Tuple[int, str, int]]:
    for index, line in enumerate(iter_text_lines(source), start=1):
        if index < start_index:
            continue
        if index > end_index:
            break
        token = _numeric_token(line)
        if token is None:
            raise ValueError(f"Missing numeric zero ordinate on line {index} of {source}")
        yield index, token, stored_dps


def _refine_zero_task(task: Tuple[int, str, int]) -> str:
    index, token, stored_dps = task
    mpmath.mp.dps = int(stored_dps) + 10
    estimate = mpmath.mpf(token)
    tolerance = mpmath.mpf(10) ** (-(int(stored_dps) + 2))
    for delta_text in ("1e-8", "1e-7", "1e-6", "1e-5"):
        delta = mpmath.mpf(delta_text)
        try:
            root = mpmath.findroot(
                mpmath.siegelz,
                (estimate - delta, estimate + delta),
                tol=tolerance,
                maxsteps=30,
                verify=False,
            )
            if root > 0 and abs(root - estimate) < mpmath.mpf("1e-4"):
                return mpmath.nstr(root, n=int(stored_dps) + 8, strip_zeros=False)
        except Exception:
            continue
    gamma = mpmath.zetazero(index).imag
    return mpmath.nstr(gamma, n=int(stored_dps) + 8, strip_zeros=False)


def _append_refined_from_lower_precision_source(
    source: Path,
    target: Path,
    current_count: int,
    requested_count: int,
    stored_dps: int,
    workers: Optional[int],
    progress_every: int,
) -> None:
    worker_count = max(1, int(workers or min(8, max(1, multiprocessing.cpu_count() - 1))))
    tasks = _refinement_tasks(source, current_count + 1, requested_count, stored_dps)
    started = time.time()
    completed = current_count
    with open(target, "a", encoding="utf-8", newline="\n") as handle:
        if worker_count == 1:
            results: Iterable[str] = map(_refine_zero_task, tasks)
        else:
            pool = multiprocessing.Pool(processes=worker_count)
            results = pool.imap(_refine_zero_task, tasks, chunksize=20)
        try:
            for refined in results:
                completed += 1
                handle.write(refined)
                handle.write("\n")
                if progress_every and completed % progress_every == 0:
                    handle.flush()
                    elapsed = max(time.time() - started, 1e-9)
                    rate = max((completed - current_count) / elapsed, 1e-9)
                    remaining = max(requested_count - completed, 0) / rate
                    print(
                        f"refined {completed}/{requested_count} zeros at stored_dps={stored_dps} "
                        f"with {worker_count} workers ({rate:.2f}/s, eta={remaining:.1f}s)",
                        flush=True,
                    )
        finally:
            if worker_count != 1:
                pool.close()
                pool.join()


def _flint_available() -> bool:
    try:
        import flint  # noqa: F401

        return True
    except Exception:
        return False


def _append_with_flint(
    target: Path,
    current_count: int,
    requested_count: int,
    stored_dps: int,
    progress_every: int,
    chunk_size: int = 1000,
) -> None:
    from flint import acb, ctx

    ctx.prec = max(int((int(stored_dps) + 10) * 3.5), 128)
    mpmath.mp.dps = int(stored_dps) + 20
    started = time.time()
    completed = current_count
    with open(target, "a", encoding="utf-8", newline="\n") as handle:
        while completed < requested_count:
            start_index = completed + 1
            batch_size = min(int(chunk_size), requested_count - completed)
            zeros = acb.zeta_zeros(start_index, batch_size)
            for zero in zeros:
                ordinate = mpmath.mpf(zero.imag._mpf_)
                handle.write(mpmath.nstr(ordinate, n=int(stored_dps) + 8, strip_zeros=False))
                handle.write("\n")
                completed += 1
            handle.flush()
            if progress_every and completed % progress_every == 0:
                elapsed = max(time.time() - started, 1e-9)
                rate = max((completed - current_count) / elapsed, 1e-9)
                remaining = max(requested_count - completed, 0) / rate
                print(
                    f"generated {completed}/{requested_count} zeros at stored_dps={stored_dps} "
                    f"with python-flint ({rate:.2f}/s, eta={remaining:.1f}s)",
                    flush=True,
                )


def ensure_nontrivial_zeros_asset(
    count: int,
    stored_dps: int,
    root: Path = ROOT,
    progress_every: int = 50,
    workers: Optional[int] = None,
) -> Dict[str, Any]:
    requested_count = int(count)
    dps = int(stored_dps)
    existing = _existing_sufficient_zero_asset(root, requested_count, dps)
    if existing:
        return existing

    extendable = _same_precision_extendable_asset(root, dps)
    if extendable and extendable.get("source_path"):
        path = root / str(extendable["source_path"])
    else:
        path = _zero_asset_path(root, dps)

    path.parent.mkdir(parents=True, exist_ok=True)
    current_count = _read_existing_count(path)
    refinement_source = _lower_precision_refinement_source(root, requested_count, dps)
    generator_name = "mpmath.zetazero"
    source_original_path = relpath(path, root)
    if _flint_available():
        generator_name = "python-flint.acb.zeta_zeros"
        source_original_path = "python-flint.acb.zeta_zeros"
        print(
            f"generating with python-flint into {relpath(path, root)}",
            flush=True,
        )
        _append_with_flint(path, current_count, requested_count, dps, progress_every)
    elif refinement_source and refinement_source.get("source_path"):
        source_path = root / str(refinement_source["source_path"])
        generator_name = "mpmath.siegelz_refinement"
        source_original_path = relpath(source_path, root)
        print(
            f"refining from {relpath(source_path, root)} into {relpath(path, root)}",
            flush=True,
        )
        _append_refined_from_lower_precision_source(
            source_path,
            path,
            current_count,
            requested_count,
            dps,
            workers,
            progress_every,
        )
    else:
        mpmath.mp.dps = dps + 10
        started = time.time()
        with open(path, "a", encoding="utf-8", newline="\n") as handle:
            for i in range(current_count + 1, requested_count + 1):
                gamma = mpmath.zetazero(i).imag
                handle.write(mpmath.nstr(gamma, n=dps + 8, strip_zeros=False))
                handle.write("\n")
                if progress_every and i % progress_every == 0:
                    handle.flush()
                    elapsed = max(time.time() - started, 1e-9)
                    rate = max((i - current_count) / elapsed, 1e-9)
                    remaining = max(requested_count - i, 0) / rate
                    print(
                        f"generated {i}/{requested_count} zeros at stored_dps={dps} "
                        f"({rate:.2f}/s, eta={remaining:.1f}s)",
                        flush=True,
                    )

    validation = validate_zero_file(path)
    validation["hash"] = hash_file(path)
    now = utc_now()
    manifest = build_zero_asset_manifest(
        f"nontrivial_zeros_count_{validation.get('count')}_dps_{dps}",
        path,
        {
            **validation,
            "stored_dps": dps,
            "usable_dps": dps,
        },
        source_path=source_original_path,
        generator=generator_name,
        created_at=now,
        root=root,
    )
    write_json(_zero_manifest_path(root, dps), manifest)
    write_data_manifest(root)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate canonical nontrivial zeta zero ordinates.")
    parser.add_argument("--count", type=int, required=True)
    parser.add_argument("--stored-dps", type=int, required=True)
    parser.add_argument("--repo-root", default=str(ROOT))
    parser.add_argument("--workers", type=int, default=None)
    args = parser.parse_args()
    print(json.dumps(
        ensure_nontrivial_zeros_asset(
            args.count,
            args.stored_dps,
            Path(args.repo_root).resolve(),
            workers=args.workers,
        ),
        indent=2,
    ))

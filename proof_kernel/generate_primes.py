"""Fallback prime generation for missing or insufficient canonical assets."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any, Dict

from .data_assets import ROOT, build_prime_asset_manifest, find_best_asset, hash_file, relpath, utc_now, validate_prime_file, write_data_manifest, write_json


def _sieve_primes(limit: int) -> list[int]:
    cap = max(3, int(limit) + 1)
    sieve = bytearray(b"\x01") * cap
    sieve[0:2] = b"\x00\x00"
    root = int(cap ** 0.5) + 1
    for i in range(2, root):
        if sieve[i]:
            start = i * i
            sieve[start:cap:i] = b"\x00" * (((cap - 1 - start) // i) + 1)
    return [i for i in range(2, cap) if sieve[i]]


def _generate_with_floor(required_count: int, required_max_prime: int) -> list[int]:
    target_count = max(0, int(required_count))
    floor_val = max(2, int(math.ceil(required_max_prime)))
    limit = max(floor_val + 1024, 2048)
    while True:
        primes = _sieve_primes(limit)
        if len(primes) >= target_count and primes and primes[-1] >= floor_val:
            return primes
        if limit > 200_000_000:
            raise ValueError("Prime sieve limit exceeded while satisfying requested asset.")
        limit = int(limit * 1.6) + 1024


def ensure_prime_asset(
    required_count: int = 0,
    required_max_prime: int = 2,
    root: Path = ROOT,
) -> Dict[str, Any]:
    existing = find_best_asset("primes", root)
    if existing and int(existing.get("count") or 0) >= int(required_count) and int(existing.get("max_prime") or 0) >= int(required_max_prime):
        return existing

    primes = _generate_with_floor(required_count, required_max_prime)
    count = len(primes)
    target = root / "data" / "primes" / f"primes.generated.count_{count}.jsonl"
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as handle:
        for prime in primes:
            handle.write(f"{prime}\n")
    tmp.replace(target)

    validation = validate_prime_file(target)
    validation["hash"] = hash_file(target)
    now = utc_now()
    manifest = build_prime_asset_manifest(target, validation, source_path="sieve", migrated_at=now, root=root)
    manifest.update({
        "asset_id": f"primes_generated_count_{count}",
        "role": "fallback_generated_asset",
        "generator": "sieve",
        "generation_required_for_current_suite": True,
    })
    write_json(root / "data" / "primes" / f"primes.generated.count_{count}.manifest.json", manifest)
    write_data_manifest(root)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate fallback prime asset.")
    parser.add_argument("--required-count", type=int, default=0)
    parser.add_argument("--required-max-prime", type=int, default=2)
    parser.add_argument("--repo-root", default=str(ROOT))
    args = parser.parse_args()
    print(json.dumps(ensure_prime_asset(args.required_count, args.required_max_prime, Path(args.repo_root).resolve()), indent=2))

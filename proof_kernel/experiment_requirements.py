"""Data requirement declarations for research experiments."""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List

from .precision_policy import required_stored_dps


SAME_OBJECT_CRITICAL_EXPERIMENTS = {"EXP_1", "EXP_6", "EXP_8"}
PROGRAM_2_EXPERIMENTS = {"EXP_2", "EXP_2B", "EXP_7"}


ALIASES = {
    "1": "EXP_1",
    "CORE-1": "EXP_1",
    "EXP1": "EXP_1",
    "6": "EXP_6",
    "VAL-1": "EXP_6",
    "EXP6": "EXP_6",
    "8": "EXP_8",
    "WIT-1": "EXP_8",
    "REG-1": "EXP_8",
    "EXP8": "EXP_8",
    "9": "EXP_9",
    "DEMO-1": "EXP_9",
    "EXP9": "EXP_9",
    "2": "EXP_2",
    "P2-1": "EXP_2",
    "2B": "EXP_2B",
    "P2-2": "EXP_2B",
    "7": "EXP_7",
    "P2-3": "EXP_7",
}


def normalize_experiment_id(value: str) -> str:
    raw = str(value).strip().upper().replace("_", "-")
    if raw.startswith("EXP-"):
        return raw.replace("EXP-", "EXP_")
    if raw.startswith("EXP") and raw[3:].replace("B", "").isdigit():
        return raw.replace("EXP", "EXP_", 1)
    return ALIASES.get(raw, raw.replace("-", "_") if raw.startswith("EXP") else raw)


def normalize_experiments(experiments: Iterable[str]) -> List[str]:
    return [normalize_experiment_id(item) for item in experiments]


def _k_values(run: Dict[str, Any]) -> List[int]:
    raw = run.get("k_values", [0, 1, 2])
    if isinstance(raw, str):
        out = []
        for item in raw.split(","):
            item = item.strip()
            if not item:
                continue
            out.append(int(float(item)))
        return out or [0, 1, 2]
    if isinstance(raw, (list, tuple)):
        return [int(float(item)) for item in raw]
    return [0, 1, 2]


def _prime_max_for_scaled_x(run: Dict[str, Any]) -> int:
    x_end = float(run.get("x_end") or 50)
    max_k = max(_k_values(run) or [0])
    tau = float(run.get("tau") or 6.283185307179586)
    return int(math.ceil(x_end * (tau ** max_k)))


def default_run_config(
    requested_dps: int = 80,
    requested_zero_count: int = 100000,
    guard_dps: int = 20,
    **overrides: Any,
) -> Dict[str, Any]:
    run = {
        "dps": int(requested_dps),
        "requested_dps": int(requested_dps),
        "zero_count": int(requested_zero_count),
        "requested_zero_count": int(requested_zero_count),
        "guard_dps": int(guard_dps),
        "x_end": 50,
        "k_values": [0, 1, 2],
        "n_test": 500,
        "sample_count": 100,
        "prime_min_count": 0,
        "prime_target_count": 0,
    }
    run.update(overrides)
    return run


def experiment_requirement_catalog() -> Dict[str, Dict[str, Any]]:
    return {
        "EXP_1": {
            "display_id": "CORE-1",
            "program": "PROGRAM_1",
            "critical_path": True,
            "requirements": {
                "nontrivial_zeros": {"count": "run.zero_count", "stored_dps": "run.dps + guard_dps"},
                "tau": {"stored_dps": "run.dps + guard_dps"},
                "primes": {"max_value": "derived from x_end and k range"},
                "trivial_zeros": {"formula": "s = -2n"},
            },
        },
        "EXP_6": {
            "display_id": "VAL-1",
            "program": "PROGRAM_1",
            "critical_path": True,
            "requirements": {
                "nontrivial_zeros": {"count": "run.zero_count", "stored_dps": "run.dps + guard_dps"},
                "tau": {"stored_dps": "run.dps + guard_dps"},
                "primes": {"max_value": "derived from x_end * max(tau^k)"},
                "trivial_zeros": {"formula": "s = -2n"},
            },
        },
        "EXP_8": {
            "display_id": "WIT-1",
            "program": "PROGRAM_1",
            "critical_path": True,
            "requirements": {
                "nontrivial_zeros": {"count": "run.n_test or run.zero_count", "stored_dps": "run.dps + guard_dps"},
                "tau": {"stored_dps": "run.dps + guard_dps"},
            },
        },
        "EXP_9": {
            "display_id": "DEMO-1",
            "program": "PROGRAM_1",
            "critical_path": False,
            "requirements": {
                "tau": {"stored_dps": "run.dps + guard_dps"},
                "nontrivial_zeros": {"count": "sample_count", "stored_dps": "run.dps + guard_dps"},
            },
        },
        "EXP_2": {
            "display_id": "P2-1",
            "program": "PROGRAM_2",
            "critical_path": False,
            "requirements": {
                "nontrivial_zeros": {"count": "run.zero_count", "stored_dps": "run.dps + guard_dps"},
                "tau": {"stored_dps": "run.dps + guard_dps"},
            },
        },
        "EXP_2B": {
            "display_id": "P2-2",
            "program": "PROGRAM_2",
            "critical_path": False,
            "requirements": {
                "nontrivial_zeros": {"count": "run.zero_count", "stored_dps": "run.dps + guard_dps"},
                "tau": {"stored_dps": "run.dps + guard_dps"},
            },
        },
        "EXP_7": {
            "display_id": "P2-3",
            "program": "PROGRAM_2",
            "critical_path": False,
            "requirements": {
                "nontrivial_zeros": {"count": "run.zero_count", "stored_dps": "run.dps + guard_dps"},
                "tau": {"stored_dps": "run.dps + guard_dps"},
                "primes": {"max_value": "derived from exploratory x range"},
            },
        },
    }


def requirements_for_experiments(experiments: Iterable[str], run: Dict[str, Any]) -> Dict[str, Any]:
    normalized = normalize_experiments(experiments)
    requested_dps = int(run.get("requested_dps") or run.get("dps") or 80)
    guard_dps = int(run.get("guard_dps") or 20)
    required_dps = required_stored_dps(requested_dps, guard_dps)
    zero_count = int(run.get("requested_zero_count") or run.get("zero_count") or 0)
    n_test = int(run.get("n_test") or zero_count or 0)
    sample_count = int(run.get("sample_count") or 100)
    prime_count = max(int(run.get("prime_target_count") or 0), int(run.get("prime_min_count") or 0))

    needs_tau = False
    needs_nontrivial = False
    needs_primes = False
    needs_trivial = False
    required_zero_count = 0
    required_prime_max = 0

    catalog = experiment_requirement_catalog()
    declarations = {}

    for exp_id in normalized:
        decl = catalog.get(exp_id)
        if not decl:
            continue
        declarations[exp_id] = decl
        reqs = decl["requirements"]
        if "tau" in reqs:
            needs_tau = True
        if "trivial_zeros" in reqs:
            needs_trivial = True
        if "nontrivial_zeros" in reqs:
            needs_nontrivial = True
            if exp_id == "EXP_8":
                required_zero_count = max(required_zero_count, n_test or zero_count)
            elif exp_id == "EXP_9":
                required_zero_count = max(required_zero_count, sample_count)
            else:
                required_zero_count = max(required_zero_count, zero_count)
        if "primes" in reqs:
            needs_primes = True
            required_prime_max = max(required_prime_max, _prime_max_for_scaled_x(run))

    required_assets: List[Dict[str, Any]] = []
    if needs_tau:
        required_assets.append({"kind": "tau", "stored_dps": required_dps})
    if needs_nontrivial:
        required_assets.append({
            "kind": "nontrivial_zeta_zeros",
            "count": required_zero_count,
            "stored_dps": required_dps,
        })
    if needs_trivial or normalized:
        required_assets.append({"kind": "trivial_zeta_zeros", "formula": "s = -2n"})
    if needs_primes:
        required_assets.append({
            "kind": "primes",
            "count": prime_count,
            "max_prime": required_prime_max,
            "max_value": required_prime_max,
        })

    return {
        "experiments": normalized,
        "declarations": declarations,
        "required_assets": required_assets,
        "required_stored_dps": required_dps,
        "guard_dps": guard_dps,
        "requested_dps": requested_dps,
    }

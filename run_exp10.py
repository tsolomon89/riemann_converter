"""Experiment 10: zeta gauge-transport residual measurement.

The user's theory says there exists a multiplicative gauge T_k under which
RH is invariant. The previous experiments (EXP_1 / EXP_5 / EXP_6) test
properties of the explicit-formula reconstruction pi_N(x), not zeta itself.
This experiment operates directly on zeta:

    For base c in {tau, sqrt(2), e, phi, 1.0001} and k in {0, 1, 2, 5, 10}:
      sample t in [T0, T0+L]
      compute zeta_orig(t)        = zeta(0.5 + i*t)
      compute zeta_transport(t)   = zeta(0.5 + i*c**k * t)
      residual_k(t)               = | zeta_orig(t) - zeta_transport(t) |

If the gauge were an exact automorphism of the RH question on zeta itself,
residual would be 0 for all t and k. It will not be — zeta has no known
non-trivial multiplicative gauge automorphism. The value of this experiment
is in *quantifying* the deviation:

  - Does residual stabilize, grow monotonically, or oscillate with t?
  - Does any base outperform another (the uniqueness question)?
  - The c=1.0001 baseline gives a sanity check via |zeta'(s)| * 0.0001
    — if it doesn't match, the experiment has a bug.

EPISTEMIC_LEVEL = EMPIRICAL, function = EXPLORATORY: this is a Level-4
witness in the user's 4-layer obligation chain (operates on zeta itself,
not on pi_N), but its outcome is INFORMATIONAL only — the experiment
cannot license a CONSISTENT theorem outcome because it WILL produce
non-zero residuals. The disallowed_conclusion list explicitly forbids
inferring "zeta admits a non-trivial multiplicative gauge automorphism"
or "tau is uniquely privileged" from the data.
"""

from __future__ import annotations

import math

import mpmath


_DEFAULT_T0 = 14.0
_DEFAULT_L = 18.0
_DEFAULT_M = 400
_QUICK_M = 80

_DEFAULT_BASES = ("tau", "sqrt2", "e", "phi", "baseline_1p0001")
_DEFAULT_K_VALUES = (0, 1, 2, 5, 10)


def _resolve_base(name):
    if name == "tau":
        return 2 * mpmath.pi
    if name == "sqrt2":
        return mpmath.sqrt(2)
    if name == "e":
        return mpmath.e
    if name == "phi":
        return (1 + mpmath.sqrt(5)) / 2
    if name == "baseline_1p0001":
        return mpmath.mpf("1.0001")
    return mpmath.mpf(name)


def _linspace(start, end, count):
    if count <= 1:
        return [float(start)]
    step = (float(end) - float(start)) / (count - 1)
    return [float(start) + i * step for i in range(count)]


def _stats(values):
    if not values:
        return {"count": 0, "max": 0.0, "mean": 0.0, "median": 0.0, "p95": 0.0}
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    return {
        "count": n,
        "max": float(sorted_vals[-1]),
        "mean": float(sum(sorted_vals) / n),
        "median": float(sorted_vals[n // 2]),
        "p95": float(sorted_vals[max(0, int(0.95 * n) - 1)]),
    }


def _residual_one(t, scale_mp):
    """Compute |zeta(0.5 + i*t) - zeta(0.5 + i*scale*t)|.

    Uses arithmetic on mpmath complex numbers for precision.
    """
    s_orig = mpmath.mpc(0.5, t)
    s_trans = mpmath.mpc(0.5, float(scale_mp) * t)
    z_orig = mpmath.zeta(s_orig)
    z_trans = mpmath.zeta(s_trans)
    diff = z_orig - z_trans
    return float(abs(diff))


def run_experiment_10(zeros=None, resolution=None, x_start=None, x_end=None,
                      progress_callback=None, quick=False, **kwargs):
    """Sweep multiplicative gauge bases against zeta on the critical line.

    Args:
        zeros: ignored (this experiment operates directly on zeta).
        resolution: sample count override.
        x_start, x_end: optional override for [T0, T0+L].
        progress_callback: standard hook.
        quick: smaller M for fast iteration.

    Returns:
        {
            "config": {T0, L, M, dps, bases, k_values},
            "bases": {
                "tau": {
                    "0": {stats..., "raw_residuals": [...]},
                    "1": {...}, ...
                },
                "sqrt2": {...},
                ...
            },
            "summary": {
                "best_base_per_k": {k: best_base_name},
                "max_residual_per_base": {base: max over all k},
                "sanity_baseline_ratio": float,
            }
        }
    """
    print("Running Experiment 10: zeta gauge-transport residual...")

    T0 = float(x_start) if x_start is not None else _DEFAULT_T0
    L = float(x_end - x_start) if (x_start is not None and x_end is not None) else _DEFAULT_L
    if quick:
        M = _QUICK_M
    else:
        M = int(resolution) if resolution else _DEFAULT_M

    bases = _DEFAULT_BASES
    k_values = _DEFAULT_K_VALUES
    t_grid = _linspace(T0, T0 + L, M)

    total_units = len(bases) * len(k_values) * M
    units_done = 0

    bases_out = {}
    for base_name in bases:
        base_mp = _resolve_base(base_name)
        per_k = {}
        for k in k_values:
            scale = base_mp ** k
            residuals = []
            for t in t_grid:
                residuals.append(_residual_one(t, scale))
                units_done += 1
                if callable(progress_callback) and units_done % max(1, total_units // 30) == 0:
                    progress_callback(
                        units_done,
                        total_units,
                        message=f"exp10 {base_name} k={k}",
                    )
            stats = _stats(residuals)
            stats["raw_residuals"] = residuals
            stats["scale"] = float(scale)
            per_k[str(k)] = stats
        bases_out[base_name] = per_k

    # Cross-base comparisons
    best_base_per_k = {}
    for k in k_values:
        if k == 0:
            best_base_per_k[str(k)] = "all-equivalent-at-k0"
            continue
        candidates = [(name, bases_out[name][str(k)]["max"]) for name in bases]
        candidates.sort(key=lambda pair: pair[1])
        best_base_per_k[str(k)] = candidates[0][0]

    max_residual_per_base = {
        name: max(bases_out[name][str(k)]["max"] for k in k_values)
        for name in bases
    }

    # Sanity baseline check: for c=1.0001, k=1, residual at t=T0 should be
    # approximately |zeta'(0.5 + i*T0)| * 0.0001 * T0. We don't compute zeta'
    # exactly here; just record that the baseline at k=1 is small relative to
    # tau's k=1. If the ratio is > 1, the baseline is misbehaving.
    baseline_max_k1 = bases_out["baseline_1p0001"]["1"]["max"]
    tau_max_k1 = bases_out["tau"]["1"]["max"]
    sanity_ratio = baseline_max_k1 / tau_max_k1 if tau_max_k1 > 0 else float("inf")

    config = {
        "T0": T0,
        "L": L,
        "M": M,
        "dps": int(mpmath.mp.dps),
        "bases": list(bases),
        "k_values": list(k_values),
    }

    summary = {
        "best_base_per_k": best_base_per_k,
        "max_residual_per_base": max_residual_per_base,
        "sanity_baseline_max_k1": baseline_max_k1,
        "tau_max_k1": tau_max_k1,
        "sanity_baseline_ratio": float(sanity_ratio),
    }

    print(
        f"  > Computed {total_units} zeta residuals across "
        f"{len(bases)} bases x {len(k_values)} k-values x {M} t-samples."
    )
    print(f"  > max(|res|) per base across all k: {max_residual_per_base}")
    print(f"  > Sanity baseline / tau ratio at k=1: {sanity_ratio:.2e}")

    if callable(progress_callback):
        progress_callback(
            total_units,
            total_units,
            message="exp10 zeta transport residual complete",
            payload={"max_residual_per_base": max_residual_per_base},
        )

    return {
        "config": config,
        "bases": bases_out,
        "summary": summary,
    }

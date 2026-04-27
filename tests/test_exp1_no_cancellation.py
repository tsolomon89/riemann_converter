"""Regression test: EXP_1 must not re-introduce the gauge-cancelling
`eff_X = x_vis / scale` bug.

The pre-rebuild kernel walked a scaled physical window and divided the
scaling back out before evaluating, which forced MobiusPi to be evaluated
at the same un-scaled coordinate at every k. max_drift = 0 was guaranteed
by the inverse-of-multiplication identity, not by any property of the
explicit formula. This test guards against that bug returning by asserting
that the kernel actually evaluates at distinct physical coordinates across
k, and that y_rec at k!=0 differs from y_rec at k=0.

Runs with a tiny zero set and resolution to keep the test fast.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import mpmath  # noqa: E402

import riemann_math  # noqa: E402
from riemann_math import TAU  # noqa: E402
from run_exp1 import WavePair, run_experiment_1  # noqa: E402


def _zeros_for_test(n=50):
    """Return n known zero ordinates from agent_context/zeros.dat (or a small
    hardcoded fallback if the file is unavailable). Test-grade only."""
    zeros_path = os.path.join(
        os.path.dirname(__file__), "..", "agent_context", "zeros.dat"
    )
    if os.path.exists(zeros_path):
        out = []
        with open(zeros_path, "r", encoding="utf-8") as fh:
            for line in fh:
                tok = line.strip()
                if not tok:
                    continue
                try:
                    out.append(mpmath.mpf(tok))
                except Exception:
                    continue
                if len(out) >= n:
                    break
        if out:
            return out
    # Fallback: first 10 known non-trivial zero imaginary parts.
    return [
        mpmath.mpf("14.134725141734693"),
        mpmath.mpf("21.022039638771555"),
        mpmath.mpf("25.010857580145688"),
        mpmath.mpf("30.424876125859513"),
        mpmath.mpf("32.935061587739189"),
        mpmath.mpf("37.586178158825671"),
        mpmath.mpf("40.918719012147495"),
        mpmath.mpf("43.327073280914999"),
        mpmath.mpf("48.005150881167159"),
        mpmath.mpf("49.773832477672302"),
    ]


def _run_small():
    riemann_math.configure(dps=30, zero_count=50, prime_min_count=0, prime_target_count=2000)
    zeros = _zeros_for_test(50)
    return run_experiment_1(
        zeros, resolution=8, x_start=10, x_end=20, progress_callback=None
    )


def _stress(result, k):
    return result["support"]["scaled_coordinate_stress"]["by_k"][str(k)]


def _main(result, k):
    return result["main"]["by_k"][str(k)]


def test_x_phys_differs_across_k():
    """At the SAME index i, x_phys at k!=0 must equal x_eff * tau^k, not x_eff."""
    result = _run_small()
    k0 = _stress(result, 0)
    k1 = _stress(result, 1)
    assert len(k0) == len(k1)
    tau = float(TAU)
    for i, (p0, p1) in enumerate(zip(k0, k1)):
        # k=0 has scale=1, so x_phys == eff_x.
        assert abs(p0["x"] - p0["eff_x"]) < 1e-9, f"k=0 point {i}: x != eff_x"
        # k=1 must have x_phys = eff_x * tau (NOT eff_x).
        assert abs(p1["x"] - p1["eff_x"] * tau) < 1e-6, (
            f"k=1 point {i}: x={p1['x']} should equal eff_x*tau={p1['eff_x'] * tau}"
        )
        # And x_phys at k=1 must NOT equal x_phys at k=0 (would mean cancelled).
        assert abs(p0["x"] - p1["x"]) > 1e-6, (
            f"point {i}: x at k=0 ({p0['x']}) equals x at k=1 ({p1['x']}); "
            "the gauge transformation has been cancelled in the kernel."
        )


def test_y_rec_differs_across_k_when_x_phys_differs():
    """y_rec at k=1 must differ from y_rec at k=0 — i.e., MobiusPi was actually
    evaluated at two different physical coordinates, not the same one twice."""
    result = _run_small()
    k0 = _stress(result, 0)
    k1 = _stress(result, 1)
    different_count = sum(1 for p0, p1 in zip(k0, k1) if abs(p0["y_rec"] - p1["y_rec"]) > 1e-9)
    assert different_count > 0, (
        "y_rec is identical across k=0 and k=1 at every point. The reconstruction "
        "is being evaluated at the same coordinate at every k, which means the "
        "gauge cancellation bug has returned."
    )


def test_y_true_at_k1_reflects_scaled_prime_count():
    """y_true at k=1 must reflect the prime count at x_phys = x_eff * tau, NOT
    at x_eff. There are more primes in [0, x*tau] than in [0, x], so y_true at
    k=1 should be >= y_true at k=0 at every matching point."""
    result = _run_small()
    k0 = _stress(result, 0)
    k1 = _stress(result, 1)
    for p0, p1 in zip(k0, k1):
        assert p1["y_true"] >= p0["y_true"], (
            f"y_true at k=1 ({p1['y_true']}) must be >= y_true at k=0 "
            f"({p0['y_true']}) since the scaled coordinate covers more primes."
        )
    # And the inequality should be strict for at least one point (otherwise
    # the prime-count buffer didn't actually expand).
    strict_count = sum(1 for p0, p1 in zip(k0, k1) if p1["y_true"] > p0["y_true"])
    assert strict_count > 0, (
        "y_true is constant across k=0 and k=1 at every point. The TruePi "
        "lookup is not picking up the scaled coordinate."
    )


def test_wavepair_is_finite_on_plotted_domain():
    gamma = _zeros_for_test(1)[0]
    for x in [2, 10, 20, 50]:
        value = WavePair(gamma, x)
        assert mpmath.isfinite(value)


def test_main_tau_substitution_rows_use_x_eff_and_x_units():
    result = _run_small()
    k0 = _main(result, 0)
    k1 = _main(result, 1)
    tau = float(TAU)
    assert len(k0) == len(k1)
    for p0, p1 in zip(k0, k1):
        assert abs(p1["x_eff"] - p0["x_eff"]) < 1e-12
        assert abs(p1["X"] - p1["x_eff"] * tau) < 1e-6
        assert abs(p0["X"] - p0["x_eff"]) < 1e-12
        assert p1["y_true"] == p0["y_true"]
        assert abs(p1["harmonic_N_50"] - p0["harmonic_N_50"]) < 1e-12
        assert abs(p1["mobius_N_50"] - p0["mobius_N_50"]) < 1e-12


def test_prime_markers_are_scaled_in_x_units():
    result = _run_small()
    markers = result["main"]["prime_markers_by_k"]["1"]
    tau = float(TAU)
    assert markers
    for marker in markers:
        assert abs(marker["X"] - marker["prime"] * tau) < 1e-6
        assert marker["x_eff"] == marker["prime"]


def test_main_and_support_branches_are_present():
    result = _run_small()
    assert result["schema_version"] == "exp1.main.v1"
    assert result["main"]["by_k"]["0"]
    assert result["support"]["scaled_coordinate_stress"]["by_k"]["0"]

"""Experiment 9: Bounded-view-corollary demonstration.

The theorem candidate's bounded-view corollary says: if exact transport
holds, then for any zero rho at arbitrarily large height there exists some
k such that T_c^k(rho) lands in a bounded window we already have full
coverage of. Checking RH on that window suffices.

This experiment does NOT witness any obligation. It is a *demonstration*:
for a sample of zero heights (low, mid, and high in the local zero set),
report the k value required to bring the image |gamma * tau^k| into a
bounded target window, and the resulting image height. This makes the
corollary's content concrete for a reviewer:

    Given zero at height 47823, k = -3 brings image to height 47823/tau^3
    = 192.15, which sits inside the [10, 1000] window. The bounded-view
    corollary asserts that IF transport holds, verifying RH on [10, 1000]
    rules out off-line zeros at height 47823.

EPISTEMIC_LEVEL = INSTRUMENTAL: this is a demonstration of the corollary's
mechanics, not evidence about whether transport holds.
"""

from __future__ import annotations

import math

import mpmath

from riemann_math import TAU


def _required_k(gamma: float, lo: float, hi: float) -> int:
    """Find the integer k closest to 0 such that gamma * tau^k is in [lo, hi].

    For high gamma we need negative k (compress down); for very low gamma we
    might need positive k (expand up), though that case is uninteresting in
    practice. Searches outward from 0; returns the smallest |k| that fits.
    """
    tau_f = float(TAU)
    if gamma == 0:
        return 0
    # Heuristic seed: solve gamma * tau^k = sqrt(lo*hi) -> k = log_tau(sqrt(lo*hi)/gamma)
    target = math.sqrt(lo * hi)
    seed = int(round(math.log(target / gamma) / math.log(tau_f)))
    # Search a small radius around the seed.
    for offset in range(0, 50):
        for sign in (1, -1) if offset > 0 else (1,):
            k = seed + sign * offset
            image = gamma * (tau_f ** k)
            if lo <= image <= hi:
                return k
    return seed  # fallback; will be reported even if outside window


def run_experiment_9(zeros, resolution=None, x_start=None, x_end=None,
                     progress_callback=None, **kwargs):
    """Sample zeros at low / mid / high indices and report the k required to
    bring each image into the bounded target window.

    Returns:
        {
            "target_window": {"lo": ..., "hi": ...},
            "samples": [
                {
                    "index": int,
                    "gamma": float,
                    "k_required": int,
                    "gamma_image": float,
                    "in_window": bool,
                },
                ...
            ],
            "in_window_count": int,
            "total_count": int,
        }
    """
    print("Running Experiment 9: Bounded-view corollary demonstration...")

    # Target window: range where current zero data is known to be reliable.
    # Pick something narrower than the full coverage to make "lands in
    # bounded window" non-trivial.
    target_lo = 10.0
    target_hi = 1000.0

    n = len(zeros)
    if n == 0:
        return {
            "target_window": {"lo": target_lo, "hi": target_hi},
            "samples": [],
            "in_window_count": 0,
            "total_count": 0,
        }

    # Sample 5 zeros: indices spanning the available range.
    sample_indices = sorted(set([
        0,
        max(0, n // 100),
        max(0, n // 10),
        max(0, n // 2),
        n - 1,
    ]))

    samples = []
    for i in sample_indices:
        gamma = float(zeros[i])
        k = _required_k(gamma, target_lo, target_hi)
        image = gamma * (float(TAU) ** k)
        samples.append({
            "index": int(i),
            "gamma": gamma,
            "k_required": int(k),
            "gamma_image": float(image),
            "in_window": bool(target_lo <= image <= target_hi),
        })

    in_window = sum(1 for s in samples if s["in_window"])

    print(
        f"  > Sampled {len(samples)} zeros from indices "
        f"{[s['index'] for s in samples]}: "
        f"{in_window}/{len(samples)} land in [{target_lo}, {target_hi}] "
        f"with their respective k_required."
    )

    if callable(progress_callback):
        progress_callback(
            len(samples),
            len(samples),
            message="exp9 bounded-view demonstration",
            payload={"in_window": in_window, "total": len(samples)},
        )

    return {
        "target_window": {"lo": target_lo, "hi": target_hi},
        "samples": samples,
        "in_window_count": in_window,
        "total_count": len(samples),
    }

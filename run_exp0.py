"""Experiment 0: Riemann zeta polar trace on the critical line.

Visualizes zeta(1/2 + i*t) directly as a parametric curve in the complex
plane. Each loop through the origin corresponds to a non-trivial zero. This
is the only place the dashboard shows zeta itself (every other experiment
operates on the explicit-formula reconstruction pi_N(x), which is built
from zeta's zeros but is not zeta).

Two outputs:

    polar_trace
        Dense sample of {t, re, im} for t in [t_start, t_end]. Loaded zero
        gammas in the same range are echoed back as `{t: gamma_k, re: re,
        im: im, marker: "zero"}` so the chart can mark expected origin
        crossings.

    dual_window
        Two overlaid samples that visually test the user's compression
        thesis: zeta(1/2 + i*t) for t in [T, T+L] (uncompressed) vs
        zeta(1/2 + i*(c**k)*t) for t in the same [T, T+L] range
        (transported). If the gauge were an automorphism of the RH question
        on the level of zeta itself, the two polar curves would superimpose.
        They do not, in general, and the visual deviation IS the point.

EPISTEMIC_LEVEL = DESCRIPTIVE: this experiment shows the analytic object
the gauge is conjectured to act on. It does not witness any obligation
and cannot vote in stage_verdicts.
"""

from __future__ import annotations

import math

import mpmath

from riemann_math import TAU


_DEFAULT_T_START = 1.0
_DEFAULT_T_END = 100.0
_DEFAULT_POINTS = 4000
_QUICK_POINTS = 800

# Dual-window defaults: window starts just past gamma_1 = 14.13 and ends
# just before gamma_8 ~= 31.18, so the uncompressed window contains a
# zero-rich segment. The compressed counterpart at k=1, c=tau lands the
# transported window in [88, 200] — a similarly zero-rich high-t band.
_DEFAULT_DUAL_T_START = 14.0
_DEFAULT_DUAL_LENGTH = 18.0
_DEFAULT_DUAL_K = 1
_DEFAULT_DUAL_BASE = "tau"

_BASE_VALUES = {
    "tau": TAU,
    "sqrt2": mpmath.sqrt(2),
    "e": mpmath.e,
    "phi": (1 + mpmath.sqrt(5)) / 2,
}


def _resolve_base(name):
    if name in _BASE_VALUES:
        return _BASE_VALUES[name]
    return mpmath.mpf(name)


def _sample_zeta(t_value):
    """Return {re, im} of zeta(1/2 + i*t) as plain floats."""
    s = mpmath.mpc(0.5, t_value)
    z = mpmath.zeta(s)
    return float(z.real), float(z.imag)


def _linspace(start, end, count):
    if count <= 1:
        return [float(start)]
    step = (float(end) - float(start)) / (count - 1)
    return [float(start) + i * step for i in range(count)]


def _build_polar_trace(t_start, t_end, point_count, zeros, progress_callback=None):
    t_grid = _linspace(t_start, t_end, point_count)
    samples = []
    for idx, t in enumerate(t_grid):
        re, im = _sample_zeta(t)
        samples.append({"t": t, "re": re, "im": im})
        if callable(progress_callback) and idx % max(1, point_count // 20) == 0:
            progress_callback(
                idx,
                point_count,
                message=f"exp0 polar sample {idx}/{point_count}",
            )

    zero_markers = []
    for k, gamma in enumerate(zeros, start=1):
        gf = float(gamma)
        if t_start <= gf <= t_end:
            re, im = _sample_zeta(gf)
            zero_markers.append({
                "index": k,
                "t": gf,
                "re": re,
                "im": im,
                "marker": "zero",
            })

    return {"samples": samples, "zero_markers": zero_markers}


def _build_dual_window(t_start, length, k, base_name, point_count, progress_callback=None):
    base_mp = _resolve_base(base_name)
    scale = base_mp ** k

    t_grid_orig = _linspace(t_start, t_start + length, point_count)
    uncompressed = []
    compressed = []

    for idx, t in enumerate(t_grid_orig):
        re_o, im_o = _sample_zeta(t)
        uncompressed.append({"t": t, "re": re_o, "im": im_o})

        t_transported = float(scale) * t
        re_c, im_c = _sample_zeta(t_transported)
        compressed.append({
            "t_orig": t,
            "t_compressed": t_transported,
            "re": re_c,
            "im": im_c,
        })

        if callable(progress_callback) and idx % max(1, point_count // 20) == 0:
            progress_callback(
                idx,
                point_count,
                message=f"exp0 dual-window sample {idx}/{point_count}",
            )

    return {
        "uncompressed": uncompressed,
        "compressed": compressed,
        "config": {
            "T": t_start,
            "L": length,
            "k": k,
            "base_name": base_name,
            "base_value": float(base_mp),
            "scale": float(scale),
            "compressed_t_range": [float(scale) * t_start, float(scale) * (t_start + length)],
        },
    }


def run_experiment_0(zeros, resolution=None, x_start=None, x_end=None,
                     progress_callback=None, quick=False, **kwargs):
    """Sample zeta(1/2 + i*t) on the critical line for visualization.

    Args:
        zeros: list of imaginary parts of non-trivial zeta zeros (gamma_k).
        resolution: optional override for polar_trace point count.
        x_start, x_end: optional override for the polar_trace t-range.
            (Named x_* for parity with other experiments' kwargs even though
            this experiment is parametrized by t, not x.)
        progress_callback: standard progress hook.
        quick: if True, use _QUICK_POINTS for faster iteration.

    Returns:
        {
            "polar_trace": {"samples": [{t, re, im}, ...],
                            "zero_markers": [{index, t, re, im, marker}, ...],
                            "config": {t_start, t_end, point_count, dps}},
            "dual_window": {"uncompressed": [...], "compressed": [...], "config": {...}},
        }
    """
    print("Running Experiment 0: zeta polar trace on critical line...")

    t_start = float(x_start) if x_start is not None else _DEFAULT_T_START
    t_end = float(x_end) if x_end is not None else _DEFAULT_T_END
    if quick:
        point_count = _QUICK_POINTS
    else:
        point_count = int(resolution) if resolution else _DEFAULT_POINTS

    polar = _build_polar_trace(t_start, t_end, point_count, zeros, progress_callback)
    polar["config"] = {
        "t_start": t_start,
        "t_end": t_end,
        "point_count": point_count,
        "dps": int(mpmath.mp.dps),
    }

    dual_points = max(200, point_count // 4)
    dual = _build_dual_window(
        _DEFAULT_DUAL_T_START,
        _DEFAULT_DUAL_LENGTH,
        _DEFAULT_DUAL_K,
        _DEFAULT_DUAL_BASE,
        dual_points,
        progress_callback,
    )

    print(
        f"  > Polar trace: {point_count} samples on t in [{t_start}, {t_end}]; "
        f"{len(polar['zero_markers'])} zero markers in range."
    )
    print(
        f"  > Dual window: {dual_points} samples on t in "
        f"[{_DEFAULT_DUAL_T_START}, {_DEFAULT_DUAL_T_START + _DEFAULT_DUAL_LENGTH}] "
        f"vs scaled by {_DEFAULT_DUAL_BASE}^{_DEFAULT_DUAL_K} to "
        f"[{dual['config']['compressed_t_range'][0]:.2f}, "
        f"{dual['config']['compressed_t_range'][1]:.2f}]."
    )

    if callable(progress_callback):
        progress_callback(
            point_count + dual_points,
            point_count + dual_points,
            message="exp0 zeta polar trace complete",
            payload={
                "point_count": point_count,
                "dual_points": dual_points,
                "zero_markers": len(polar["zero_markers"]),
            },
        )

    return {
        "polar_trace": polar,
        "dual_window": dual,
    }

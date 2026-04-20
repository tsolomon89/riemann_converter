import math
import mpmath
import riemann_math


def _parse_k_values(k_values):
    if isinstance(k_values, str):
        raw = [v.strip() for v in k_values.split(",") if v.strip()]
        parsed = [float(v) for v in raw]
    elif isinstance(k_values, (list, tuple)):
        parsed = [float(v) for v in k_values]
    else:
        parsed = [0.0, 1.0, 2.0]

    # Preserve order but remove duplicates.
    dedup = []
    seen = set()
    for v in parsed:
        key = float(v)
        if key in seen:
            continue
        seen.add(key)
        dedup.append(key)
    return dedup if dedup else [0.0, 1.0, 2.0]


def _k_label(k):
    if abs(k - round(k)) < 1e-12:
        return str(int(round(k)))
    return f"{k:.12g}"


def _percentile(values, q):
    if not values:
        return None
    s = sorted(values)
    if len(s) == 1:
        return float(s[0])
    rank = (len(s) - 1) * q
    lo = int(math.floor(rank))
    hi = int(math.ceil(rank))
    if lo == hi:
        return float(s[lo])
    frac = rank - lo
    return float(s[lo] + (s[hi] - s[lo]) * frac)


def _local_spacing(zeros, idx):
    if len(zeros) <= 1:
        return mpmath.mpf(1)
    if idx == 0:
        return abs(zeros[1] - zeros[0])
    if idx >= len(zeros) - 1:
        return abs(zeros[-1] - zeros[-2])
    left = abs(zeros[idx] - zeros[idx - 1])
    right = abs(zeros[idx + 1] - zeros[idx])
    return min(left, right)


def _refine_t_hat(t_seed, scale, local_spacing, dps):
    # Refine near t_seed for F_k(t) = zeta(0.5 + i*t/scale) using Hardy Z.
    tol_find = mpmath.power(10, -min(30, max(10, int(dps // 2))))
    # Keep the local bracket narrow; source decimal error is tiny relative to spacing.
    delta = max(mpmath.mpf("1e-7"), abs(scale) * local_spacing * mpmath.mpf("1e-6"))

    def z_scaled(t):
        return mpmath.siegelz(t / scale)

    try:
        t_hat = mpmath.findroot(z_scaled, (t_seed - delta, t_seed + delta), tol=tol_find, maxsteps=60)
        return t_hat, True
    except Exception:
        try:
            t_hat = mpmath.findroot(z_scaled, t_seed, tol=tol_find, maxsteps=60)
            return t_hat, True
        except Exception:
            return None, False


def run_experiment_8(zeros, k_values="0,1,2", n_test=500, dps=50, **kwargs):
    """
    Experiment 8: Anchored scaled-zeta zero-equivalence test.

    Model:
      F_k(s) = zeta(0.5 + (s - 0.5)/tau^k)
    On s = 0.5 + i t:
      F_k(t) = zeta(0.5 + i t/tau^k)
    Predicted mapped zeros:
      t_pred(n, k) = tau^k * gamma_n
    """
    print(f"Running Experiment 8: Scaled-Zeta Zero Equivalence... [n_test={n_test}, k={k_values}]")
    if not zeros:
        raise ValueError("Experiment 8 requires non-empty zero list.")

    ks = _parse_k_values(k_values)
    n = min(int(n_test), len(zeros))
    if n <= 0:
        return {
            "config": {"model": "anchored_full_s", "k_values": ks, "n_test": 0, "dps": int(dps)},
            "per_k": {},
        }

    per_k = {}
    all_abs_dev = []
    all_residual = []
    total_success = 0
    total_fail = 0
    tau = riemann_math.TAU
    gamma_seeds = [mpmath.mpf(zeros[i]) for i in range(n)]
    local_spacings = [_local_spacing(zeros, i) for i in range(n)]
    residual_seed = []
    for gamma in gamma_seeds:
        s_seed = mpmath.mpc(mpmath.mpf("0.5"), gamma)
        residual_seed.append(abs(mpmath.zeta(s_seed)))

    for k in ks:
        scale = mpmath.power(tau, k)
        points = []
        abs_dev_vals = []
        residual_vals = []
        count_success = 0
        count_fail = 0

        for i in range(n):
            gamma_pred = gamma_seeds[i]
            t_pred = scale * gamma_pred
            # F_k(s) = zeta(0.5 + (s-0.5)/tau^k), evaluated on critical line.
            residual_pred = residual_seed[i]
            residual_vals.append(float(residual_pred))
            all_residual.append(float(residual_pred))

            spacing = local_spacings[i]
            t_hat, ok = _refine_t_hat(t_pred, scale, spacing, dps)

            if ok and t_hat is not None:
                abs_dev = abs(t_hat - t_pred)
                abs_dev_vals.append(float(abs_dev))
                all_abs_dev.append(float(abs_dev))
                count_success += 1
                refined = True
                t_hat_out = float(t_hat)
                abs_dev_out = float(abs_dev)
            else:
                count_fail += 1
                refined = False
                t_hat_out = None
                abs_dev_out = None

            points.append(
                {
                    "n": int(i + 1),
                    "t_pred": float(t_pred),
                    "t_hat": t_hat_out,
                    "abs_dev": abs_dev_out,
                    "residual_pred": float(residual_pred),
                    "refined": refined,
                }
            )

            if (i + 1) % 200 == 0 or (i + 1) == n:
                print(f"  > k={k}: point {i+1}/{n}", end="\r")
        print("")

        metrics = {
            "max_abs_dev": max(abs_dev_vals) if abs_dev_vals else None,
            "p95_abs_dev": _percentile(abs_dev_vals, 0.95) if abs_dev_vals else None,
            "p99_abs_dev": _percentile(abs_dev_vals, 0.99) if abs_dev_vals else None,
            "max_residual": max(residual_vals) if residual_vals else None,
            "p95_residual": _percentile(residual_vals, 0.95) if residual_vals else None,
            "count_success": int(count_success),
            "count_fail": int(count_fail),
            "count_total": int(len(points)),
        }

        total_success += count_success
        total_fail += count_fail

        per_k[_k_label(k)] = {
            "k": float(k),
            "scale": float(scale),
            "metrics": metrics,
            "points": points,
        }

    overall = {
        "max_abs_dev": max(all_abs_dev) if all_abs_dev else None,
        "p95_abs_dev": _percentile(all_abs_dev, 0.95) if all_abs_dev else None,
        "p99_abs_dev": _percentile(all_abs_dev, 0.99) if all_abs_dev else None,
        "max_residual": max(all_residual) if all_residual else None,
        "p95_residual": _percentile(all_residual, 0.95) if all_residual else None,
        "count_success": int(total_success),
        "count_fail": int(total_fail),
        "count_total": int(total_success + total_fail),
    }

    return {
        "config": {
            "model": "anchored_full_s",
            "definition": "F_k(s)=zeta(0.5 + (s-0.5)/tau^k)",
            "k_values": ks,
            "n_test": int(n),
            "dps": int(dps),
        },
        "per_k": per_k,
        "overall": overall,
    }

from concurrent.futures import ProcessPoolExecutor

import mpmath

from riemann_math import MobiusPi_equal_beta, TAU, TruePi, get_primes

_EXP6_WORKER_STATE = {}


def _exp6_worker_init(gamma_tokens, dps):
    mpmath.mp.dps = int(dps)
    _EXP6_WORKER_STATE["gammas"] = [mpmath.mpf(tok) for tok in gamma_tokens]


def _exp6_worker_point(task):
    x, beta_token = task
    state = _EXP6_WORKER_STATE
    return MobiusPi_equal_beta(
        mpmath.mpf(x),
        mpmath.mpf(beta_token),
        state["gammas"],
        use_dynamic=False,
    )


def _compute_series_for_beta(x_points, gammas_k, beta_val, workers, dps, pool=None):
    beta_mp = mpmath.mpf(beta_val)
    if workers <= 1:
        return [
            MobiusPi_equal_beta(mpmath.mpf(x), beta_mp, gammas_k, use_dynamic=False)
            for x in x_points
        ]

    beta_token = mpmath.nstr(beta_mp, n=20)
    tasks = [(x, beta_token) for x in x_points]
    chunk = max(1, len(x_points) // max(1, workers * 4))
    if pool is not None:
        return list(pool.map(_exp6_worker_point, tasks, chunksize=chunk))

    gamma_tokens = [mpmath.nstr(g, n=20) for g in gammas_k]
    with ProcessPoolExecutor(
        max_workers=workers,
        initializer=_exp6_worker_init,
        initargs=(gamma_tokens, int(dps)),
    ) as pool:
        return list(pool.map(_exp6_worker_point, tasks, chunksize=chunk))


def _rmse_from_indices(series, truth, indices):
    if not indices:
        return mpmath.mpf("inf")
    total = mpmath.mpf(0)
    for idx in indices:
        err = series[idx] - truth[idx]
        total += err * err
    return mpmath.sqrt(total / len(indices))


def _rmse_pairwise(series, truth):
    if not series:
        return mpmath.mpf("inf")
    total = mpmath.mpf(0)
    for actual, expected in zip(series, truth):
        err = actual - expected
        total += err * err
    return mpmath.sqrt(total / len(series))


def run_experiment_6(zeros, resolution=60, x_start=10, x_end=100, progress_callback=None, **kwargs):
    """
    Experiment 6: Beta-invariance under the gauge (transport-via-zeros).

    OBL_BETA_INVARIANCE says beta_hat(k) = 1/2 at every k under the gauge.
    The right test pairs x and the truth consistently:
        For each k, walk x_eff over [x_start, x_end].
        Compute x_phys = x_eff * tau^k.
        truth = TruePi(x_phys)
        For each candidate beta:
            recon = MobiusPi_equal_beta(x_phys, beta, gammas_PRISTINE)
        Pick the beta that minimizes RMSE(recon, truth) on the subset grid.

    This directly tests "the same un-scaled zero set reconstructs the
    staircase at scaled coordinates with beta=1/2." Both x and truth are
    at the same scaled coordinate; the zeros are NOT scaled.

    Earlier kernels held x and truth at un-scaled values while scaling the
    zeros, which made beta absorb the resulting mismatch — the reported
    beta_hat ~ 0.57 was an artifact of that mismatch, not a measurement of
    beta-invariance. See PROOF_TARGET.md / agent_context/obligation_movement_analysis.md.
    """
    print("Running Experiment 6: Beta-invariance under the gauge...")

    workers = max(1, int(kwargs.get("workers", 1)))
    dps = int(kwargs.get("dps", mpmath.mp.dps))

    results = {}
    x_start_val, x_end_val = x_start, x_end
    points = max(20, int(resolution))
    k_values = [0, 1, 2]

    # Primes must cover x_end * tau^max_k, since truth is taken at x_phys.
    max_k = max(k_values)
    max_scale = float(mpmath.power(TAU, max_k))
    primes = get_primes(x_end_val * max_scale + 50)

    gammas_pristine = [mpmath.mpf(g) for g in zeros]

    # Per-k x_grid at scaled coordinates; truth taken at the SAME scaled coords.
    x_grid_by_k = {}
    y_true_by_k = {}
    step = (x_end_val - x_start_val) / points
    for k in k_values:
        scale = mpmath.power(TAU, k)
        x_eff_grid = [x_start_val + i * step for i in range(points + 1)]
        x_phys_grid = [float(mpmath.mpf(x) * scale) for x in x_eff_grid]
        x_grid_by_k[k] = x_phys_grid
        y_true_by_k[k] = [TruePi(x, primes) for x in x_phys_grid]

    full_indices = list(range(points + 1))
    subset_step = max(1, (points + 1) // 20)
    subset_indices = list(range(0, points + 1, subset_step))

    total_steps = len(k_values)
    for idx, k in enumerate(k_values, start=1):
        print(f"  > Processing Scale K={k}...", end="\r")

        x_grid = x_grid_by_k[k]
        y_true_grid = y_true_by_k[k]
        x_grid_subset = [x_grid[i] for i in subset_indices]
        y_true_subset = [y_true_grid[i] for i in subset_indices]
        series_cache = {}
        pool = None
        if workers > 1:
            gamma_tokens = [mpmath.nstr(g, n=20) for g in gammas_pristine]
            pool = ProcessPoolExecutor(
                max_workers=workers,
                initializer=_exp6_worker_init,
                initargs=(gamma_tokens, int(dps)),
            )

        def series_for(beta_val, grid_name="full"):
            x_values = x_grid_subset if grid_name == "subset" else x_grid
            key = (k, grid_name, mpmath.nstr(beta_val, n=14))
            if key not in series_cache:
                series_cache[key] = _compute_series_for_beta(
                    x_values,
                    gammas_pristine,    # PRISTINE zeros, not scaled
                    beta_val,
                    workers=workers,
                    dps=dps,
                    pool=pool,
                )
            return series_cache[key]
        try:
            best_rmse = mpmath.inf
            best_beta = mpmath.mpf("0.5")

            print("    > Optimizing Beta (Coarse)...")
            for b in mpmath.linspace(0.45, 0.55, 11):
                rmse = _rmse_pairwise(series_for(b, "subset"), y_true_subset)
                if rmse < best_rmse:
                    best_rmse = rmse
                    best_beta = b

            for b in mpmath.linspace(best_beta - 0.02, best_beta + 0.02, 11):
                rmse = _rmse_pairwise(series_for(b, "subset"), y_true_subset)
                if rmse < best_rmse:
                    best_rmse = rmse
                    best_beta = b

            best_rmse = _rmse_from_indices(series_for(best_beta), y_true_grid, full_indices)
            rmse_05 = _rmse_from_indices(series_for(mpmath.mpf("0.5")), y_true_grid, full_indices)
        finally:
            if pool is not None:
                pool.shutdown()

        print(
            f"    K={k}: Beta_hat={float(best_beta):.4f}, RMSE={float(best_rmse):.4f} "
            f"(vs 0.5: {float(rmse_05):.4f})"
        )

        results[str(k)] = {
            "beta_hat": float(best_beta),
            "rmse_opt": float(best_rmse),
            "rmse_05": float(rmse_05),
            "delta_rmse": float(rmse_05 - best_rmse),
        }

        if callable(progress_callback):
            progress_callback(
                idx,
                total_steps,
                message="exp6 beta-invariance",
                payload={"k": k, "beta_hat": float(best_beta), "workers": workers},
            )

    return results

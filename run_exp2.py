from concurrent.futures import ProcessPoolExecutor

import mpmath

from riemann_math import LogIntegral, MobiusPi_equal_beta, TAU, get_mobius_schedule

_EXP2_WORKER_STATE = {}


def _delta_from_beta_perturbation(schedule, gamma0, delta_beta):
    """
    Delta in MobiusPi induced by perturbing only beta_1 from 0.5 -> 0.5+delta.
    """
    if gamma0 is None or delta_beta == 0:
        return mpmath.mpf(0)

    beta_clean = mpmath.mpf("0.5")
    beta_rogue = beta_clean + delta_beta
    total_delta = mpmath.mpf(0)

    for m, mu, root_x in schedule:
        ln_root = mpmath.log(root_x)
        osc = mpmath.sin(gamma0 * ln_root) / gamma0
        common = (2 * osc) / ln_root
        delta_j = common * (
            mpmath.power(root_x, beta_rogue) - mpmath.power(root_x, beta_clean)
        )
        total_delta += (mpmath.mpf(mu) / m) * delta_j

    return total_delta


def _compute_exp2_point(x_vis, scale_factor, gammas, gamma0, delta_beta):
    x_vis_mp = mpmath.mpf(x_vis)
    eff_x = x_vis_mp * scale_factor

    schedule = get_mobius_schedule(eff_x, use_dynamic=True)
    val_true = LogIntegral(eff_x)
    val_clean = MobiusPi_equal_beta(
        eff_x,
        mpmath.mpf("0.5"),
        gammas,
        use_dynamic=True,
        schedule=schedule,
    )
    delta_pi = _delta_from_beta_perturbation(schedule, gamma0, delta_beta)
    val_rogue = val_clean + delta_pi

    error_clean = abs(val_true - val_clean)
    error_rogue = abs(val_true - val_rogue)

    return {
        "x": float(x_vis_mp),
        "eff_x": eff_x,
        "error_clean": error_clean,
        "error_rogue": error_rogue,
    }


def _compute_exp2b_diff_point(x_vis, scale_factor, gamma0, delta_beta):
    x_vis_mp = mpmath.mpf(x_vis)
    eff_x = x_vis_mp * scale_factor
    schedule = get_mobius_schedule(eff_x, use_dynamic=True)
    diff = abs(_delta_from_beta_perturbation(schedule, gamma0, delta_beta))
    return {
        "x": float(x_vis_mp),
        "eff_x": eff_x,
        "diff": diff,
    }


def _exp2_worker_init(gamma_tokens, scale_factor_token, beta_offset_token, dps):
    mpmath.mp.dps = int(dps)
    gammas = [mpmath.mpf(tok) for tok in gamma_tokens]
    _EXP2_WORKER_STATE["gammas"] = gammas
    _EXP2_WORKER_STATE["gamma0"] = gammas[0] if gammas else None
    _EXP2_WORKER_STATE["scale_factor"] = mpmath.mpf(scale_factor_token)
    _EXP2_WORKER_STATE["delta_beta"] = mpmath.mpf(beta_offset_token)


def _exp2_worker_point(x_vis):
    state = _EXP2_WORKER_STATE
    return _compute_exp2_point(
        x_vis,
        state["scale_factor"],
        state["gammas"],
        state["gamma0"],
        state["delta_beta"],
    )


def _exp2b_worker_point(x_vis):
    state = _EXP2_WORKER_STATE
    return _compute_exp2b_diff_point(
        x_vis,
        state["scale_factor"],
        state["gamma0"],
        state["delta_beta"],
    )


def _parallel_map(x_values, workers, init_fn, init_args, worker_fn, serial_fn):
    if workers <= 1:
        return [serial_fn(x) for x in x_values]

    chunk = max(1, len(x_values) // max(1, workers * 4))
    with ProcessPoolExecutor(
        max_workers=workers,
        initializer=init_fn,
        initargs=init_args,
    ) as pool:
        return list(pool.map(worker_fn, x_values, chunksize=chunk))


# -----------------------------------------------------------------------------
# EXPERIMENT 2A: The Centrifuge (Rogue Mode)
# -----------------------------------------------------------------------------


def run_experiment_2(
    zeros,
    resolution=100,
    x_start=2,
    x_end=20,
    beta_offset=0.0001,
    k_power=-20,
    **kwargs,
):
    """
    Experiment 2: The Centrifuge (Rogue Mode).
    k = k_power (default -20).
    """
    print(
        f"Running Experiment 2: Centrifuge... [Res={resolution}, k={k_power}, beta_offset={beta_offset}]"
    )
    if not zeros:
        raise ValueError("Experiment 2 requires at least one loaded zero.")

    workers = max(1, int(kwargs.get("workers", 1)))
    progress_callback = kwargs.get("progress_callback")
    dps = int(kwargs.get("dps", mpmath.mp.dps))

    scale_factor = mpmath.power(TAU, -k_power)
    delta_beta = mpmath.mpf(beta_offset)
    gammas = [mpmath.mpf(g) for g in zeros]
    gamma0 = gammas[0]

    points = int(resolution)
    step = (x_end - x_start) / points
    x_values = [x_start + i * step for i in range(points + 1)]

    gamma_tokens = [mpmath.nstr(g, n=20) for g in gammas] if workers > 1 else None

    results = _parallel_map(
        x_values,
        workers=workers,
        init_fn=_exp2_worker_init,
        init_args=(
            gamma_tokens,
            mpmath.nstr(scale_factor, n=30),
            mpmath.nstr(delta_beta, n=20),
            dps,
        )
        if workers > 1
        else tuple(),
        worker_fn=_exp2_worker_point,
        serial_fn=lambda xv: _compute_exp2_point(
            xv,
            scale_factor,
            gammas,
            gamma0,
            delta_beta,
        ),
    )

    res_2a = []
    res_2b = []
    total_steps = len(results)
    for idx, row in enumerate(results, start=1):
        res_2a.append({"x": row["x"], "error": float(row["error_clean"])})
        res_2b.append({"x": row["x"], "error": float(row["error_rogue"])})

        if callable(progress_callback) and (idx % 10 == 0 or idx == total_steps):
            progress_callback(
                idx,
                total_steps,
                message="exp2 centrifuge points",
                payload={"point": idx - 1, "x_vis": float(row["x"]), "workers": workers},
            )
        if (idx - 1) % 10 == 0:
            print(
                f"  > [Exp2] Centrifuge point {idx-1}/{points} (x_vis={float(row['x']):.1f})",
                flush=True,
            )

    return {"2A": res_2a, "2B": res_2b}


# -----------------------------------------------------------------------------
# EXPERIMENT 2B: Rogue Isolation
# -----------------------------------------------------------------------------


def run_experiment_2b(
    zeros,
    resolution=100,
    x_start=2,
    x_end=20,
    beta_offset=0.0001,
    k_power=-20,
    **kwargs,
):
    """
    Experiment 2B: The Centrifuge (Rogue Isolation).
    Computes Diff, Predicted Ratio, and Residual.
    """
    print(f"Running Experiment 2B: Rogue Isolation... [Res={resolution}, k={k_power}]")
    if not zeros:
        raise ValueError("Experiment 2B requires at least one loaded zero.")

    workers = max(1, int(kwargs.get("workers", 1)))
    progress_callback = kwargs.get("progress_callback")
    dps = int(kwargs.get("dps", mpmath.mp.dps))

    scale_factor = mpmath.power(TAU, -k_power)
    delta_beta = mpmath.mpf(beta_offset)

    gammas = [mpmath.mpf(g) for g in zeros]
    gamma0 = gammas[0]

    points = int(resolution)
    step = (x_end - x_start) / points
    x_values = [x_start + i * step for i in range(points + 1)]

    gamma_tokens = [mpmath.nstr(g, n=20) for g in gammas] if workers > 1 else None

    diff_rows = _parallel_map(
        x_values,
        workers=workers,
        init_fn=_exp2_worker_init,
        init_args=(
            gamma_tokens,
            mpmath.nstr(scale_factor, n=30),
            mpmath.nstr(delta_beta, n=20),
            dps,
        )
        if workers > 1
        else tuple(),
        worker_fn=_exp2b_worker_point,
        serial_fn=lambda xv: _compute_exp2b_diff_point(
            xv,
            scale_factor,
            gamma0,
            delta_beta,
        ),
    )

    total_steps = len(diff_rows) * 2
    progress_steps = 0

    diffs = []
    for i, row in enumerate(diff_rows):
        diffs.append((row["x"], row["eff_x"], row["diff"]))
        progress_steps += 1
        if callable(progress_callback) and (progress_steps % 10 == 0 or progress_steps == total_steps):
            progress_callback(
                progress_steps,
                total_steps,
                message="exp2b rogue-isolation pass-1",
                payload={"point": i, "workers": workers},
            )
        if i % 20 == 0:
            print(f"  > Isolation point {i}/{points}...", end="\r")

    mid_idx = points // 2
    _, ref_x_eff, ref_diff = diffs[mid_idx]
    if ref_diff == 0:
        ref_diff = mpmath.mpf("1e-20")

    final_data = []
    for x_vis, eff_x, diff in diffs:
        log_ratio = mpmath.log(eff_x) - mpmath.log(ref_x_eff)
        pred = mpmath.exp(delta_beta * log_ratio)
        obs = diff / ref_diff
        residual = obs / pred if pred != 0 else mpmath.mpf(0)

        final_data.append(
            {
                "x": float(x_vis),
                "diff": float(diff),
                "pred_ratio": float(pred),
                "obs_ratio": float(obs),
                "residual": float(residual),
            }
        )

        progress_steps += 1
        if callable(progress_callback) and (progress_steps % 10 == 0 or progress_steps == total_steps):
            progress_callback(
                progress_steps,
                total_steps,
                message="exp2b rogue-isolation pass-2",
                payload={"x_vis": float(x_vis), "workers": workers},
            )

    print("\n  > Experiment 2B Done.")
    return final_data

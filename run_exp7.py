from concurrent.futures import ProcessPoolExecutor

import mpmath

from riemann_math import LogIntegral, MobiusPi_equal_beta, TAU, get_mobius_schedule, mean_spacing

_EXP7_WORKER_STATE = {}


def _delta_from_gamma_perturbation(schedule, beta, gamma_clean, gamma_rogue):
    if gamma_clean is None or gamma_rogue is None or gamma_clean == gamma_rogue:
        return mpmath.mpf(0)

    total_delta = mpmath.mpf(0)
    beta_mp = mpmath.mpf(beta)
    for m, mu, root_x in schedule:
        ln_root = mpmath.log(root_x)
        pref = (mpmath.power(root_x, beta_mp) / ln_root) * 2
        osc_clean = mpmath.sin(gamma_clean * ln_root) / gamma_clean
        osc_rogue = mpmath.sin(gamma_rogue * ln_root) / gamma_rogue
        delta_j = pref * (osc_rogue - osc_clean)
        total_delta += (mpmath.mpf(mu) / m) * delta_j
    return total_delta


def _compute_exp7_point(x_vis, eps, state):
    scale = state["scale"]
    gammas = state["gammas"]
    gamma_clean = state["gamma_clean"]
    spacing = state["spacing"]
    eta = state["eta"]

    x_mp = mpmath.mpf(x_vis)
    eff_x = x_mp / scale

    schedule = get_mobius_schedule(eff_x, use_dynamic=True)
    val_clean = MobiusPi_equal_beta(
        eff_x,
        mpmath.mpf("0.5"),
        gammas,
        use_dynamic=True,
        schedule=schedule,
    )

    gamma_rogue = gamma_clean + (mpmath.mpf(eps) * spacing)
    delta_pi = _delta_from_gamma_perturbation(
        schedule,
        beta=mpmath.mpf("0.5"),
        gamma_clean=gamma_clean,
        gamma_rogue=gamma_rogue,
    )

    val_li = LogIntegral(eff_x)
    resid_clean = abs(val_clean - val_li)
    amp = abs(delta_pi) / (resid_clean + eta)

    return float(eps), float(x_mp), amp


def _exp7_worker_init(gamma_tokens, scale_token, gamma_clean_token, spacing_token, eta_token, dps):
    mpmath.mp.dps = int(dps)
    _EXP7_WORKER_STATE["gammas"] = [mpmath.mpf(tok) for tok in gamma_tokens]
    _EXP7_WORKER_STATE["scale"] = mpmath.mpf(scale_token)
    _EXP7_WORKER_STATE["gamma_clean"] = mpmath.mpf(gamma_clean_token)
    _EXP7_WORKER_STATE["spacing"] = mpmath.mpf(spacing_token)
    _EXP7_WORKER_STATE["eta"] = mpmath.mpf(eta_token)


def _exp7_worker_point(task):
    eps, x_vis = task
    return _compute_exp7_point(x_vis, eps, _EXP7_WORKER_STATE)


def _parallel_map(tasks, workers, init_args, serial_fn):
    if workers <= 1:
        return [serial_fn(task) for task in tasks]

    chunk = max(1, len(tasks) // max(1, workers * 4))
    with ProcessPoolExecutor(
        max_workers=workers,
        initializer=_exp7_worker_init,
        initargs=init_args,
    ) as pool:
        return list(pool.map(_exp7_worker_point, tasks, chunksize=chunk))


def run_experiment_7(
    zeros,
    resolution=100,
    x_start=40,
    x_end=50,
    beta_offset=0.0001,
    k_power=-20,
    **kwargs,
):
    """
    Experiment 7: Centrifuge Fix / Relative Amplification.
    Tests if a rogue zero perturbation is amplified at scale,
    using a relative metric A(x) instead of absolute error.
    """
    print(
        f"Running Experiment 7: Centrifuge Fix... [Res={resolution}, k={k_power}, beta_offset={beta_offset}]"
    )
    if not zeros:
        raise ValueError("Experiment 7 requires at least one loaded zero.")

    workers = max(1, int(kwargs.get("workers", 1)))
    progress_callback = kwargs.get("progress_callback")
    dps = int(kwargs.get("dps", mpmath.mp.dps))

    k_test = k_power
    scale = mpmath.power(TAU, k_test)

    points = int(resolution)
    step = (x_end - x_start) / points

    epsilon_values = [0.1, 0.25, 0.5]

    gammas = [mpmath.mpf(g) for g in zeros]
    target_idx = min(100, len(gammas) - 1)
    target_gamma = gammas[target_idx]
    spacing = mean_spacing(target_gamma)
    eta = mpmath.mpf("1e-6")

    x_values = [x_start + i * step for i in range(points + 1)]
    tasks = []
    for eps in epsilon_values:
        for x in x_values:
            tasks.append((eps, x))

    gamma_tokens = [mpmath.nstr(g, n=20) for g in gammas] if workers > 1 else None
    init_args = (
        gamma_tokens,
        mpmath.nstr(scale, n=30),
        mpmath.nstr(target_gamma, n=30),
        mpmath.nstr(spacing, n=30),
        mpmath.nstr(eta, n=10),
        dps,
    )

    state = {
        "gammas": gammas,
        "scale": scale,
        "gamma_clean": target_gamma,
        "spacing": spacing,
        "eta": eta,
    }

    rows = _parallel_map(
        tasks,
        workers=workers,
        init_args=init_args if workers > 1 else tuple(),
        serial_fn=lambda task: _compute_exp7_point(task[1], task[0], state),
    )

    grouped = {float(eps): [] for eps in epsilon_values}
    total_steps = len(rows)
    processed_steps = 0

    for eps, x_vis, amp in rows:
        grouped.setdefault(float(eps), []).append(amp)
        processed_steps += 1

        if callable(progress_callback) and (processed_steps % 10 == 0 or processed_steps == total_steps):
            progress_callback(
                processed_steps,
                total_steps,
                message="exp7 calibrated sensitivity",
                payload={"epsilon": eps, "point": processed_steps - 1, "workers": workers},
            )

    results = {"calibrated": []}
    for eps in epsilon_values:
        amps = grouped.get(float(eps), [])
        if not amps:
            max_amp = 0.0
            mean_amp = 0.0
        else:
            max_amp = max(float(a) for a in amps)
            mean_amp = sum(float(a) for a in amps) / len(amps)
        results["calibrated"].append(
            {
                "epsilon": eps,
                "max_amp": float(max_amp),
                "mean_amp": float(mean_amp),
            }
        )

    print("  > Experiment 7 Done.         ")
    return results

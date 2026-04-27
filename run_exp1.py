from concurrent.futures import ProcessPoolExecutor

from riemann_math import get_primes, get_zeros, TruePi, LogIntegral, J_Wave, MobiusPi, MobiusPi_equal_beta, mean_spacing, find_nearest_zero, load_or_init_results, save_results, ZERO_COUNT, TAU
import mpmath
import time

_EXP1_WORKER_STATE = {}
_PARALLEL_WORK_THRESHOLD = 100_000
_EXP1_N_VALUES = (0, 1, 3, 10, 50, 200)


def _token_digits(dps):
    return max(30, min(90, int(dps) + 10))


def _should_parallel_equal_beta(workers, x_count, zero_count):
    return workers > 1 and x_count > 1 and (x_count * max(1, zero_count)) >= _PARALLEL_WORK_THRESHOLD


def _exp_equal_beta_worker_init(gamma_tokens, beta_token, use_dynamic, dps):
    mpmath.mp.dps = int(dps)
    _EXP1_WORKER_STATE["gammas"] = [mpmath.mpf(tok) for tok in gamma_tokens]
    _EXP1_WORKER_STATE["beta"] = mpmath.mpf(beta_token)
    _EXP1_WORKER_STATE["use_dynamic"] = bool(use_dynamic)


def _exp_equal_beta_worker_value(x_token):
    state = _EXP1_WORKER_STATE
    return MobiusPi_equal_beta(
        mpmath.mpf(x_token),
        state["beta"],
        state["gammas"],
        use_dynamic=state["use_dynamic"],
    )


def _exp_equal_beta_worker_status(x_token):
    try:
        return "ok", _exp_equal_beta_worker_value(x_token)
    except Exception:
        return "error", float("nan")


def _compute_equal_beta_series(x_values, gammas, beta, use_dynamic, workers, dps, safe=False):
    if not _should_parallel_equal_beta(int(workers), len(x_values), len(gammas)):
        out = []
        beta_mp = mpmath.mpf(beta)
        for x in x_values:
            try:
                value = MobiusPi_equal_beta(
                    mpmath.mpf(x),
                    beta_mp,
                    gammas,
                    use_dynamic=use_dynamic,
                )
                out.append(("ok", value) if safe else value)
            except Exception:
                if not safe:
                    raise
                out.append(("error", float("nan")))
        return out

    digits = _token_digits(dps)
    gamma_tokens = [mpmath.nstr(g, n=digits) for g in gammas]
    x_tokens = [mpmath.nstr(mpmath.mpf(x), n=digits) for x in x_values]
    beta_token = mpmath.nstr(mpmath.mpf(beta), n=digits)
    max_workers = min(int(workers), len(x_tokens))
    chunk = max(1, len(x_tokens) // max(1, max_workers * 4))
    worker_fn = _exp_equal_beta_worker_status if safe else _exp_equal_beta_worker_value
    with ProcessPoolExecutor(
        max_workers=max_workers,
        initializer=_exp_equal_beta_worker_init,
        initargs=(gamma_tokens, beta_token, bool(use_dynamic), int(dps)),
    ) as pool:
        return list(pool.map(worker_fn, x_tokens, chunksize=chunk))


def _exp1_n_values(gammas):
    max_n = len(gammas)
    values = [n for n in _EXP1_N_VALUES if n == 0 or n <= max_n]
    if not values:
        values = [0]
    if max_n and max_n < _EXP1_N_VALUES[-1] and max_n not in values:
        values.append(max_n)
    return sorted(set(values))


def WavePair(gamma, x):
    """
    Direct Riemann harmonic pair:
        2 * Re(Ei((1/2 + i gamma) * log(x))).
    """
    x_mp = mpmath.mpf(x)
    if x_mp <= 1:
        return mpmath.mpf(0)
    rho = mpmath.mpc(mpmath.mpf("0.5"), mpmath.mpf(gamma))
    return 2 * mpmath.re(mpmath.ei(rho * mpmath.log(x_mp)))


def _compute_mobius_by_n(x_eff_grid, gammas, n_values, workers, dps):
    mobius_by_n = {}
    for n in n_values:
        if n == 0:
            continue
        mobius_by_n[n] = _compute_equal_beta_series(
            x_eff_grid,
            gammas[:n],
            mpmath.mpf("0.5"),
            use_dynamic=True,
            workers=workers,
            dps=dps,
        )
    return mobius_by_n


def _harmonic_converter_rows(x_eff_grid, gammas, n_values, primes, mobius_by_n):
    rows = []
    sorted_n = sorted(n_values)
    max_n = max(sorted_n) if sorted_n else 0

    for i, x_eff in enumerate(x_eff_grid):
        x_mp = mpmath.mpf(x_eff)
        li_val = LogIntegral(x_mp)
        row = {
            "X": float(x_mp),
            "x_eff": float(x_mp),
            "tau_power": 1.0,
            "y_true": float(TruePi(x_mp, primes)),
            "li": float(li_val),
        }

        correction = mpmath.mpf(0)
        row["harmonic_N_0"] = float(li_val)
        for n in range(1, max_n + 1):
            correction += WavePair(gammas[n - 1], x_mp)
            if n in sorted_n:
                row[f"harmonic_N_{n}"] = float(li_val - correction)

        row["mobius_N_0"] = float(li_val)
        for n in sorted_n:
            if n == 0:
                continue
            row[f"mobius_N_{n}"] = float(mobius_by_n[n][i])

        rows.append(row)

    return rows


def _copy_main_rows_for_scale(base_rows, k):
    scale = mpmath.power(TAU, k)
    out = []
    for row in base_rows:
        copied = dict(row)
        copied["X"] = float(mpmath.mpf(row["x_eff"]) * scale)
        copied["tau_power"] = float(scale)
        out.append(copied)
    return out


def _prime_markers_by_k(primes, x_start, x_end, k_values):
    lo = float(x_start)
    hi = float(x_end)
    visible_primes = [p for p in primes if lo <= float(p) <= hi]
    markers = {}
    for k in k_values:
        scale = mpmath.power(TAU, k)
        rows = []
        for prime in visible_primes:
            prime_mp = mpmath.mpf(prime)
            rows.append({
                "prime": int(prime),
                "x_eff": float(prime_mp),
                "X": float(prime_mp * scale),
            })
        markers[str(k)] = rows
    return markers


def _schoenfeld_bound(x_eff):
    x_mp = mpmath.mpf(x_eff)
    if x_mp <= 1:
        return mpmath.mpf(0)
    return mpmath.sqrt(x_mp) * mpmath.log(x_mp) / (8 * mpmath.pi)


def _schoenfeld_rows_by_k(base_rows, k_values):
    rows_by_k = {}
    for k in k_values:
        scale = mpmath.power(TAU, k)
        rows = []
        for row in base_rows:
            x_eff = mpmath.mpf(row["x_eff"])
            li_val = mpmath.mpf(row["li"])
            true_pi = mpmath.mpf(row["y_true"])
            bound = _schoenfeld_bound(x_eff)
            rows.append({
                "X": float(x_eff * scale),
                "x_eff": float(x_eff),
                "tau_power": float(scale),
                "TruePi": float(true_pi),
                "Li": float(li_val),
                "LiError": float(abs(true_pi - li_val)),
                "SchoenfeldBound": float(bound),
                "SchoenfeldApplicable": x_eff >= mpmath.mpf(2657),
                "bound_formula": "sqrt(x_eff) * log(x_eff) / (8*pi)",
            })
        rows_by_k[str(k)] = rows
    return rows_by_k


def _main_metrics(by_k, n_values):
    base = by_k.get("0", [])
    max_n = max(n_values) if n_values else 0
    harmonic_key = f"harmonic_N_{max_n}"
    mobius_key = f"mobius_N_{max_n}"
    per_k = {}
    max_harmonic = 0.0
    max_mobius = 0.0
    max_true = 0.0

    for k_str, rows in by_k.items():
        harmonic_drift = 0.0
        mobius_drift = 0.0
        truth_drift = 0.0
        valid = 0
        for base_row, row in zip(base, rows):
            if harmonic_key in base_row and harmonic_key in row:
                harmonic_drift = max(harmonic_drift, abs(row[harmonic_key] - base_row[harmonic_key]))
            if mobius_key in base_row and mobius_key in row:
                mobius_drift = max(mobius_drift, abs(row[mobius_key] - base_row[mobius_key]))
            truth_drift = max(truth_drift, abs(row["y_true"] - base_row["y_true"]))
            valid += 1
        per_k[k_str] = {
            "max_harmonic_drift_vs_k0": harmonic_drift,
            "max_mobius_drift_vs_k0": mobius_drift,
            "max_y_true_drift_vs_k0": truth_drift,
            "points": valid,
        }
        max_harmonic = max(max_harmonic, harmonic_drift)
        max_mobius = max(max_mobius, mobius_drift)
        max_true = max(max_true, truth_drift)

    return {
        "reference_k": "0",
        "comparison_N": max_n,
        "harmonic_curve_key": harmonic_key,
        "mobius_curve_key": mobius_key,
        "max_harmonic_drift_vs_k0": max_harmonic,
        "max_mobius_drift_vs_k0": max_mobius,
        "max_y_true_drift_vs_k0": max_true,
        "per_k": per_k,
    }


def _stress_metrics(by_k):
    max_err = 0.0
    per_k = {}
    for k_str, rows in by_k.items():
        k_max = 0.0
        for row in rows:
            k_max = max(k_max, abs(row["y_rec"] - row["y_true"]))
        per_k[k_str] = k_max
        max_err = max(max_err, k_max)
    return {"max_abs_truth_error": max_err, "per_k_max_abs_truth_error": per_k}


# -----------------------------------------------------------------------------
# CORE-1 SUPPORT: Scaled-Coordinate Stress
# -----------------------------------------------------------------------------

def _run_exp1_scaled_coordinate_stress(zeros, resolution=500, x_start=2, x_end=50, progress_callback=None, **kwargs):
    """
    CORE-1 supporting stress: scaled-coordinate reconstruction.

    Tests the gauge claim that the SAME un-scaled zero set reconstructs the
    prime-counting staircase at scaled coordinates. For each k in {-2,-1,0,1,2}
    and each point on an un-scaled x grid, we evaluate:
        y_rec(k, x)  = MobiusPi(x * tau^k, betas=1/2, gammas=PRISTINE)
        y_true(k, x) = TruePi(x * tau^k)
    Drift = |y_rec - y_true|, evaluated at the same scaled coordinate where
    BOTH sides are taken. The reconstruction's gammas are NOT scaled — that is
    the load-bearing claim under test.

    Earlier versions of this kernel had `eff_X = x_vis / scale`, which cancelled
    the gauge transformation and forced max_drift = 0 trivially. That bug is
    preserved in version control as a cautionary tale; do not reintroduce.
    """
    print(f"  > Running EXP1 support: scaled-coordinate stress [Res={resolution}, Range={x_start}-{x_end}]...")

    gammas = zeros
    workers = max(1, int(kwargs.get("workers", 1)))
    dps = int(kwargs.get("dps", mpmath.mp.dps))

    points = resolution
    X_base_start, X_base_end = x_start, x_end

    k_values = [-2, -1, 0, 1, 2]

    results = {}

    # Primes must cover x_max * tau^max_k. At max_k=2 and x_max=50 this is ~1973;
    # at max_k=2 and x_max=100 it is ~3947. Compute the actual upper bound.
    max_k = max(k_values)
    max_scale = mpmath.power(TAU, max_k)
    primes_upper = float(X_base_end * max_scale) + 100
    primes = get_primes(primes_upper)

    total_steps = len(k_values) * (points + 1)
    processed_steps = 0

    for k in k_values:
        print(f"  > Processing Scale K={k}...", end='\r')
        res_k = []

        scale = mpmath.power(TAU, k)
        step_eff = (X_base_end - X_base_start) / points
        x_eff_grid = [X_base_start + i * step_eff for i in range(points + 1)]
        x_phys_grid = [mpmath.mpf(x_eff) * scale for x_eff in x_eff_grid]
        rec_values = _compute_equal_beta_series(
            x_phys_grid,
            gammas,
            mpmath.mpf(0.5),
            use_dynamic=False,
            workers=workers,
            dps=dps,
        )

        for i, (x_eff, x_phys, val_rec) in enumerate(zip(x_eff_grid, x_phys_grid, rec_values)):

            # Both sides of the comparison are at the SAME scaled coordinate.
            # The reconstruction uses the pristine (un-scaled) zero set —
            # this is a supporting stress check, not the main CORE-1 claim.
            val_true = TruePi(x_phys, primes)

            res_k.append({
                "x": float(x_phys),
                "eff_x": float(x_eff),
                "y_rec": float(val_rec),
                "y_true": float(val_true),
            })
            processed_steps += 1
            if callable(progress_callback) and (processed_steps % 25 == 0 or processed_steps == total_steps):
                progress_callback(
                    processed_steps,
                    total_steps,
                    message="exp1 coordinate-gauge points",
                    payload={"k": k, "point": i},
                )

            if i % 50 == 0:
                print(f"    > Point {i}/{points} (K={k})", end='\r')

        results[str(k)] = res_k

    print(f"  > EXP1 support stress done.       ")
    return results


def run_experiment_1(zeros, resolution=500, x_start=2, x_end=50, progress_callback=None, **kwargs):
    """
    Experiment 1A: Main Riemann Converter calculation.

    The canonical branch is the direct harmonic converter:
        Li(x_eff) - sum_j WavePair(gamma_j, x_eff)
    evaluated after the tau substitution x_eff = X / tau^k and stored in
    plotted X-units. Prime-step markers therefore land at X = p * tau^k.

    The previous physical-coordinate EXP_1 calculation is retained under
    support.scaled_coordinate_stress as a validation branch, not as the main
    theory-facing claim.
    """
    print(f"Running Experiment 1: Riemann Converter tau-substitution [Res={resolution}, Range={x_start}-{x_end}]...")

    gammas = zeros
    workers = max(1, int(kwargs.get("workers", 1)))
    dps = int(kwargs.get("dps", mpmath.mp.dps))
    points = max(1, int(resolution))
    x_start_mp = mpmath.mpf(x_start)
    x_end_mp = mpmath.mpf(x_end)
    k_values = [-2, -1, 0, 1, 2]
    n_values = _exp1_n_values(gammas)

    max_scale = mpmath.power(TAU, max(k_values))
    primes_upper = float(max(x_end_mp, x_end_mp * max_scale)) + 100
    primes = get_primes(primes_upper)

    step_eff = (x_end_mp - x_start_mp) / points
    x_eff_grid = [x_start_mp + i * step_eff for i in range(points + 1)]

    print("  > Building main converter curves...", end="\r")
    mobius_by_n = _compute_mobius_by_n(
        x_eff_grid,
        gammas,
        n_values,
        workers=workers,
        dps=dps,
    )
    base_rows = _harmonic_converter_rows(x_eff_grid, gammas, n_values, primes, mobius_by_n)
    main_by_k = {str(k): _copy_main_rows_for_scale(base_rows, k) for k in k_values}

    main_steps = points + 1
    stress_steps = (points + 1) * len(k_values)
    total_steps = main_steps + stress_steps

    if callable(progress_callback):
        progress_callback(
            main_steps,
            total_steps,
            message="exp1 main converter points",
            payload={"branch": "main"},
        )

    stress_progress_callback = None
    if callable(progress_callback):
        def stress_progress_callback(done, _total, message=None, payload=None):
            progress_callback(
                main_steps + done,
                total_steps,
                message=message,
                payload=payload,
            )

    stress_by_k = _run_exp1_scaled_coordinate_stress(
        zeros,
        resolution=points,
        x_start=x_start,
        x_end=x_end,
        progress_callback=stress_progress_callback,
        **kwargs,
    )

    return {
        "schema_version": "exp1.main.v1",
        "main": {
            "description": "Direct harmonic Riemann Converter under x_eff = X / tau^k.",
            "config": {
                "k_values": k_values,
                "n_values": n_values,
                "x_start": float(x_start_mp),
                "x_end": float(x_end_mp),
                "harmonic_formula": "Li(x_eff) - sum_{j<=N} 2*Re(Ei((1/2+i*gamma_j)*log(x_eff)))",
                "mobius_formula": "MobiusPi_equal_beta(x_eff, beta=1/2, gammas[:N])",
            },
            "by_k": main_by_k,
            "prime_markers_by_k": _prime_markers_by_k(primes, x_start_mp, x_end_mp, k_values),
            "metrics": _main_metrics(main_by_k, n_values),
        },
        "support": {
            "schoenfeld_bound": {
                "description": (
                    "Schoenfeld lens for CORE-1: compares |pi(x_eff)-Li(x_eff)| "
                    "against sqrt(x_eff)*log(x_eff)/(8*pi), stored in X units "
                    "with x_eff = X/tau^k. The theorem applies for x_eff >= 2657."
                ),
                "by_k": _schoenfeld_rows_by_k(base_rows, k_values),
                "domain": {"x_eff_min": 2657},
            },
            "scaled_coordinate_stress": {
                "description": (
                    "CORE-1 supporting physical-coordinate stress: MobiusPi_equal_beta(x_eff*tau^k) "
                    "versus TruePi(x_eff*tau^k), retained as validation rather than the main claim."
                ),
                "by_k": stress_by_k,
                "metrics": _stress_metrics(stress_by_k),
            },
        },
    }

# -----------------------------------------------------------------------------
# EXPERIMENT 1B: Operator Gauge
# -----------------------------------------------------------------------------

def run_experiment_1b(zeros, resolution=200, x_start=2, x_end=50, progress_callback=None, **kwargs):
    """
    Experiment 1B: Operator Gauge.
    Tests two variants of scaling:
    1. Variant B1: Gamma-only scaling (Frequency scaling).
    2. Variant B2: Rho scaling (Beta + Gamma scaling) - The "Doc Claim".
    """
    print(f"Running Experiment 1B: Operator Gauge Chains... [Res={resolution}]")
    
    # Configuration
    workers = max(1, int(kwargs.get("workers", 1)))
    dps = int(kwargs.get("dps", mpmath.mp.dps))
    points = resolution
    X_base_start, X_base_end = x_start, x_end
    k_values = [-2, -1, 0, 1, 2]
    
    results = {
        "variants": {
            "gamma_scaled": {},
            "rho_scaled": {}
        }
    }
    
    # Pre-compute primes for validation
    primes = get_primes(X_base_end + 10)
    
    gamma_total = len(k_values) * (points + 1)
    rho_total = 3 * (points + 1)
    total_steps = gamma_total + rho_total
    processed_steps = 0

    # -------------------------------------------------------------------------
    # VARIANT B1: GAMMA SCALING (Frequency Only)
    # gammas_k = gamma * tau^k, betas fixed at 0.5
    # -------------------------------------------------------------------------
    print("  > [Variant B1] Gamma Scaling...")
    for k in k_values:
        res_k = []
        scale = mpmath.power(TAU, k)
        X_start = X_base_start
        X_end = X_base_end
        step = (X_end - X_start) / points
        x_grid = [X_start + i * step for i in range(points + 1)]
        
        scaled_gammas = [g * scale for g in zeros]
        rec_values = _compute_equal_beta_series(
            x_grid,
            scaled_gammas,
            mpmath.mpf(0.5),
            use_dynamic=True,
            workers=workers,
            dps=dps,
        )
        
        for i, (x_vis, val_rec) in enumerate(zip(x_grid, rec_values)):
            val_true = TruePi(x_vis, primes)
            
            y_rec_raw = float(val_rec)
            y_rec_renorm = float(val_rec * scale)
            
            res_k.append({
                "x": float(x_vis),
                "y_rec": y_rec_raw,
                "y_rec_amp_renorm": y_rec_renorm,
                "y_true": float(val_true)
            })
            processed_steps += 1
            if callable(progress_callback) and (processed_steps % 25 == 0 or processed_steps == total_steps):
                progress_callback(
                    processed_steps,
                    total_steps,
                    message="exp1b operator-gauge points",
                    payload={"variant": "gamma", "k": k, "point": i},
                )
            
            if i % 50 == 0:
                 print(f"    > [Gamma] Point {i}/{points} (K={k})", end='\r')
            
        results["variants"]["gamma_scaled"][str(k)] = res_k

    # -------------------------------------------------------------------------
    # VARIANT B2: RHO SCALING (Beta + Gamma Experiment)
    # -------------------------------------------------------------------------
    print("\n  > [Variant B2] Rho Scaling (Beta+Gamma)...")
    k_values_safe = [-1, 0, 1] 
    
    for k in k_values_safe:
        res_k = []
        scale = mpmath.power(TAU, k)
        
        scaled_gammas = [g * scale for g in zeros]
        scaled_betas = [mpmath.mpf(0.5) * scale for g in zeros] 
        
        X_start = X_base_start
        X_end = X_base_end
        step = (X_end - X_start) / points
        x_grid = [X_start + i * step for i in range(points + 1)]
        rec_rows = _compute_equal_beta_series(
            x_grid,
            scaled_gammas,
            scaled_betas[0],
            use_dynamic=True,
            workers=workers,
            dps=dps,
            safe=True,
        )
        
        for i, (x_vis, rec_row) in enumerate(zip(x_grid, rec_rows)):
            val_true = TruePi(x_vis, primes)
            status, val_rec_raw = rec_row
            val_rec = float(val_rec_raw)
            
            res_k.append({
                "x": float(x_vis),
                "y_rec": val_rec,
                "y_true": float(val_true),
                "status": status
            })
            processed_steps += 1
            if callable(progress_callback) and (processed_steps % 25 == 0 or processed_steps == total_steps):
                progress_callback(
                    processed_steps,
                    total_steps,
                    message="exp1b operator-gauge points",
                    payload={"variant": "rho", "k": k, "point": i},
                )

            if i % 50 == 0:
                 print(f"    > [Rho] Point {i}/{points} (K={k})", end='\r')
            
        results["variants"]["rho_scaled"][str(k)] = res_k

    print("\n  > Experiment 1B Done.")
    return results

# -----------------------------------------------------------------------------
# EXPERIMENT 1C: Zero Scaling Hypothesis (τ-Lattice)
# -----------------------------------------------------------------------------

def fast_J_Wave(X, betas, gammas):
    """
    Optimized J_Wave for scalar X when every beta is equal.
    Pulls x^beta / ln(x) * 2 out of the zero-sum loop. Requires that all
    elements of `betas` are the same value; asserts this so the silent
    "hardcoded beta=0.5" landmine cannot recur.
    """
    if X < 2: return mpmath.mpf(0)

    # Enforce the equal-beta precondition that makes the pre-factor optimization valid.
    if not betas:
        raise ValueError("fast_J_Wave requires a non-empty betas list")
    beta0 = betas[0]
    if any(b != beta0 for b in betas):
        raise ValueError("fast_J_Wave requires all betas to be equal; use J_Wave for varying betas")

    ln_X = mpmath.log(X)
    inv_ln_X = 1 / ln_X

    term1 = -mpmath.log(2)
    term2 = 1 / (2 * X * X * ln_X)
    trivial_zeros = term1 + term2

    li_val = mpmath.li(X)

    pre_factor = (mpmath.power(X, beta0) * inv_ln_X) * 2

    sum_osc = mpmath.mpf(0)
    for g in gammas:
        sum_osc += mpmath.sin(g * ln_X) / g

    total_mask = pre_factor * sum_osc

    return li_val - total_mask + trivial_zeros

def fast_MobiusPi(X, betas, gammas):
    """
    Optimized Mobius Inversion.
    Uses a hardcoded Mobius map for small k since we only care about X < ~1000 usually.
    Dynamic loop is safe but we can optimize the lookup.
    """
    if X < 2: return mpmath.mpf(0)
    
    pi_reconstructed = mpmath.mpf(0)
    m = 1
    
    while True:
        root_X = mpmath.power(X, mpmath.mpf(1)/m)
        if root_X < 2: break
        
        from riemann_math import mobius
        mu = mobius(m)
        
        if mu != 0:
            J_val = fast_J_Wave(root_X, betas, gammas)
            pi_reconstructed += (mpmath.mpf(mu) / m) * J_val
            
        m += 1
        if m > 100: break 
        
    return pi_reconstructed

def run_experiment_1c(zeros, resolution=50, x_start=2, x_end=50, progress_callback=None, **kwargs):
    """
    Experiment 1C: Zero Scaling Hypothesis (τ-Lattice).
    Tests if scaling gammas by tau^k corresponds to scaling the prime lattice by tau^k.
    """
    print(f"Running Experiment 1C: Zero Scaling (tau-Lattice)... [Res={resolution}]")
    
    # Constants
    K_VALUES = [-2, -1, 0, 1, 2]
    POINTS = resolution
    X_EFF_START, X_EFF_END = x_start, x_end
    N_ZEROS = len(zeros) 
    
    # Slice zeros to N_ZEROS
    base_gammas = zeros[:N_ZEROS]
    betas = [mpmath.mpf(0.5)] * len(base_gammas)
    
    # Pre-load primes for TruePi (needs to cover max physical X)
    max_k = 2 
    max_scale = float(mpmath.power(TAU, max(K_VALUES)))
    max_phys = X_EFF_END * max_scale
    primes = get_primes(max_phys + 100)
    
    results = {}
    
    total_steps = len(K_VALUES) * (POINTS + 1)
    processed_steps = 0

    for k in K_VALUES:
        print(f"  > Processing Scale K={k}...", end='\r')
        
        scale = mpmath.power(TAU, k)
        
        # Prepare gammas for Hypothesis (Operator Scale)
        exp_gammas = [g * scale for g in base_gammas]
        
        # Define X_eff grid
        step_eff = (X_EFF_END - X_EFF_START) / POINTS
        
        res_k = []
        
        for i in range(POINTS + 1):
            x_eff = X_EFF_START + i * step_eff
            x_eff_mp = mpmath.mpf(x_eff)
            
            # Physical Coordinate
            x_phys = x_eff_mp * scale
            
            # 1. Ground Truth (Scaled Primes)
            val_true = mpmath.mpf(0)
            if x_eff >= 2:
                import bisect
                val_true = mpmath.mpf(bisect.bisect_right(primes, float(x_eff)))
            
            # 2. Baseline Reconstruction (Coordinate Gauge)
            val_coord = fast_MobiusPi(x_eff_mp, betas, base_gammas)
            
            # 3. Operator Hypothesis (Scaled Zeros)
            val_op = fast_MobiusPi(x_phys, betas, exp_gammas)
            
            res_k.append({
                "x_eff": float(x_eff),
                "x_phys": float(x_phys),
                "y_true": float(val_true),
                "y_coord": float(val_coord),
                "y_op": float(val_op)
            })
            processed_steps += 1
            if callable(progress_callback) and (processed_steps % 25 == 0 or processed_steps == total_steps):
                progress_callback(
                    processed_steps,
                    total_steps,
                    message="exp1c zero-scaling points",
                    payload={"k": k, "point": i},
                )
            
            if i % 50 == 0:
                print(f"    > Point {i}/{POINTS} (K={k})", end='\r')
                
        results[str(k)] = res_k
        print(f"    > Finished K={k}            ")
        
    print("  > Experiment 1C Done.           ")
    return results

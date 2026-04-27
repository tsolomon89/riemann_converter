from concurrent.futures import ProcessPoolExecutor

from riemann_math import get_primes, get_zeros, TruePi, LogIntegral, J_Wave, MobiusPi, MobiusPi_equal_beta, mean_spacing, find_nearest_zero, load_or_init_results, save_results, ZERO_COUNT, TAU
import mpmath
import time

_EXP3_WORKER_STATE = {}
_PARALLEL_WORK_THRESHOLD = 100_000


def _exp3_worker_init(gamma_tokens, dps):
    mpmath.mp.dps = int(dps)
    _EXP3_WORKER_STATE["gammas"] = [mpmath.mpf(tok) for tok in gamma_tokens]


def _exp3_worker_point(task):
    x_vis_token, scale_token = task
    x_vis = mpmath.mpf(x_vis_token)
    scale = mpmath.mpf(scale_token)
    eff_x = x_vis / scale
    gammas = _EXP3_WORKER_STATE["gammas"]
    val_rec_a = MobiusPi_equal_beta(eff_x, mpmath.mpf(0.5), gammas)
    val_rec_b = MobiusPi_equal_beta(eff_x, mpmath.pi, gammas)
    return val_rec_a, val_rec_b


def _compute_exp3_reconstructions(x_values, scale, gammas, workers, dps):
    if workers <= 1 or (len(x_values) * max(1, len(gammas))) < _PARALLEL_WORK_THRESHOLD:
        out = []
        for x_vis in x_values:
            eff_x = x_vis / scale
            out.append((
                MobiusPi_equal_beta(eff_x, mpmath.mpf(0.5), gammas),
                MobiusPi_equal_beta(eff_x, mpmath.pi, gammas),
            ))
        return out

    digits = max(30, min(90, int(dps) + 10))
    gamma_tokens = [mpmath.nstr(g, n=digits) for g in gammas]
    scale_token = mpmath.nstr(scale, n=digits)
    tasks = [(mpmath.nstr(x, n=digits), scale_token) for x in x_values]
    max_workers = min(int(workers), len(tasks))
    chunk = max(1, len(tasks) // max(1, max_workers * 4))
    with ProcessPoolExecutor(
        max_workers=max_workers,
        initializer=_exp3_worker_init,
        initargs=(gamma_tokens, int(dps)),
    ) as pool:
        return list(pool.map(_exp3_worker_point, tasks, chunksize=chunk))


def run_experiment_3(zeros, resolution=200, x_start=2, x_end=50, progress_callback=None, **kwargs):
    """
    Experiment 3: Beta=Pi Falsification.
    Visual Window: x in [2tau, 50tau], Gauge: k=1.
    """
    print(f"\nRunning Experiment 3: Beta=Pi Falsification (Honest Calculation)... [Res={resolution}]")
    
    gammas = zeros
    workers = max(1, int(kwargs.get("workers", 1)))
    dps = int(kwargs.get("dps", mpmath.mp.dps))
    
    points = resolution
    
    # Physical Scale K=1
    scale = TAU
    X_start_phys = x_start * scale
    X_end_phys = x_end * scale
    step = (X_end_phys - X_start_phys) / points
    
    primes = get_primes(X_end_phys / scale + 10)
    
    res_3A = []
    res_3B = []
    res_True = []
    x_values = [X_start_phys + i * step for i in range(points + 1)]
    rec_values = _compute_exp3_reconstructions(x_values, scale, gammas, workers, dps)
    
    for i, (x_vis, (val_rec_A, val_rec_B)) in enumerate(zip(x_values, rec_values)):
        
        # HONESTY CHECK: The Gauge Transformation
        eff_X = x_vis / scale
        
        val_true = TruePi(eff_X, primes)
        res_True.append({"x": float(x_vis), "y": float(val_true)})
        
        res_3A.append({"x": float(x_vis), "y": float(val_rec_A)})
        
        res_3B.append({"x": float(x_vis), "y": float(val_rec_B)})
        if callable(progress_callback) and (i % 10 == 0 or i == points):
            progress_callback(
                i + 1,
                points + 1,
                message="exp3 beta-pi falsification points",
                payload={"point": i, "x_vis": float(x_vis)},
            )
        
        if i % 20 == 0:
            print(f"  > [Exp3] Point {i}/{points} (x_vis={float(x_vis):.1f})", flush=True)
        
    return {"3A": res_3A, "3B": res_3B, "TruePi": res_True}

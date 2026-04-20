import mpmath
from riemann_math import get_primes, get_zeros, TruePi, LogIntegral, J_Wave, MobiusPi, mean_spacing, find_nearest_zero, load_or_init_results, save_results, ZERO_COUNT, TAU
import time

def run_experiment_7(zeros, resolution=100, x_start=40, x_end=50, beta_offset=0.0001, k_power=-20, **kwargs):
    """
    Experiment 7: Centrifuge Fix / Relative Amplification.
    Tests if a rogue zero perturbation is amplified at scale, 
    using a relative metric A(x) instead of absolute error.
    """
    print(f"Running Experiment 7: Centrifuge Fix... [Res={resolution}, k={k_power}, beta_offset={beta_offset}]")
    if not zeros:
        raise ValueError("Experiment 7 requires at least one loaded zero.")

    k_test = k_power
    scale = mpmath.power(TAU, k_test)

    points = resolution
    X_start, X_end = x_start, x_end
    step = (X_end - X_start) / points

    epsilon_values = [0.1, 0.25, 0.5]

    target_idx = min(100, len(zeros) - 1)
    target_gamma = zeros[target_idx]
    spacing = mean_spacing(target_gamma)
    eta = mpmath.mpf("1e-6")

    base_betas = [mpmath.mpf("0.5")] * len(zeros)
    results = {"calibrated": []}

    for eps in epsilon_values:
        print(f"  > Testing Epsilon={eps}...", end="\r")
        zeros_rogue = zeros[:]
        zeros_rogue[target_idx] += mpmath.mpf(eps) * spacing

        max_amp = mpmath.mpf(0)
        mean_amp = mpmath.mpf(0)

        for i in range(points + 1):
            x = X_start + i * step
            x_eff = x / scale

            if i % 10 == 0:
                print(f"    > Epsilon={eps}: Point {i}/{points}...", end="\r")

            val_clean = MobiusPi(x_eff, base_betas, zeros, use_dynamic=True)
            val_rogue = MobiusPi(x_eff, base_betas, zeros_rogue, use_dynamic=True)
            val_li = LogIntegral(x_eff)

            resid_clean = abs(val_clean - val_li)
            amp = abs(val_rogue - val_clean) / (resid_clean + eta)

            if amp > max_amp:
                max_amp = amp
            mean_amp += amp

        mean_amp /= (points + 1)
        results["calibrated"].append(
            {
                "epsilon": eps,
                "max_amp": float(max_amp),
                "mean_amp": float(mean_amp),
            }
        )

    print("  > Experiment 7 Done.         ")
    return results

from riemann_math import get_primes, get_zeros, TruePi, LogIntegral, J_Wave, MobiusPi, mean_spacing, find_nearest_zero, load_or_init_results, save_results, ZERO_COUNT, TAU
import mpmath
import time

# -----------------------------------------------------------------------------
# EXPERIMENT 2A: The Centrifuge (Rogue Mode)
# -----------------------------------------------------------------------------

def run_experiment_2(zeros, resolution=100, x_start=2, x_end=20, beta_offset=0.0001, k_power=-20, **kwargs):
    """
    Experiment 2: The Centrifuge (Rogue Mode).
    k = k_power (default -20).
    """
    print(f"Running Experiment 2: Centrifuge... [Res={resolution}, k={k_power}, beta_offset={beta_offset}]")
    
    k = k_power
    scale_factor = mpmath.power(TAU, -k) # tau^(-k)
    
    X_start_vis, X_end_vis = x_start, x_end
    
    # Data 2A: Clean (betas=0.5)
    gammas = zeros
    betas_clean = [mpmath.mpf(0.5)] * len(gammas)
    
    # Data 2B: Rogue (beta_1 = 0.5 + offset)
    betas_rogue = [mpmath.mpf(0.5)] * len(gammas)
    betas_rogue[0] = mpmath.mpf(0.5 + beta_offset)
    
    res_2A = []
    res_2B = []
    
    points = resolution 
    step = (X_end_vis - X_start_vis) / points
    
    for i in range(points + 1):
        x_vis = X_start_vis + i * step
        eff_X = x_vis * scale_factor
        
        # True Pi approximation for huge X
        val_true = LogIntegral(eff_X) 
        
        # 2A Clean (Explicit k=-20)
        val_rec_A = MobiusPi(eff_X, betas_clean, gammas)
        error_A = abs(val_true - val_rec_A)
        
        # 2B Rogue (Explicit k=-20)
        val_rec_B = MobiusPi(eff_X, betas_rogue, gammas)
        error_B = abs(val_true - val_rec_B)
        
        res_2A.append({"x": float(x_vis), "error": float(error_A)})
        res_2B.append({"x": float(x_vis), "error": float(error_B)})
        
        if i % 10 == 0: 
            print(f"  > [Exp2] Centrifuge point {i}/{points} (x_vis={float(x_vis):.1f})", flush=True)

    return {"2A": res_2A, "2B": res_2B}

# -----------------------------------------------------------------------------
# EXPERIMENT 2B: Rogue Isolation
# -----------------------------------------------------------------------------

def run_experiment_2b(zeros, resolution=100, x_start=2, x_end=20, beta_offset=0.0001, k_power=-20, **kwargs):
    """
    Experiment 2B: The Centrifuge (Rogue Isolation).
    Targeted test to isolate the single perturbed zero.
    Computes Diff, Predicted Ratio, and Residual.
    """
    print(f"Running Experiment 2B: Rogue Isolation... [Res={resolution}, k={k_power}]")
    
    k = k_power
    scale_factor = mpmath.power(TAU, -k) # ~10^16
    
    X_start_vis, X_end_vis = x_start, x_end
    points = resolution
    step = (X_end_vis - X_start_vis) / points
    
    # Setup Zeros
    gammas = zeros
    betas_clean = [mpmath.mpf(0.5)] * len(gammas)
    betas_rogue = [mpmath.mpf(0.5)] * len(zeros)
    
    # Perturbation delta
    delta_beta = mpmath.mpf(beta_offset)
    betas_rogue[0] += delta_beta # First zero perturbed
    
    results = []
    
    # Reference point for ratio calculation
    diffs = []
    
    for i in range(points + 1):
        x_vis = X_start_vis + i * step
        eff_X = x_vis * scale_factor
        
        # Clean
        val_clean = MobiusPi(eff_X, betas_clean, gammas, use_dynamic=True)
        # Rogue
        val_rogue = MobiusPi(eff_X, betas_rogue, gammas, use_dynamic=True)
        
        diff = abs(val_rogue - val_clean)
        diffs.append((x_vis, eff_X, diff))
        
        if i % 20 == 0: print(f"  > Isolation point {i}/{points}...", end='\r')


    # Find reference diff (at index close to middle)
    mid_idx = points // 2
    ref_x_vis, ref_X_eff, ref_diff = diffs[mid_idx]
    
    if ref_diff == 0: ref_diff = 1e-20 
    
    final_data = []
    
    for x_vis, eff_X, diff in diffs:
        # pred_ratio(x) = exp(delta_beta * (ln X_eff - ln X_ref_eff))
        log_ratio = mpmath.log(eff_X) - mpmath.log(ref_X_eff)
        pred = mpmath.exp(delta_beta * log_ratio)
        
        obs = diff / ref_diff
        
        residual = obs / pred if pred != 0 else 0
        
        final_data.append({
            "x": float(x_vis),
            "diff": float(diff),
            "pred_ratio": float(pred),
            "obs_ratio": float(obs),
            "residual": float(residual)
        })

    print("\n  > Experiment 2B Done.")
    return final_data

from riemann_math import get_primes, get_zeros, TruePi, LogIntegral, J_Wave, MobiusPi, mean_spacing, find_nearest_zero, load_or_init_results, save_results, ZERO_COUNT, TAU
import mpmath
import time

# -----------------------------------------------------------------------------
# EXPERIMENT 1A: Explicit Equivariance
# -----------------------------------------------------------------------------

def run_experiment_1(zeros, resolution=500, x_start=2, x_end=50):
    """
    Experiment 1: Explicit Equivariance (Coordinate Gauge).
    Tests if zeros scaled by tau^k (rho * tau^k) reconstruct the function 
    at scaled coordinates X * tau^k.
    """
    print(f"Running Experiment 1: Exp1A (Coordinate Gauge) [Res={resolution}, Range={x_start}-{x_end}]...")
    
    gammas = zeros
    betas = [mpmath.mpf(0.5)] * len(gammas)
    
    points = resolution
    # Base Logical Window (Effective X)
    X_base_start, X_base_end = x_start, x_end
    
    # K values to test
    k_values = [-2, -1, 0, 1, 2]
    
    results = {}
    
    # We need primes up to the max effective X (which is always ~50)
    # But just in case, we stick to the base range + buffer
    primes = get_primes(X_base_end + 10)
    
    for k in k_values:
        print(f"  > Processing Scale K={k}...", end='\r')
        res_k = []
        
        # Define Physical Window: [2*tau^k, 50*tau^k]
        scale = mpmath.power(TAU, k)
        X_start_phys = X_base_start * scale
        X_end_phys = X_base_end * scale
        step_phys = (X_end_phys - X_start_phys) / points
        
        for i in range(points + 1):
            x_vis = X_start_phys + i * step_phys
            
            # THE GAUGE TRANSFORMATION (Your actual hypothesis)
            eff_X = x_vis / scale
            
            # Evaluate using the untouched, strictly invariant zeros
            val_true = TruePi(eff_X, primes)
            # Use dynamic=False for Exp 1A (legacy behavior/fast path)
            val_rec = MobiusPi(eff_X, betas, gammas, use_dynamic=False)
            
            res_k.append({
                "x": float(x_vis),         # UI plots against the physical scale!
                "eff_x": float(eff_X),
                "y_rec": float(val_rec),
                "y_true": float(val_true)
            })

            if i % 50 == 0:
                print(f"    > Point {i}/{points} (K={k})", end='\r')
                
        results[str(k)] = res_k

    print(f"  > Experiment 1A Done.       ")
    return results

# -----------------------------------------------------------------------------
# EXPERIMENT 1B: Operator Gauge
# -----------------------------------------------------------------------------

def run_experiment_1b(zeros, resolution=200, x_start=2, x_end=50):
    """
    Experiment 1B: Operator Gauge.
    Tests two variants of scaling:
    1. Variant B1: Gamma-only scaling (Frequency scaling).
    2. Variant B2: Rho scaling (Beta + Gamma scaling) - The "Doc Claim".
    """
    print(f"Running Experiment 1B: Operator Gauge Chains... [Res={resolution}]")
    
    # Configuration
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
        
        scaled_gammas = [g * scale for g in zeros]
        fixed_betas = [mpmath.mpf(0.5)] * len(zeros)
        
        for i in range(points + 1):
            x_vis = X_start + i * step
            
            val_true = TruePi(x_vis, primes)
            val_rec = MobiusPi(x_vis, fixed_betas, scaled_gammas, use_dynamic=True)
            
            y_rec_raw = float(val_rec)
            y_rec_renorm = float(val_rec * scale)
            
            res_k.append({
                "x": float(x_vis),
                "y_rec": y_rec_raw,
                "y_rec_amp_renorm": y_rec_renorm,
                "y_true": float(val_true)
            })
            
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
        
        for i in range(points + 1):
            x_vis = X_start + i * step
            val_true = TruePi(x_vis, primes)
            status = "ok"
            try:
                val_rec = float(MobiusPi(x_vis, scaled_betas, scaled_gammas, use_dynamic=True))
            except Exception as e:
                val_rec = float('nan')
                status = "error"
            
            res_k.append({
                "x": float(x_vis),
                "y_rec": val_rec,
                "y_true": float(val_true),
                "status": status
            })

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
    Optimized J_Wave for scalar X and lists of betas/gammas.
    Precomputes log(X) and avoids some mpmath overhead in the loop.
    """
    if X < 2: return mpmath.mpf(0)
    
    ln_X = mpmath.log(X)
    inv_ln_X = 1 / ln_X
    
    term1 = -mpmath.log(2)
    term2 = 1 / (2 * X * X * ln_X)
    trivial_zeros = term1 + term2
    
    li_val = mpmath.li(X)
    
    sqrt_X = mpmath.sqrt(X)
    pre_factor = (sqrt_X * inv_ln_X) * 2
    
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

def run_experiment_1c(zeros, resolution=50, x_start=2, x_end=50):
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
            
            if i % 50 == 0:
                print(f"    > Point {i}/{POINTS} (K={k})", end='\r')
                
        results[str(k)] = res_k
        print(f"    > Finished K={k}            ")
        
    print("  > Experiment 1C Done.           ")
    return results

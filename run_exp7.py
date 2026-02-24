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
    
    results = {}
    
    # Setup
    k_test = k_power
    scale = mpmath.power(TAU, k_test)
    
    # Effective X ~ 10^17? 
    # Wait, k=-20 => 1/tau^20 approx 1/10^16.
    # X_phys = 50. X_eff = 50 * tau^20 approx 5e16.
    # This matches Exp 2 description.
    
    points = resolution
    X_start, X_end = x_start, x_end # Physical window
    step = (X_end - X_start) / points
    
    # 1. Calibrated Rogue Mode
    # Perturb one zero by epsilon * spacing
    # We can use beta_offset as a multiplier for epsilon if needed, but the logic is specific here.
    # Let's keep epsilon values fixed for now or allow override? 
    # For now, let's just respect X range and Resolution.
    epsilon_values = [0.1, 0.25, 0.5]
    
    # Pick a safe index (middle of available zeros)
    target_idx = min(100, len(zeros) // 2)
    target_gamma = zeros[target_idx]
    spacing = mean_spacing(target_gamma)
    
    metrics = {}
    
    # Baseline (Clean)
    # We must compute Clean Resid once
    x_grid = []
    clean_resid = []
    
    eta = 1e-6
    
    # Compute clean residuals
    print("  > Computing Clean Baseline...")
    for i in range(points + 1):
        x = X_start + i * step
        x_grid.append(x)
        
        # Effective X
        x_eff = x / scale
        
        val_rec = MobiusPi(x_eff, [0.5]*len(zeros), zeros, use_dynamic=True)
        val_li = LogIntegral(x_eff)
        
        clean_resid.append(abs(val_rec - val_li))
        
    for eps in epsilon_values:
        print(f"  > Testing Epsilon={eps}...", end='\r')
        
        # Perturb
        zeros_rogue = zeros[:]
        zeros_rogue[target_idx] += eps * spacing
        
        amplifications = []
        
        for i, x in enumerate(x_grid):
            x_eff = x / scale
            
            # Compute Rogue
            val_rogue = MobiusPi(x_eff, [0.5]*len(zeros_rogue), zeros_rogue, use_dynamic=True)
            val_li = LogIntegral(x_eff) # Same Li
            
            res_rogue = abs(val_rogue - val_li)
            res_clean = clean_resid[i]
            
            # Relative Amplification A(x)
            # A = |E_rogue - E_clean| / (|E_clean| + eta)
            # Actually Diff = |val_rogue - val_clean| (since Li cancels)
            diff = abs(val_rogue - (val_rogue - res_rogue + res_clean)) # Wait, Li cancels.
            # val_rogue - val_clean = (RecR - Li) - (RecC - Li) = RecR - RecC
            # So A = |RecR - RecC| / (|RecC - Li| + eta)
            
            delta = abs(val_rogue - (val_rogue - res_rogue + res_clean)) # Error in thinking.
            # Re-calculate clean value? No.
            # Just calculating |Diff|
            # Since I stored abs(resid), I lost sign.
            # Let's recompute RecC? No, too slow.
            # Wait, `clean_resid` stores ABS error.
            # I need signed RecC to compute RecR - RecC.
            pass 
        
        # Re-loop correctly
        # Just compute max_amp of difference
        # Optimization: Just compute rogue and diff on fly relative to clean_resid?
        # No, let's just do it cleanly inside loop
        pass

    # REFRACTORED LOOP for correctness
    results["calibrated"] = []
    
    for eps in epsilon_values:
         print(f"  > Testing Epsilon={eps}...", end='\r')
         zeros_rogue = zeros[:]
         zeros_rogue[target_idx] += eps * spacing
         
         max_amp = 0
         mean_amp = 0
         
         for i in range(points + 1):
            x = X_start + i * step
            x_eff = x / scale
            
            
            if i % 10 == 0:
                 print(f"    > Epsilon={eps}: Point {i}/{points}...", end='\r')

            # Re-compute Clean (safe)
            val_clean = MobiusPi(x_eff, [0.5]*len(zeros), zeros, use_dynamic=True)
            val_rogue = MobiusPi(x_eff, [0.5]*len(zeros_rogue), zeros_rogue, use_dynamic=True)
            val_li = LogIntegral(x_eff)
            
            resid_clean = abs(val_clean - val_li)
            items_diff = abs(val_rogue - val_clean)
            
            amp = items_diff / (resid_clean + eta)
            
            if amp > max_amp: max_amp = amp
            mean_amp += amp
            
         mean_amp /= (points + 1)
         
         results["calibrated"].append({
             "epsilon": eps,
             "max_amp": float(max_amp),
             "mean_amp": float(mean_amp)
         })
         
    return results

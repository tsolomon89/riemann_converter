import mpmath
from riemann_math import get_primes, get_zeros, TruePi, LogIntegral, J_Wave, MobiusPi, mean_spacing, find_nearest_zero, load_or_init_results, save_results, ZERO_COUNT, TAU
import math
import time


def run_experiment_4(zeros):
    """
    Experiment 4: Log-Translation vs Log-Dilation Disambiguation.
    Distinguishes whether 'scaling works' because of coordinate invariance (translation)
    or a true operator scaling effect.
    """
    print("Running Experiment 4: Translation vs Dilation...")
    
    results = {}
    
    # 1. Setup
    # Physical range for visualization
    X_start, X_end = 10, 100 # Visual window
    points = 20 if len(zeros) <= 100 else 200 # Number of points (Fast mode for quick check)
    
    # K values to test
    k_values = [1, 2]
    
    gammas_clean = zeros
    betas_clean = [mpmath.mpf(0.5)] * len(zeros)
    
    # Pre-load primes (enough for reconstruction, though we compare Recon vs Recon)
    # Actually MobiusPi doesn't need primes, it needs zeros.
    # TruePi needs primes. We might not need TruePi for this comparison if we compare Recon vs Recon.
    # But let's load some to be safe for range.
    get_primes(1000) 

    def get_norm_residual(x, betas, gammas):
        # R(x) = (Pi_rec(x) - Li(x)) / (sqrt(x)/ln(x))
        # This isolates the oscillatory component O(1)
        val_rec = MobiusPi(x, betas, gammas, use_dynamic=False)
        val_li = LogIntegral(x)
        diff = val_rec - val_li
        
        # Normalization factor
        denom = mpmath.sqrt(x) / mpmath.log(x)
        return diff / denom

    for k in k_values:
        print(f"  > Processing Scale K={k}...", end='\r')
        
        tau_k_val = mpmath.power(TAU, k)
        
        # 1. Generate Target Curve (using SCALED zeros)
        # gamma -> gamma * tau^k
        # This simulates the "Operator Hypothesis"
        gammas_scaled = [g * tau_k_val for g in gammas_clean]
        
        points_x = []
        target_residuals = []
        
        # Logarithmic sampling for better frequency resolution? 
        # Or linear in log-space? 
        # Standard linear X is fine for small range [10, 100]
        step = (X_end - X_start) / points
        for i in range(points + 1):
            x = X_start + i * step
            points_x.append(x)
            res = get_norm_residual(x, betas_clean, gammas_scaled)
            target_residuals.append(res)
            
        # Optimization: Use fewer points for the grid search to speed up 10x
        # We only need full resolution for the final RMSE check.
        subset_step = max(1, len(points_x) // 20) # Target ~20 points
        points_x_opt = points_x[::subset_step]
        target_residuals_opt = target_residuals[::subset_step]
        
        # 2. Translation Model Optimization
        # Model: Base zeros, but at Coordinate x' = x * exp(Delta)
        # Predicted Delta = -k * ln(tau)
        delta_pred = -k * mpmath.log(TAU)
        
        best_rmse_trans = mpmath.inf
        best_delta = 0
        
        # Grid Search around predicted
        # Delta corresponds to log-shift. 
        # log(x') = log(x) + Delta
        # x' = x * e^Delta
        search_range = 0.5
        steps_opt = 20
        
        print(f"    > Optimizing Translation Model ({steps_opt} steps)...")
        # Coarse Grid
        for d in mpmath.linspace(delta_pred - search_range, delta_pred + search_range, steps_opt):
            rmse = 0
            for px, tr in zip(points_x_opt, target_residuals_opt):
                # Calculate Base Residual at shifted coordinate
                x_shifted = px * mpmath.exp(d)
                br = get_norm_residual(x_shifted, betas_clean, gammas_clean)
                rmse += (tr - br)**2
            rmse = mpmath.sqrt(rmse / len(points_x_opt))
            
            if rmse < best_rmse_trans:
                best_rmse_trans = rmse
                best_delta = d
                
        # Refinement (Golden Section or simple local refine)
        # Just doing a finer grid local to best
        local_range = 0.05
        # print("    > Refining Translation Model...")
        for d in mpmath.linspace(best_delta - local_range, best_delta + local_range, 20):
             rmse = 0
             for px, tr in zip(points_x_opt, target_residuals_opt):
                x_shifted = px * mpmath.exp(d)
                br = get_norm_residual(x_shifted, betas_clean, gammas_clean)
                rmse += (tr - br)**2
             rmse = mpmath.sqrt(rmse / len(points_x_opt))
             
             if rmse < best_rmse_trans:
                 best_rmse_trans = rmse
                 best_delta = d

        # FINAL COMPLETE CHECK with all points
        # print("    > Final Translation RMSE Check...")
        final_rmse_trans = 0
        for px, tr in zip(points_x, target_residuals):
             x_shifted = px * mpmath.exp(best_delta)
             br = get_norm_residual(x_shifted, betas_clean, gammas_clean)
             final_rmse_trans += (tr - br)**2
        best_rmse_trans = mpmath.sqrt(final_rmse_trans / len(points_x))

        # 3. Dilation Model Optimization
        # Model: Base zeros, at Coordinate x' = x ^ alpha
        # Predicted Alpha = tau^k (if gamma -> gamma*alpha implies x -> x^alpha)
        # Wait, gamma*A corresponds to x -> x^A
        alpha_pred = tau_k_val
        
        best_rmse_dil = mpmath.inf
        best_alpha = 0
        
        # Search around alpha_pred
        # Note: x^alpha grows fast. Ensure x' doesn't overflow or become too massive for MobiusPi precision
        
        search_alpha_range = alpha_pred * 0.1
        
        print(f"    > Optimizing Dilation Model...")
        for a in mpmath.linspace(alpha_pred - search_alpha_range, alpha_pred + search_alpha_range, 10):
            rmse = 0
            count_ok = 0
            for px, tr in zip(points_x_opt, target_residuals_opt):
                try:
                    x_dilated = mpmath.power(px, a)
                    if x_dilated > 1e20: continue # Safety cap
                    
                    br = get_norm_residual(x_dilated, betas_clean, gammas_clean)
                    rmse += (tr - br)**2
                    count_ok += 1
                except:
                    pass
            
            if count_ok > 0:
                rmse = mpmath.sqrt(rmse / count_ok)
                if rmse < best_rmse_dil:
                    best_rmse_dil = rmse
                    best_alpha = a

        # FINAL COMPLETE CHECK with all points for Dilation
        final_rmse_dil = 0
        final_count_ok = 0
        for px, tr in zip(points_x, target_residuals):
            try:
                x_dilated = mpmath.power(px, best_alpha)
                if x_dilated > 1e20: continue
                br = get_norm_residual(x_dilated, betas_clean, gammas_clean)
                final_rmse_dil += (tr - br)**2
                final_count_ok += 1
            except:
                pass
        
        if final_count_ok > 0:
            best_rmse_dil = mpmath.sqrt(final_rmse_dil / final_count_ok)
        else:
            best_rmse_dil = mpmath.inf

        # 4. Compare
        if math.isinf(float(best_rmse_trans)): best_rmse_trans = None
        if math.isinf(float(best_rmse_dil)): best_rmse_dil = None
        
        # Safe float conversion for print
        p_trans = float(best_rmse_trans) if best_rmse_trans is not None else -1.0
        p_dil = float(best_rmse_dil) if best_rmse_dil is not None else -1.0
        
        print(f"    K={k}: Trans RMSE={p_trans:.4f} (Delta={float(best_delta):.4f}), Dilation RMSE={p_dil:.4f}")
        
        winner = "INCONCLUSIVE"
        if best_rmse_trans is not None and best_rmse_dil is not None:
             winner = "TRANSLATION" if best_rmse_trans < best_rmse_dil else "DILATION"
        elif best_rmse_trans is not None:
             winner = "TRANSLATION"
        elif best_rmse_dil is not None:
             winner = "DILATION"

        row = {
            # ... (unchanged)
            "k": k,
            "delta_pred": float(delta_pred),
            "delta_hat": float(best_delta),
            "delta_error": float(abs(best_delta - delta_pred)),
            "rmse_trans": p_trans if p_trans >= 0 else None,
            "rmse_dil": p_dil if p_dil >= 0 else None,
            "winner": winner
        }
        results[str(k)] = row

    return results

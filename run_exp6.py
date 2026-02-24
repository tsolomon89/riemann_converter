import mpmath
from riemann_math import *
import time

def run_experiment_6(zeros):
    """
    Experiment 6: Critical Line Drift Estimator.
    Measures if the reconstruction implicitly prefers a different beta > 0.5
    under scaling, which would indicate a broken symmetry.
    """
    print("Running Experiment 6: Critical Line Drift...")
    
    results = {}
    
    # 1. Setup
    X_start, X_end = 10, 100
    points = 100
    k_values = [0, 1, 2] # Include 0 check
    
    # Pre-load primes for TruePi
    primes = get_primes(X_end + 50)
    
    gammas_fixed = zeros
    
    def get_rmse(beta_val, k, x_points, y_true):
        # Construct beta list
        betas = [mpmath.mpf(beta_val)] * len(gammas_fixed)
        
        # Scale gammas?
        # Prompt: "For each k (and for each scaling model you care about)"
        # "Hold gamma list fixed (or scaled...)"
        # We want to see if SCALING THE COORDINATE implies beta drift?
        # Or if SCALING THE ZEROS implies beta drift?
        # "If some 'scaled system' implied beta drift..."
        # Let's test the "Scaled Zeros" hypothesis (Operator) since that's the interesting one.
        # k=0 is baseline.
        
        # Scaling gammas by tau^k
        scale = mpmath.power(TAU, k)
        gammas_k = [g * scale for g in gammas_fixed]
        
        rmse = 0
        for i, x in enumerate(x_points):
            y_rec = MobiusPi(x, betas, gammas_k, use_dynamic=False)
            err = (y_rec - y_true[i])**2
            rmse += err
            
        return mpmath.sqrt(rmse / len(x_points))

    # Generate Ground Truth (TruePi) on grid
    # We use ONE grid for all K?
    # Prompt: "If K changes the x-domain, truth must be evaluated on that same domain".
    # Here we are testing the "Operator Hypothesis":
    # gammas -> gammas * tau^k.
    # We reconstruct at PHYSICAL x.
    # So ground truth is TruePi at PHYSICAL x.
    # AND "baseline reconstruction as self-truth".
    # Using TruePi is safer for "absolute" drift.
    
    x_grid = []
    y_true_grid = []
    step = (X_end - X_start) / points
    for i in range(points + 1):
        x = X_start + i * step
        x_grid.append(x)
        y_true_grid.append(TruePi(x, primes))
        
    for k in k_values:
        print(f"  > Processing Scale K={k}...", end='\r')
        
        # Optimize Beta
        # Grid Search [0.45, 0.55]
        best_rmse = mpmath.inf
        best_beta = 0.5
        
        # Optimization: Use fewer points for the grid search
        subset_step = max(1, len(x_grid) // 20)
        x_grid_opt = x_grid[::subset_step]
        y_true_grid_opt = y_true_grid[::subset_step]
        
        # 1. Coarse Grid
        print(f"    > Optimizing Beta (Coarse)...")
        for b in mpmath.linspace(0.45, 0.55, 11): # 0.45, 0.46, ... 0.55
            rmse = get_rmse(b, k, x_grid_opt, y_true_grid_opt)
            if rmse < best_rmse:
                best_rmse = rmse
                best_beta = b
                
        # 2. Refine
        # print(f"    > Optimizing Beta (Refine)...")
        for b in mpmath.linspace(best_beta - 0.02, best_beta + 0.02, 11):
            rmse = get_rmse(b, k, x_grid_opt, y_true_grid_opt)
            if rmse < best_rmse:
                best_rmse = rmse
                best_beta = b
        
        # FINAL COMPLETE CHECK
        # Recalculate best_rmse using ALL points
        best_rmse = get_rmse(best_beta, k, x_grid, y_true_grid)
        
        # Check RMSE at beta=0.5 explicitly
        rmse_05 = get_rmse(0.5, k, x_grid, y_true_grid)
        
        print(f"    K={k}: Beta_hat={float(best_beta):.4f}, RMSE={float(best_rmse):.4f} (vs 0.5: {float(rmse_05):.4f})")
        
        results[str(k)] = {
            "beta_hat": float(best_beta),
            "rmse_opt": float(best_rmse),
            "rmse_05": float(rmse_05),
            "delta_rmse": float(rmse_05 - best_rmse)
        }
        
    return results

if __name__ == "__main__":
    t0 = time.time()
    zeros = get_zeros(ZERO_COUNT)
    # data = load_or_init_results()
    exp6 = run_experiment_6(zeros)
    # data["experiment_6"] = exp6
    # save_results(data)
    print(f"Finished Exp 6 in {time.time() - t0:.2f}s")

from riemann_math import get_primes, get_zeros, TruePi, LogIntegral, J_Wave, MobiusPi, mean_spacing, find_nearest_zero, load_or_init_results, save_results, ZERO_COUNT, TAU
import mpmath
import time

def run_experiment_3(zeros, resolution=200, x_start=2, x_end=50):
    """
    Experiment 3: Beta=Pi Falsification.
    Visual Window: x in [2tau, 50tau], Gauge: k=1.
    """
    print(f"\nRunning Experiment 3: Beta=Pi Falsification (Honest Calculation)... [Res={resolution}]")
    
    gammas = zeros
    betas_control = [mpmath.mpf(0.5)] * len(gammas)
    betas_pi = [mpmath.pi] * len(gammas) # Beta = 3.14159...
    
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
    
    for i in range(points + 1):
        x_vis = X_start_phys + i * step
        
        # HONESTY CHECK: The Gauge Transformation
        eff_X = x_vis / scale
        
        val_true = TruePi(eff_X, primes)
        res_True.append({"x": float(x_vis), "y": float(val_true)})
        
        # 3A Control
        val_rec_A = MobiusPi(eff_X, betas_control, gammas)
        res_3A.append({"x": float(x_vis), "y": float(val_rec_A)})
        
        # 3B Pi
        val_rec_B = MobiusPi(eff_X, betas_pi, gammas)
        res_3B.append({"x": float(x_vis), "y": float(val_rec_B)})
        
        if i % 20 == 0:
            print(f"  > [Exp3] Point {i}/{points} (x_vis={float(x_vis):.1f})", flush=True)
        
    return {"3A": res_3A, "3B": res_3B, "TruePi": res_True}

import mpmath
from riemann_math import *
import time
import numpy as np # For stats if available, else manual

def run_experiment_5(zeros):
    """
    Experiment 5: Zero Correspondence / Nearest-Neighbor Mapping.
    Tests if scaling gamma_n by tau^k lands on another zero gamma_m.
    """
    print("Running Experiment 5: Zero Correspondence...")
    
    results = {}
    
    # Sort zeros just in case (though they should be sorted)
    # Using mpmath types
    max_zero = zeros[-1]
    
    k_values = [1, 2] # Test scales
    
    for k in k_values:
        print(f"  > Processing Scale K={k}...", end='\r')
        
        scale = mpmath.power(TAU, k)
        
        errors = []
        normalized_errors = []
        
        # Iterate through zeros
        # We can only test gamma_n where gamma_n * scale < max_gamma
        limit_val = max_zero / scale
        
        count_tested = 0
        
        for i, g in enumerate(zeros):
            if g > limit_val: break
            
            # Skip first few (transient behavior?)
            if i < 10: continue
            
            target = g * scale
            
            # Find nearest in known zeros
            # Note: 'zeros' list contains mpmath floats
            # find_nearest_zero returns (index, value, dist)
            idx, match_val, dist = find_nearest_zero(target, zeros)
            
            # Distance
            spacing = mean_spacing(target)
            
            # Normalized Error
            z_score = dist / spacing
            
            errors.append(float(dist))
            normalized_errors.append(float(z_score))
            count_tested += 1
            
            if count_tested % 1000 == 0:
                print(f"    > K={k}: Processed {count_tested} zeros...", end='\r')
            
        if count_tested == 0:
            print(f"    > K={k}: [WARN] No zeros in range (Need > {float(limit_val)}).")
            results[str(k)] = {"error": "Insufficient Zeros"}
            continue

        # Stats
        # Manual stats calc to avoid numpy dependency if strict
        z_array = sorted(normalized_errors)
        n_count = len(z_array)
        
        median_z = z_array[n_count // 2]
        mean_z = sum(z_array) / n_count
        p95_z = z_array[int(0.95 * n_count)]
        
        # Correspondence Scores (Fraction within X spacing)
        # thresholds: 0.1, 0.25, 0.5
        c_10 = sum(1 for z in z_array if z < 0.1) / n_count
        c_25 = sum(1 for z in z_array if z < 0.25) / n_count
        c_50 = sum(1 for z in z_array if z < 0.5) / n_count
        
        print(f"    K={k}: Tested {count_tested} zeros. Median Z={median_z:.4f}, p95={p95_z:.4f}")
        
        results[str(k)] = {
            "count": count_tested,
            "mean_z": float(mean_z),
            "median_z": float(median_z),
            "p95_z": float(p95_z),
            "frac_below_0_1": float(c_10),
            "frac_below_0_25": float(c_25),
            "frac_below_0_5": float(c_50),
            "interpretation": "PASS" if median_z < 0.1 else "FAIL"
        }
        
    return results

if __name__ == "__main__":
    t0 = time.time()
    zeros = get_zeros(ZERO_COUNT)
    data = load_or_init_results()
    exp5 = run_experiment_5(zeros)
    # data["experiment_5"] = exp5
    # save_results(data)
    print(f"Finished Exp 5 in {time.time() - t0:.2f}s")

import time
import mpmath
from riemann_math import get_zeros, MobiusPi, LogIntegral, J_Wave, TAU

# Setup
mpmath.mp.dps = 50
ZERO_COUNT_FULL = 20000
ZERO_COUNT_REDUCED = 1000

print("Loading zeros...")
zeros_full = get_zeros(ZERO_COUNT_FULL)
zeros_reduced = zeros_full[:ZERO_COUNT_REDUCED]

betas_full = [mpmath.mpf(0.5)] * len(zeros_full)
betas_reduced = [mpmath.mpf(0.5)] * len(zeros_reduced)

X = mpmath.mpf(50)

def timed_run(label, z, b):
    t0 = time.time()
    # Simulate one residual calculation
    # MobiusPi calls J_Wave
    val_rec = MobiusPi(X, b, z, use_dynamic=False) # Exp 4 uses dynamic=False implicitly? No, run_exp4 calls it with False.
    # Wait, run_exp4 line 37: val_rec = MobiusPi(x, betas, gammas, use_dynamic=False)
    # So it uses the fast path (fixed mobius terms).
    dt = time.time() - t0
    print(f"{label}: {dt:.4f}s per call")
    return dt

print("\n--- TIMING ---")
dt_1 = timed_run("20k Zeros", zeros_full, betas_full)
dt_2 = timed_run("1k Zeros", zeros_reduced, betas_reduced)

ratio = dt_1 / dt_2
print(f"\nRatio 20k/1k: {ratio:.2f}x")

# Estimate Exp 4 total time
# 2 K values
# 200 points
# 50 optimization steps
# Total calls ~ 2 * 50 * 200 = 20,000 calls to MobiusPi
estimated_seconds = 20000 * dt_1
print(f"\nEstimated Experiment 4 time with 20k zeros: {estimated_seconds/3600:.2f} hours")

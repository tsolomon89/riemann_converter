from mpmath import mp
import numpy as np

# Mimic BakingEngine setup
mp.dps = 50

def input_A0(s, k, tau):
    return s

def safe_zeta(s, eps_pole=1e-6):
    try:
        diff = s - 1
        val = mp.abs(diff)
        if val < eps_pole:
            return mp.nan
        return mp.zeta(s)
    except Exception as e:
        print(f"Error in safe_zeta: {e}")
        print(f"Type of s: {type(s)}")
        print(f"Value of s: {s}")
        raise e

def transform_line(s_points):
    k = -1.0
    tau = 2 * mp.pi
    for s in s_points:
        s_prime = input_A0(s, k, tau)
        safe_zeta(s_prime)

# Generate points like generate_grid_scene
sigma = -10.0
t_min = -50.0
t_max = 50.0
steps = 200

# Using numpy linspace
t_vals = np.linspace(t_min, t_max, steps)
s_points = [mp.mpc(sigma, t) for t in t_vals]

print("Running transform...")
transform_line(s_points)
print("Done.")

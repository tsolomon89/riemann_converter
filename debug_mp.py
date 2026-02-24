from mpmath import mp
import numpy as np

mp.dps = 50

def safe_zeta(s, eps_pole=1e-6):
    print(f"DEBUG: s type: {type(s)}, value: {s}")
    diff = s - 1
    print(f"DEBUG: diff type: {type(diff)}, value: {diff}")
    val = mp.abs(diff)
    print(f"DEBUG: abs type: {type(val)}, value: {val}")
    if val < eps_pole:
        return mp.nan
    return mp.zeta(s)

s = mp.mpc(0.5, 14.13)
safe_zeta(s)

k = -1.0
tau = 2 * mp.pi
scale = mp.power(tau, k)
s2 = mp.mpc(0.5, scale * 14.13)
safe_zeta(s2)

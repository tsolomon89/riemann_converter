
import logging
import time
import riemann_math
from riemann_math import get_zeros

# Monkey patch constants for speed
riemann_math.ZERO_COUNT = 100
print("Running Verification with ZERO_COUNT = 100")

zeros = get_zeros(100)

print("\n--- TEST EXP 4 ---")
import run_exp4
results4 = run_exp4.run_experiment_4(zeros)
print("Exp 4 Results:", results4.keys())

print("\n--- TEST EXP 5 ---")
import run_exp5
results5 = run_exp5.run_experiment_5(zeros)
print("Exp 5 Results:", results5.keys())

print("\n--- TEST EXP 6 ---")
import run_exp6
results6 = run_exp6.run_experiment_6(zeros)
print("Exp 6 Results:", results6.keys())

print("\n--- TEST EXP 7 ---")
import run_exp7
results7 = run_exp7.run_experiment_7(zeros)
print("Exp 7 Results:", results7.keys())

print("\nDONE")

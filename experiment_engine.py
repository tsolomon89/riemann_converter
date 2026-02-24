import argparse
import time
import riemann_math
from riemann_math import get_zeros, load_or_init_results, save_results, ZERO_COUNT


from verifier import run_verification

def main():
    parser = argparse.ArgumentParser(description="Riemann Research Engine CLI")
    parser.add_argument("--run", type=str, default="all", help="Experiment to run: 1, 1c, 2, 3, or all")
    parser.add_argument("--quick", action="store_true", help="Run in fast mode with fewer zeros and points")
    parser.add_argument("--zero-source", type=str, default="generated", help="Source of zeros: 'generated' or 'file:<path>'")
    parser.add_argument("--zero-count", type=int, default=ZERO_COUNT, help="Overridden number of zeros")
    parser.add_argument("--dps", type=int, default=50, help="Decimal precision")
    parser.add_argument("--resolution", type=int, default=500, help="Number of points to plot")
    parser.add_argument("--x-start", type=float, default=None, help="Start of X range")
    parser.add_argument("--x-end", type=float, default=None, help="End of X range")
    parser.add_argument("--beta-offset", type=float, default=0.0001, help="Beta perturbation amount (for Exp 2/7)")
    parser.add_argument("--k-power", type=int, default=-20, help="Exponent of tau (k) for deep zoom (for Exp 2/7)")
    args = parser.parse_args()
    
    # Configure Math Engine
    riemann_math.configure(dps=args.dps, zero_count=args.zero_count)

    # Apply Quick Mode Overrides
    if args.quick:
        print(" [WARN] RUNNING IN QUICK MODE (Reduced Precision/Count)")
        riemann_math.configure(dps=30, zero_count=100)
    
    # Late Import to ensure they pick up the modified configuration
    import run_exp1
    import run_exp2
    import run_exp3

    
    print("Initialize Experiment Engine...")
    t0 = time.time()
    
    # Shared Resource Loading
    zeros = get_zeros(riemann_math.ZERO_COUNT, source=args.zero_source)
    
    # Load Existing Data (to preserving other experiments if running partial)
    data = load_or_init_results()

    # Step 0: Generate Code Fingerprint
    import hashlib
    import glob
    print("Generating code fingerprints...")
    fingerprints = {}
    files_to_hash = glob.glob("run_exp*.py") + ["riemann_math.py", "experiment_engine.py", "verifier.py"]
    for fname in files_to_hash:
        try:
            with open(fname, "rb") as f:
                fingerprints[fname] = hashlib.md5(f.read()).hexdigest()
        except FileNotFoundError:
            print(f"  > Warning: Could not find {fname} for hashing.")
            
    if "meta" not in data: data["meta"] = {}
    data["meta"]["code_fingerprint"] = fingerprints
    
    # Parse Run Arguments (support comma-separated lists)
    run_args = [x.strip() for x in args.run.split(",")]
    run_all = "all" in run_args

    # Prepare Kwargs for Experiments
    default_kwargs = {}
    if args.resolution: default_kwargs['resolution'] = args.resolution
    if args.x_start is not None: default_kwargs['x_start'] = float(args.x_start)
    if args.x_end is not None: default_kwargs['x_end'] = float(args.x_end)
    default_kwargs['beta_offset'] = float(args.beta_offset)
    default_kwargs['k_power'] = int(args.k_power)

    # EXPERIMENT 1 (Consolidated 1, 1B, 1C)
    if run_all or "1" in run_args:
        print("\n--- EXPERIMENT 1A (Consolidated) ---")
        exp1 = run_exp1.run_experiment_1(zeros, **default_kwargs)
        data["experiment_1"] = exp1
        
    if run_all or "1b" in run_args or "1" in run_args: 
         print("\n--- EXPERIMENT 1B (Consolidated) ---")
         # Now inside run_exp1
         exp1b = run_exp1.run_experiment_1b(zeros, **default_kwargs)
         data["experiment_1b"] = exp1b

    if run_all or "1c" in run_args:
        print("\n--- EXPERIMENT 1C (Consolidated) ---")
        # Now inside run_exp1
        exp1c = run_exp1.run_experiment_1c(zeros, **default_kwargs)
        data["experiment_1c"] = exp1c

    # EXPERIMENT 2 (Consolidated 2, 2B)
    if run_all or "2" in run_args:
        print("\n--- EXPERIMENT 2A (Consolidated) ---")
        exp2 = run_exp2.run_experiment_2(zeros, **default_kwargs)
        data["experiment_2"] = exp2
        
    if run_all or "2b" in run_args or "2" in run_args:
        print("\n--- EXPERIMENT 2B (Consolidated) ---")
        exp2b = run_exp2.run_experiment_2b(zeros, **default_kwargs)
        data["experiment_2b"] = exp2b

    # EXPERIMENT 3
    if run_all or "3" in run_args:
        print("\n--- EXPERIMENT 3 ---")
        exp3 = run_exp3.run_experiment_3(zeros, **default_kwargs)
        data["experiment_3"] = exp3

    # EXPERIMENT 4: Translation vs Dilation
    if run_all or "4" in run_args:
        print("\n--- EXPERIMENT 4 ---")
        import run_exp4
        exp4 = run_exp4.run_experiment_4(zeros)
        data["experiment_4"] = exp4

    # EXPERIMENT 5: Zero Correspondence
    if run_all or "5" in run_args:
        print("\n--- EXPERIMENT 5 ---")
        import run_exp5
        exp5 = run_exp5.run_experiment_5(zeros)
        data["experiment_5"] = exp5

    # EXPERIMENT 6: Critical Line Drift
    if run_all or "6" in run_args:
        print("\n--- EXPERIMENT 6 ---")
        import run_exp6
        exp6 = run_exp6.run_experiment_6(zeros)
        data["experiment_6"] = exp6

    # EXPERIMENT 7: Centrifuge Fix
    if run_all or "7" in run_args:
        print("\n--- EXPERIMENT 7 ---")
        import run_exp7
        exp7 = run_exp7.run_experiment_7(zeros)
        data["experiment_7"] = exp7
        
    # Save Merged Results
    # Run the automated verification checks!
    data = run_verification(data)

    # Save Merged Results
    save_results(data)
    print(f"\nEngine Finished in {time.time() - t0:.2f}s.")

if __name__ == "__main__":
    main()

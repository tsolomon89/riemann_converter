import argparse
import time
import riemann_math
from riemann_math import get_zeros, load_or_init_results, save_results, ZERO_COUNT


from verifier import run_verification

EXPERIMENT_REGISTRY = [
    {"keys": ["1"], "module": "run_exp1", "func": "run_experiment_1", "name": "EXPERIMENT 1A (Consolidated)", "out_key": "experiment_1", "pass_kwargs": True},
    {"keys": ["1b", "1"], "module": "run_exp1", "func": "run_experiment_1b", "name": "EXPERIMENT 1B (Consolidated)", "out_key": "experiment_1b", "pass_kwargs": True},
    {"keys": ["1c"], "module": "run_exp1", "func": "run_experiment_1c", "name": "EXPERIMENT 1C (Consolidated)", "out_key": "experiment_1c", "pass_kwargs": True},
    {"keys": ["2"], "module": "run_exp2", "func": "run_experiment_2", "name": "EXPERIMENT 2A (Consolidated)", "out_key": "experiment_2", "pass_kwargs": True},
    {"keys": ["2b", "2"], "module": "run_exp2", "func": "run_experiment_2b", "name": "EXPERIMENT 2B (Consolidated)", "out_key": "experiment_2b", "pass_kwargs": True},
    {"keys": ["3"], "module": "run_exp3", "func": "run_experiment_3", "name": "EXPERIMENT 3", "out_key": "experiment_3", "pass_kwargs": True},
    {"keys": ["4"], "module": "run_exp4", "func": "run_experiment_4", "name": "EXPERIMENT 4: Translation vs Dilation", "out_key": "experiment_4", "pass_kwargs": False},
    {"keys": ["5"], "module": "run_exp5", "func": "run_experiment_5", "name": "EXPERIMENT 5: Zero Correspondence", "out_key": "experiment_5", "pass_kwargs": False},
    {"keys": ["6"], "module": "run_exp6", "func": "run_experiment_6", "name": "EXPERIMENT 6: Critical Line Drift", "out_key": "experiment_6", "pass_kwargs": False},
    {"keys": ["7"], "module": "run_exp7", "func": "run_experiment_7", "name": "EXPERIMENT 7: Centrifuge Fix", "out_key": "experiment_7", "pass_kwargs": False},
]

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

    # Execute Experiments from Registry
    import importlib
    import inspect
    
    for exp in EXPERIMENT_REGISTRY:
        if run_all or any(k in run_args for k in exp["keys"]):
            print(f"\n--- {exp['name']} ---")
            mod = importlib.import_module(exp["module"])
            func = getattr(mod, exp["func"])
            
            if exp["pass_kwargs"]:
                sig = inspect.signature(func)
                filtered_kwargs = {k: v for k, v in default_kwargs.items() if k in sig.parameters or any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values())}
                result = func(zeros, **filtered_kwargs)
            else:
                result = func(zeros)
                
            data[exp["out_key"]] = result
            
    # Save Merged Results
    # Run the automated verification checks!
    data = run_verification(data)

    # Save Merged Results
    save_results(data)
    print(f"\nEngine Finished in {time.time() - t0:.2f}s.")

if __name__ == "__main__":
    main()

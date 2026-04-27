import argparse
import glob
import hashlib
import importlib
import inspect
import json
import os
import sys
import time
import multiprocessing

import riemann_math
from riemann_math import (
    ZERO_COUNT,
    get_last_prime_source_info,
    get_last_zero_source_info,
    get_zeros,
    load_or_init_results,
    save_results,
)
from verifier import run_verification

# Schema version of public/experiments.json.
# Bump when adding/removing/renaming top-level fields or the summary structure.
# Verifier refuses to grade artifacts with a mismatched version.
SCHEMA_VERSION = "2026.05.0"
RUN_EVENT_PREFIX = os.getenv("RIEMANN_RUN_EVENT_PREFIX", "@@RUN_EVENT@@")

EXPERIMENT_REGISTRY = [
    {"keys": ["0", "exp0", "exp_0", "zeta-0", "polar", "polar-trace"], "module": "run_exp0", "func": "run_experiment_0", "name": "ZETA-0: Critical Line Polar Trace", "out_key": "experiment_0", "pass_kwargs": True},
    {"keys": ["1", "exp1", "exp_1", "core-1", "harmonic", "harmonic-converter", "converter"], "module": "run_exp1", "func": "run_experiment_1", "name": "CORE-1: Harmonic Converter", "out_key": "experiment_1", "pass_kwargs": True},
    {"keys": ["1b", "exp1b", "exp_1b", "ctrl-1", "operator-control", "operator-scaling-control"], "module": "run_exp1", "func": "run_experiment_1b", "name": "CTRL-1: Operator Scaling Control", "out_key": "experiment_1b", "pass_kwargs": True},
    {"keys": ["1c", "exp1c", "exp_1c", "note-1", "zero-reuse", "zero-reuse-note"], "module": "run_exp1", "func": "run_experiment_1c", "name": "NOTE-1: Zero-Reuse Note", "out_key": "experiment_1c", "pass_kwargs": True},
    {"keys": ["2", "exp2", "exp_2", "p2-1", "rogue-centrifuge"], "module": "run_exp2", "func": "run_experiment_2", "name": "P2-1: Rogue Centrifuge", "out_key": "experiment_2", "pass_kwargs": True},
    {"keys": ["2b", "exp2b", "exp_2b", "p2-2", "rogue-isolation"], "module": "run_exp2", "func": "run_experiment_2b", "name": "P2-2: Rogue Isolation", "out_key": "experiment_2b", "pass_kwargs": True},
    {"keys": ["3", "exp3", "exp_3", "ctrl-2", "beta-control", "beta-counterfactual"], "module": "run_exp3", "func": "run_experiment_3", "name": "CTRL-2: Beta Counterfactual Control", "out_key": "experiment_3", "pass_kwargs": True},
    {"keys": ["4", "exp4", "exp_4", "path-1", "translation-dilation"], "module": "run_exp4", "func": "run_experiment_4", "name": "PATH-1: Translation vs Dilation", "out_key": "experiment_4", "pass_kwargs": True},
    {"keys": ["5", "exp5", "exp_5", "path-2", "zero-correspondence"], "module": "run_exp5", "func": "run_experiment_5", "name": "PATH-2: Zero Correspondence", "out_key": "experiment_5", "pass_kwargs": True},
    {"keys": ["6", "exp6", "exp_6", "val-1", "beta-stability", "beta-validation"], "module": "run_exp6", "func": "run_experiment_6", "name": "VAL-1: Beta Stability", "out_key": "experiment_6", "pass_kwargs": True},
    {"keys": ["7", "exp7", "exp_7", "p2-3", "calibrated-amplification"], "module": "run_exp7", "func": "run_experiment_7", "name": "P2-3: Calibrated Amplification", "out_key": "experiment_7", "pass_kwargs": True},
    {"keys": ["8", "exp8", "exp_8", "reg-1", "scaled-zeta-regression"], "module": "run_exp8", "func": "run_experiment_8", "name": "REG-1: Scaled-Zeta Regression", "out_key": "experiment_8", "pass_kwargs": True},
    {"keys": ["9", "exp9", "exp_9", "demo-1", "bounded-view"], "module": "run_exp9", "func": "run_experiment_9", "name": "DEMO-1: Bounded View", "out_key": "experiment_9", "pass_kwargs": True},
    {"keys": ["10", "exp10", "exp_10", "trans-1", "transport", "zeta-transport"], "module": "run_exp10", "func": "run_experiment_10", "name": "TRANS-1: Zeta Gauge Transport", "out_key": "experiment_10", "pass_kwargs": True},
]


def emit_run_event(
    enabled,
    kind="PY_EVENT",
    phase=None,
    state=None,
    message=None,
    current_experiment=None,
    completed_units=None,
    total_units=None,
    percent=None,
    eta_seconds=None,
    payload=None,
):
    if not enabled:
        return
    event = {"kind": kind}
    if phase is not None:
        event["phase"] = phase
    if state is not None:
        event["state"] = state
    if message is not None:
        event["message"] = message
    if current_experiment is not None:
        event["current_experiment"] = current_experiment
    if completed_units is not None:
        event["completed_units"] = int(completed_units)
    if total_units is not None:
        event["total_units"] = int(total_units)
    if percent is not None:
        event["percent"] = float(percent)
    if eta_seconds is not None:
        event["eta_seconds"] = float(eta_seconds)
    if payload is not None:
        event["payload"] = payload
    print(f"{RUN_EVENT_PREFIX}{json.dumps(event, separators=(',', ':'))}", flush=True)


def hash_jsonable(payload):
    raw = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def compat_number(value):
    if value is None:
        return None
    out = float(value)
    if out.is_integer():
        return int(out)
    return out


def load_checkpoint(path):
    if not path or not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_checkpoint(path, checkpoint):
    if not path:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(checkpoint, f, indent=2, sort_keys=True)


def main():
    parser = argparse.ArgumentParser(description="Riemann Research Engine CLI")
    parser.add_argument(
        "--run",
        type=str,
        default="all",
        help="Experiment(s) to run: stable ids (1,1b,...), display aliases (core-1,ctrl-1,val-1,...), or all",
    )
    parser.add_argument("--quick", action="store_true", help="Run in fast mode with fewer zeros and points")
    parser.add_argument("--zero-source", type=str, default="generated", help="Source of zeros: 'generated' or 'file:<path>'")
    parser.add_argument("--zero-count", type=int, default=ZERO_COUNT, help="Overridden number of zeros")
    parser.add_argument("--dps", type=int, default=50, help="Decimal precision")
    parser.add_argument("--resolution", type=int, default=500, help="Number of points to plot")
    parser.add_argument("--x-start", type=float, default=None, help="Start of X range")
    parser.add_argument("--x-end", type=float, default=None, help="End of X range")
    parser.add_argument("--beta-offset", type=float, default=0.0001, help="Beta perturbation amount (for Exp 2/7)")
    parser.add_argument("--k-power", type=int, default=-20, help="Exponent of tau (k) for deep zoom (for Exp 2/7)")
    parser.add_argument("--k-values", type=str, default="0,1,2", help="k-values for Exp 8 (comma-separated, e.g. -2,-1,0,1,2)")
    parser.add_argument("--n-test", type=int, default=500, help="Number of zeros to evaluate in Exp 8")
    parser.add_argument("--allow-corrupt-zero-cache", action="store_true", help="Allow non-monotonic zeros.dat for generated source (not recommended)")
    parser.add_argument("--workers", type=int, default=None, help="Worker count for per-point parallel evaluation (default: max(1, cpu_count-1))")
    parser.add_argument("--prime-min-count", type=int, default=0, help="Minimum number of primes required from source")
    parser.add_argument("--prime-target-count", type=int, default=0, help="Target number of primes to preload from source")
    parser.add_argument("--no-verify", action="store_true", help="Skip inline verification; run `python verifier.py` separately to grade (recommended for reviewer-reproducible runs)")
    parser.add_argument("--emit-run-events", action="store_true", help="Emit structured run events for orchestration/status pipelines")
    parser.add_argument("--checkpoint-out", type=str, default=None, help="Path to checkpoint JSON file")
    parser.add_argument("--resume-checkpoint", type=str, default=None, help="Resume/validate against an existing checkpoint JSON file")
    parser.add_argument("--skip-unchanged", action="store_true", help="Skip unchanged experiments when checkpoint cache keys match")
    args = parser.parse_args()

    cpu_count = multiprocessing.cpu_count() if multiprocessing.cpu_count() else 1
    auto_workers = max(1, int(cpu_count) - 1)
    effective_workers = auto_workers if args.workers is None else max(1, int(args.workers))

    t0 = time.time()

    phase_started = {}

    def phase_start(phase, message, percent=None, payload=None):
        phase_started[phase] = time.time()
        emit_run_event(
            args.emit_run_events,
            kind="PHASE",
            phase=phase,
            state="start",
            message=message,
            percent=percent,
            payload=payload,
        )

    def phase_done(phase, message, percent=None, payload=None):
        duration = time.time() - phase_started.get(phase, time.time())
        out_payload = dict(payload or {})
        out_payload["phase_duration_seconds"] = duration
        emit_run_event(
            args.emit_run_events,
            kind="PHASE",
            phase=phase,
            state="done",
            message=message,
            percent=percent,
            payload=out_payload,
        )

    phase_start("PRECHECK", "Initializing Experiment Engine", percent=0)
    emit_run_event(
        args.emit_run_events,
        kind="CONFIG",
        phase="PRECHECK",
        state="run_config",
        message="Run configuration resolved",
        payload={
            "workers": int(effective_workers),
            "prime_min_count": int(args.prime_min_count),
            "prime_target_count": int(args.prime_target_count),
            "cpu_count": int(cpu_count),
        },
    )

    # Configure Math Engine
    riemann_math.configure(
        dps=args.dps,
        zero_count=args.zero_count,
        prime_min_count=args.prime_min_count,
        prime_target_count=args.prime_target_count,
    )

    # Apply Quick Mode Overrides
    if args.quick:
        print(" [WARN] RUNNING IN QUICK MODE (Reduced Precision/Count)")
        riemann_math.configure(
            dps=30,
            zero_count=100,
            prime_min_count=args.prime_min_count,
            prime_target_count=args.prime_target_count,
        )

    print("Initialize Experiment Engine...")
    phase_done(
        "PRECHECK",
        "Precheck complete",
        percent=2,
        payload={
            "dps": riemann_math.PRECISION,
            "zero_count": riemann_math.ZERO_COUNT,
            "workers": int(effective_workers),
            "prime_min_count": int(args.prime_min_count),
            "prime_target_count": int(args.prime_target_count),
        },
    )

    phase_start("ZERO_LOAD", "Loading/generated zeros", percent=2)

    def zero_progress_callback(completed, total, message=None, payload=None):
        if not total:
            return
        fraction = max(0.0, min(1.0, float(completed) / float(total)))
        percent = 2 + (13 * fraction)
        emit_run_event(
            args.emit_run_events,
            kind="PROGRESS",
            phase="ZERO_LOAD",
            state="heartbeat",
            message=message or "zero load",
            completed_units=int(completed),
            total_units=int(total),
            percent=percent,
            payload=payload,
        )

    zeros = get_zeros(
        riemann_math.ZERO_COUNT,
        source=args.zero_source,
        allow_corrupt_cache=args.allow_corrupt_zero_cache,
        progress_callback=zero_progress_callback if args.emit_run_events else None,
    )
    if not zeros:
        raise ValueError(
            "No zeros were loaded. Check --zero-source path/format and try again. "
            f"(source='{args.zero_source}')"
        )
    phase_done(
        "ZERO_LOAD",
        "Zero load complete",
        percent=15,
        payload={"loaded_zeros": len(zeros)},
    )

    # Load Existing Data (to preserve other experiments if running partial)
    data = load_or_init_results()

    # Step 0: Generate Code Fingerprint
    print("Generating code fingerprints...")
    fingerprints = {}
    files_to_hash = glob.glob("run_exp*.py") + ["riemann_math.py", "experiment_engine.py", "verifier.py"]
    for fname in files_to_hash:
        try:
            with open(fname, "rb") as f:
                fingerprints[fname] = hashlib.md5(f.read()).hexdigest()
        except FileNotFoundError:
            print(f"  > Warning: Could not find {fname} for hashing.")

    if "meta" not in data:
        data["meta"] = {}
    data["meta"]["code_fingerprint"] = fingerprints
    data["meta"]["zero_source_info"] = get_last_zero_source_info()
    data["meta"]["prime_source_info"] = get_last_prime_source_info()
    data["meta"]["run_config"] = {
        "workers": int(effective_workers),
        "prime_min_count": int(args.prime_min_count),
        "prime_target_count": int(args.prime_target_count),
    }
    data["meta"]["schema_version"] = SCHEMA_VERSION
    data["meta"]["reproducibility_instructions"] = (
        f"python experiment_engine.py {' '.join(sys.argv[1:])}  "
        f"[dps={args.dps}, zero_source={args.zero_source}, zero_count={riemann_math.ZERO_COUNT}, "
        f"workers={effective_workers}, prime_min_count={args.prime_min_count}, "
        f"prime_target_count={args.prime_target_count}]"
    )

    # Parse Run Arguments (support comma-separated lists)
    run_args = [x.strip().lower() for x in args.run.split(",")]
    run_all = "all" in run_args
    selected_experiments = [
        exp for exp in EXPERIMENT_REGISTRY if run_all or any(k in run_args for k in exp["keys"])
    ]

    # Prepare kwargs for Experiments
    default_kwargs = {}
    if args.resolution:
        default_kwargs["resolution"] = args.resolution
    if args.x_start is not None:
        default_kwargs["x_start"] = float(args.x_start)
    if args.x_end is not None:
        default_kwargs["x_end"] = float(args.x_end)
    default_kwargs["beta_offset"] = float(args.beta_offset)
    default_kwargs["k_power"] = int(args.k_power)
    default_kwargs["k_values"] = args.k_values
    default_kwargs["n_test"] = int(args.n_test)
    default_kwargs["dps"] = int(args.dps)
    default_kwargs["workers"] = int(effective_workers)
    default_kwargs["prime_min_count"] = int(args.prime_min_count)
    default_kwargs["prime_target_count"] = int(args.prime_target_count)

    checkpoint_path = args.checkpoint_out or args.resume_checkpoint
    resume_checkpoint = load_checkpoint(args.resume_checkpoint) if args.resume_checkpoint else None
    run_compat_payload = {
        "schema_version": SCHEMA_VERSION,
        "run": args.run,
        "quick": bool(args.quick),
        "zero_source": args.zero_source,
        "zero_count": int(riemann_math.ZERO_COUNT),
        "dps": int(riemann_math.PRECISION),
        "resolution": int(args.resolution),
        "x_start": compat_number(args.x_start),
        "x_end": compat_number(args.x_end),
        "beta_offset": float(args.beta_offset),
        "k_power": int(args.k_power),
        "k_values": str(args.k_values),
        "n_test": int(args.n_test),
        "workers": int(effective_workers),
        "prime_min_count": int(args.prime_min_count),
        "prime_target_count": int(args.prime_target_count),
    }
    run_compat_hash = hash_jsonable(run_compat_payload)
    if resume_checkpoint:
        if resume_checkpoint.get("schema_version") != SCHEMA_VERSION:
            raise ValueError("Resume checkpoint schema mismatch.")
        if resume_checkpoint.get("compatibility_hash") != run_compat_hash:
            raise ValueError("Resume checkpoint is not compatible with current run settings.")

    canonical_mode = os.getenv("RIEMANN_CANONICAL_MODE", args.run)

    checkpoint = resume_checkpoint or {
        "version": 1,
        "schema_version": SCHEMA_VERSION,
        "mode": canonical_mode,
        "compatibility_hash": run_compat_hash,
        "config": run_compat_payload,
        "experiments": {},
        "verification": {"completed": False},
        "performance": {"phase_durations_seconds": {}},
    }
    checkpoint["mode"] = canonical_mode
    checkpoint["compatibility_hash"] = run_compat_hash
    checkpoint["config"] = run_compat_payload
    run_id = os.getenv("RIEMANN_RUN_ID")

    def set_partial_run_meta(active, current_experiment=None):
        meta = data.setdefault("meta", {})
        if active:
            meta["partial_run"] = {
                "active": True,
                "mode": canonical_mode,
                "run_id": run_id,
                "current_experiment": current_experiment,
                "completed_experiments": sorted(list(checkpoint.get("experiments", {}).keys())),
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "verification_completed": bool(checkpoint.get("verification", {}).get("completed")),
            }
        else:
            meta.pop("partial_run", None)

    phase_start(
        "EXPERIMENT_LOOP",
        "Executing experiment loop",
        percent=15,
        payload={"selected": [exp["out_key"] for exp in selected_experiments]},
    )

    skipped_count = 0
    total_experiments = max(1, len(selected_experiments))

    for idx, exp in enumerate(selected_experiments, start=1):
        exp_out_key = exp["out_key"]
        exp_name = exp["name"]
        print(f"\n--- {exp_name} ---")

        mod = importlib.import_module(exp["module"])
        func = getattr(mod, exp["func"])
        sig = inspect.signature(func)
        supports_var_kw = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values())
        filtered_kwargs = {}
        if exp["pass_kwargs"]:
            filtered_kwargs = {
                k: v for k, v in default_kwargs.items()
                if k in sig.parameters or supports_var_kw
            }

        exp_cache_payload = {
            "exp_out_key": exp_out_key,
            "func": exp["func"],
            "module": exp["module"],
            "kwargs": filtered_kwargs,
            "code_fingerprint": fingerprints,
            "zero_source_info": data["meta"].get("zero_source_info", {}),
            "run_compatibility_hash": run_compat_hash,
        }
        exp_cache_key = hash_jsonable(exp_cache_payload)
        checkpoint_entry = checkpoint.get("experiments", {}).get(exp_out_key, {})
        should_skip = (
            args.skip_unchanged
            and checkpoint_entry.get("cache_key") == exp_cache_key
            and exp_out_key in data
        )

        if should_skip:
            skipped_count += 1
            completed_fraction = idx / total_experiments
            overall_percent = 15 + 65 * completed_fraction
            emit_run_event(
                args.emit_run_events,
                kind="CHECKPOINT",
                phase="EXPERIMENT_LOOP",
                state="skip_unchanged",
                message=f"Skipping unchanged {exp_out_key}",
                current_experiment=exp_out_key,
                completed_units=idx * 100,
                total_units=total_experiments * 100,
                percent=overall_percent,
                payload={"cache_key": exp_cache_key},
            )
            continue

        emit_run_event(
            args.emit_run_events,
            kind="PROGRESS",
            phase="EXPERIMENT_LOOP",
            state="start_experiment",
            message=f"Starting {exp_out_key}",
            current_experiment=exp_out_key,
            completed_units=(idx - 1) * 100,
            total_units=total_experiments * 100,
            percent=15 + (65 * ((idx - 1) / total_experiments)),
        )

        exp_started = time.time()

        def exp_progress_callback(completed, total, message=None, payload=None):
            if not total:
                return
            inner_fraction = max(0.0, min(1.0, float(completed) / float(total)))
            aggregate_fraction = ((idx - 1) + inner_fraction) / total_experiments
            overall_percent = 15 + (65 * aggregate_fraction)
            emit_run_event(
                args.emit_run_events,
                kind="PROGRESS",
                phase="EXPERIMENT_LOOP",
                state="heartbeat",
                message=message or f"{exp_out_key} progress",
                current_experiment=exp_out_key,
                completed_units=((idx - 1) * 100) + int(inner_fraction * 100),
                total_units=total_experiments * 100,
                percent=overall_percent,
                payload=payload,
            )

        if exp["pass_kwargs"]:
            if "progress_callback" in sig.parameters or supports_var_kw:
                filtered_kwargs["progress_callback"] = exp_progress_callback
            result = func(zeros, **filtered_kwargs)
        else:
            result = func(zeros)

        data[exp_out_key] = result
        duration = time.time() - exp_started
        checkpoint.setdefault("experiments", {})[exp_out_key] = {
            "cache_key": exp_cache_key,
            "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "duration_seconds": duration,
        }
        save_checkpoint(checkpoint_path, checkpoint)
        set_partial_run_meta(True, exp_out_key)
        save_results(data)

        completed_fraction = idx / total_experiments
        overall_percent = 15 + 65 * completed_fraction
        emit_run_event(
            args.emit_run_events,
            kind="PROGRESS",
            phase="EXPERIMENT_LOOP",
            state="done_experiment",
            message=f"Completed {exp_out_key}",
            current_experiment=exp_out_key,
            completed_units=idx * 100,
            total_units=total_experiments * 100,
            percent=overall_percent,
            payload={
                "duration_seconds": duration,
                "partial_artifact_updated": True,
                "prime_source_info": get_last_prime_source_info(),
            },
        )

    phase_done(
        "EXPERIMENT_LOOP",
        "Experiment loop complete",
        percent=80,
        payload={"skipped_experiments": skipped_count, "total_experiments": len(selected_experiments)},
    )
    data.setdefault("meta", {})["prime_source_info"] = get_last_prime_source_info()
    emit_run_event(
        args.emit_run_events,
        kind="RESOURCE",
        phase="EXPERIMENT_LOOP",
        state="prime_telemetry",
        message="Prime loader telemetry",
        percent=80,
        payload={"prime_source_info": get_last_prime_source_info()},
    )

    # Verification is now decoupled: --no-verify produces a raw-data artifact
    # that a reviewer can grade independently via `python verifier.py`.
    should_skip_verify = (
        args.skip_unchanged
        and not args.no_verify
        and skipped_count == len(selected_experiments)
        and checkpoint.get("verification", {}).get("completed")
        and data.get("summary")
    )

    if not args.no_verify and not should_skip_verify:
        phase_start("VERIFY", "Running verifier", percent=80)

        def verify_progress_callback(completed, total, message=None, payload=None):
            if not total:
                return
            fraction = max(0.0, min(1.0, float(completed) / float(total)))
            percent = 80 + (15 * fraction)
            emit_run_event(
                args.emit_run_events,
                kind="PROGRESS",
                phase="VERIFY",
                state="heartbeat",
                message=message or "verifier progress",
                completed_units=int(completed),
                total_units=int(total),
                percent=percent,
                payload=payload,
            )

        data = run_verification(
            data,
            progress_callback=verify_progress_callback if args.emit_run_events else None,
        )
        checkpoint["verification"] = {
            "completed": True,
            "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        set_partial_run_meta(False)
        save_checkpoint(checkpoint_path, checkpoint)
        phase_done("VERIFY", "Verifier complete", percent=95)
    elif should_skip_verify:
        emit_run_event(
            args.emit_run_events,
            kind="CHECKPOINT",
            phase="VERIFY",
            state="skip_unchanged",
            message="Skipping verifier (unchanged run + existing graded summary)",
            percent=95,
        )
    else:
        # Clear any stale summary so the artifact is unambiguously un-graded.
        data.pop("summary", None)
        checkpoint["verification"] = {"completed": False}
        set_partial_run_meta(False)
        save_checkpoint(checkpoint_path, checkpoint)
        print("  [INFO] Skipping inline verification. Run `python verifier.py` to grade.")

    phase_start("ARTIFACT_WRITE", "Writing artifacts", percent=95)
    set_partial_run_meta(False)
    save_results(data)
    phase_done("ARTIFACT_WRITE", "Artifact write complete", percent=99)

    elapsed = time.time() - t0
    emit_run_event(
        args.emit_run_events,
        kind="PHASE",
        phase="DONE",
        state="done",
        message="Engine completed",
        percent=100,
        payload={"elapsed_seconds": elapsed},
    )
    print(f"\nEngine Finished in {elapsed:.2f}s.")


if __name__ == "__main__":
    main()

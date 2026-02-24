import json
import os
import math

OUTPUT_FILE = "dashboard/public/experiments.json"

def run_verification(data=None):
    if data is None:
        if not os.path.exists(OUTPUT_FILE):
            print(" [NO] Data file not found. Run the engine first.")
            return None
        with open(OUTPUT_FILE, "r") as f:
            data = json.load(f)

    print("\n" + "="*75)
    print(" [VERIFIER] AUTOMATED HYPOTHESIS VERIFIER (SCHEMA V2) ")
    print("="*75)

    summary = {
        "engine_status": "OK",
        "overall": "PASS",
        "experiments": {}
    }
    
    overall_pass = True
    
    def log_result(exp_id, type_str, status, metric_summary, interpretation):
        nonlocal overall_pass
        print(f"\n[{exp_id}] {type_str}: {status}") 
        print(f"  > Metrics: {metric_summary}")
        print(f"  > Interpretation: {interpretation}")
        
        summary["experiments"][exp_id] = {
            "type": type_str,
            "status": status,
            "metrics": metric_summary,
            "interpretation": interpretation
        }
        
        if status == "FAIL" and type_str != "FALSIFICATION_CONTROL":
            overall_pass = False

    # =========================================================================
    # EXP 1: COORDINATE GAUGE (Isometry) -> VALIDATION
    # =========================================================================
    exp1 = data.get("experiment_1", {})
    if "0" in exp1:
        max_drift = 0.0
        scales_analyzed = []
        k0_data = exp1["0"]
        
        for k_str, k_data in exp1.items():
            if k_str == "0": continue
            scales_analyzed.append(k_str)
            if len(k0_data) == len(k_data):
                for p0, pk in zip(k0_data, k_data):
                    drift = abs(p0["y_rec"] - pk["y_rec"])
                    if drift > max_drift: max_drift = drift
        
        # Verdict
        if max_drift < 1e-9:
            status = "PASS"
            interp = "Strict geometric isometry confirmed. Coordinate scaling works as expected."
        else:
            status = "FAIL"
            interp = "Gauge symmetry broken. Coordinate scaling failed to match baseline."
            
        log_result("EXP_1", "VALIDATION", status, {"max_drift": max_drift}, interp)
    else:
        log_result("EXP_1", "VALIDATION", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 1B: OPERATOR GAUGE (Falsification) -> FALSIFICATION_CONTROL
    # =========================================================================
    exp1b = data.get("experiment_1b", {}).get("variants", {})
    if "gamma_scaled" in exp1b:
        base = exp1b["gamma_scaled"].get("0", [])
        max_drift = 0.0
        for k, pts in exp1b["gamma_scaled"].items():
            if k == "0": continue
            for p_base, p_k in zip(base, pts):
                drift = abs(p_base["y_rec"] - p_k["y_rec"])
                max_drift = max(max_drift, drift)
                
        if max_drift > 1.0:
            status = "PASS"
            interp = "System broke as expected under naive gamma scaling."
        else:
            status = "FAIL"
            interp = "Control failed: Naive gamma scaling weirdly matched baseline."
            
        log_result("EXP_1B", "FALSIFICATION_CONTROL", status, {"max_drift": max_drift}, interp)
    else:
        log_result("EXP_1B", "FALSIFICATION_CONTROL", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 2: CENTRIFUGE (Stress Test) -> VALIDATION / HYPOTHESIS
    # =========================================================================
    # Only if present (might be superseded by Exp 7)
    exp2 = data.get("experiment_2", {})
    if "2A" in exp2 and "2B" in exp2:
         # Simplified check
         max_rogue = max(pt["error"] for pt in exp2["2B"])
         max_clean = max(pt["error"] for pt in exp2["2A"])
         amp = max_rogue / (max_clean if max_clean > 0 else 1)
         
         if amp > 1.001:
             status = "PASS"
             interp = "Rogue zero signal detected."
         else:
             status = "FAIL"
             interp = "No signal amplification."
         log_result("EXP_2", "VALIDATION", status, {"amp": amp}, interp)

    # =========================================================================
    # EXP 3: FALSIFICATION (Beta=Pi) -> FALSIFICATION_CONTROL
    # =========================================================================
    exp3 = data.get("experiment_3", {})
    if "3B" in exp3 and "TruePi" in exp3:
        pi_err = max(abs(b["y"] - t["y"]) for b, t in zip(exp3["3B"], exp3["TruePi"]))
        if pi_err > 1000.0:
            status = "PASS"
            interp = "Beta=Pi hypothesis exploded to infinity as expected."
        else:
            status = "FAIL"
            interp = "Beta=Pi did not diverge enough."
        log_result("EXP_3", "FALSIFICATION_CONTROL", status, {"max_error": pi_err}, interp)

    # =========================================================================
    # EXP 4: TRANSLATION VS DILATION -> HYPOTHESIS_TEST
    # =========================================================================
    exp4 = data.get("experiment_4", {})
    if exp4:
        # Check K=1
        if "1" in exp4:
            row = exp4["1"]
            winner = row["winner"]
            rmse_ratio = row["rmse_dil"] / (row["rmse_trans"] + 1e-9)
            
            if winner == "TRANSLATION":
                if row["delta_error"] < 0.05:
                     status = "PASS"
                     interp = "Data overwhelmingly supports Log-Translation (Coordinate Effect). No operator scaling detected."
                else:
                     status = "WARN"
                     interp = "Favors Translation, but delta error is high."
            else:
                status = "FAIL" # OR PASS if we WANTED operator scaling? 
                # Prompt: "PASS ... only if coordinate-only model fits itself (sanity) ... otherwise it's evidence ... (of operator)"
                # Actually, Exp 4 is a disambiguation.
                # If it's Translation, it means "Just coordinate shift".
                # If it's Dilation, it means "Operator effect".
                # User Prompt: "Exp4 must clearly show translation vs dilation are different".
                interp = "Data supports Dilation (Operator Scaling). This would be a major discovery."
                
            log_result("EXP_4", "HYPOTHESIS_TEST", status, 
                       {"winner": winner, "delta_err": row["delta_error"], "ratio": rmse_ratio}, 
                       interp)
    else:
        log_result("EXP_4", "HYPOTHESIS_TEST", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 5: ZERO CORRESPONDENCE -> HYPOTHESIS_TEST
    # =========================================================================
    exp5 = data.get("experiment_5", {})
    if exp5:
        # Check K=1
        if "1" in exp5:
            row = exp5["1"]
            median_z = row.get("median_z", 1.0)
            
            if median_z < 0.1:
                status = "PASS"
                interp = "STRONG EVIDENCE: Scaled zeros map directly to existing zeros (Lattice Property)."
            elif median_z < 0.25:
                status = "WARN"
                interp = "Weak evidence of correspondence."
            else:
                status = "FAIL"
                interp = "No correspondence. Scaled zeros land randomly between existing zeros."
                
            log_result("EXP_5", "HYPOTHESIS_TEST", status, {"median_z": median_z}, interp)
    else:
        log_result("EXP_5", "HYPOTHESIS_TEST", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 6: CRITICAL LINE DRIFT -> HYPOTHESIS_TEST
    # =========================================================================
    exp6 = data.get("experiment_6", {})
    if exp6:
        if "1" in exp6:
            row = exp6["1"]
            beta = row.get("beta_hat", 0.5)
            drift = abs(beta - 0.5)
            
            if drift < 0.005:
                status = "PASS"
                interp = "Critical line is stable at Beta=0.5 under scaling."
            else:
                status = "FAIL"
                interp = f"Drift detected! Beta prefers {beta:.4f}."
                
            log_result("EXP_6", "HYPOTHESIS_TEST", status, {"beta_hat": beta, "drift": drift}, interp)
    else:
        log_result("EXP_6", "HYPOTHESIS_TEST", "SKIP", {}, "Missing Data")
        
    # =========================================================================
    # EXP 7: CENTRIFUGE FIX -> VALIDATION
    # =========================================================================
    exp7 = data.get("experiment_7", {})
    if "calibrated" in exp7:
        calib = exp7["calibrated"]
        # Check monotonicity: A(eps) should increase with eps
        amps = [c["max_amp"] for c in calib]
        is_monotone = all(x < y for x, y in zip(amps, amps[1:]))
        
        if is_monotone:
            status = "PASS"
            interp = "Sensitivity confirmed. Rogue signal amplifies monotonically with perturbation."
        else:
            status = "FAIL"
            interp = "Sensitivity test failed. Signal is not monotonic."
            
        log_result("EXP_7", "VALIDATION", status, {"monotone": is_monotone, "amps": amps}, interp)
    else:
        log_result("EXP_7", "VALIDATION", "SKIP", {}, "Missing Data")

    # Finalize
    summary["overall"] = "PASS" if overall_pass else "FAIL"
    data["summary"] = summary
    
    # Save back? Rely on verify.py consumer to save or just return data
    # The engine calls this and then saves.
    return data

if __name__ == "__main__":
    # Standalone run
    d = run_verification()
    if d:
        with open(OUTPUT_FILE, "w") as f:
            json.dump(d, f, indent=2)

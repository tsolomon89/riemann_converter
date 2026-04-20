import json
import os
import math
import datetime

OUTPUT_FILE = "dashboard/public/experiments.json"
HISTORY_FILE = "dashboard/public/verdict_history.jsonl"

# Must match experiment_engine.SCHEMA_VERSION. Bump in both places when the
# artifact shape changes (top-level keys, summary shape, stage names, etc.).
EXPECTED_SCHEMA_VERSION = "2026.05.0"

# Fidelity tiers — declared floor for theory-centric grading.
#
# Problem these solve: at low zero counts / low precision, numerical artifacts
# (e.g. EXP_6's beta optimizer stabilizing at ~0.43 when N=100) produce
# mechanical REFUTES that have to be explained away post-hoc. Principled fix:
# the verifier refuses to translate mechanical outcomes into theory_fit
# verdicts below a declared floor.
#
# Policy (hard clamp):
#   SMOKE tier:         ENABLER / DETECTOR theory_fits clamped to INCONCLUSIVE
#   STANDARD tier:      ENABLER theory_fits retained but tagged `provisional`
#   AUTHORITATIVE tier: unchanged
#
# FALSIFICATION_CONTROL (EXP_1B, EXP_3) and PATHFINDER (EXP_4, EXP_5) are
# NEVER clamped: controls must diverge regardless of N; pathfinders compare
# two models on the same data, so noise affects both equally.
FIDELITY_SMOKE_MAX_ZEROS = 500
FIDELITY_STANDARD_MAX_ZEROS = 10000
FIDELITY_MIN_DPS = 35
FIDELITY_AUTHORITATIVE_MIN_DPS = 50


def compute_fidelity_tier(zeros, dps):
    """Return one of "SMOKE", "STANDARD", "AUTHORITATIVE" based on zero
    count and dps. Missing/non-numeric values degrade conservatively to SMOKE.
    """
    try:
        z = int(zeros)
    except (TypeError, ValueError):
        return "SMOKE"
    try:
        d = float(dps)
    except (TypeError, ValueError):
        return "SMOKE"
    if z < FIDELITY_SMOKE_MAX_ZEROS or d < FIDELITY_MIN_DPS:
        return "SMOKE"
    if z < FIDELITY_STANDARD_MAX_ZEROS or d < FIDELITY_AUTHORITATIVE_MIN_DPS:
        return "STANDARD"
    return "AUTHORITATIVE"

# Theory stage for each experiment. Tracks the Gauge -> Lattice -> Brittleness
# ordering of the three-stage conjecture. "control" is the global falsification
# sanity check (Exp 3) plus the operator-gauge falsification (Exp 1B).
STAGE_MAP = {
    "EXP_1":  "gauge",
    "EXP_1B": "gauge",        # operator-gauge falsification belongs with Gauge
    "EXP_6":  "gauge",        # beta-stability under scaling = gauge invariance consequence
    "EXP_1C": "lattice",
    "EXP_4":  "lattice",      # translation vs dilation disambiguation
    "EXP_5":  "lattice",      # scaled zeros vs true zeros correspondence
    "EXP_8":  "lattice",      # scaled-zeta zero equivalence
    "EXP_2":  "brittleness",
    "EXP_2B": "brittleness",
    "EXP_7":  "brittleness",
    "EXP_3":  "control",
}

# Control-type verdicts (falsification experiments) don't count toward their
# stage's pass/fail rollup because their PASS means "the counter-test failed
# as expected". They're reported separately.
_CONTROL_TYPES = {"FALSIFICATION_CONTROL"}


# Role of each experiment in the theory chain (orthogonal to `stage`).
#
# ENABLER              - establishes a premise in the conformality ->
#                        compression -> RH-contradiction chain. Its PASS
#                        unlocks a step. Its FAIL blocks that step.
# PATHFINDER           - disambiguates a mechanism or labels a direction.
#                        A decisive outcome is informative (INFORMATIVE)
#                        regardless of which branch wins; it's not pass/fail.
# DETECTOR             - verifies the rogue-zero detection machinery works.
#                        PASS = detector armed.
# FALSIFICATION_CONTROL - sanity check that the system can fail on
#                        known-bad data.
ROLE_MAP = {
    "EXP_1":  "ENABLER",
    "EXP_1B": "FALSIFICATION_CONTROL",
    "EXP_1C": "ENABLER",
    "EXP_2":  "DETECTOR",
    "EXP_2B": "DETECTOR",
    "EXP_3":  "FALSIFICATION_CONTROL",
    "EXP_4":  "PATHFINDER",
    "EXP_5":  "PATHFINDER",
    "EXP_6":  "ENABLER",
    "EXP_7":  "DETECTOR",
    "EXP_8":  "ENABLER",
}


# Mechanical status -> theory-fit translation.
#
# The mechanical `status` (PASS/FAIL/NOTEWORTHY/SKIP/...) only tells you whether
# a numeric threshold was crossed. `theory_fit` answers the question that
# actually matters for this project: does this experiment's outcome SUPPORT or
# REFUTE (or INFORM) the Gauge -> Lattice -> Brittleness conjecture?
#
# Polarity rules:
#   FALSIFICATION_CONTROL: PASS -> SUPPORTS, FAIL -> CONTROL_BROKEN
#     (the decoy is *supposed* to blow up; if it doesn't, the discriminator is
#      dead, which is theory-refuting in a serious way)
#   PATHFINDER: any decisive outcome -> INFORMATIVE
#     (EXP_4 TRANSLATION win, EXP_4 DILATION win, EXP_5 lattice-hit,
#      EXP_5 lattice-miss). The pathfinder's job is to *answer a direction
#      question*, not to confirm or refute the top-level theory.
#   ENABLER / DETECTOR: PASS -> SUPPORTS, FAIL -> REFUTES
#
# Values:
#   SUPPORTS         - observed outcome is what the theory predicted
#   REFUTES          - observed outcome contradicts the theory
#   CANDIDATE        - noteworthy / partial support
#   INFORMATIVE      - pathfinder answered; outcome informs next-step choice
#   CONTROL_BROKEN   - a falsification control failed to trigger (serious)
#   INCONCLUSIVE     - data insufficient to judge
def _theory_fit(status, type_str, role=None):
    if type_str == "FALSIFICATION_CONTROL" or role == "FALSIFICATION_CONTROL":
        if status == "PASS":
            return "SUPPORTS"
        if status == "FAIL":
            return "CONTROL_BROKEN"
        return "INCONCLUSIVE"
    if role == "PATHFINDER":
        if status in ("PASS", "FAIL", "NOTEWORTHY", "WARN"):
            return "INFORMATIVE"
        return "INCONCLUSIVE"
    if status == "PASS":
        return "SUPPORTS"
    if status == "FAIL":
        return "REFUTES"
    if status == "NOTEWORTHY":
        return "CANDIDATE"
    if status == "WARN":
        return "CANDIDATE"
    return "INCONCLUSIVE"


def run_verification(data=None):
    if data is None:
        if not os.path.exists(OUTPUT_FILE):
            print(" [NO] Data file not found. Run the engine first.")
            return None
        with open(OUTPUT_FILE, "r") as f:
            data = json.load(f)

    print("\n" + "="*75)
    print(f" [VERIFIER] AUTOMATED HYPOTHESIS VERIFIER (schema {EXPECTED_SCHEMA_VERSION}) ")
    print("="*75)

    observed_schema = data.get("meta", {}).get("schema_version")
    if observed_schema != EXPECTED_SCHEMA_VERSION:
        print(
            f" [SCHEMA MISMATCH] artifact declares '{observed_schema}', "
            f"verifier expects '{EXPECTED_SCHEMA_VERSION}'. Refusing to grade."
        )
        data["summary"] = {
            "engine_status": "SCHEMA_MISMATCH",
            "overall": "SKIP",
            "expected_schema_version": EXPECTED_SCHEMA_VERSION,
            "observed_schema_version": observed_schema,
            "experiments": {},
            "stage_verdicts": {},
        }
        return data

    fidelity_zeros = data.get("meta", {}).get("zeros")
    fidelity_dps = data.get("meta", {}).get("dps")
    fidelity_tier = compute_fidelity_tier(fidelity_zeros, fidelity_dps)
    print(
        f" [FIDELITY] tier={fidelity_tier}  "
        f"zeros={fidelity_zeros}  dps={fidelity_dps}"
    )

    summary = {
        "engine_status": "OK",
        "overall": "PASS",
        "schema_version": EXPECTED_SCHEMA_VERSION,
        "fidelity_tier": fidelity_tier,
        "fidelity_zeros": fidelity_zeros,
        "fidelity_dps": fidelity_dps,
        "experiments": {}
    }

    overall_pass = True

    def log_result(exp_id, type_str, status, metric_summary, interpretation):
        nonlocal overall_pass
        stage = STAGE_MAP.get(exp_id, "unknown")
        role = ROLE_MAP.get(exp_id, "UNKNOWN")
        fit = _theory_fit(status, type_str, role)

        # Fidelity-floor policy. FALSIFICATION_CONTROL and PATHFINDER are
        # fidelity-independent (see FIDELITY_* comment block above).
        provisional = False
        clamped_note = None
        if role in ("ENABLER", "DETECTOR"):
            if fidelity_tier == "SMOKE":
                if fit != "INCONCLUSIVE":
                    clamped_note = (
                        f"[SMOKE tier: theory verdict '{fit}' suppressed below declared "
                        f"fidelity floor; mechanical status '{status}' retained]"
                    )
                    fit = "INCONCLUSIVE"
            elif fidelity_tier == "STANDARD" and role == "ENABLER":
                provisional = True

        print(
            f"\n[{exp_id}] ({stage}/{role}) {type_str}: {status}  "
            f"[theory_fit={fit}{' provisional' if provisional else ''}]"
        )
        print(f"  > Metrics: {metric_summary}")
        if clamped_note:
            print(f"  > Note: {clamped_note}")
        print(f"  > Interpretation: {interpretation}")

        final_interp = (
            f"{interpretation} {clamped_note}".strip() if clamped_note else interpretation
        )

        entry = {
            "stage": stage,
            "role": role,
            "type": type_str,
            "status": status,
            "theory_fit": fit,
            "metrics": metric_summary,
            "interpretation": final_interp,
        }
        if provisional:
            entry["provisional"] = True
        summary["experiments"][exp_id] = entry

        if fit in ("REFUTES", "CONTROL_BROKEN"):
            overall_pass = False

    def is_number(x):
        return isinstance(x, (int, float)) and math.isfinite(x)

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
    # EXP 1C: ZERO SCALING (Tau-Lattice) -> HYPOTHESIS_TEST
    # Pass Condition (MATH_README):
    #   Drift <= 0.25 AND (Operator Error / Baseline Error) <= 1.10
    # =========================================================================
    exp1c = data.get("experiment_1c", {})
    if exp1c:
        drifts = []
        ratios = []
        scales_used = []

        for k, rows in exp1c.items():
            if not isinstance(rows, list) or not rows:
                continue

            max_drift_k = 0.0
            max_coord_err_k = 0.0
            max_op_err_k = 0.0
            valid_count = 0

            for row in rows:
                y_coord = row.get("y_coord")
                y_op = row.get("y_op")
                y_true = row.get("y_true")
                if not (is_number(y_coord) and is_number(y_op) and is_number(y_true)):
                    continue

                valid_count += 1
                drift = abs(y_op - y_coord)
                coord_err = abs(y_coord - y_true)
                op_err = abs(y_op - y_true)

                if drift > max_drift_k:
                    max_drift_k = drift
                if coord_err > max_coord_err_k:
                    max_coord_err_k = coord_err
                if op_err > max_op_err_k:
                    max_op_err_k = op_err

            if valid_count == 0:
                continue

            ratio_k = (max_op_err_k / max_coord_err_k) if max_coord_err_k > 0 else (1.0 if max_op_err_k == 0 else math.inf)
            drifts.append(max_drift_k)
            ratios.append(ratio_k)
            scales_used.append(k)

        if not drifts:
            log_result(
                "EXP_1C",
                "HYPOTHESIS_TEST",
                "INSUFFICIENT_DATA",
                {},
                "No valid numeric rows to evaluate drift/ratio."
            )
        else:
            worst_drift = max(drifts)
            worst_ratio = max(ratios)
            pass_drift = worst_drift <= 0.25
            pass_ratio = worst_ratio <= 1.10

            if pass_drift and pass_ratio:
                status = "PASS"
                interp = "Zero-scaling hypothesis is supported within documented drift/ratio tolerances."
            else:
                status = "FAIL"
                interp = "Zero-scaling hypothesis fails documented tolerances (drift and/or error-ratio)."

            log_result(
                "EXP_1C",
                "HYPOTHESIS_TEST",
                status,
                {
                    "max_drift": worst_drift,
                    "max_ratio_op_over_coord": worst_ratio,
                    "drift_threshold": 0.25,
                    "ratio_threshold": 1.10,
                    "scales": scales_used,
                },
                interp
            )
    else:
        log_result("EXP_1C", "HYPOTHESIS_TEST", "SKIP", {}, "Missing Data")

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
    else:
         log_result("EXP_2", "VALIDATION", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 2B: ROGUE ISOLATION -> VALIDATION
    # Pass Condition (MATH_README):
    #   Max Residual Deviation < 0.5 where Residual = Observed/Predicted
    # =========================================================================
    exp2b = data.get("experiment_2b", [])
    if isinstance(exp2b, list) and len(exp2b) > 0:
        residuals = []
        for row in exp2b:
            r = row.get("residual")
            if is_number(r):
                residuals.append(r)

        if not residuals:
            log_result(
                "EXP_2B",
                "VALIDATION",
                "INSUFFICIENT_DATA",
                {},
                "Residual series missing or non-numeric."
            )
        else:
            max_abs_dev = max(abs(r - 1.0) for r in residuals)
            if max_abs_dev < 0.5:
                status = "PASS"
                interp = "Observed residuals stay within theoretical tolerance; rogue isolation supported."
            else:
                status = "FAIL"
                interp = "Residual deviation exceeds tolerance; rogue isolation not supported at this fidelity."

            log_result(
                "EXP_2B",
                "VALIDATION",
                status,
                {
                    "max_abs_residual_dev": max_abs_dev,
                    "threshold": 0.5,
                    "count": len(residuals),
                },
                interp,
            )
    else:
        log_result("EXP_2B", "VALIDATION", "SKIP", {}, "Missing Data")

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
    # EXP 4: TRANSLATION VS DILATION -> HYPOTHESIS_TEST (Lattice stage)
    #
    # Decision rule, aligned with the Gauge -> Lattice -> Brittleness theory:
    #   - TRANSLATION wins with low delta_error -> PASS
    #     (consistent with Gauge: scaling is a trivial coord reparametrization,
    #      the expected outcome for this disambiguator)
    #   - DILATION wins with low delta_error -> NOTEWORTHY
    #     (candidate evidence that the scaling carries non-trivial operator
    #      content -- would support the Lattice claim; not a FAIL)
    #   - Either winner with high delta_error -> INSUFFICIENT_SEPARATION
    #     (the two models aren't resolvable at this fidelity)
    # delta_error threshold 0.05 is preserved from the prior rule.
    # =========================================================================
    exp4 = data.get("experiment_4", {})
    if exp4:
        if "1" in exp4:
            row = exp4["1"]
            winner = row["winner"]
            delta_err = row.get("delta_error")
            rmse_trans = row.get("rmse_trans")
            rmse_dil = row.get("rmse_dil")
            rmse_ratio = None
            if is_number(rmse_trans) and is_number(rmse_dil):
                rmse_ratio = rmse_dil / (rmse_trans + 1e-9)

            low_delta = is_number(delta_err) and delta_err < 0.05

            direction = None
            if not low_delta:
                status = "INSUFFICIENT_SEPARATION"
                interp = (
                    f"Cannot resolve Translation vs Dilation at current fidelity "
                    f"(delta_error={delta_err}). Re-run at higher precision or wider K."
                )
            elif winner == "TRANSLATION":
                status = "PASS"
                direction = "TRANSLATION"
                interp = (
                    "PATHFINDER verdict: TRANSLATION. Data supports Log-Translation "
                    "(coordinate reparametrization). Consistent with Gauge: no operator-"
                    "scaling signature detected."
                )
            elif winner == "DILATION":
                status = "NOTEWORTHY"
                direction = "DILATION"
                interp = (
                    "PATHFINDER verdict: DILATION. Data supports Log-Dilation (operator "
                    "scaling). Opens the Lattice-path investigation."
                )
            else:
                status = "INSUFFICIENT_DATA"
                interp = f"Unrecognized winner value: {winner!r}."

            log_result(
                "EXP_4", "HYPOTHESIS_TEST", status,
                {"winner": winner, "delta_err": delta_err, "ratio": rmse_ratio, "direction": direction},
                interp,
            )
        else:
            log_result("EXP_4", "HYPOTHESIS_TEST", "INSUFFICIENT_DATA", {}, "K=1 row missing; cannot apply decision rule.")
    else:
        log_result("EXP_4", "HYPOTHESIS_TEST", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 5: ZERO CORRESPONDENCE -> HYPOTHESIS_TEST (PATHFINDER role)
    #
    # EXP_5 is a pathfinder: its job is to *answer* whether scaled zeros align
    # with existing zeros at lattice points, not to pass/fail the top-level
    # theory. Any decisive outcome (hit OR miss) is INFORMATIVE — it tells us
    # which path to pursue next. We preserve the median_z thresholds but label
    # outcomes with direction-flavored status strings so the mechanical status
    # doesn't visually contradict the theory_fit (INFORMATIVE).
    # =========================================================================
    exp5 = data.get("experiment_5", {})
    if exp5:
        # Check K=1
        if "1" in exp5:
            row = exp5["1"]
            if isinstance(row, dict) and row.get("error"):
                status = "INSUFFICIENT_DATA"
                interp = f"Cannot test correspondence: {row.get('error')}."
                log_result("EXP_5", "HYPOTHESIS_TEST", status, {"error": row.get("error")}, interp)
            elif not is_number(row.get("median_z")):
                status = "INSUFFICIENT_DATA"
                interp = "Median z-score missing or non-numeric."
                log_result("EXP_5", "HYPOTHESIS_TEST", status, {}, interp)
            else:
                median_z = row.get("median_z")

                if median_z < 0.1:
                    status = "PASS"
                    direction = "lattice-hit"
                    interp = (
                        "PATHFINDER verdict: lattice-hit. Scaled zeros map directly onto existing "
                        "zeros at this fidelity — consistent with the Lattice property."
                    )
                elif median_z < 0.25:
                    status = "NOTEWORTHY"
                    direction = "lattice-weak"
                    interp = (
                        "PATHFINDER verdict: weak alignment. Partial correspondence detected; "
                        "re-run at higher fidelity / larger N to disambiguate."
                    )
                else:
                    status = "NOTEWORTHY"
                    direction = "lattice-path-negative"
                    interp = (
                        "PATHFINDER verdict: lattice-path-negative. Scaled zeros do NOT align with "
                        "existing zeros at this fidelity — rules out the naive lattice path and "
                        "redirects toward the operator/coord-reparam investigation."
                    )

                log_result(
                    "EXP_5",
                    "HYPOTHESIS_TEST",
                    status,
                    {"median_z": median_z, "direction": direction},
                    interp,
                )
        else:
            log_result("EXP_5", "HYPOTHESIS_TEST", "INSUFFICIENT_DATA", {}, "K=1 row missing; cannot apply decision rule.")
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
            log_result("EXP_6", "HYPOTHESIS_TEST", "INSUFFICIENT_DATA", {}, "K=1 row missing; cannot apply decision rule.")
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
        amps = [a for a in amps if is_number(a)]
        if len(amps) < 2:
            log_result("EXP_7", "VALIDATION", "INSUFFICIENT_DATA", {"amps": amps}, "Not enough valid amplification points.")
            is_monotone = None
        else:
            is_monotone = all(x < y for x, y in zip(amps, amps[1:]))
        
        if is_monotone is not None:
            if is_monotone:
                status = "PASS"
                interp = "Sensitivity confirmed. Rogue signal amplifies monotonically with perturbation."
            else:
                status = "FAIL"
                interp = "Sensitivity test failed. Signal is not monotonic."
            
            log_result("EXP_7", "VALIDATION", status, {"monotone": is_monotone, "amps": amps}, interp)
    else:
        log_result("EXP_7", "VALIDATION", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 8: SCALED-ZETA ZERO EQUIVALENCE -> HYPOTHESIS_TEST
    # Adaptive Tolerance:
    #   tol_zero = max(5 * 10^(-declared_decimals), 1e-20)
    #   tol_residual = 10^(-min(30, dps/2))
    # Pass Condition:
    #   p99_abs_dev <= tol_zero AND p95_residual <= tol_residual
    # =========================================================================
    exp8 = data.get("experiment_8", {})
    exp8_status = "SKIP"
    if exp8:
        per_k = exp8.get("per_k", {})
        p99_vals = []
        p95_res_vals = []
        k_used = []

        for k, row in per_k.items():
            metrics = row.get("metrics", {}) if isinstance(row, dict) else {}
            p99 = metrics.get("p99_abs_dev")
            p95_res = metrics.get("p95_residual")
            if is_number(p99):
                p99_vals.append(float(p99))
            if is_number(p95_res):
                p95_res_vals.append(float(p95_res))
            if is_number(p99) or is_number(p95_res):
                k_used.append(k)

        dps = data.get("meta", {}).get("dps", 50)
        dps = float(dps) if is_number(dps) else 50.0
        tol_residual = 10 ** (-min(30, dps / 2.0))

        zinfo = data.get("meta", {}).get("zero_source_info", {})
        declared_decimals = zinfo.get("declared_decimals")
        if is_number(declared_decimals):
            tol_zero = max(5 * (10 ** (-int(declared_decimals))), 1e-20)
        else:
            # Fallback when source precision metadata is missing.
            tol_zero = 1e-9

        if not p99_vals or not p95_res_vals:
            exp8_status = "INSUFFICIENT_DATA"
            log_result(
                "EXP_8",
                "HYPOTHESIS_TEST",
                exp8_status,
                {
                    "tol_zero": tol_zero,
                    "tol_residual": tol_residual,
                    "k_values": k_used,
                },
                "Missing p99_abs_dev and/or p95_residual metrics."
            )
        else:
            worst_p99 = max(p99_vals)
            worst_p95_residual = max(p95_res_vals)
            if worst_p99 <= tol_zero and worst_p95_residual <= tol_residual:
                exp8_status = "PASS"
                interp = "Scaled-zeta zeros align with tau-scaled baseline zeros within adaptive tolerance."
            else:
                exp8_status = "FAIL"
                interp = "Scaled-zeta zeros deviate from tau-scaled baseline zeros beyond adaptive tolerance."

            log_result(
                "EXP_8",
                "HYPOTHESIS_TEST",
                exp8_status,
                {
                    "worst_p99_abs_dev": worst_p99,
                    "worst_p95_residual": worst_p95_residual,
                    "tol_zero": tol_zero,
                    "tol_residual": tol_residual,
                    "k_values": k_used,
                },
                interp,
            )
    else:
        log_result("EXP_8", "HYPOTHESIS_TEST", "SKIP", {}, "Missing Data")

    # =========================================================================
    # ZERO PATH DECISION (based on EXP_8)
    # =========================================================================
    exp8_summary = summary["experiments"].get("EXP_8", {})
    exp8_status = exp8_summary.get("status", "SKIP")
    if exp8_status == "PASS":
        zero_path_decision = "SCALE_AD_HOC"
        zero_path_reason = "EXP_8 passed adaptive tolerance checks."
    elif exp8_status == "FAIL":
        zero_path_decision = "COMPUTE_PER_K"
        zero_path_reason = "EXP_8 failed adaptive tolerance checks."
    else:
        zero_path_decision = "UNDECIDED"
        zero_path_reason = f"EXP_8 status is {exp8_status}."
    summary["zero_path_decision"] = zero_path_decision
    summary["zero_path_reason"] = zero_path_reason

    # =========================================================================
    # STAGE ROLLUP: aggregate per-experiment theory_fit values into stage-
    # level verdicts. This rollup is the theory-centric headline the dashboard
    # renders; it answers "does the data support the theory at this stage?"
    # not "did the thresholds get hit?".
    #
    # Precedence (most serious first):
    #   REFUTES / CONTROL_BROKEN in any member    -> stage REFUTES
    #   all members INCONCLUSIVE                  -> stage INCONCLUSIVE
    #   only INFORMATIVE (no SUPPORTS, no FAILS)  -> stage PARTIAL
    #     (pathfinders answered but no enabler confirmed the chain yet)
    #   INFORMATIVE + SUPPORTS, no REFUTES        -> stage CANDIDATE
    #     (pathfinders returned directions AND enablers confirmed)
    #   any CANDIDATE, rest SUPPORTS/INCONCLUSIVE -> stage CANDIDATE
    #   all SUPPORTS (ignoring INCONCLUSIVE)      -> stage SUPPORTS
    #   otherwise                                  -> stage PARTIAL
    # =========================================================================
    stage_verdicts = {}
    for stage_name in ("gauge", "lattice", "brittleness", "control"):
        members = [
            (exp_id, summary["experiments"][exp_id])
            for exp_id in summary["experiments"]
            if STAGE_MAP.get(exp_id) == stage_name
        ]
        if not members:
            stage_verdicts[stage_name] = {
                "status": "INCONCLUSIVE",
                "reason": "no experiments mapped to stage",
                "members": [],
                "member_fits": {},
                "role_breakdown": {},
            }
            continue

        fits = [(mid, entry.get("theory_fit", "INCONCLUSIVE")) for mid, entry in members]
        member_ids = [mid for mid, _ in fits]
        member_fits = {mid: fit for mid, fit in fits}

        role_breakdown = {}
        for mid, entry in members:
            r = entry.get("role", "UNKNOWN")
            role_breakdown[r] = role_breakdown.get(r, 0) + 1

        refuting = [mid for mid, fit in fits if fit in ("REFUTES", "CONTROL_BROKEN")]
        supporting = [mid for mid, fit in fits if fit == "SUPPORTS"]
        candidate = [mid for mid, fit in fits if fit == "CANDIDATE"]
        informative = [mid for mid, fit in fits if fit == "INFORMATIVE"]
        inconclusive = [mid for mid, fit in fits if fit == "INCONCLUSIVE"]
        decisive = [mid for mid, fit in fits if fit != "INCONCLUSIVE"]

        if refuting:
            verdict = "REFUTES"
            reason = f"theory-refuting outcomes in: {refuting}"
        elif not decisive:
            verdict = "INCONCLUSIVE"
            reason = "no experiments in this stage produced decisive data"
        elif informative and not supporting and not candidate:
            verdict = "PARTIAL"
            reason = (
                f"pathfinders answered ({informative}) but no enabler has confirmed the "
                f"chain at this stage yet"
            )
        elif informative and (supporting or candidate):
            verdict = "CANDIDATE"
            reason = (
                f"pathfinders informed direction ({informative}) + confirming evidence "
                f"(supports: {supporting}, candidates: {candidate})"
            )
        elif candidate and not refuting:
            verdict = "CANDIDATE"
            reason = f"supporting + candidate evidence (candidate: {candidate})"
        elif supporting and not candidate and not refuting:
            verdict = "SUPPORTS"
            reason = f"all decisive experiments support the theory ({len(supporting)}/{len(members)})"
        else:
            verdict = "PARTIAL"
            reason = f"mixed theory_fit: {sorted(set(fit for _, fit in fits))}"

        stage_verdicts[stage_name] = {
            "status": verdict,
            "reason": reason,
            "members": member_ids,
            "member_fits": member_fits,
            "role_breakdown": role_breakdown,
        }

    summary["stage_verdicts"] = stage_verdicts

    # Finalize
    summary["overall"] = "PASS" if overall_pass else "FAIL"
    data["summary"] = summary

    # =========================================================================
    # REGRESSION LOG: append one line per verifier run to verdict_history.jsonl
    # and shout loudly if any stage verdict flipped from the prior line.
    # The history file is the canonical evidence trail: skeptical reviewers can
    # diff it to see when verdicts changed and correlate with code_fingerprint.
    # =========================================================================
    try:
        prev_line = None
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, "r") as f:
                for line in f:
                    if line.strip():
                        prev_line = line
        prev_record = json.loads(prev_line) if prev_line else None

        record = {
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
            "schema_version": EXPECTED_SCHEMA_VERSION,
            "fidelity_tier": fidelity_tier,
            "overall": summary["overall"],
            "stage_verdicts": {
                s: v["status"] for s, v in stage_verdicts.items()
            },
            "code_fingerprint": data.get("meta", {}).get("code_fingerprint", {}),
            "zero_source_info": data.get("meta", {}).get("zero_source_info", {}),
        }

        if prev_record is not None:
            flipped = []
            prev_stages = prev_record.get("stage_verdicts", {})
            for stage_name, curr_status in record["stage_verdicts"].items():
                prev_status = prev_stages.get(stage_name)
                if prev_status is not None and prev_status != curr_status:
                    flipped.append((stage_name, prev_status, curr_status))
            if flipped:
                print("\n" + "!" * 75)
                print(" [REGRESSION] Stage verdict FLIP(S) detected vs prior run:")
                for s, p, c in flipped:
                    print(f"   - {s}: {p} -> {c}")
                print("!" * 75)

        os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
        with open(HISTORY_FILE, "a") as f:
            f.write(json.dumps(record) + "\n")
    except Exception as exc:
        print(f" [WARN] Could not append to verdict history log: {exc}")

    return data

if __name__ == "__main__":
    # Standalone run
    d = run_verification()
    if d:
        with open(OUTPUT_FILE, "w") as f:
            json.dump(d, f, indent=2)

# Candidate Lemma / Note: Calibrated Amplification Candidate Lemma

## Run
run_1777543478730_6gu8mh

## Experiment
EXP_7 (P2-3)

## Role
witness

## Baseline Hypothesis
Rogue amplification behaves monotonically or in a structured way across the epsilon perturbation sweep.

## Observed Pattern
Sensitivity confirmed. Rogue signal amplifies monotonically with perturbation.

Metric summary:
```json
{
  "summary_metric": 1.0
}
```

## Result Against Baseline
CONFIRMED

## Candidate Lemma or Research Note
On this run's window, Rogue amplification behaves monotonically or in a structured way across the epsilon perturbation sweep held within tolerance (primary metric amplification_vs_epsilon_curve: observed ≈ 1). Formalizing this as a finite/proxy lemma is the next research step.

## Why It Matters
Calibrated amplification is the metrology baseline for Program 2: it gauges whether the detection instrument tracks perturbation size in a predictable way. Without calibration, NC6 cannot be quantified.

## What It Does Not Prove
- this proves NC6
- this proves RH
- this refutes Program 1
- The theorem candidate is supported.
- A non-hiding theorem is established.
- Contradiction closure is established.

## Required Next Test
- Extend the tested window for P2-3 to confirm robustness.
- Tighten the tolerance on amplification_vs_epsilon_curve and re-run.

## Formalization Target
Lift this finite/proxy result to a formal lemma in the proof program. See PROOF_PROGRAM_SPEC.md for the obligation index.

## Scoped Consequence
NONE

## Actual Run Inference (this run only)
- P2-3: the finite/proxy baseline was confirmed on this run's window.
- What was tested: Rogue amplification behaves monotonically or in a structured way across the epsilon perturbation sweep.
- This preserves the route the experiment witnesses; it does not prove the base claim or any necessary condition.

## Intended Inference If Baseline Is Confirmed (do not read as run conclusion)
- Program 2 metrology is consistent on the tested epsilon range
- the contradiction-track instrument is calibrated for this window
- this is not a proof of NC6

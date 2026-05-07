# Candidate Lemma / Note: Beta-Counterfactual Detection Lemma (instrument health)

## Run
run_1778052633325_epw531

## Experiment
EXP_3 (CTRL-2)

## Role
control

## Baseline Hypothesis
A counterfactual beta (off the critical line) should diverge from the true / reconstructed prime count under the same gauge scales.

## Observed Pattern
Control armed: beta=pi reconstruction diverges from true by 1138.8x baseline amplitude (pi_err=1.708e+04).

Metric summary:
```json
{
  "summary_metric": 15.0
}
```

## Result Against Baseline
CONFIRMED

## Candidate Lemma or Research Note
On this run's window, A counterfactual beta (off the critical line) should diverge from the true / reconstructed prime count under the same gauge scales held within tolerance. Formalizing this as a finite/proxy lemma is the next research step.

## Why It Matters
Without this control, beta-stability would be uninformative: any value of beta could appear to pass. The beta falsifier must be armed for VAL-1 to be epistemically meaningful.

## What It Does Not Prove
- this proves RH
- this proves predicate transport
- passing this control supports Program 1 directly
- The theorem candidate is supported by this control.
- beta is invariant.

## Required Next Test
- Extend the tested window for CTRL-2 to confirm robustness.
- Tighten the tolerance on counterfactual_beta_divergence and re-run.

## Formalization Target
Controls do not produce formal proof obligations; they gate other experiments.

## Scoped Consequence
NONE

## Actual Run Inference (this run only)
- CTRL-2: the falsifier described by this control is armed in this run.
- This is a statement about instrument health, not theory support.

## Intended Inference If Baseline Is Confirmed (do not read as run conclusion)
- the beta-divergence falsifier is armed for the tested counterfactual range
- VAL-1 results are epistemically meaningful in this window
- this is not theory support — it is instrument health

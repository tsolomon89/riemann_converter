# Candidate Lemma / Note: Operator-Action Separation Lemma (instrument health)

## Run
run_1778052633325_epw531

## Experiment
EXP_1B (CTRL-1)

## Role
control

## Baseline Hypothesis
Naive / wrong operator scaling of the gauge action should fail or visibly diverge under the reconstruction metric.

## Observed Pattern
Control armed: naive gamma scaling diverges from baseline by 452.9% (max_drift=67.93 vs baseline_amplitude=15).

Metric summary:
```json
{
  "summary_metric": 14.99809194731132
}
```

## Result Against Baseline
CONFIRMED

## Candidate Lemma or Research Note
On this run's window, Naive / wrong operator scaling of the gauge action should fail or visibly diverge under the reconstruction metric held within tolerance. Formalizing this as a finite/proxy lemma is the next research step.

## Why It Matters
If wrong scaling does not fail, the reconstruction metric cannot distinguish correct from incorrect gauge action — meaning every other Program 1 result is unreliable.

## What It Does Not Prove
- this supports RH
- this supports Program 1's positive witnesses directly
- this proves NC2 in any formal sense
- The theorem candidate is supported by this control.
- The gauge is correct.
- RH is true.

## Required Next Test
- Extend the tested window for CTRL-1 to confirm robustness.
- Tighten the tolerance on wrong_scaling_drift_or_amplitude_explosion and re-run.

## Formalization Target
Controls do not produce formal proof obligations; they gate other experiments.

## Scoped Consequence
NONE

## Actual Run Inference (this run only)
- CTRL-1: the falsifier described by this control is armed in this run.
- This is a statement about instrument health, not theory support.

## Intended Inference If Baseline Is Confirmed (do not read as run conclusion)
- the reconstruction metric distinguishes the correct gauge action from a wrong scaling
- the falsifier is armed in this window
- this does not, by itself, support the base claim

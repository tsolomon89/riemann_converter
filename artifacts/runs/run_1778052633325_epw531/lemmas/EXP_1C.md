# Candidate Lemma / Note: Zero-Reuse Engineering Note (failure-direction)

## Run
run_1778052633325_epw531

## Experiment
EXP_1C (NOTE-1)

## Role
pathfinder

## Baseline Hypothesis
Zero-reuse / zero-handling optimization (scaled-zero reconstruction at physical coordinates) behaves consistently with the baseline reconstruction under the declared tolerance.

## Observed Pattern
Zero-scaling hypothesis fails documented tolerances (drift and/or error-ratio).

Metric summary:
```json
{
  "summary_metric": 0.25
}
```

## Result Against Baseline
FAILED

## Candidate Lemma or Research Note
The current baseline (Zero-reuse / zero-handling optimization (scaled-zero reconstruction at physical coordinates) behaves consistently with the baseline reconstruction under the declared tolerance) was not confirmed on this run. A revised lemma should account for the observed deviation, possibly via one of the alternative hypotheses below.

## Why It Matters
Zero-reuse is a research-engineering optimization. If it disagrees with the baseline reconstruction, then either the optimization is wrong or the baseline depends on a hidden detail of zero-handling.

## What It Does Not Prove
- this supports the base claim
- this supports Program 1 witnesses directly
- this proves any necessary condition
- This experiment is a witness for any proof obligation.
- OBL_ZERO_SCALING_EQUIVALENCE is supported, refuted, or otherwise affected by this result.
- The RH predicate transports exactly under the gauge.
- The theorem candidate is proved or refuted.

## Required Next Test
- zero-reuse is valid only at low |k|
- zero-reuse requires a specific normalization to match the baseline
- the baseline implicitly does something the optimization skips

## Formalization Target
No formalization target suggested by this experiment.

## Scoped Consequence
BASELINE_MODEL

## Actual Run Inference (this run only)
- NOTE-1: the partial-transport / zero-reuse baseline was not confirmed on this run.
- Raw data show the scaled-zero reconstruction at physical coordinates diverged from the coordinate-baseline beyond the documented drift / ratio tolerances.
- Read this as a zero-reuse engineering failure for the current baseline, not as a Program 1 same-object failure or theory verdict.

## Intended Inference If Baseline Is Confirmed (do not read as run conclusion)
- the zero-reuse engineering optimization is consistent with the baseline on this window
- it is safe to reuse zeros under the tested settings
- no theoretical claim is added

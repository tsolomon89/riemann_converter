# Candidate Lemma / Note: Zero-Reuse Engineering Note (no-lemma)

## Run
run_1777543478730_6gu8mh

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
NOT_APPLICABLE

## Candidate Lemma or Research Note
This experiment is pathfinder-typed; no candidate lemma is suggested from this run.

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
- No specific next test recommended.

## Formalization Target
No formalization target suggested by this experiment.

## Scoped Consequence
NONE

## Actual Run Inference (this run only)
- NOTE-1: status not determinable from this run.
- This is an instrument / coverage gap, not a theory result.

## Intended Inference If Baseline Is Confirmed (do not read as run conclusion)
- the zero-reuse engineering optimization is consistent with the baseline on this window
- it is safe to reuse zeros under the tested settings
- no theoretical claim is added

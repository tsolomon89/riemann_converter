# Candidate Lemma / Note: Residual Isolation / Residual Envelope Candidate Lemma (failure-direction)

## Run
run_1777543478730_6gu8mh

## Experiment
EXP_2B (P2-2)

## Role
witness

## Baseline Hypothesis
A single-perturbed-zero model predicts residual behavior according to the current residual-ratio model (observed/predicted residual ~ 1.0 under the tested envelope).

## Observed Pattern
Residual deviation exceeds tolerance; rogue isolation not supported at this fidelity.

Metric summary:
```json
{
  "summary_metric": 501.0
}
```

## Result Against Baseline
FAILED

## Candidate Lemma or Research Note
The current baseline (A single-perturbed-zero model predicts residual behavior according to the current residual-ratio model (observed/predicted residual ~ 1.0 under the tested envelope)) was not confirmed on this run (primary metric observed_over_predicted_residual_ratio: observed ≈ 501). A revised lemma should account for the observed deviation, possibly via one of the alternative hypotheses below.

## Why It Matters
Residual isolation is the finite-precision baseline for NC6 via single-perturbation modeling. The current ratio model is one specific baseline among several plausible models.

## What It Does Not Prove
- this proves NC6
- this proves the rogue-isolation theorem
- this is consistent with Program 1 in any direct sense
- The theorem candidate is supported.
- All off-line zeros are isolable in general.
- No-hiding under compression is proved.

## Required Next Test
- phase-dependent residual envelope
- k-depth dependent attenuation of the residual signal
- window-dependent amplification
- multi-zero interference dominates over single-perturbation contribution
- wrong normalization of the observed/predicted ratio

## Formalization Target
No formalization target until the baseline is revised or re-tested. Consider one of the alternative hypotheses listed above.

## Scoped Consequence
ROUTE

## Actual Run Inference (this run only)
- P2-2: the current baseline was not confirmed on this run.
- Baseline tested: A single-perturbed-zero model predicts residual behavior according to the current residual-ratio model (observed/predicted residual ~ 1.0 under the tested envelope).
- The raw data may still contain structured behavior — see candidate lemma and alternative-hypothesis suggestions.
- This run does not, by itself, refute the base claim.

## Intended Inference If Baseline Is Confirmed (do not read as run conclusion)
- the single-perturbation residual model is consistent on the tested window
- the Program 2 detection route via residual ratios remains armed
- this is not a proof of NC6

# Candidate Lemma / Note: Rogue Detectability Candidate Lemma (failure-direction)

## Run
run_1777543478730_6gu8mh

## Experiment
EXP_2 (P2-1)

## Role
witness

## Baseline Hypothesis
A planted rogue / off-line zero produces detectable amplification under the tested compression and gauge settings.

## Observed Pattern
No significant signal amplification detected (ratio 0.9997x, below 1% threshold).

Metric summary:
```json
{
  "summary_metric": 0.9997352740346337
}
```

## Result Against Baseline
FAILED

## Candidate Lemma or Research Note
The current baseline (A planted rogue / off-line zero produces detectable amplification under the tested compression and gauge settings) was not confirmed on this run (primary metric rogue_amplification_signature: observed ≈ 0.999735). A revised lemma should account for the observed deviation, possibly via one of the alternative hypotheses below.

## Why It Matters
If a planted rogue cannot be detected, NC6 (no hiding under compression) is threatened — but only with respect to the chosen detection metric. The Program 2 contradiction route depends on detectability.

## What It Does Not Prove
- this proves NC6
- this proves RH
- this contradicts Program 1
- The theorem candidate is supported.
- No off-line zero exists at arbitrary height.
- The Contradiction Track's non-hiding theorem is established.
- Contradiction closure is established.

## Required Next Test
- detectability requires a different compression depth
- detectability requires phase-aware metrics rather than amplitude metrics
- detectability holds only for perturbations above a structured floor

## Formalization Target
No formalization target until the baseline is revised or re-tested. Consider one of the alternative hypotheses listed above.

## Scoped Consequence
ROUTE

## Actual Run Inference (this run only)
- P2-1: the current baseline was not confirmed on this run.
- Baseline tested: A planted rogue / off-line zero produces detectable amplification under the tested compression and gauge settings.
- The raw data may still contain structured behavior — see candidate lemma and alternative-hypothesis suggestions.
- This run does not, by itself, refute the base claim.

## Intended Inference If Baseline Is Confirmed (do not read as run conclusion)
- structured rogue zeros produce a detectable signature on the tested window
- the Program 2 contradiction route remains armed in this window
- this is not a proof of NC6

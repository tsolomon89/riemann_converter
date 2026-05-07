# Candidate Lemma / Note: Finite Beta-Stability Lemma

## Run
run_1777543478730_6gu8mh

## Experiment
EXP_6 (VAL-1)

## Role
witness

## Baseline Hypothesis
The recovered beta parameter remains pinned at 1/2 across the tested gauge scales.

## Observed Pattern
beta_hat=0.500000 within tolerance of 0.5 (drift=0.00e+00, tol=1.00e-10 via dps-derived (dps=80.0)).

Metric summary:
```json
{
  "summary_metric": 0.5
}
```

## Result Against Baseline
CONFIRMED

## Candidate Lemma or Research Note
On this run's window, The recovered beta parameter remains pinned at 1/2 across the tested gauge scales held within tolerance. Formalizing this as a finite/proxy lemma is the next research step.

## Why It Matters
Beta stability is the finite-precision proxy for predicate-preservation under the gauge. It is the closest experiment to NC4 (predicate transport).

## What It Does Not Prove
- this proves NC4
- this proves RH
- this establishes pointwise predicate transport
- beta is invariant at untested k.
- The RH predicate transports exactly under the gauge.
- OBL_BETA_INVARIANCE is formally proven.
- The theorem candidate is proved.

## Required Next Test
- Extend the tested window for VAL-1 to confirm robustness.
- Tighten the tolerance on recovered_beta and re-run.

## Formalization Target
Lift this finite/proxy result to a formal lemma in the proof program. See PROOF_PROGRAM_SPEC.md for the obligation index.

## Scoped Consequence
NONE

## Actual Run Inference (this run only)
- VAL-1: the finite/proxy baseline was confirmed on this run's window.
- What was tested: The recovered beta parameter remains pinned at 1/2 across the tested gauge scales.
- This preserves the route the experiment witnesses; it does not prove the base claim or any necessary condition.

## Intended Inference If Baseline Is Confirmed (do not read as run conclusion)
- predicate-preservation proxy is consistent on the tested window
- the route to NC4 via beta stability is preserved
- this is not a proof of NC4

# Candidate Lemma / Note: Finite Reconstruction Covariance Lemma

## Run
run_1778052633325_epw531

## Experiment
EXP_1 (CORE-1)

## Role
witness

## Baseline Hypothesis
The harmonic converter / explicit-formula reconstruction behaves covariantly across the tested gauge scales k.

## Observed Pattern
Main Riemann Converter curves are invariant under x_eff = X/tau^k on the tested grid. Reconstruction accuracy is reported separately as supporting validation, not as an RH or zero-scaling proof.

Metric summary:
```json
{
  "summary_metric": 200.0
}
```

## Result Against Baseline
CONFIRMED

## Candidate Lemma or Research Note
On this run's window, The harmonic converter / explicit-formula reconstruction behaves covariantly across the tested gauge scales k held within tolerance. Formalizing this as a finite/proxy lemma is the next research step.

## Why It Matters
Reconstruction covariance is the finite-precision proxy for the same-object behavior the gauge claims. Without it, NC3 (same-case criterion) cannot be witnessed by reconstruction agreement.

## What It Does Not Prove
- this proves RH
- this proves predicate transport
- this turns the proxy into a formal proof
- The Riemann Hypothesis is true.
- The zero-scaling hypothesis is confirmed.
- OBL_COORD_RECONSTRUCTION_COVARIANCE is formally proven.
- The RH predicate transports exactly under the gauge.
- The theorem candidate is proved.
- Coverage extends beyond Odlyzko's verified range.

## Required Next Test
- Extend the tested window for CORE-1 to confirm robustness.
- Tighten the tolerance on max_drift_between_k_zero_and_other_k and re-run.

## Formalization Target
Lift this finite/proxy result to a formal lemma in the proof program. See PROOF_PROGRAM_SPEC.md for the obligation index.

## Scoped Consequence
NONE

## Actual Run Inference (this run only)
- CORE-1: the finite/proxy baseline was confirmed on this run's window.
- What was tested: The harmonic converter / explicit-formula reconstruction behaves covariantly across the tested gauge scales k.
- This preserves the route the experiment witnesses; it does not prove the base claim or any necessary condition.

## Intended Inference If Baseline Is Confirmed (do not read as run conclusion)
- the finite reconstruction-covariance proxy is consistent with same-object behavior on the tested window
- this preserves the candidate route to NC3 via reconstruction agreement
- no formal claim about same-object equality is established

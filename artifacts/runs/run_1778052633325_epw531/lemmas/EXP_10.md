# Candidate Lemma / Note: Direct-Zeta-Transport Guardrail Note

## Run
run_1778052633325_epw531

## Experiment
EXP_10 (TRANS-1)

## Role
exploratory

## Baseline Hypothesis
Direct pointwise transport of zeta — i.e. ζ(t) = ζ(c^k t) — is not expected to be invariant under arbitrary multiplicative scaling. Residuals should quantify and bound this guardrail.

## Observed Pattern
Sampled 500 t-points across 5 bases x 5 k-values. max|residual| at tau, k=1: 6.8303e+00; baseline (c=1.0001): 1.6618e-02; ratio: 2.43e-03. best base per k: {'0': 'all-equivalent-at-k0', '1': 'baseline_1p0001', '2': 'baseline_1p0001', '5': 'baseline_1p0001', '10': 'baseline_1p0001'}. INFORMATIONAL: zeta is not multiplicatively gauge-invariant in general; this run quantifies the deviation, not a proof of any kind.

Metric summary:
```json
{
  "summary_metric": 6.830321442835776
}
```

## Result Against Baseline
CONFIRMED

## Candidate Lemma or Research Note
On this run's window, Direct pointwise transport of zeta — i.e. ζ(t) = ζ(c^k t) — is not expected to be invariant under arbitrary multiplicative scaling. Residuals should quantify and bound this guardrail held within tolerance. Formalizing this as a finite/proxy lemma is the next research step.

## Why It Matters
TRANS-1 protects against the misreading that the gauge claim requires literal pointwise zeta equality. The base claim is about same-object behavior under the gauge, not pointwise function equality.

## What It Does Not Prove
- the gauge-coordinate theory fails
- Program 1 fails
- RH is refuted
- zeta admits a non-trivial multiplicative gauge automorphism.
- tau (or any other base tested) is uniquely privileged.
- Small residuals at one base imply transport-invariance of the RH predicate.
- The residual decay rate provides a path to a proof.
- The theorem candidate is proved or refuted by this experiment.

## Required Next Test
- Extend the tested window for TRANS-1 to confirm robustness.
- Tighten the tolerance on pointwise_zeta_transport_residual and re-run.

## Formalization Target
No formalization target suggested by this experiment.

## Scoped Consequence
NONE

## Actual Run Inference (this run only)
- TRANS-1: the pathfinder / guardrail behaved as declared on this run's window.
- This is a direction note, not theory support.

## Intended Inference If Baseline Is Confirmed (do not read as run conclusion)
- the guardrail is in place on the tested window
- the gauge-coordinate theory is not being mistakenly tested as pointwise zeta equality
- this is not theory support

# Candidate Lemma / Note: Finite Zero-Scaling Correspondence Lemma

## Run
run_1778052633325_epw531

## Experiment
EXP_8 (WIT-1)

## Role
witness

## Baseline Hypothesis
Scaled-zero / scaled-lattice equivalence holds within adaptive tolerance over the tested k-range.

## Observed Pattern
Scaled-zeta zeros align with tau-scaled baseline zeros within adaptive tolerance.

Metric summary:
```json
{
  "summary_metric": 1e-30
}
```

## Result Against Baseline
CONFIRMED

## Candidate Lemma or Research Note
On this run's window, Scaled-zero / scaled-lattice equivalence holds within adaptive tolerance over the tested k-range held within tolerance. Formalizing this as a finite/proxy lemma is the next research step.

## Why It Matters
Scaled-zero correspondence is the witness object for NC3 via zero-ensemble equivalence. Without it, the predicate-transport route loses its finite witness.

## What It Does Not Prove
- this proves NC3
- this proves predicate transport
- this proves RH
- The Riemann Hypothesis is true.
- OBL_ZERO_SCALING_EQUIVALENCE is formally proven.
- The RH predicate transports exactly under the gauge.
- The theorem candidate is proved.
- Zero-scaling preserves RH-relevant structure (that requires OBL_EXACT_RH_TRANSPORT).

## Required Next Test
- Extend the tested window for WIT-1 to confirm robustness.
- Tighten the tolerance on nearest_neighbor_distance_under_scaling and re-run.

## Formalization Target
Lift this finite/proxy result to a formal lemma in the proof program. See PROOF_PROGRAM_SPEC.md for the obligation index.

## Scoped Consequence
NONE

## Actual Run Inference (this run only)
- WIT-1: the finite/proxy baseline was confirmed on this run's window.
- What was tested: Scaled-zero / scaled-lattice equivalence holds within adaptive tolerance over the tested k-range.
- This preserves the route the experiment witnesses; it does not prove the base claim or any necessary condition.

## Intended Inference If Baseline Is Confirmed (do not read as run conclusion)
- the zero-ensemble equivalence proxy is consistent on the tested window
- NC3 route via zero-ensemble is preserved
- this is not a proof of NC3

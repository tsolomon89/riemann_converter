# Proof Discovery — run_1778052633325_epw531

_schema 2026.05.experiment-review.v1_

## Coverage
```json
{
  "all_confirmed": false,
  "coverage_complete": true,
  "experiments_not_run": [],
  "experiments_run": [
    "EXP_0",
    "EXP_1",
    "EXP_10",
    "EXP_1B",
    "EXP_1C",
    "EXP_2",
    "EXP_2B",
    "EXP_3",
    "EXP_4",
    "EXP_5",
    "EXP_6",
    "EXP_7",
    "EXP_8",
    "EXP_9"
  ],
  "lemmas_generated": [
    "EXP_0",
    "EXP_1",
    "EXP_10",
    "EXP_1B",
    "EXP_1C",
    "EXP_2",
    "EXP_2B",
    "EXP_3",
    "EXP_4",
    "EXP_5",
    "EXP_6",
    "EXP_7",
    "EXP_8",
    "EXP_9"
  ],
  "model_comparisons_generated": [
    "EXP_0",
    "EXP_1",
    "EXP_10",
    "EXP_1B",
    "EXP_1C",
    "EXP_2",
    "EXP_2B",
    "EXP_3",
    "EXP_4",
    "EXP_5",
    "EXP_6",
    "EXP_7",
    "EXP_8",
    "EXP_9"
  ],
  "registered_experiments": [
    "EXP_0",
    "EXP_1",
    "EXP_1B",
    "EXP_1C",
    "EXP_2",
    "EXP_2B",
    "EXP_3",
    "EXP_4",
    "EXP_5",
    "EXP_6",
    "EXP_7",
    "EXP_8",
    "EXP_9",
    "EXP_10"
  ],
  "reviews_generated": [
    "EXP_0",
    "EXP_1",
    "EXP_10",
    "EXP_1B",
    "EXP_1C",
    "EXP_2",
    "EXP_2B",
    "EXP_3",
    "EXP_4",
    "EXP_5",
    "EXP_6",
    "EXP_7",
    "EXP_8",
    "EXP_9"
  ]
}
```

## Totals
```json
{
  "controls": 2,
  "demonstrations": 2,
  "experiments_reviewed": 14,
  "failed_or_incomplete": 4,
  "pathfinders": 4,
  "program_1_total": 4,
  "program_1_witnesses": 3,
  "program_2_total": 3,
  "program_2_witnesses": 3
}
```

## Program 1 Candidate Lemmas
- **CORE-1** — Finite Reconstruction Covariance Lemma: On this run's window, The harmonic converter / explicit-formula reconstruction behaves covariantly across the tested gauge scales k held within tolerance. Formalizing this as a finite/proxy lemma is the next research step.
- **VAL-1** — Finite Beta-Stability Lemma: On this run's window, The recovered beta parameter remains pinned at 1/2 across the tested gauge scales held within tolerance. Formalizing this as a finite/proxy lemma is the next research step.
- **WIT-1** — Finite Zero-Scaling Correspondence Lemma: On this run's window, Scaled-zero / scaled-lattice equivalence holds within adaptive tolerance over the tested k-range held within tolerance. Formalizing this as a finite/proxy lemma is the next research step.

## Program 1 Witnesses
- CORE-1: CONFIRMED
- VAL-1: CONFIRMED
- WIT-1: CONFIRMED

## Controls / Instrument Lemmas
- CTRL-1: Operator-Action Separation Lemma (instrument health) (CONFIRMED)
- CTRL-2: Beta-Counterfactual Detection Lemma (instrument health) (CONFIRMED)

## Pathfinding Notes
- NOTE-1: Zero-Reuse Engineering Note (no-lemma) (NOT_APPLICABLE)
- PATH-1: Preferred Gauge-Direction Note (deferred) (INCONCLUSIVE)
- PATH-2: Zero-Correspondence Pathfinding Note (deferred) (INCOMPLETE)
- TRANS-1: Direct-Zeta-Transport Guardrail Note (CONFIRMED)

## Program 2 Contradiction-Track Lemmas
- P2-1: Rogue Detectability Candidate Lemma (failure-direction) (FAILED)
- P2-2: Residual Isolation / Residual Envelope Candidate Lemma (failure-direction) (FAILED)
- P2-3: Calibrated Amplification Candidate Lemma (CONFIRMED)

## Failed or Incomplete Baselines
- **P2-1** — FAILED (scoped: ROUTE)
  - P2-1: the current baseline was not confirmed on this run.
  - Baseline tested: A planted rogue / off-line zero produces detectable amplification under the tested compression and gauge settings.
  - The raw data may still contain structured behavior — see candidate lemma and alternative-hypothesis suggestions.
  - This run does not, by itself, refute the base claim.
- **P2-2** — FAILED (scoped: ROUTE)
  - P2-2: the current baseline was not confirmed on this run.
  - Baseline tested: A single-perturbed-zero model predicts residual behavior according to the current residual-ratio model (observed/predicted residual ~ 1.0 under the tested envelope).
  - The raw data may still contain structured behavior — see candidate lemma and alternative-hypothesis suggestions.
  - This run does not, by itself, refute the base claim.
- **PATH-1** — INCONCLUSIVE (scoped: NONE)
  - PATH-1: the run was inconclusive against this baseline.
  - More precision, a wider window, or a revised metric may be needed to decide.
- **PATH-2** — INCOMPLETE (scoped: BASELINE_MODEL)
  - PATH-2: the run produced partial / directional information against this baseline.
  - Strengthening the metric or extending the window is the natural next step.

## Alternative Hypotheses
- **P2-1**:
  - detectability requires a different compression depth
  - detectability requires phase-aware metrics rather than amplitude metrics
  - detectability holds only for perturbations above a structured floor
- **P2-2**:
  - phase-dependent residual envelope
  - k-depth dependent attenuation of the residual signal
  - window-dependent amplification
  - multi-zero interference dominates over single-perturbation contribution
  - wrong normalization of the observed/predicted ratio

## Formalization Targets
- CORE-1: Finite Reconstruction Covariance Lemma (finite/proxy)
- VAL-1: Finite Beta-Stability Lemma (finite/proxy)
- WIT-1: Finite Zero-Scaling Correspondence Lemma (finite/proxy)

## Recommended Next Proof Work
- Formalize Finite Reconstruction Covariance Lemma as a finite/proxy lemma.
- Formalize Finite Beta-Stability Lemma as a finite/proxy lemma.
- Formalize Finite Zero-Scaling Correspondence Lemma as a finite/proxy lemma.

## Recommended Next Experiments
- **P2-1**:
  - detectability requires a different compression depth
  - detectability requires phase-aware metrics rather than amplitude metrics
  - detectability holds only for perturbations above a structured floor
- **P2-2**:
  - phase-dependent residual envelope
  - k-depth dependent attenuation of the residual signal
  - window-dependent amplification
  - multi-zero interference dominates over single-perturbation contribution
  - wrong normalization of the observed/predicted ratio
- **PATH-1**:
  - Increase precision and re-run PATH-1.
  - Re-examine the metric coherence_advantage_dilation_minus_translation for sensitivity.
- **PATH-2**:
  - Increase precision and re-run PATH-2.
  - Re-examine the metric nearest_neighbor_correspondence_signal for sensitivity.

## What Must Not Be Concluded
- this proves any necessary condition
- this supports the base claim
- this is a substitute for any other experiment
- The Riemann Hypothesis is true.
- The theorem candidate is supported or refuted by this visualization.
- Zero positions are verified to ζ(ρ)=0 to any specific precision by this experiment.
- Coverage extends beyond the displayed t-range.
- The compressed and uncompressed dual-window curves agree exactly under any non-trivial multiplicative gauge.
- this proves RH
- this proves predicate transport
- this turns the proxy into a formal proof
- The zero-scaling hypothesis is confirmed.
- OBL_COORD_RECONSTRUCTION_COVARIANCE is formally proven.
- The RH predicate transports exactly under the gauge.
- The theorem candidate is proved.
- Coverage extends beyond Odlyzko's verified range.
- this supports RH
- this supports Program 1's positive witnesses directly
- this proves NC2 in any formal sense
- The theorem candidate is supported by this control.
- The gauge is correct.
- RH is true.
- this supports Program 1 witnesses directly
- This experiment is a witness for any proof obligation.
- OBL_ZERO_SCALING_EQUIVALENCE is supported, refuted, or otherwise affected by this result.
- The theorem candidate is proved or refuted.
- this proves NC6
- this contradicts Program 1
- The theorem candidate is supported.
- No off-line zero exists at arbitrary height.
- The Contradiction Track's non-hiding theorem is established.
- Contradiction closure is established.
- this proves the rogue-isolation theorem
- this is consistent with Program 1 in any direct sense
- All off-line zeros are isolable in general.
- No-hiding under compression is proved.
- passing this control supports Program 1 directly
- beta is invariant.
- this rules out the non-preferred direction in general
- The theorem candidate is supported or refuted by this pathfinder.
- The chosen direction is correct at untested scales.
- The zero-scaling hypothesis is universally confirmed or ruled out.
- this proves NC4
- this establishes pointwise predicate transport
- beta is invariant at untested k.
- OBL_BETA_INVARIANCE is formally proven.
- this refutes Program 1
- A non-hiding theorem is established.
- this proves NC3
- OBL_ZERO_SCALING_EQUIVALENCE is formally proven.
- Zero-scaling preserves RH-relevant structure (that requires OBL_EXACT_RH_TRANSPORT).
- this proves NC5
- Transport is established by this experiment.
- The bounded-view corollary is proved.
- Anything about whether the gauge actually preserves RH-relevant structure.
- the gauge-coordinate theory fails
- Program 1 fails
- RH is refuted
- zeta admits a non-trivial multiplicative gauge automorphism.
- tau (or any other base tested) is uniquely privileged.
- Small residuals at one base imply transport-invariance of the RH predicate.
- The residual decay rate provides a path to a proof.
- The theorem candidate is proved or refuted by this experiment.

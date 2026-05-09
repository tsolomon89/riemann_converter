# Lean 4 Formalization Scaffold

> First Lean 4 files in this repo. Statement-only skeletons, no proofs.

This directory holds Lean 4 statements of the **finite/proxy** lemmas that
the proof-discovery layer (Python + TS) identifies as confirmed witnesses
on the live run. Each file is a 1-to-1 translation of one
`artifacts/runs/<run_id>/lemmas/<exp_id>.md` candidate-lemma artifact.

The point of this scaffold is **not** to prove the lemmas. The point is to
expose every auxiliary definition that would have to be constructed before a
proof attempt is even meaningful — i.e. to convert the empirical apparatus
into a formal proof obligation.

## Files

| Lean file | Source experiment | Plain-statement summary | Obligation |
|---|---|---|---|
| [FiniteReconstructionCovariance.lean](FiniteReconstructionCovariance.lean) | EXP_1 / CORE-1 | Truncated explicit-formula reconstruction is gauge-covariant on a bounded test window. | `OBL_COORD_RECONSTRUCTION_COVARIANCE` |
| [FiniteBetaStability.lean](FiniteBetaStability.lean) | EXP_6 / VAL-1 | Best-fit β̂(k) stays at 1/2 across the tested k-family within tolerance. | `OBL_BETA_INVARIANCE` |
| [FiniteZeroScalingCorrespondence.lean](FiniteZeroScalingCorrespondence.lean) | EXP_8 / WIT-1 | Scaled-zero ordinates `τ^k · γ_j` track the baseline `γ_i` in nearest-neighbor distance. | `OBL_ZERO_SCALING_EQUIVALENCE` |

Each file follows the same structure:

1. **Header** — provenance pointer, plain statement, obligation pointer, NC pointer (where applicable), disallowed-conclusions list (verbatim from the source `.md`).
2. **Missing-hypotheses catalog** — a `## TODO-Xn` block enumerating each undefined operator the lemma references.
3. **Auxiliary primitives** — `axiom` or `noncomputable def := sorry` stubs for each catalog entry.
4. **Witness theorem** — the finite/proxy statement, ending with `sorry`.
5. **Strengthened "exact" form** — the ambition the witness is a proxy for, also `sorry`. Kept inline so future provers can see what would be needed to discharge the actual obligation.

## Disallowed conclusions (universal across all files)

Compiling these files (or even proving them) does NOT entail any of the following. Every file repeats this list for its own context:

- This proves RH.
- This proves predicate transport (NC4).
- This proves any `OBL_*` obligation in PROOF_PROGRAM_SPEC.md.
- This turns a finite/proxy witness into a formal proof.

Reviewers should treat the `_OBL` suffix on the strengthened forms as a name, not a status — those theorems are sealed by `sorry` and remain unproven.

## Consolidated missing-hypotheses catalog

The three files surface **17 distinct primitives** that need to be constructed (or axiomatized against external artifacts) before any proof attempt is meaningful. Listed once here so the catalog is auditable:

### Special functions (shared)

| Tag | Primitive | Status | Notes |
|---|---|---|---|
| **A2** | `logarithmicIntegral : ℝ → ℝ` | axiom | Mathlib has no `Li`. Standard PV-integral construction. |
| **A3** | `exponentialIntegralComplex : ℂ → ℂ` | axiom | Mathlib has no `Ei`. Standard PV-integral construction. |
| **A4** | Möbius coefficient as `ℝ` | def | Wraps `Nat.ArithmeticFunction.moebius`. Easy. |

### Riemann zeta enumeration (shared)

| Tag | Primitive | Status | Notes |
|---|---|---|---|
| **A1 / W1** | `rzZeroIm : ℕ → ℝ` (j-th nontrivial critical-line ordinate) | axiom | Mathlib has `Complex.riemannZeta` but no enumeration of zeros. The witness statement assumes the critical-line property; the proof of that for indices 1..N rests on Odlyzko's external numerical verification. **This is the largest single import.** |

### Reconstruction operators (EXP_1)

| Tag | Primitive | Status | Notes |
|---|---|---|---|
| **A5** | Convergence of the outer Möbius sum at fixed (N, x) | TODO-prove | Sum has finitely many nonzero terms; proving that converts `tsum` to `Finset.sum`. |
| **A6** | Test window W ⊂ ℝ_{>0}, bounded, no-singularity | TODO-state | The lemma uses `Bornology.IsBounded`; a stronger no-singularity guard is implicit. |
| **A7** | Tested gauge-scale set K ⊂ ℤ, finite | encoded | `Finset ℤ`. |
| **A8** | Tolerance `ε`, experiment-declared | encoded | quantified existentially. |

### Beta recovery (EXP_6)

| Tag | Primitive | Status | Notes |
|---|---|---|---|
| **B1** | Recovery model `recoveryModel : ℝ → ℝ → ℝ` | axiom | Engine fits a 1-parameter offset model against a Möbius-inverted reconstruction; needs to be built on top of A2/A3/A4. |
| **B2** | Fitness functional `fitnessFunctional : ℝ → ℝ` | axiom | Engine uses an L²-style residual. Tautological-self-fit caveat is in the file. |
| **B3** | Companion control `BetaCounterfactualControl.lean` | not-created | EXP_3 (β = π) is the falsifier; without it, EXP_6 is uninformative. |
| **B4** | Fidelity-tier→tolerance map | TODO-state | engine: `tol = 1e-10` at AUTHORITATIVE. |

### Zero-scaling (EXP_8)

| Tag | Primitive | Status | Notes |
|---|---|---|---|
| **W2** | Nearest-neighbor metric `d_NN(j) := min_i \| γ̃[τ,k] j - γ_i \|` | def + nonempty TODO | Encoded; nonempty proof is `sorry`. |
| **W3** | Adaptive tolerance map `FidelityTier → ℝ_{>0}` | TODO-state | engine reports `5e-09` at AUTHORITATIVE. |
| **W5** | Order-preservation `i < j ↔ τ^k · γ_i < τ^k · γ_j` | TODO-state | Trivial for `τ^k > 0`; worth stating because it is the formal content of "the lattice scales as a whole." |

### Cross-cutting

| Tag | Primitive | Status | Notes |
|---|---|---|---|
| **B5 / W4** | Shared `gaugeAction τ k x = x / τ^k` (covariant) and `· τ^k` (zero-scaling) | duplicated | Each file currently re-stubs. Extract to `Auxiliary/GaugeAction.lean` once a `lakefile.lean` exists. |
| **W6** | EXP_1 vs EXP_8 distinction (reconstruction-covariance vs ensemble-scaling) | encoded | Both lemmas exist in this directory; their relationship is documented in `EXP_8.md`'s catalog. |

## Why these aren't proofs

Read these files as **statements** in the Wittgensteinian sense — what is mathematically being claimed, made precise enough that a contradiction (or a proof) would be unambiguous. Each `sorry` is a research target, not a bug.

The empirical run (`run_1777543478730_6gu8mh`) **is the witness** that these statements are not vacuous: at AUTHORITATIVE fidelity, the engine reports drift within tolerance for all three. The witnesses make the lemmas worth attempting; the lemmas make the witnesses formalizable. Closing the catalog is the immediate next research step.

## How to extend

When constructing a missing primitive (e.g. `Li`, `Ei`, `rzZeroIm`):

1. Place the construction in `proof_kernel/lean/Auxiliary/<Name>.lean`.
2. Replace the `axiom` in the consuming witness file with `import RiemannConverter.Auxiliary.<Name>`.
3. Remove the corresponding `TODO-` line from the missing-hypotheses block at the top.
4. Update the table in this README.

When attempting the witness theorem itself, keep the `sorry` until you have:

- discharged every TODO-Xn that the proof relies on, and
- exhibited a concrete `(τ, ε, W, K, N, ...)` calibration drawn from the engine's preset table (the engine's AUTHORITATIVE preset is a sound source).

When attempting the strengthened `_OBL` form, you are no longer doing a proxy — you are attempting the actual proof obligation. That is its own multi-month research effort and should not be undertaken without first (a) closing the witness, and (b) reading PROOF_PROGRAM_SPEC.md §obligations and `proof_kernel/necessary_conditions.md` carefully.

## Toolchain (not yet set up)

This directory does NOT currently include a `lakefile.lean` or `lean-toolchain` file. The Lean files are statement-level and rely on Mathlib4 being available to a future `lake build`. Setting up the toolchain is an orthogonal task; until it is done, the files are read-only formal targets, not compilable artifacts.

When the toolchain is set up:

1. Add `lakefile.lean` declaring a single `RiemannConverter` package depending on Mathlib4.
2. Add `lean-toolchain` pinning the Mathlib4-compatible Lean version.
3. Wire `lake build` into `npm test` (Python + Jest + Lean).
4. CI: every PR that edits a `*.lean` file must pass `lake build`.

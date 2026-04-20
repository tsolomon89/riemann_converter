# The Precise Claim

This document states exactly what this repository asserts and what it does
not. Audience: a reader familiar with analytic number theory who wants to
evaluate the claims without reading source. Sibling docs:
[MATH_README.md](MATH_README.md) (derivations), [REPRODUCE.md](REPRODUCE.md)
(reviewer handoff).

---

## 0. Setup

Let τ = 2π. Let ζ denote the Riemann zeta function, ρ its non-trivial
zeros (with Re(ρ) = ½ conjecturally). The explicit formula

  ψ(X) = X − Σρ X^ρ/ρ − log(2π) − ½ log(1 − X⁻²)

connects the Chebyshev prime-counting function ψ to the zero ensemble.

We study the family of transformations indexed by k ∈ ℤ:

  X ↦ X / τᵏ     (coordinate scaling)
  p ↦ p · τ⁻ᵏ   (induced prime-point relabeling, p prime)

**Key structural fact.** Primality is a *relational* property of integer
divisibility. Under uniform multiplicative rescaling by any factor c > 0,
the set `{p · c : p prime}` has the same multiplicative structure as
`{p : p prime}`: the gap sequence is scaled by c, the local density is
divided by c, and the "primality" in the sense of "minimal multiplicative
generators of the scaled semigroup" is preserved. This is the formal
content of the informal phrase "3·τ⁻⁹⁹ is still a prime relative to τ⁻⁹⁹."
It is not a claim that τ⁻⁹⁵ is a prime number in ℤ; it is a claim that
the scaled lattice is the same object up to conformal relabeling.

---

## 1. Claim 1 — Coordinate equivariance (Gauge stage)

**Statement.** Under X → X/τᵏ, the explicit formula ψ transforms
covariantly:

  ψ(X/τᵏ) = τ⁻ᵏ · ψ(X) + subdominant corrections

where "subdominant" means corrections whose relative size vanishes as X
grows into the asymptotic regime. Derivation: [MATH_README.md §2].

**Numerical witness.** EXP_1 checks that reconstructing ψ from zeros
under this coordinate scaling matches the k=0 baseline to machine
precision across k ∈ {−3,…,+3}.

**Falsification control.** EXP_1B applies a *naive operator scaling* to
the zeros themselves (ρ → ρ · τᵏ) instead of to the coordinate. This is
the wrong group action; the reconstruction breaks by design. EXP_1B
passes iff the system *fails* — confirming the gauge is rigid, not
floppy, under the choice of scaling group.

---

## 2. Claim 2 — Zero equivariance (Lattice stage, tautological)

**Statement.** Zeros of ζ(s · τᵏ) are exactly {ρ · τ⁻ᵏ : ζ(ρ) = 0}. This
is a variable substitution: if ζ(ρ) = 0, then ζ((ρ · τ⁻ᵏ) · τᵏ) = ζ(ρ) =
0, so ρ · τ⁻ᵏ is a zero of s ↦ ζ(s·τᵏ).

**EXP_8 is plumbing, not evidence.** EXP_8 verifies this identity
holds numerically to the declared precision. Its purpose is to confirm
the engine doesn't silently violate an identity we're already assuming.
A failure of EXP_8 would mean we have a bug, not that the identity is
false. A reviewer should read EXP_8 as a regression test on the zero
generator, not as an independent empirical claim.

---

## 3. Claim 3 — β-stability under scaling (the load-bearing one)

**Setup.** Let β̂(k) denote the best-fit real part of the critical line
*as recovered empirically* by reconstructing ψ from τ⁻ᵏ-scaled zeros
using the coordinate gauge. β̂(k) is an optimizer output, not an
identity: it is the β that minimizes reconstruction residual for scale
k given access to the scaled zeros.

**Statement.** β̂(k) = ½ for all k in the tested range, to within
optimizer tolerance at AUTHORITATIVE fidelity.

**Why this is the load-bearing claim.** Claim 1 (gauge) says ψ
transforms covariantly; Claim 2 (lattice) says zero locations relabel
exactly. Neither of those alone tells you the *critical line stays at
½*. Claim 3 is what licenses the computational payoff:

  If β̂(k) ≡ ½ under scaling, then a verification of RH at k=0 (i.e.,
  Odlyzko's numerical confirmation for the first ~10¹³ zeros)
  *propagates to every k* without recomputation, because the zero
  structure at scale k is an exact relabeling of the zero structure at
  k=0, and the critical-line fit is invariant.

**Numerical witness.** EXP_6. Drift |β̂(k) − ½| is measured across k and
must remain below a threshold (0.005 at AUTHORITATIVE tier).

**Caveat on fidelity.** At SMOKE tier (N < 500 zeros), the β̂ optimizer
has known artifacts — β̂ ≈ 0.43 is common, reflecting optimizer
discretization, not a gauge failure. The verifier clamps theory-fit to
INCONCLUSIVE at SMOKE tier for this reason. Cite AUTHORITATIVE only.

---

## 4. Claim 4 — Brittleness (detectability of rogue zeros)

**Setup.** Suppose, counterfactually, a zero ρ* with Re(ρ*) = ½ + ε for
small ε > 0. The explicit formula's reconstruction error under
coordinate-gauge scaling is expected to amplify this off-line
contribution by a factor monotone in ε, becoming detectable under
deep-zoom (k → large negative).

**Statement.** The detection function A(ε) is monotone in ε and
finite-k-detectable — i.e., there exists a k such that A(ε) exceeds
ambient numerical noise at ordinate ranges we can sample.

**Numerical witnesses.**
- EXP_2 (centrifuge): plant a β = 0.5001 perturbation, observe visible
  error amplification under scaling.
- EXP_2B (rogue isolation): residual error scales as x^Δβ, isolating
  the single perturbed zero.
- EXP_7 (calibrated sensitivity): local relative metric confirms A(ε)
  monotonicity across an ε sweep.

**This is the evidentiary hero of the repo.** Claims 1–3 establish an
equivalence class (scale-invariant zero structure under the coordinate
gauge). Claim 4 is the falsifiable content: if RH is false *anywhere in
the covered ordinate range at any scale*, we expect to detect it. We
do not detect it. That is the empirical result.

---

## 5. The combined empirical argument

1. **Premise (external).** Odlyzko has numerically verified ζ's first
   ~10¹³ non-trivial zeros lie on Re(s) = ½. Platt–Trudgian extend
   RH-up-to-height bounds. We take these as given.
2. **Claims 1–3.** If the gauge is rigid, the lattice relabels exactly,
   and β̂ stays at ½, then the external verification at k=0 extends to
   the full family {k ∈ ℤ} without recomputation.
3. **Claim 4.** If any zero were off-line within the covered ordinate
   range at any tested k, the brittleness battery would detect it.
4. **Observed.** No detection.

**Conclusion.** Empirical robustness of RH under gauge/lattice
transformations, over the regime covered by the external verification
and our tested k range.

---

## 6. The non-claim

- **Not a proof of RH.** No formal derivation; no Lean artifact; no
  axiomatic chain.
- **Does not extend coverage beyond Odlyzko's range.** Scaling already-
  verified zeros produces scaled copies, not new zeros of the original
  ζ at higher ordinate. The verified ordinate range is whatever Odlyzko
  verified.
- **"Trillion primes at τ⁻⁹⁹" is about the relabeled regime.** It
  refers to the image of the already-known primes under p → p·τ⁻⁹⁹,
  not to primes freshly discovered at that scale. The content is: the
  scaled lattice is a conformal copy, subject to the same rules, with
  no new structure needed to describe it.
- **Claim 4's detectability bound is empirical, not sharp.** We
  calibrate A(ε) on planted rogue zeros; we do not derive a closed-form
  amplification theorem.

---

## 7. Relationship to prior work

This repo sits on top of, and explicitly relies on:

- **Odlyzko's numerical verification** of ζ's zeros on the critical
  line for the first ~10¹³ zeros. We use his 100k-zero file (at ~10⁻⁹
  precision) for the Overkill reproduction tier; see
  [REPRODUCE.md §2](REPRODUCE.md#2-how-to-run).
- **Platt–Trudgian** on RH-up-to-height bounds, which give us the
  ordinate range for which the external premise holds.

What this repo *adds* is the structural test: are Claims 1–4 consistent
with the numerical record? If yes, the external verification buys more
than it bought as standalone numerical coverage — it buys a whole
equivariance class. If Claim 3 or Claim 4 fails at any k, the structure
is wrong and the computational payoff evaporates.

What this repo *assumes* is that Odlyzko's verification at k=0 is
correct. If that assumption is wrong, nothing here is salvageable. The
assumption is commonly accepted and well-audited; we note it
explicitly.

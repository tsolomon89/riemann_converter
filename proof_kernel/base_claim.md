# Base Compression Claim

> This document states the base claim in its simplest form. It is derived
> from the logic of the compression argument, not from existing experiments.
> Experiments are evaluated against this claim — not the reverse.
>
> **Layer dominance.** This document defines what the claim *is*.
> [necessary_conditions.md](necessary_conditions.md) defines what must hold
> for it to work. [experiment_relevance.md](experiment_relevance.md) audits
> whether existing experiments bear on it.

---

## 1. The claim

A nontrivial multiplicative gauge may transport the RH-relevant analytic
structure without changing the analytic case. If compressed and uncompressed
views are the same case, then a counterexample at arbitrarily large scale
cannot exist only at that scale — it must transport into the compressed
representation. If it does not appear there, the assumed counterexample
produces a contradiction.

### Formal statement (draft)

Under an admissible multiplicative gauge

$$T_c : s \mapsto s \cdot c^k, \qquad c > 1,\; k \in \mathbb{Z},$$

the RH predicate is transport-invariant: ζ has a non-trivial zero ρ with
Re(ρ) ≠ ½ **if and only if** T_c(ρ) is likewise off the critical line.

No off-line zero can exist on one side of the gauge without existing on
the other.

### Plain-language statement

If the relevant zeta/prime structure can be transported into a compressed
scale without changing the RH-relevant behavior, then searching arbitrarily
further in the uncompressed scale becomes logically redundant rather than
mathematically necessary.

### Working gauge

The project takes c = τ = 2π as the current working gauge.

**Uniqueness of τ is not a claim.** Whether another c > 1 would also serve
is an open research question parked outside the critical path.

---

## 2. Object candidates

The claim requires defining **what object** is being transported. The
certificate must declare which is primary for each run. The claim does not
pre-select one — the audit must determine which is load-bearing.

| Candidate | Description | Experiments that touch it |
|---|---|---|
| `explicit_formula_reconstruction` | The ψ/π reconstruction under coordinate gauge x → x/τ^k | EXP_1, EXP_1C, EXP_6 |
| `zero_ensemble` | The nontrivial zero set {ρ} under ρ → ρ·τ^(-k) | EXP_8, EXP_5 |
| `prime_lattice_relation` | The scaled prime semigroup {p·τ^(-k)} | EXP_1, EXP_1C |
| `rh_predicate` | Re(ρ) = ½ invariance directly | EXP_6 (beta_hat) |
| `transformed_zeta_model` | ζ under F_k(s) = ζ(0.5 + (s-0.5)/τ^k) | EXP_8, EXP_10 |

**Current primary candidate**: `explicit_formula_reconstruction`, because
EXP_1 (the "Harmonic Converter") and EXP_6 (beta invariance) both operate
on the reconstruction. But the audit must verify this is the right choice.

**Important distinction:**

- **Wrong test**: Does ζ(t) literally equal ζ(c^k·t)? No — ζ has no known
  non-trivial multiplicative automorphism. EXP_10 confirms this.
- **Right test**: Does the RH-relevant object/relation/predicate transport
  under the declared gauge? That is what the certificate must determine.

---

## 3. What the claim is not

- A formal proof of RH.
- An extension of verified ordinate coverage beyond Odlyzko's range.
- A claim that numerical equivariance of reconstructions *is* a transport
  theorem for the RH predicate.
- A claim that τ is the unique gauge base.
- A claim that detecting a rogue zero under deep scaling is equivalent to
  proving RH before the Contradiction Track is formalized.

---

## 4. External premises

The claim rests on:

1. **Odlyzko's numerical verification**: the first ~10^13 nontrivial zeros
   of ζ lie on Re(s) = ½. Taken as given.
2. **Platt–Trudgian**: RH-up-to-height bounds. Taken as given.
3. **The explicit formula**: ψ(X) = X − Σ_ρ X^ρ/ρ − log(2π) − ½ log(1−X^(-2)).
   This is classical analytic number theory, not novel.

What this project adds is the structural question: does the RH-relevant
analytic structure survive the τ-indexed multiplicative gauge?

---

## 5. Proof goal

The claim can be discharged through either of two routes:

- **Program 1 (Direct transport)**: Prove the RH predicate is exactly
  transport-invariant under T_c. This requires a formal proof artifact.
- **Program 2 (Contradiction)**: Prove that any off-line zero is detectable,
  cannot hide under compression, and that detectability + no-hiding + a
  verified bounded view forces a contradiction.

Both routes require the same base claim. They differ in how the claim is
discharged.

---

## 6. Same-case criterion (NC3 — the central open question)

The claim requires defining what it means for compressed and uncompressed
views to be "the same analytic case." This is the central missing definition.

Possible criteria (not mutually exclusive):

1. **Same zero predicate**: ζ(ρ) = 0 iff ζ(T_c(ρ)) = 0.
2. **Same RH truth value**: Re(ρ) = ½ iff Re(T_c(ρ)) = ½.
3. **Same reconstruction**: ψ(X) and ψ(X/τ^k) agree up to covariant
   rescaling and subdominant corrections.
4. **Same prime lattice**: {p} and {p·τ^(-k)} have the same multiplicative
   structure.
5. **Same counterexample visibility**: an off-line zero at height γ produces
   a detectable signature at height γ·τ^(-k).

The certificate must be able to test all five, but the overall certificate
result hinges on which criterion is declared primary. This is a mathematical
decision that the human must make.

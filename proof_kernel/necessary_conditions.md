# Necessary Conditions

> Derived from the logic of the base claim, not from existing experiments.
> See [base_claim.md](base_claim.md) for the claim these conditions serve.

---

## Overview

For the base compression claim to go through, seven conditions must hold.
They are ordered by logical dependency, not by existing experiment coverage.

Only **NC4** can kill the theory outright. NC1–NC3 are definitional — their
failure means the formalization is wrong, not the intuition. NC5–NC7 are
route-dependent — their failure kills the contradiction route but not
necessarily the direct-transport route.

---

## NC1 — Object definition

**Statement.** There exists a well-defined mathematical object O whose
RH-relevant properties are the subject of the claim.

**Why needed.** If the object is not well-defined, the claim has no
mathematical content.

**Current status:** `FORMALIZED` — the explicit-formula reconstruction ψ
is classical. But the proof kernel must verify that ψ is the right
primary object or whether zero_ensemble / prime_lattice_relation is
load-bearing.

**Failure meaning:** `KILL_FORMALIZATION` — the current math formulation
chose the wrong object. Does not kill the intuition.

**Experiments that may bear on it:** EXP_1 (reconstruction exists and
computes), EXP_8 (zero ensemble exists and computes).

**Experiments that do not bear on it:** EXP_2, EXP_2B, EXP_7 (brittleness
tests), EXP_4, EXP_5 (pathfinders).

---

## NC2 — Gauge definition

**Statement.** The gauge T_c : s ↦ s · c^k is a well-defined group action
on the relevant space.

**Why needed.** If the gauge is not a legitimate action (e.g. introduces
singularities, fails to be invertible, or is not compatible with the
analytic continuation), the transport claim has no content.

**Current status:** `FORMALIZED` — the multiplicative rescaling s ↦ s·c^k
is a simple linear map on ℂ. As a group action on ℂ it is trivially
well-defined. The question is whether it preserves the relevant structure
(that is NC3/NC4, not NC2).

**Failure meaning:** `KILL_FORMALIZATION` — the gauge action is
mathematically defective.

**Experiments that may bear on it:** EXP_1B (operator-gauge falsification
shows the gauge is rigid — naive scaling fails).

**Experiments that do not bear on it:** All others test consequences, not
the gauge definition itself.

---

## NC3 — Same-case criterion (THE CENTRAL OPEN QUESTION)

**Statement.** There exists a well-defined criterion C such that
C(O, T_c(O)) = true means "compressed and uncompressed views are the
same analytic case for the purposes of the RH predicate."

**Why needed.** Without this, "same case" is undefined and the claim
cannot be evaluated. This is the single most important missing definition.

**Current status:** `UNFORMALIZED` — the codebase uses multiple proxies
(reconstruction covariance via EXP_1, beta invariance via EXP_6, zero
correspondence via EXP_8) but has never explicitly stated which of these
constitutes the "same case" criterion.

**Failure meaning:** `KILL_FORMALIZATION` — cannot define what "same case"
means. Does not kill the intuition unless no criterion exists that
captures the intended meaning.

**Possible criteria** (from base_claim.md §6):
1. Same zero predicate
2. Same RH truth value
3. Same reconstruction up to covariant rescaling
4. Same prime lattice structure
5. Same counterexample visibility

**The human must choose.** The certificate builder can test all five,
but the certificate's pass/fail must be scoped to a declared primary
criterion.

**Experiments that may bear on it:** Depends on which criterion is chosen.
If criterion (3), then EXP_1 and EXP_6. If criterion (1), then EXP_8.

---

## NC4 — Predicate transport (THEORY-KILLING IF FAILS)

**Statement.** The RH predicate is exactly transport-invariant: Re(ρ) = ½
if and only if Re(T_c(ρ)) = ½. Equivalently: any off-line zero ρ maps to
an off-line image, and conversely.

**Why needed.** This is the claim itself. NC1–NC3 define the objects, NC4
is the theorem. Without NC4, the compression argument does not work.

**Current status:** `UNFORMALIZED` — no formal proof exists. This is
GAP_RH_PREDICATE_TRANSPORT in the existing codebase.

**Failure meaning:** `KILL_THEORY` — the base claim is false. The
compression argument does not preserve the RH predicate.

**Note:** NC4 is the only condition whose failure kills the theory. All
others kill the formalization or the route.

**Experiments that may bear on it:** EXP_6 (beta_hat invariance is the
empirical proxy). But EXP_6 is numerical — it cannot prove NC4. It can
only fail to disprove it or produce a counterexample.

**Experiments that do not bear on it:** EXP_1 (reconstruction covariance
is necessary but not sufficient), EXP_8 (zero correspondence is
necessary but not sufficient), EXP_2/2B/7 (Program 2 only).

---

## NC5 — Bounded-view reduction

**Statement.** Iterating the gauge T_c maps any ordinate γ into a
computable bounded window W after finitely many steps.

**Why needed.** The contradiction route (Program 2) requires that if an
off-line zero exists at arbitrary height, it is eventually compressed
into a window where it can be checked. Without bounded-view, there is
no finite search.

**Current status:** `WITNESSED` — EXP_9 demonstrates the bounded-view
mechanics. The mathematical fact is elementary: τ^k grows/decays
exponentially, so any γ maps into [W₀, W₁] for large enough k. But
the formal bound and its relationship to coverage has not been stated
as a lemma.

**Failure meaning:** `KILL_ROUTE` — the contradiction route (Program 2)
fails. Program 1 (direct transport) is unaffected.

**Experiments that may bear on it:** EXP_9 (bounded-view demonstration).

**Experiments that do not bear on it:** Most others. NC5 is about the
gauge geometry, not about the analytic object.

---

## NC6 — No hiding under compression

**Statement.** An off-line zero ρ with Re(ρ) ≠ ½ produces a detectable
signature in the compressed representation. The deviation cannot be
absorbed by the compression.

**Why needed.** For the contradiction route: if the deviation is
undetectable after compression, the bounded view is useless.

**Current status:** `UNFORMALIZED` — EXP_2/2B/7 produce empirical
amplification data, but no formal non-hiding theorem exists. This is
GAP_PROGRAM2_FORMALIZATION in the existing codebase.

**Failure meaning:** `KILL_ROUTE` — Program 2 fails. Program 1 is
unaffected.

**Experiments that may bear on it:** EXP_2 (centrifuge), EXP_2B (rogue
isolation), EXP_7 (calibrated ε-sweep). All are Program 2 exploratory.

**Experiments that do not bear on it:** EXP_1, EXP_6, EXP_8 (these test
transport, not hiding).

---

## NC7 — Contradiction closure

**Statement.** Bounded-view (NC5) + no-hiding (NC6) + Odlyzko verification
at k=0 → any assumed off-line zero leads to a contradiction.

**Why needed.** This is the final step of the contradiction route. If NC5
and NC6 hold but the argument does not close, the route is incomplete.

**Current status:** `UNFORMALIZED` — the argument has been sketched
informally but not written as a formal derivation.

**Failure meaning:** `KILL_ROUTE` — Program 2 fails. Program 1 is
unaffected.

**Experiments that may bear on it:** None directly. NC7 is a logical
derivation from NC5 + NC6 + external premises.

---

## Summary table

| ID | Condition | Status | Kill scope | Key experiments |
|---|---|---|---|---|
| NC1 | Object definition | FORMALIZED | KILL_FORMALIZATION | EXP_1, EXP_8 |
| NC2 | Gauge definition | FORMALIZED | KILL_FORMALIZATION | EXP_1B |
| NC3 | Same-case criterion | **UNFORMALIZED** | KILL_FORMALIZATION | depends on choice |
| NC4 | Predicate transport | **UNFORMALIZED** | **KILL_THEORY** | EXP_6 (proxy only) |
| NC5 | Bounded-view reduction | WITNESSED | KILL_ROUTE | EXP_9 |
| NC6 | No hiding | **UNFORMALIZED** | KILL_ROUTE | EXP_2, EXP_2B, EXP_7 |
| NC7 | Contradiction closure | **UNFORMALIZED** | KILL_ROUTE | none directly |

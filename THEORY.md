# The Precise Claim

This document states exactly what this repository asserts and what it does
not. The authoritative ontology is in [PROOF_PROGRAM_SPEC.md](PROOF_PROGRAM_SPEC.md);
this file reorganises the mathematical content around that ontology.
Audience: a reader familiar with analytic number theory who wants to evaluate
the claims without reading source. Sibling docs:
[MATH_README.md](MATH_README.md) (derivations),
[REPRODUCE.md](REPRODUCE.md) (reviewer handoff).

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

## 1. Theorem candidate (canonical target)

This replaces the previous "Claims 1–4" framing. Claims 1–4 are not four
independent theses; they are proof obligations of a single candidate. The
canonical target is (verbatim from PROOF_PROGRAM_SPEC.md §3):

**Formal statement.**
> There exists a nontrivial multiplicative gauge `T_c : s ↦ s · c^k`
> (c > 1 real, k integer) under which the RH-relevant analytic structure
> of ζ is preserved strongly enough that the compressed view under `T_c`
> and the uncompressed view are the **same mathematical case** for the
> purposes of the Riemann Hypothesis predicate. Equivalently: if ζ has a
> non-trivial zero ρ with Re(ρ) ≠ ½, its image under `T_c` is likewise
> off the critical line, and conversely.

**Plain-language statement.**
> If the relevant zeta/prime structure can be transported into a
> compressed scale without changing the RH-relevant behavior, then
> searching arbitrarily further in the uncompressed scale becomes
> logically redundant rather than mathematically necessary.

**Working gauge.** The project takes c = τ = 2π. **Uniqueness of τ is not
a proof obligation**; whether another c > 1 would also serve is an open
research question parked as `GAP_TAU_UNIQUENESS` and explicitly outside
the critical path.

---

## 2. Proof obligations (what the candidate decomposes into)

The following obligations are what would have to hold for the theorem
candidate to go through. They are stated, not measured. Each obligation
has an ID that is the canonical cross-reference across the schema, the
API, and the UI.

### OBL_COORD_RECONSTRUCTION_COVARIANCE

**Statement.** Under X → X/τᵏ, the explicit formula ψ transforms
covariantly:

  ψ(X/τᵏ) = τ⁻ᵏ · ψ(X) + subdominant corrections,

where "subdominant" means corrections whose relative size vanishes as X
grows into the asymptotic regime. Derivation: [MATH_README.md §2].

**Role in the program.** This is what licenses treating coordinate
rescaling as a legitimate structural transformation of the
reconstruction, not a data-mangling operation.

**Witnesses.** EXP_1 (coherence witness — shows numerical covariance on
the tested k-range at declared fidelity). EXP_1B (control — arms the
falsifier by breaking when a *wrong* group action is substituted).

**What witnesses do not establish.** Covariance of the reconstruction is
not covariance of the RH predicate. A witness at finite fidelity does
not upgrade this obligation to formally proven.

### OBL_ZERO_SCALING_EQUIVALENCE

**Statement.** Scaling zeros by τᵏ is isometric to scaling the prime
lattice by τᵏ in the reconstruction:

  zeros of ζ(s · τᵏ) = { ρ · τ⁻ᵏ : ζ(ρ) = 0 }.

This is a variable substitution and is *formal* at that level: if
ζ(ρ) = 0, then ζ((ρ · τ⁻ᵏ) · τᵏ) = ζ(ρ) = 0, so ρ · τ⁻ᵏ is a zero of
s ↦ ζ(s·τᵏ).

**Role in the program.** Fixes the precise sense in which the scaled
lattice is a conformal copy, not a new analytic object.

**Witnesses.** EXP_1C (coherence witness — numerical isometry within
documented drift/ratio tolerances).

**EXP_8 is `REGRESSION_CHECK`, not a witness.** EXP_8 verifies that the
engine's zero generator respects this identity numerically. Its purpose
is to confirm the implementation does not silently violate an identity
already assumed. A failure of EXP_8 means a bug, not a theory update.
This was already the repo's own characterization ("plumbing, not
evidence"); under the canonical ontology it is now the
`REGRESSION_CHECK` function.

### OBL_BETA_INVARIANCE

**Setup.** Let β̂(k) denote the best-fit real part of the critical line
*as recovered empirically* by reconstructing ψ from τ⁻ᵏ-scaled zeros
using the coordinate gauge. β̂(k) is an optimizer output, not an
identity: it is the β that minimizes reconstruction residual for scale
k given access to the scaled zeros.

**Statement.** β̂(k) = ½ for all k in the tested range, to within
optimizer tolerance at AUTHORITATIVE fidelity.

**Role in the program.** This is the empirical invariance the candidate
needs: coordinate covariance alone does not tell you the *critical line*
stays at ½. If β̂(k) drifts under scaling, the compression story is not
preserving the RH-relevant condition cleanly.

**Witnesses.** EXP_6 (`PROOF_OBLIGATION_WITNESS`, provisional — currently
the clearest candidate to produce theorem-directed evidence on tested
settings; mapping remains provisional pending `GAP_WITNESS_MAP_REVIEW`
and the Sprint 3b.0 signoff artifact in [WITNESS_MAP_REVIEW.md](WITNESS_MAP_REVIEW.md)).
EXP_3 (control — arms the falsifier by making an obviously-wrong β=π
hypothesis diverge as expected).

**Documentation guardrail.** Until witness-map signoff is complete, this
repository treats witness mappings as provisional research assignments,
not as settled theorem-directed evidence.

**Caveat on fidelity.** At SMOKE tier (N < 500 zeros), the β̂ optimizer
has known artifacts — β̂ ≈ 0.43 is common, reflecting optimizer
discretization, not an invariance failure. The verifier clamps any
fidelity-sensitive outcome (witness / coherence / exploratory) to
`INCONCLUSIVE` at SMOKE tier and flags STANDARD-tier witnesses as
provisional. Cite AUTHORITATIVE only.

**What witnesses do not establish.** A consistent witness at one fidelity
tier does not formally prove β-invariance; it does not extend to
untested k; and it does not, on its own, establish exact transport of
the RH predicate.

### OBL_EXACT_RH_TRANSPORT

**Statement.** The RH predicate itself — not merely the reconstruction,
not merely the zero locations, not merely the β̂ fit — transports
exactly under the gauge T_c.

**Role in the program.** This is the step the three obligations above do
not, on their own, establish. OBL_COORD_RECONSTRUCTION_COVARIANCE gives
you coherent coordinate transport; OBL_ZERO_SCALING_EQUIVALENCE gives
you formal identity-level zero transport; OBL_BETA_INVARIANCE gives you
empirical critical-line stability. What is missing is a proof that the
predicate *Re(ρ) = ½* transports exactly — i.e. that any counterexample
at arbitrary height necessarily shows up in the compressed window, and
the reverse.

**Witnesses.** None currently. This obligation has no empirical witness
in the current apparatus; it is the theorem-level claim awaiting a
formal artifact.

**Open gap.** `GAP_RH_PREDICATE_TRANSPORT` blocks this obligation.

### OBL_ROGUE_DETECTABILITY *(Program 2, exploratory)*

**Statement (informal).** Any off-line zero within the covered ordinate
range produces an amplification signature that is finite-k-detectable
under the gauge.

**Program assignment.** This obligation belongs to **Program 2
(contradiction-by-detectability)**, which is explicitly **not on the
proof-critical path** under the canonical Program 1 posture (direct
invariance). Program 2 is retained as a research route and diagnostic
tooling, not retired; but it does not currently produce theorem-directed
evidence, and its witnesses must not be conflated with Program 1
obligations.

**Witnesses (exploratory only).** EXP_2, EXP_2B, EXP_7.

**Open gap.** `GAP_PROGRAM2_FORMALIZATION` — the contradiction route
lacks a formal amplification / non-hiding theorem. Until that gap is
closed, EXP_2 / EXP_2B / EXP_7 remain `EXPLORATORY`, not
`PROOF_OBLIGATION_WITNESS`.

---

## 3. What witnesses, controls, pathfinders, and regression checks do

Witnesses are empirical or numerical observations consistent with an
obligation at the declared scope and fidelity. They cannot upgrade an
obligation to formally proven, and they do not cover untested k or
higher ordinates.

Controls (EXP_1B, EXP_3) must fail on known-bad input. A passing control
is an instrument-health signal — it *arms* the falsifier for an
adjacent obligation. A passing control is not, by itself, evidence for
the theorem candidate.

Pathfinders (EXP_4, EXP_5) select a research direction. Their output is
directional (e.g. `TRANSLATION` vs `DILATION`), not supporting/refuting.
A pathfinder that "answers" has informed what to do next; it has not
voted on the theorem.

Regression checks (EXP_8) verify that the implementation still satisfies
an identity that is assumed, not measured. A regression failure means a
bug in the engine, not a theory update.

Exploratory experiments (EXP_2, EXP_2B, EXP_7) bear on Program 2 only.
Their consistent outcomes support a research direction that is not
currently on the proof-critical path.

**Positive-evidence rule (PROOF_PROGRAM_SPEC.md §5).** Only a record with
`function = PROOF_OBLIGATION_WITNESS`, `outcome = CONSISTENT`, and
`epistemic_level ∈ {FORMAL, EMPIRICAL}` at AUTHORITATIVE fidelity
contributes theorem-directed evidence. Controls passing, pathfinders
choosing, regression checks passing, coherence witnesses being
consistent, and exploratory experiments succeeding are **preconditions
for trusting evidence**, not themselves evidence.

Every experiment's record carries mandatory `inference` rails
(`inference_scope` / `allowed_conclusion` / `disallowed_conclusion`)
that encode exactly these constraints. Surfaces that render a result
must render at least one of the rails.

---

## 4. The combined empirical argument (revised)

1. **External premise.** Odlyzko has numerically verified ζ's first
   ~10¹³ non-trivial zeros lie on Re(s) = ½. Platt–Trudgian extend
   RH-up-to-height bounds. We take these as given.
2. **Obligations OBL_COORD_RECONSTRUCTION_COVARIANCE and
   OBL_ZERO_SCALING_EQUIVALENCE.** Coherence witnesses (EXP_1, EXP_1C)
   are consistent at declared fidelity; controls (EXP_1B, EXP_3) arm as
   expected; regression check (EXP_8) reports `IMPLEMENTATION_OK`. The
   reconstruction and the zero-relabeling identity are numerically
   coherent on the tested range.
3. **Obligation OBL_BETA_INVARIANCE.** Provisional witness EXP_6
   produces `CONSISTENT` at AUTHORITATIVE fidelity (see REPRODUCE.md
   for the overkill tier).
4. **Obligation OBL_EXACT_RH_TRANSPORT.** No empirical witness. Open
   gap `GAP_RH_PREDICATE_TRANSPORT` is explicitly unresolved.
5. **Program 2 exploratory.** Brittleness experiments (EXP_2, EXP_2B,
   EXP_7) report consistent amplification on the tested perturbations;
   this informs the Program 2 research direction. Not theorem-directed
   evidence under the canonical posture.

**Conclusion (correctly scoped).** The RH-relevant structure is
numerically coherent under the τ-indexed multiplicative gauge on the
regime jointly covered by Odlyzko's external verification, our tested
k-range, and AUTHORITATIVE-fidelity measurement. The obligation
`OBL_EXACT_RH_TRANSPORT` remains open; the gauge is not yet proved to
transport the RH predicate exactly.

---

## 5. The non-claim

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
- **Brittleness / detectability is not a proof route under the canonical
  posture.** Program 2 is retained as exploratory, not retired. Its
  empirical amplification results calibrate an instrument; they do not
  establish a non-hiding theorem, which is `GAP_PROGRAM2_FORMALIZATION`.
- **τ is not claimed to be unique.** Whether other c > 1 would serve the
  same role is parked as `GAP_TAU_UNIQUENESS` and explicitly outside the
  critical path.

---

## 6. Relationship to prior work

This repo sits on top of, and explicitly relies on:

- **Odlyzko's numerical verification** of ζ's zeros on the critical
  line for the first ~10¹³ zeros. We use his 100k-zero file (at ~10⁻⁹
  precision) for the Overkill reproduction tier; see
  [REPRODUCE.md §2](REPRODUCE.md#2-how-to-run).
- **Platt–Trudgian** on RH-up-to-height bounds, which give us the
  ordinate range for which the external premise holds.

What this repo *adds* is a structural apparatus: does the RH-relevant
analytic structure survive the τ-indexed multiplicative gauge? The
obligations above decompose that question; the experiments produce
witnesses, controls, pathfinders, and regression checks against those
obligations, each with explicit inference rails documenting what their
outcomes may and may not be taken to imply.

What this repo *assumes* is that Odlyzko's verification at k=0 is
correct. If that assumption is wrong, nothing here is salvageable. The
assumption is commonly accepted and well-audited; we note it
explicitly.

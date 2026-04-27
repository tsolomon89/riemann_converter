# PROOF_TARGET.md

**Canonical theorem-facing document for the Riemann Converter.**

## Layer dominance

- `PROOF_TARGET.md` (this document) is the canonical **theorem-facing** source. It dominates in theorem posture.
- [PROOF_PROGRAM_SPEC.md](PROOF_PROGRAM_SPEC.md) is the canonical **ontology / rails / semantics** source. It dominates in semantic posture.
- Where the two conflict on the theorem statement itself, **this document wins**. Where they conflict on how evidence is classified or how inference rails work, the spec wins.

Neither document is decorative. Both are required reading. Keeping them in distinct layers is what prevents the program from re-collapsing into "what the experiments may and may not infer" at the expense of "what, exactly, are we trying to prove."

---

## 1. Canonical theorem target

Under the working gauge

$$T_c : s \mapsto s \cdot c^k, \qquad c = \tau = 2\pi, \quad k \in \mathbb{Z},$$

the RH predicate is **transport-invariant**:

> $\zeta$ has a non-trivial zero $\rho$ with $\mathrm{Re}(\rho) \neq \tfrac{1}{2}$ **if and only if** $T_c(\rho)$ is likewise off the critical line.

Equivalently: **no off-line zero can exist on one side of the gauge without existing on the other.**

This is the strongest form of the claim the program commits to. The earlier phrase *"preserved strongly enough"* is retired. The target is exact predicate transport, stated sharply.

## 2. Operational corollary — bounded-view equivalence

As a *consequence* of §1, not as a separate headline:

> If exact transport holds, then for any off-line zero $\rho$ at arbitrarily large height, some iterate $T_c^k(\rho)$ lands in a bounded window $W \subseteq \mathbb{C}$ computable in advance. **Checking RH on $W$ suffices; unbounded search is logically redundant rather than mathematically necessary.**

Bounded-view equivalence is the operational *payoff* of the theorem target — it is what makes the theorem worth proving — but it is not itself the theorem. Stating it as a corollary, rather than as the main claim, prevents the weaker claim from silently replacing the stronger one.

## 3. Working gauge

The project takes $c = \tau = 2\pi$ as the **current working gauge only**. Uniqueness of $\tau$ is **not a proof obligation**. Whether any other $c > 1$ would also serve (e.g. $\sqrt{2}$, $e$) is a parked open research question — see [`GAP_TAU_UNIQUENESS`](PROOF_PROGRAM_SPEC.md#11-open-gaps).

## 4. Obligation ladder

The theorem target is discharged through a DAG of named obligations, not a flat checklist. Each obligation has a canonical ID, one of four ladder statuses, and declared dependencies. Status is **computed** per run from witness observations, fidelity, the witness-map review gate, and the gap/blocker graph — never hand-edited.

### Program 1 — direct invariance (canonical proof-critical chain)

| # | Obligation | Depends on | Current status | Blocked by |
|---|---|---|---|---|
| 1 | `OBL_COORD_RECONSTRUCTION_COVARIANCE` — Under $X \mapsto X/\tau^k$, the explicit-formula reconstruction of $\psi$ transforms covariantly modulo subdominant corrections. | — (foundation) | CONJECTURAL | — |
| 2 | `OBL_ZERO_SCALING_EQUIVALENCE` — Scaling zeros $\rho$ by $\tau^k$ is isometric to scaling the prime lattice by $\tau^k$. | (1) | BLOCKED | (1) not yet witnessed |
| 3 | `OBL_BETA_INVARIANCE` — $\hat{\beta}(k) = \tfrac{1}{2}$ across the tested $k$-family within optimizer tolerance. | (2) | BLOCKED | (2) not yet witnessed |
| 4 | **`OBL_EXACT_RH_TRANSPORT`** — the RH predicate itself transports exactly under $T_c$. **Load-bearing.** | (1), (2), (3) | BLOCKED | all three prereqs + `GAP_RH_PREDICATE_TRANSPORT` |

Obligation 4 is the real center of the ladder. Obligations 1–3 are necessary but not sufficient; even when all three reach WITNESSED, obligation 4 still requires `GAP_RH_PREDICATE_TRANSPORT` to be discharged by a formal proof artifact.

### Program 2 — contradiction by detectability (exploratory, outside the critical chain)

| # | Obligation | Depends on | Current status |
|---|---|---|---|
| P2.1 | `OBL_ROGUE_DETECTABILITY` — any off-line zero in the covered ordinate range produces a finite-$k$-detectable amplification signature. | — | BLOCKED (`GAP_PROGRAM2_FORMALIZATION`) |

Program 2 is now the explicit **Contradiction Track**. It is not casual side work, but it also does **not** contribute theorem-directed evidence until rogue detectability, no-hiding under compression, and contradiction closure are formalized. It cannot silently redefine the Program 1 theorem target.

Additional Contradiction Track obligations:

| # | Obligation | Depends on | Current status |
|---|---|---|---|
| P2.2 | `OBL_NO_HIDING_UNDER_COMPRESSION` — compression by $\tau^k$ cannot move a rogue zero outside every bounded/verified view needed by the contradiction argument. | P2.1 | BLOCKED (`GAP_NO_HIDING_UNDER_COMPRESSION`) |
| P2.3 | `OBL_CONTRADICTION_CLOSURE` — detectability plus no-hiding plus a verified bounded view yields the contradiction needed to close the alternate route. | P2.1, P2.2 | BLOCKED (`GAP_CONTRADICTION_CLOSURE`) |

## 5. Ladder status rubric

For every obligation, exactly one of:

- **PROVEN** — a formal proof artifact (Lean/Coq hash) is recorded for this obligation. No current occupants.
- **WITNESSED** — some `PROOF_OBLIGATION_WITNESS` experiment bearing on this obligation produced a `CONSISTENT` outcome at `AUTHORITATIVE` fidelity, **and** witness-map review is `SIGNED_OFF`. Until sign-off lands, no obligation can reach WITNESSED.
- **BLOCKED** — at least one `depends_on` prereq is not yet `WITNESSED|PROVEN`, or some `open_gap.blocker_for` names this obligation. The specific blockers are listed in `blocked_by`.
- **CONJECTURAL** — the default. No witness, no blocker; just not addressed yet.

The computation is in `verifier._build_proof_program()` and is covered by `tests/test_proof_program.py`.

## 6. What this document does not claim

The sharpened theorem target stands; these remain explicit non-claims, but they are now subordinate to the target rather than leading:

- A formal proof of RH. No Lean / Coq / axiomatic chain exists in this repo.
- Extension of verified ordinate coverage beyond Odlyzko's range. Scaling already-verified zeros produces scaled copies of the verified zero set; it does not produce new zeros of the original $\zeta$ at higher ordinate.
- That numerical equivariance of reconstructions is itself a transport theorem for the RH predicate. Plot overlays, residual stability, and $\hat{\beta}$ fits are empirical witnesses; they do not constitute proof.
- That $\tau$ is the unique multiplicative base for which the invariance can hold.
- That detecting a rogue zero under deep scaling is equivalent to proving RH before the Contradiction Track's non-hiding and closure obligations are formalized.

### What would close the proof?

- `GAP_RH_PREDICATE_TRANSPORT`: a proof artifact for exact transport of the RH predicate under the working gauge.
- `GAP_PROGRAM2_FORMALIZATION`: a formal amplification/detectability theorem for rogue/off-line zeros.
- `GAP_NO_HIDING_UNDER_COMPRESSION`: a proof that compression cannot move a rogue zero outside every bounded/verified view.
- `GAP_CONTRADICTION_CLOSURE`: a closure argument showing detectability plus no-hiding plus a verified bounded view forces the contradiction.

## 7. Evidence semantics

How each obligation reaches WITNESSED, and what counts as theorem-directed evidence, is governed by [PROOF_PROGRAM_SPEC.md §5 / §6 / Decision Log #6–7](PROOF_PROGRAM_SPEC.md). Only `PROOF_OBLIGATION_WITNESS + CONSISTENT + AUTHORITATIVE` contributes theorem-directed evidence; controls, pathfinders, coherence witnesses, and regression checks are preconditions or instrumentation, never evidence for the target itself. That rule is deliberately conservative and is not relaxed by this document.

## 8. What follows from this document

This document is theorem-facing. Implementations downstream of it must mirror, not re-author, the theorem statement:

- [verifier.py](verifier.py) `PROOF_PROGRAM_TEMPLATE.theorem_candidate` — the canonical machine copy of §1 and §2.
- [lib/types.ts](lib/types.ts) `ProofProgram.theorem_candidate` — the TypeScript mirror.
- [lib/research-types.ts](lib/research-types.ts) `TheoremCandidatePayload` — the API/MCP payload mirror.
- [components/ProofProgramMap.tsx](components/ProofProgramMap.tsx) — the rendered UI mirror.

If any of those four sources drift from this document, **this document wins** and the drift is a bug to fix, not a judgment call.

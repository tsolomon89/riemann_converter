# Obligation Movement Analysis

Why has no obligation status moved across 23 runs? What would have to change for one to move? This document answers those questions from the source — [verifier.py:681-789](../verifier.py) — and surfaces a non-obvious risk about the upcoming witness-map sign-off.

---

## 1. The status ladder

[verifier._build_proof_program](../verifier.py) ([verifier.py:681](../verifier.py)) assigns each obligation one of four statuses, evaluated in order:

| Order | Status | Required conditions |
|---|---|---|
| 1 | **PROVEN** | `has_formal_proof_artifact(obl_id)` returns truthy. Currently the default is `lambda _: False`; no formal proof artifacts exist. |
| 2 | **WITNESSED** | (a) `witness_map_review_status == "SIGNED_OFF"` AND (b) `fidelity_tier == "AUTHORITATIVE"` AND (c) at least one `PROOF_OBLIGATION_WITNESS`-mapped experiment produced a `CONSISTENT` outcome with `provisional == False`. |
| 3 | **BLOCKED** | Any `depends_on` prereq is not `WITNESSED`/`PROVEN`, OR any open gap names it in `blocker_for`. |
| 4 | **CONJECTURAL** | Default. |

Note the absence of `REFUTED`. The ladder has no negative terminal. An `INCONSISTENT` witness outcome simply causes the WITNESSED branch to not fire — the obligation falls through to BLOCKED or CONJECTURAL.

## 2. Why no obligation has moved across 23 runs

Three independent gates currently keep every obligation at `BLOCKED` or `CONJECTURAL`:

**Gate A — Witness map review.** [verifier.py:224](../verifier.py): `WITNESS_MAP_REVIEW_STATUS = "PENDING_SIGNOFF"`. The WITNESSED branch is unreachable from this state. No matter how good the data is, no obligation can become WITNESSED until this gate flips.

**Gate B — Witness coverage.** [verifier.py:220-222](../verifier.py): `OBLIGATION_MAP = {"EXP_6": "OBL_BETA_INVARIANCE"}`. Only EXP_6 has `function == "PROOF_OBLIGATION_WITNESS"`. EXP_1 and EXP_1C are `COHERENCE_WITNESS` — the proof-program builder filters them out at [verifier.py:740](../verifier.py). So three of the five obligations have no witness experiment mapped at all:

| Obligation | Has a `PROOF_OBLIGATION_WITNESS`? | Could it ever become WITNESSED? |
|---|---|---|
| OBL_COORD_RECONSTRUCTION_COVARIANCE | No | Not without one |
| OBL_ZERO_SCALING_EQUIVALENCE | No | Not without one |
| **OBL_BETA_INVARIANCE** | Yes — EXP_6 | Yes — IF its prereqs become WITNESSED |
| OBL_EXACT_RH_TRANSPORT | No (and blocked by `GAP_RH_PREDICATE_TRANSPORT`) | Only via PROVEN |
| OBL_ROGUE_DETECTABILITY | No (and Program 2 / blocked by `GAP_PROGRAM2_FORMALIZATION`) | Out of scope |

**Gate C — Dependency chain.** Even if gates A and B were both lifted for OBL_BETA_INVARIANCE, it would still stay BLOCKED. Its `depends_on = ["OBL_ZERO_SCALING_EQUIVALENCE"]`, which has no witness ([verifier.py:436-457](../verifier.py)). With no witness, OBL_ZERO_SCALING_EQUIVALENCE stays CONJECTURAL or BLOCKED forever, which keeps OBL_BETA_INVARIANCE stuck in BLOCKED.

**Conclusion.** The reason no obligation has ever moved is **not** noisy data or bad luck. It is structural: the current witness map cannot move any obligation under any data, even at AUTHORITATIVE fidelity, even after sign-off, until additional `PROOF_OBLIGATION_WITNESS` experiments are added for the upstream obligations.

## 3. The non-obvious risk at witness-map sign-off

Earlier session notes (including the prior draft of [analyzer_followups.md](analyzer_followups.md)) claimed signing off the witness map would "immediately refute OBL_BETA_INVARIANCE" because of EXP_6's INCONSISTENT outcome. **That was wrong.** The verifier has no REFUTED status. The actual post-signoff state, given today's run:

| Obligation | Today | Post-signoff (no other changes) |
|---|---|---|
| OBL_COORD_RECONSTRUCTION_COVARIANCE | CONJECTURAL | CONJECTURAL (no witness mapped) |
| OBL_ZERO_SCALING_EQUIVALENCE | BLOCKED | BLOCKED (prereq still CONJECTURAL) |
| OBL_BETA_INVARIANCE | BLOCKED | BLOCKED (prereq still not WITNESSED) |
| OBL_EXACT_RH_TRANSPORT | BLOCKED | BLOCKED |
| OBL_ROGUE_DETECTABILITY | BLOCKED | BLOCKED |

**No obligation moves.** The data state changes — but the ladder doesn't.

What *does* change at sign-off is the analyzer's headline rule: from **Rule 4** (NON_DECISIVE_NEGATIVE: "EXP_6 is INCONSISTENT BUT mapping not signed off") to **Rule 3** (DECISIVE_NEGATIVE: "EXP_6 is INCONSISTENT, mapping signed off, no caveats apply"). The analyzer would loudly say "the only theorem-relevant witness produces an inconsistent outcome with no remaining caveats" — even though the obligation status itself doesn't move.

This severity escalation is the real risk. Anyone reading the analyzer report after sign-off would see a DECISIVE_NEGATIVE headline that the obligation block doesn't reflect. The presentation gap that motivated this whole work would re-open in the opposite direction: now the headline would be MORE pessimistic than the obligation state, instead of less.

## 4. What would actually move OBL_BETA_INVARIANCE to WITNESSED

All four conditions, simultaneously:

1. `WITNESS_MAP_REVIEW_STATUS = SIGNED_OFF`.
2. A `PROOF_OBLIGATION_WITNESS` experiment for OBL_COORD_RECONSTRUCTION_COVARIANCE that produces CONSISTENT at AUTHORITATIVE — likely a promotion of EXP_1 (currently `COHERENCE_WITNESS`).
3. A `PROOF_OBLIGATION_WITNESS` experiment for OBL_ZERO_SCALING_EQUIVALENCE that produces CONSISTENT at AUTHORITATIVE — likely a promotion of EXP_1C (currently `COHERENCE_WITNESS`).
4. EXP_6 itself produces CONSISTENT at AUTHORITATIVE (today it produces INCONSISTENT with β̂ ≈ 0.5700).

[WITNESS_MAP_REVIEW.md §5](../WITNESS_MAP_REVIEW.md) already lists "Should EXP_1 / EXP_1C remain indirect obligation-bearing coherence witnesses, or should either be promoted/demoted after stricter criteria review?" as an unresolved question. That question is load-bearing: a "no, leave them as coherence witnesses" answer locks all upstream obligations into permanent BLOCKED status.

## 5. Recommendation for the next sprint

Before signing off the witness map ([WITNESS_MAP_REVIEW.md §6](../WITNESS_MAP_REVIEW.md) signoff criteria), do two things in this order:

1. **Resolve the EXP_1 / EXP_1C promotion question.** If they stay COHERENCE_WITNESS, document explicitly that no obligation in the current architecture can ever move to WITNESSED — the ladder is permanently stuck, and the project is operating in a "coherence + control" mode rather than a "witness" mode. That is a defensible posture, but it should be stated.
2. **Investigate EXP_6's β̂ stability under N.** [verifier.py:73-89](../verifier.py) notes the optimizer stabilizes at ~0.43 at N=100 and is now at 0.57 at N=20000. Run EXP_6 at N ∈ {10K, 20K, 50K, 100K} and chart β̂(N). If it continues to drift, the threshold of 0.005 is too tight for a quantity that hasn't been shown N-stable; revisit before sign-off. If it stabilizes at 0.57, the negative signal is real and the project should plan the post-signoff narrative around a DECISIVE_NEGATIVE that the obligation block does not move.

Doing #1 changes the ladder. Doing #2 calibrates the signal. Skipping either before sign-off creates a presentation gap exactly like the one this whole sprint was built to close — just on the opposite side.

## 6. What the analyzer surfaces today

[reports/latest.md](../reports/latest.md) Headline: **Rule 4 (NON_DECISIVE_NEGATIVE)**. Stage Cross-Check flags `brittleness=REFUTES` as having no Program-1 theorem members. Obligation Movement section reports "0 movements across 23 runs." All correct, deterministic, and testable.

The analyzer cannot detect Gate B (no upstream witness mapping). That requires the structural critique above. A useful follow-up would be to extend [analyzer/decompose.py](../analyzer/decompose.py) to compute "ladder reachability" — for each obligation, can it ever reach WITNESSED given the current OBLIGATION_MAP? — and surface that under "Obligation Movement" as a permanent caveat per obligation.

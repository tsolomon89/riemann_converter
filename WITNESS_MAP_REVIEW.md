# WITNESS_MAP_REVIEW

This document is the Sprint 3b.0 witness-map review artifact.

It is separate from [PROOF_PROGRAM_SPEC.md](PROOF_PROGRAM_SPEC.md), which
remains the canonical ontology source.

---

## 1. Purpose

Record the current experiment -> obligation mapping state, mark what is still
provisional, and define signoff criteria before any API contract treats witness
mappings as authoritative.

---

## 2. Guardrails

- Witness mapping remains provisional until explicit signoff is complete.
- No API/schema contract finalization may treat provisional mappings as
  authoritative before signoff.
- No documentation written in this sprint may phrase provisional witness
  mappings as settled theorem-directed evidence.

---

## 3. Current mapping snapshot (provisional where marked)

| Experiment | Function | Program | Obligation bearing | Mapping state |
|---|---|---|---|---|
| EXP_1 | `COHERENCE_WITNESS` | PROGRAM_1 | indirect -> `OBL_COORD_RECONSTRUCTION_COVARIANCE` | Provisional |
| EXP_1B | `CONTROL` | PROGRAM_1 | arms `OBL_COORD_RECONSTRUCTION_COVARIANCE` falsifier | Provisional |
| EXP_1C | `COHERENCE_WITNESS` | PROGRAM_1 | indirect -> `OBL_ZERO_SCALING_EQUIVALENCE` | Provisional |
| EXP_2 | `EXPLORATORY` | PROGRAM_2 | optional -> `OBL_ROGUE_DETECTABILITY` | Provisional |
| EXP_2B | `EXPLORATORY` | PROGRAM_2 | optional -> `OBL_ROGUE_DETECTABILITY` | Provisional |
| EXP_3 | `CONTROL` | PROGRAM_1 | arms `OBL_BETA_INVARIANCE` falsifier | Provisional |
| EXP_4 | `PATHFINDER` | PROGRAM_1 | none (direction selector) | Provisional |
| EXP_5 | `PATHFINDER` | PROGRAM_1 | none (direction selector) | Provisional |
| EXP_6 | `PROOF_OBLIGATION_WITNESS` | PROGRAM_1 | `OBL_BETA_INVARIANCE` | Provisional (high-priority review) |
| EXP_7 | `EXPLORATORY` | PROGRAM_2 | optional -> `OBL_ROGUE_DETECTABILITY` | Provisional |
| EXP_8 | `REGRESSION_CHECK` | PROGRAM_1 | none (implementation identity check) | Provisional |

---

## 4. Rationale by mapping cluster

### 4.1 Program 1 witness/coherence/control cluster

- EXP_1 and EXP_1C are coherence witnesses: they show numerical coherence of
  reconstruction/zero-scaling claims within declared settings.
- EXP_1B and EXP_3 are controls: they arm falsifiers and establish instrument
  trust boundaries.
- EXP_6 is the only current candidate for direct obligation witness status in
  Program 1 (`OBL_BETA_INVARIANCE`), but remains provisional pending review.

### 4.2 Program 1 pathfinder/regression cluster

- EXP_4 and EXP_5 are direction selectors and should not be interpreted as
  theorem evidence.
- EXP_8 is implementation plumbing and should stay outside witness semantics.

### 4.3 Program 2 exploratory cluster

- EXP_2 / EXP_2B / EXP_7 remain exploratory under Program 2 and must not be
  treated as Program 1 theorem-directed evidence.
- Their obligation link to `OBL_ROGUE_DETECTABILITY` stays optional pending
  closure of `GAP_PROGRAM2_FORMALIZATION`.

---

## 5. Unresolved or disputed mapping questions

1. Is EXP_6 the only `PROOF_OBLIGATION_WITNESS` for `OBL_BETA_INVARIANCE`, or
   should additional witness-class evidence be required before treating this
   mapping as stable?
2. Should EXP_1 / EXP_1C remain indirect obligation-bearing coherence witnesses,
   or should either be promoted/demoted after stricter criteria review?
3. Should Program 2 experiments keep optional obligation links in the public
   artifact until Program 2 formalization is complete?
4. Are any current inference rails too permissive relative to the provisional
   mapping labels?

---

## 6. Signoff criteria (required before API authority)

All criteria below must be satisfied:

1. Each experiment has a documented mapping rationale tied to explicit
   `inference.allowed_conclusion` and `inference.disallowed_conclusion`.
2. No mapping marked provisional is represented as settled theorem evidence in
   docs, UI copy, or API contract language.
3. Program 1 and Program 2 boundaries are explicit and non-coequal in
   semantics.
4. At least one reviewer pass verifies that obligation-bearing mappings are
   auditable from artifact data alone.
5. Review outcome is recorded in a signed decision log entry in this file.

---

## 7. Gate policy

Status: **SIGNED_OFF**.

Witness mappings are now authoritative. API contracts may treat them as stable.

### Decision log

| Date (UTC) | Reviewer(s) | Decision | Scope | Notes |
|---|---|---|---|---|
| 2026-04-28 | T. Solomon + Antigravity | **WITNESS PROMOTION** | EXP_1, EXP_8 | EXP_1 (CORE-1)→OBL_COORD_RECONSTRUCTION_COVARIANCE, EXP_8 (WIT-1, formerly REG-1)→OBL_ZERO_SCALING_EQUIVALENCE. Full Program 1 chain now wired: 3 witnesses covering obligations 1-3. |
| 2026-04-28 | T. Solomon + Antigravity | **SIGNED_OFF** | Full witness map | Reviewed against `project_alignment.md`. All 7 alignment criteria met. All 5 sign-off criteria satisfied. EXP_6→OBL_BETA_INVARIANCE is the sole direct witness. All other experiments correctly classified. |
| — | — | OPEN | Initial Sprint 3a artifact | Signoff deferred to Sprint 3b.0 review gate |


# PROOF_PROGRAM_SPEC.md

**Canonical ontology and research semantics for the Riemann Converter.**

_Workstream 1 of the "Reframe as a proof-program research instrument" epic. Planning / spec only — no schema, UI, or docs changes in this document. Sprints 2 and 3 consume this spec._

---

## 1. Purpose

This document defines **what the Riemann Converter project is, and is not**, in terms that the app's schema, UI, docs, and (future) research API must all respect.

**What this spec is.**
- The frozen ontology for the project's research semantics: how the theorem candidate, proof obligations, witnesses, controls, pathfinders, and diagnostics relate.
- The authoritative terminology source for Sprints 2 (schema + UI reframe) and 3 (docs + research API).
- A drift guardrail: it names the precise surfaces where the current app muddles theorem with evidence, and fixes the language before Codex or any other agent rewrites the code.

**What this spec is not.**
- Not a proof of anything. No mathematical content is established here that is not already established elsewhere in the repo.
- Not new mathematics. It re-describes the existing project honestly; it does not extend it.
- Not a UI design document. It dictates semantics, not visual layout.
- Not a final classification of every experiment's role. The mapping of specific experiments to proof obligations is provisional and is explicitly scheduled for review (see §11 `GAP_WITNESS_MAP_REVIEW`).

**Precedence rule.** Where this document conflicts with existing text in [THEORY.md](THEORY.md), [MATH_README.md](MATH_README.md), [README.md](README.md), or any in-app copy, this document wins. Those files will be brought into alignment in Sprint 3a (Docs Alignment). Until then, treat them as subordinate.

---

## Decision Log (locked)

The items below are locked decisions for this workstream. Changing any of them is a **spec amendment**, not an implementation detail — it requires re-opening this document, not a code-level judgment call.

1. **Filename and location.** `PROOF_PROGRAM_SPEC.md` at the repo root, sibling to `THEORY.md`, `MATH_README.md`, `REPRODUCE.md`. Canonical.
2. **Proof posture.**
   - **Program 1 — Direct invariance.** Canonical. Defines the current proof target (see §3).
   - **Program 2 — Contradiction by detectability.** Exploratory only. Retained as diagnostic tooling and as a possible future route; explicitly **not** on the current proof-critical path; explicitly **not** permitted to silently redefine the theorem candidate.
3. **Theorem candidate.** The simpler transport-invariance formulation in §3 is canonical. THEORY.md's existing Claim 1–4 decomposition is **subordinate** to §3: claims 1–4 are either reclassified as proof obligations of the §3 candidate, or as witness-level support, or as plumbing. They do not redefine the target.
4. **τ-uniqueness.** τ is the current working gauge only. **Uniqueness of τ is not a present proof obligation.** Whether another `c > 1` would also serve as a gauge is an open research question parked outside the critical path (see `GAP_TAU_UNIQUENESS` in §11).
5. **Stage axis.** The `stage` field (`gauge` / `lattice` / `brittleness` / `control`) is **preserved** in the schema as a noncanonical grouping and navigation axis. It is **demoted, not removed**. Forbidden semantics: no stage-level SUPPORTS/REFUTES rollup, no implied proof-progress ordering, no contribution to the theorem candidate.
6. **No experiment directly outputs a theorem verdict.** No experiment, control, pathfinder, or regression check is authorized to emit SUPPORTS / REFUTES / PASS / FAIL on the theorem candidate. Theorem-directed evidence is produced only by aggregating `PROOF_OBLIGATION_WITNESS` results against the obligation map, and even then the aggregate is advisory, not a verdict.
7. **Inference rails are mandatory.** Every experiment record and every proof obligation must declare `inference_scope`, `allowed_conclusion`, and `disallowed_conclusion` (see §5, §6). Any UI or API surface that renders a result must also render at least one of `allowed_conclusion` / `disallowed_conclusion`. This is the primary drift guardrail.

---

## 2. Problem statement

The app has drifted into treating experiments as if they directly support, refute, pass, or fail "the theory." This drift is concrete and located:

**Theory-verdict terminology baked into the data model.**
- [lib/types.ts:143](lib/types.ts#L143) defines `TheoryFit = "SUPPORTS" | "REFUTES" | "CANDIDATE" | "INFORMATIVE" | "CONTROL_BROKEN" | "INCONCLUSIVE"`.
- [lib/types.ts:159](lib/types.ts#L159) defines `ExperimentRole = "ENABLER" | "PATHFINDER" | "DETECTOR" | "FALSIFICATION_CONTROL"`.
- [lib/types.ts:125](lib/types.ts#L125) defines `TheoryStage = "gauge" | "lattice" | "brittleness" | "control"`.
- [lib/types.ts:166](lib/types.ts#L166) defines `StageFit` with the same SUPPORTS/REFUTES/CANDIDATE/PARTIAL/INCONCLUSIVE vocabulary applied to stage rollups.

**Decision logic that mints theory verdicts from mechanical outcomes.**
- [verifier.py:127–145](verifier.py#L127-L145) — `_theory_fit(status, type_str, role)` translates every experiment's `PASS`/`FAIL`/`WARN` into a SUPPORTS/REFUTES/CANDIDATE verdict on "the theory." This is the single most load-bearing source of drift.
- [verifier.py:88–100](verifier.py#L88-L100) — the `ROLE_MAP` is duplicated in [components/ExperimentSidebar.tsx:24](components/ExperimentSidebar.tsx#L24). Two sources of truth, drift-prone.

**UI surfaces that imply theory support/refutation.**
- [components/StageBanner.tsx:129](components/StageBanner.tsx#L129) labels the main banner "Theory Fit · Gauge → Lattice → Brittleness" — implying cumulative proof progress.
- [components/StageBanner.tsx:157](components/StageBanner.tsx#L157) remaps the `overall` field: `PASS → SUPPORTS`, `FAIL → REFUTES`. This is the most visible conflation in the app.
- [app/page.tsx:220–233](app/page.tsx#L220-L233) — per-experiment badges render SUPPORTS / REFUTES / CANDIDATE / INFORMATIVE / CONTROL BROKEN directly on every experiment card.
- [app/page.tsx:354](app/page.tsx#L354) — the EXP 1 overlay description conflates the coordinate gauge hypothesis with the zero-scaling hypothesis ("If the Explicit Zero Scaling is correct…" appears inside EXP 1's overlay caption, where it does not belong).
- [components/ExperimentSidebar.tsx:81–121](components/ExperimentSidebar.tsx#L81-L121) — the sidebar is organized as `Stage 1 · Gauge → Stage 2 · Lattice → Stage 3 · Brittleness → Control`, visually implying a staged proof sequence that does not exist.

**Docs that overclaim or re-center the project on AI-added probes.**
- [THEORY.md](THEORY.md) calls Claim 3 (β-stability) "the load-bearing one" and Claim 4 (brittleness) "the evidentiary hero of the repo." Both phrases center the project on experiments that are AI-added scaffolding, not on the simpler claim the human is actually investigating. (THEORY.md does correctly acknowledge EXP_8 as "plumbing, not evidence," which is the pattern this spec generalizes.)
- [README.md:66–68](README.md#L66-L68) — "**The stages are not coequal.** Brittleness carries the falsifiable content; Gauge and Lattice are the structural scaffolding…" This ordering is a reinterpretation that the core claim does not require.

**The single underlying problem.** The app flattens five different kinds of experimental work — theorem-anchoring statements, proof-obligation witnesses, coherence witnesses, controls, pathfinders, and regression checks — into one verdict surface labeled `theory_fit`. This spec replaces that single axis with a three-axis ontology (§5), mandatory inference rails (§5, §6), and a separate obligation/open-gap structure (§6).

---

## 3. Core theorem candidate

Two parallel statements. Both are authoritative and carry equal weight; neither is decorative.

### Formal statement

> There exists a nontrivial multiplicative gauge
> \[ T_c : s \mapsto s \cdot c^k, \qquad c \in \mathbb{R}_{>1}, \ k \in \mathbb{Z}, \]
> under which the RH-relevant analytic structure of ζ is preserved strongly enough that the compressed view under `T_c` and the uncompressed view are the **same mathematical case** for the purposes of the Riemann Hypothesis predicate.
>
> Equivalently: if ζ has a non-trivial zero `ρ` with `Re(ρ) ≠ ½`, its image under `T_c` is likewise off the critical line, and conversely — no off-line zero can exist on one side of the gauge without existing on the other.
>
> **Working choice of gauge.** The project takes `c = τ = 2π` as the current working gauge. **Uniqueness of τ is not a present proof obligation.** Whether another `c > 1` (e.g. `c = √2`, `c = e`, etc.) would also serve is an open research question parked outside the critical path (see `GAP_TAU_UNIQUENESS`).

### Plain-language statement

> If the relevant zeta/prime structure can be transported into a compressed scale without changing the RH-relevant behavior, then searching arbitrarily further in the uncompressed scale becomes logically redundant rather than mathematically necessary. The compressed case and the uncompressed case are the same case.

### What is **not** claimed

| Non-claim | Why it is listed |
|---|---|
| (a) A formal proof of RH. | No Lean / Coq / axiomatic chain. No theorem in the mathematical sense has been produced by this repository. |
| (b) Extension of verified ordinate coverage beyond Odlyzko's range. | Scaling already-verified zeros produces scaled copies of the verified zero set, not new zeros of the original ζ at higher ordinate. The verified range is whatever Odlyzko and Platt–Trudgian have verified. |
| (c) That a numerical equivariance of reconstructions is itself a transport theorem for the RH predicate. | Plot overlays, residual stability, and β̂ fits are empirical witnesses. They do not constitute a proof that the RH predicate is preserved under `T_c`. |
| (d) That τ is the unique multiplicative base for which the invariance can hold. | Uniqueness of τ is parked as a research question, not a proof obligation. |
| (e) That detecting a rogue zero under deep scaling is equivalent to proving RH. | Brittleness experiments are Program 2 exploratory material; their passes do not constitute proof-directed evidence under Program 1. |

---

## 4. Theorem vs proof obligations vs witness vs control vs pathfinder vs diagnostic

Six roles, with the "what it is / what it is not / what you may conclude from it" shape spelled out explicitly. These terms are used in their exact senses throughout the rest of the spec.

### 4.1 Theorem candidate

- **What it is.** A single mathematical statement that the project is investigating. See §3.
- **What it is not.** A collection; a verdict; a function of experimental outputs; something an experiment can "produce."
- **What you may conclude.** Nothing empirical. The theorem candidate is a target, not a result.

### 4.2 Proof obligations

- **What they are.** Mathematical facts that **would have to hold** for the theorem candidate to go through as a theorem. They are stated, not measured.
- **What they are not.** Empirical observations. Numerical witnesses. Opinions about experiments.
- **What you may conclude.** That the theorem candidate is logically reducible to a finite list of claims, each of which must be independently established (either by proof or by the stronger combination of witness + argument).

Examples (provisional; Sprint 2.0 WITNESS_MAP_REVIEW may refine):
- `OBL_COORD_RECONSTRUCTION_COVARIANCE` — the explicit-formula reconstruction transforms covariantly under `X ↦ X/τ^k`.
- `OBL_ZERO_SCALING_EQUIVALENCE` — scaling zeros by `τ^k` is isometric to scaling the lattice by `τ^k`.
- `OBL_BETA_INVARIANCE` — the best-fit critical-line parameter `β̂(k)` equals ½ across the tested k-family.
- `OBL_EXACT_RH_TRANSPORT` — the RH predicate transports exactly under `T_c` (not merely the reconstruction, not merely the zeros, not merely the β fit).

### 4.3 Witnesses

Two subtypes.

#### 4.3.1 Proof-obligation witnesses
- **What they are.** Empirical or numerical observations that are **consistent with** a stated proof obligation, measured at declared precision over a declared window.
- **What they are not.** Proofs. Substitutes for proof. Anything that holds outside their declared `inference_scope`.
- **What you may conclude.** That the obligation is not currently contradicted by the measured data, at the stated fidelity and scope. You may **not** conclude the obligation is true, nor that the theorem candidate is proved.

#### 4.3.2 Coherence witnesses
- **What they are.** Numerical demonstrations that the project's intermediate machinery is internally consistent — "showing the work" to a reviewer. Typical role: make an assumed or derived identity visible in data.
- **What they are not.** Evidence for the theorem candidate. Evidence for any obligation, except insofar as they rule out an implementation error.
- **What you may conclude.** That the reconstruction machinery behaves the way it is claimed to behave on the tested inputs. Nothing about ζ itself.

### 4.4 Controls

- **What they are.** Experiments whose job is to **fail on known-bad input**. Their role is to prove the instrument can discriminate; an armed control is an instrument-health signal.
- **What they are not.** Evidence for the theorem. A passing control is a precondition for trusting other evidence, not itself evidence.
- **What you may conclude.** That the engine is capable of detecting the failure mode the control was designed around. You may **not** conclude anything about ζ or about the theorem candidate from a control pass.

### 4.5 Pathfinders

- **What they are.** Direction-selection probes. Their job is to pick a branch of the research tree (e.g. "translation or dilation?", "lattice-hit or weak-alignment?"). Their outcome is a direction, not a verdict.
- **What they are not.** Supporters or refuters of the theorem. A pathfinder that returns `DIRECTIONAL: TRANSLATION` has not voted on RH; it has said "the next experiment to run is the translation-branch experiment."
- **What you may conclude.** That one research direction is more promising than another, under this run's conditions. Nothing about the theorem candidate.

### 4.6 Regression / plumbing checks

- **What they are.** Engine-health and identity-verification experiments. They test that the software still produces what it is supposed to produce.
- **What they are not.** Mathematical claims. A failure means the implementation has drifted; it does not mean ζ has changed.
- **What you may conclude.** That the implementation is (or is not) currently faithful to its specification. EXP_8 is the archetype: THEORY.md §2 already explicitly flags it as "plumbing, not evidence."

### 4.7 Exploratory

- **What it is.** A probe whose role in the proof program is not yet decided. Typically because the probe is a candidate for a future obligation that has not yet been formalized (e.g. Program 2 brittleness experiments under the current Program 1 posture).
- **What it is not.** A theorem verdict; a witness; a control.
- **What you may conclude.** Guidance for what future research question to formalize. Nothing about the theorem candidate.

---

## 5. Canonical ontology

Three orthogonal axes replace the single `theory_fit` axis. A fourth mandatory structure — the inference rails — wraps every record.

### Axis A — Function

What job does this experiment do in the proof program?

| Value | Meaning |
|---|---|
| `THEOREM_STATEMENT` | Anchors the theorem candidate itself. Typically 0 or 1 entries in the whole project. |
| `PROOF_OBLIGATION_WITNESS` | Empirical witness to a declared proof obligation. Must carry `obligation_id`. |
| `COHERENCE_WITNESS` | "Showing the work" — makes intermediate machinery visible. Does not witness any obligation directly. |
| `CONTROL` | Must fail on known-bad input. Arms an instrument; does not evidence the theorem. |
| `PATHFINDER` | Selects a research direction. Outcome is directional, not supporting/refuting. |
| `REGRESSION_CHECK` | Plumbing / identity check. A failure means a bug, not a theory update. |
| `EXPLORATORY` | Role not yet decided. Parked until formalized. |

### Axis B — Outcome

What happened on this run?

| Value | Meaning |
|---|---|
| `CONSISTENT` | Outcome matches the experiment's expectation, for its function. |
| `INCONSISTENT` | Outcome contradicts the experiment's expectation. |
| `DIRECTIONAL` | Pathfinder returned a decisive branch. Branch name goes in metrics or `direction`. |
| `INCONCLUSIVE` | Noise floor, tolerance, or fidelity tier prevented a call. |
| `IMPLEMENTATION_OK` | Regression / control passed as it should. |
| `IMPLEMENTATION_BROKEN` | Regression failed, or a control failed to arm. Instrument-level red flag. |

### Axis C — Epistemic level

What kind of claim does this result license?

| Value | Meaning |
|---|---|
| `FORMAL` | Derivation or identity; holds by proof. |
| `EMPIRICAL` | Measured at finite precision over a finite window. |
| `HEURISTIC` | Qualitative or visual. |
| `INSTRUMENTAL` | About the engine, not about ζ. |

### Positive-evidence rule

**Only** a record with `function = PROOF_OBLIGATION_WITNESS`, `outcome = CONSISTENT`, `epistemic_level ∈ {FORMAL, EMPIRICAL}`, at `AUTHORITATIVE` fidelity, contributes **theorem-directed evidence**. Everything else — control passes, pathfinder picks, regression OKs, coherence witnesses, exploratory hits — is something other than evidence for the theorem candidate. Controls and regression passes are **preconditions** for trusting evidence; they are not themselves evidence.

### Inference rails (mandatory)

Every experiment verdict and every proof obligation must carry three fields:

- **`inference_scope`** — where this result applies. Examples: "this run, k ∈ {−3,…,+3}, AUTHORITATIVE fidelity, x ∈ [2, 50]"; "identity, all k, formal".
- **`allowed_conclusion`** — what a reader may legitimately infer. A list of short statements, phrased as limited claims.
- **`disallowed_conclusion`** — what a reader must **not** infer. A list of overreach claims the record explicitly does not support. For every experiment, this list must contain at least one theorem-level disallowed conclusion (e.g. "the theorem candidate is proved").

Rails travel with the data into every surface. The UI must render at least one of `allowed_conclusion` / `disallowed_conclusion` near any badge or verdict. The research API must return them verbatim. This is the primary structural guardrail against drift.

---

## 6. Recommended schema semantics

Proposed TypeScript types for Sprint 2a. Python analogues live in [verifier.py](verifier.py).

```ts
// REPLACES: TheoryFit as the primary verdict axis.
// `theory_fit` itself is retained as a deprecated legacy field for one release
// to enable a soft migration; the UI hides it.
export type ExperimentFunction =
  | "THEOREM_STATEMENT"
  | "PROOF_OBLIGATION_WITNESS"
  | "COHERENCE_WITNESS"
  | "CONTROL"
  | "PATHFINDER"
  | "REGRESSION_CHECK"
  | "EXPLORATORY";

export type ExperimentOutcome =
  | "CONSISTENT"
  | "INCONSISTENT"
  | "DIRECTIONAL"
  | "INCONCLUSIVE"
  | "IMPLEMENTATION_OK"
  | "IMPLEMENTATION_BROKEN";

export type EpistemicLevel = "FORMAL" | "EMPIRICAL" | "HEURISTIC" | "INSTRUMENTAL";

// Mandatory inference guardrails on every experiment verdict and every
// proof obligation. Forces every downstream surface to declare what may
// and may not be concluded.
export interface InferenceRails {
  inference_scope: string;          // e.g. "this run, k ∈ {-3..+3}, AUTHORITATIVE, x ∈ [2,50]"
  allowed_conclusion: string[];     // what one MAY infer from this result
  disallowed_conclusion: string[];  // what one MUST NOT infer (must include ≥1 theorem-level item)
}

export interface ExperimentVerdict {
  // Canonical axes (new)
  function: ExperimentFunction;
  outcome: ExperimentOutcome;
  epistemic_level: EpistemicLevel;

  // Mandatory guardrails
  inference: InferenceRails;

  // Optional structured fields
  obligation_id?: string;  // required iff function === "PROOF_OBLIGATION_WITNESS"
  direction?: string;      // required iff function === "PATHFINDER" and outcome === "DIRECTIONAL"
  interpretation: string;  // short natural-language summary
  metrics: Record<string, unknown>;

  // Noncanonical grouping axis. Retained for navigation; FORBIDDEN from
  // carrying theorem semantics. No stage-level SUPPORTS/REFUTES permitted.
  stage?: "gauge" | "lattice" | "brittleness" | "control";

  // Raw mechanical outcome — kept for debugging only, never surfaced as theory signal.
  raw_status: "PASS" | "FAIL" | "WARN" | "NOTEWORTHY" | "INCONCLUSIVE" |
              "INSUFFICIENT_DATA" | "INSUFFICIENT_SEPARATION" | "SKIP";

  // Legacy fields retained for one release to allow migration; UI hides them.
  /** @deprecated use `function` + `outcome` */ theory_fit?: string;
  /** @deprecated use `function` */              role?: string;

  // Fidelity policy is unchanged. Still suppresses ENABLER/DETECTOR verdicts
  // at SMOKE tier, flags ENABLER verdicts provisional at STANDARD tier.
  provisional?: boolean;
}
```

### Proof obligations and the proof program

```ts
export type ObligationStatus = "OPEN" | "WITNESSED" | "FORMALLY_PROVEN";

export interface ProofObligation {
  id: string;                 // e.g. "OBL_BETA_INVARIANCE"
  title: string;
  statement: string;          // the mathematical claim that would have to hold
  status: ObligationStatus;
  witnesses: string[];        // experiment IDs whose function=PROOF_OBLIGATION_WITNESS bear on this
  inference: InferenceRails;  // obligation-level rails; disallowed_conclusion MUST include "theorem candidate is proved by this obligation alone"
  program: "PROGRAM_1" | "PROGRAM_2";  // Program 1 canonical; Program 2 exploratory
  notes?: string;
}

export interface OpenGap {
  id: string;                 // e.g. "GAP_RH_PREDICATE_TRANSPORT"
  title: string;
  description: string;
  blocker_for?: string[];     // obligation IDs this gap blocks
}

export interface ProofProgram {
  theorem_candidate: {
    formal_statement: string;      // §3 formal
    plain_language: string;        // §3 plain-language
    non_claims: string[];          // §3 table
    working_gauge: { base: string; unique: boolean };  // { base: "τ=2π", unique: false }
  };
  obligations: ProofObligation[];
  open_gaps: OpenGap[];
}
```

### On the `stage` axis

`TheoryStage` (`"gauge" | "lattice" | "brittleness" | "control"`) is **preserved** in the schema as a noncanonical grouping axis — used by the sidebar, filter chips, and documentation anchors. It is **demoted, not removed.**

**Forbidden stage semantics:**
- No `StageFit` verdict. The `StageFit` type (SUPPORTS / REFUTES / CANDIDATE / PARTIAL / INCONCLUSIVE) is removed.
- No stage-level theory rollup on the banner. The `overall` theory verdict is removed.
- No implication that stages are sequential steps in a proof.

**Permitted stage semantics (optional):**
- Non-theoretic implementation-health aggregate per stage (e.g. "all members `IMPLEMENTATION_OK`"). This is an engine-health signal, not a theory verdict.
- Navigation grouping in the sidebar and in docs.

### Inference rails examples

Every experiment record ships with concrete `allowed_conclusion` / `disallowed_conclusion` text. The following are draft examples — Sprint 2a finalizes them.

**EXP_1 (COHERENCE_WITNESS, stage=gauge):**
- `allowed_conclusion`: `["The explicit-formula reconstruction is numerically covariant under X ↦ X/τ^k on the tested k-range at the stated fidelity."]`
- `disallowed_conclusion`: `["The Riemann Hypothesis is true.", "The zero-scaling hypothesis is confirmed.", "The theorem candidate is proved.", "Coverage extends beyond Odlyzko's verified range."]`

**EXP_6 (PROOF_OBLIGATION_WITNESS → `OBL_BETA_INVARIANCE`, stage=gauge, *provisional*):**
- `allowed_conclusion`: `["β̂(k) = ½ to within optimizer tolerance at AUTHORITATIVE fidelity, on the tested k-range."]`
- `disallowed_conclusion`: `["β is invariant at untested k.", "The RH predicate transports exactly under the gauge.", "OBL_BETA_INVARIANCE is formally proven.", "The theorem candidate is proved."]`

**EXP_8 (REGRESSION_CHECK, stage=lattice):**
- `allowed_conclusion`: `["The zero-generator respects the ζ(s·τ^k) identity numerically within tolerance."]`
- `disallowed_conclusion`: `["Anything about the RH predicate.", "Anything about the theorem candidate.", "Anything about whether zero-scaling preserves RH-relevant structure."]`

**EXP_1B (CONTROL, stage=gauge):**
- `allowed_conclusion`: `["The engine detects the wrong group action: naive operator scaling breaks the reconstruction as expected, arming the gauge claim's falsifier."]`
- `disallowed_conclusion`: `["The theorem candidate is supported.", "The gauge is correct.", "RH is true."]`

**EXP_4 (PATHFINDER, stage=lattice):**
- `allowed_conclusion`: `["Between Translation and Dilation, the data prefers <direction> under this run's conditions."]`
- `disallowed_conclusion`: `["The theorem candidate is supported or refuted.", "The chosen direction is correct at untested scales."]`

---

## 7. Reclassification of existing experiments

The table below maps each existing experiment from its current (role, stage) to its proposed (function, outcome-class, obligation). **This mapping is provisional** — it is the starting point for Sprint 2.0 `WITNESS_MAP_REVIEW`, which must complete before Sprint 2a begins schema work. It is not frozen by this spec.

| ID | Current (role / stage) | Proposed function | Typical outcome | Obligation bearing (if any) | Program | Notes |
|---|---|---|---|---|---|---|
| EXP_1 | ENABLER / gauge | `COHERENCE_WITNESS` | `CONSISTENT` | indirect → `OBL_COORD_RECONSTRUCTION_COVARIANCE` | P1 | Shows the reconstruction is numerically covariant. Not itself proof-directed evidence. |
| EXP_1B | FALSIFICATION_CONTROL / gauge | `CONTROL` | `IMPLEMENTATION_OK` when it breaks as designed | arms `OBL_COORD_RECONSTRUCTION_COVARIANCE` | P1 | Must fail on naive operator scaling; a passing control is an instrument-health signal only. |
| EXP_1C | ENABLER / lattice | `COHERENCE_WITNESS` | `CONSISTENT` | indirect → `OBL_ZERO_SCALING_EQUIVALENCE` | P1 | Zero-scaling hypothesis is a distinct claim from EXP_1. Fix the UI conflation at [app/page.tsx:354](app/page.tsx#L354). |
| EXP_2 | DETECTOR / brittleness | `EXPLORATORY` | `CONSISTENT` or `INCONSISTENT` | (optional) `OBL_ROGUE_DETECTABILITY` | **P2** | Centrifuge — planted rogue zero. Program 2 only. |
| EXP_2B | DETECTOR / brittleness | `EXPLORATORY` | `CONSISTENT` | (optional) `OBL_ROGUE_DETECTABILITY` | **P2** | Rogue-zero residual isolation. Program 2 only. |
| EXP_3 | FALSIFICATION_CONTROL / control | `CONTROL` | `IMPLEMENTATION_OK` | arms `OBL_BETA_INVARIANCE` | P1 | β=π counterfactual must diverge; instrument-health. |
| EXP_4 | PATHFINDER / lattice | `PATHFINDER` | `DIRECTIONAL` (translation \| dilation) | none | P1 | Selects a mechanism; not proof-directed. |
| EXP_5 | PATHFINDER / lattice | `PATHFINDER` | `DIRECTIONAL` | none | P1 | Nearest-neighbor zero correspondence; selects a direction. |
| EXP_6 | ENABLER / gauge | `PROOF_OBLIGATION_WITNESS` **(provisional)** | `CONSISTENT` | `OBL_BETA_INVARIANCE` | P1 | Currently the clearest candidate for proof-directed evidence. **Subject to `GAP_WITNESS_MAP_REVIEW`.** |
| EXP_7 | DETECTOR / brittleness | `EXPLORATORY` | `CONSISTENT` | (optional) `OBL_ROGUE_DETECTABILITY` | **P2** | Calibrated ε-sweep. Program 2 only. |
| EXP_8 | ENABLER / lattice | `REGRESSION_CHECK` | `IMPLEMENTATION_OK` | none | P1 | Plumbing. Matches THEORY.md §2's own characterization. Moves out of any theorem-adjacent class. |

### Program framing

- **Program 1 — Direct invariance (canonical).** Proof obligations: `OBL_COORD_RECONSTRUCTION_COVARIANCE`, `OBL_ZERO_SCALING_EQUIVALENCE`, `OBL_BETA_INVARIANCE`, `OBL_EXACT_RH_TRANSPORT`. Witnesses: EXP_1, EXP_1C (coherence); EXP_6 (obligation, provisional). Controls: EXP_1B, EXP_3. Pathfinders: EXP_4, EXP_5. Plumbing: EXP_8.
- **Program 2 — Contradiction by detectability (exploratory).** Optional obligation: `OBL_ROGUE_DETECTABILITY` and a non-hiding theorem (`GAP_PROGRAM2_FORMALIZATION`). Exploratory members: EXP_2, EXP_2B, EXP_7.

**Program 2 is explicitly retained, not retired.** Its experiments remain useful as diagnostics and as a standing alternative route. They are simply excluded from the set of things that currently produce theorem-directed evidence under the canonical proof posture.

### Provisional witness map — review required

Under this reclassification, **EXP_6 is currently the only candidate for `PROOF_OBLIGATION_WITNESS`**, and it is marked provisional. This is a starting point for Sprint 2.0 `WITNESS_MAP_REVIEW`, not a frozen judgment. Two reasons:

1. Some of the existing experiment structure was introduced by AI agents (including ChatGPT, Claude, Codex) and may be partially misframed relative to the user's core claim. A reclassification of any given experiment to `PROOF_OBLIGATION_WITNESS` requires confirmation that the experiment actually measures the stated obligation at the stated epistemic level.
2. The obligation list itself is subject to tightening before the witness map is finalized.

Until `WITNESS_MAP_REVIEW` completes, no experiment is canonized as a uniquely privileged witness.

---

## 8. UI implications (planning only — implementation is Sprint 2b/2c)

Changes the UI must make to match this ontology. All implementation deferred.

### Retire theory-verdict surfaces
- Remove the "SUPPORTS / REFUTES / CANDIDATE / INFORMATIVE / CONTROL BROKEN" badges at [app/page.tsx:220–233](app/page.tsx#L220-L233) as **theory-level** verdicts. Per-experiment badges instead render `function` + `outcome`: e.g. "Witness · Consistent", "Control · Armed", "Pathfinder → TRANSLATION", "Regression · OK", "Exploratory · Inconsistent".
- Remove the single `overall` theory verdict from [components/StageBanner.tsx:157](components/StageBanner.tsx#L157). There is no project-wide PASS/FAIL.
- Remove the "Theory Fit · Gauge → Lattice → Brittleness" label at [components/StageBanner.tsx:129](components/StageBanner.tsx#L129). Stages are navigation, not ordered proof progress.

### Introduce a Proof Program Map
Replace the `StageBanner` with a `ProofProgramMap` component structured as:
1. **Theorem candidate** at the top (formal + plain-language from §3).
2. **Proof obligations** list, each showing: status (OPEN / WITNESSED / FORMALLY_PROVEN), witness count, program (P1 / P2), and a `disallowed_conclusion` excerpt.
3. **Open Gaps** panel (`OpenGapsPanel`) listing `GAP_*` entries from §11.
4. **(Optional)** non-theoretic implementation-health rollup grouped by stage.

### Introduce an IntroPanel
Onboarding copy above the Proof Program Map. Required sentence: *"Not every experiment is a verdict on the theory. Some validate implementation, some show the work, some witness proof obligations, and some guide future research."*

### Fix the EXP_1 / EXP_1C copy conflation
At [app/page.tsx:354](app/page.tsx#L354), the current overlay text for EXP_1 reads *"If the Explicit Zero Scaling is correct, all curves should collapse onto a single trajectory."* This is the wrong invariant for EXP_1 and must be moved. EXP_1 is the **coordinate gauge** witness; zero-scaling language belongs exclusively to EXP_1C. The spec fixes the semantics; Sprint 2b fixes the copy.

### Render inference rails with every result
Every experiment card must render at least one of `allowed_conclusion` / `disallowed_conclusion` next to its badge. This is non-optional — the rails are the primary drift guardrail, and they must be visible.

### Sidebar reorganization
[ExperimentSidebar.tsx](components/ExperimentSidebar.tsx) gains a primary grouping by `function` (Witnesses / Controls / Pathfinders / Regression / Exploratory) with `stage` retained as a secondary filter or toggle. Current grouping ("Stage 1 · Gauge → Stage 2 · Lattice → Stage 3 · Brittleness") is demoted but remains available as a navigation affordance.

### Deprecate, don't orphan
Deprecated fields (`theory_fit`, `role`) remain in the artifact for one release so older snapshots still load. The UI hides them. The verifier continues to populate them for that release, then removes them.

---

## 9. Documentation implications (Sprint 3a)

### `THEORY.md`
- Rewrite around the §3 theorem candidate as the canonical statement. The existing Claim 1–4 decomposition is recast as proof obligations of §3.
- Remove load-bearing language: "load-bearing one" (Claim 3), "evidentiary hero of the repo" (Claim 4). These phrases re-center the project on AI-added probes.
- Preserve the existing §6 "non-claims" block; it is correct and aligns with §3's non-claims here.
- Preserve EXP_8's "plumbing, not evidence" characterization; it was already right and is now generalized into this spec's `REGRESSION_CHECK` function.

### `README.md`
- Reorder the "Experiments" section by **function** (Witnesses / Controls / Pathfinders / Regression / Exploratory) rather than by stage.
- Remove the sentence *"**The stages are not coequal.** Brittleness carries the falsifiable content; Gauge and Lattice are the structural scaffolding…"* at [README.md:66–68](README.md#L66-L68). Under this spec the stages are neither ordered nor ranked; they are groupings.
- Update the quick-start to match the current app root and port (a minor, long-standing drift from when the app moved out of `dashboard/`).

### `MATH_README.md`
- Retain derivations.
- Add a front-matter note mapping its Claim 1–4 IDs to the new obligation IDs (`OBL_*`) so cross-references from THEORY.md and this spec resolve.

### In-app explanatory copy
- Per-experiment copy audited for claims beyond `allowed_conclusion`. The rails are the contract; the copy must respect them.

---

## 10. Research API / agent implications (Sprint 3b)

Out of scope for this workstream; named so Sprint 3b has a target and so the ontology propagates to the agent surface without translation.

### HTTP endpoints
- `GET /api/research/manifest` — schema version, fidelity tier, theorem candidate (formal + plain-language), list of obligation IDs, list of open-gap IDs, list of experiment IDs.
- `GET /api/research/obligations` — array of `ProofObligation`, each with status, witnesses, inference rails.
- `GET /api/research/obligations/:id` — single obligation, with its witnesses inlined.
- `GET /api/research/experiments/:id` — returns the new `ExperimentVerdict`: `{ function, outcome, epistemic_level, inference, obligation_id?, direction?, stage?, interpretation, metrics }`. **Never** returns `theory_fit` as authoritative.
- `GET /api/research/experiments/:id/series` — downsampled numeric series. Must include `inference.inference_scope` in the response envelope.
- `GET /api/research/open-gaps` — array of `OpenGap`, each optionally with `blocker_for`.
- `GET /api/research/history` — verdict history, with per-entry program framing.
- `POST /api/research/run` — authenticated only; mutation endpoint.

### MCP tool surface
The MCP wrapper exposes tools with the same ontology as the HTTP layer. **No SUPPORTS / REFUTES / CANDIDATE vocabulary at the tool boundary.** Suggested tools:
- `get_manifest`
- `get_theorem_candidate`
- `list_obligations`
- `get_obligation(id)`
- `get_experiment(id)` → returns verdict + rails
- `get_experiment_series(id, variant, k, fields, downsample)`
- `list_open_gaps`
- `compare_runs(run_a, run_b)`
- `explain_inference(experiment_id)` — returns `inference.allowed_conclusion` and `disallowed_conclusion` verbatim

### Invariant for the agent layer
An agent reading this API must be able to tell, without scraping the UI:
1. What the theorem candidate is.
2. Which obligations it decomposes into.
3. For each experiment, what may and may not be concluded from its current result.
4. What gaps remain open.

If the API answers those four questions, the agent surface is faithful to this spec.

---

## 11. Open gaps / unresolved questions

Named gaps so they stop living inside implicit app copy. These appear in the artifact under `ProofProgram.open_gaps` and render in the UI's `OpenGapsPanel`.

| ID | Title | Short description |
|---|---|---|
| `GAP_RH_PREDICATE_TRANSPORT` | Exact transport of the RH predicate | Exact transport of the RH predicate under the gauge is not proved, only witnessed. Blocks `OBL_EXACT_RH_TRANSPORT`. |
| `GAP_TAU_UNIQUENESS` | Uniqueness of τ as the gauge base | Whether τ is structurally singled out, or whether any `c > 1` would serve. **Not a proof obligation** — a research question, parked outside the critical path. |
| `GAP_COVERAGE_TRANSPORT` | No-zero-hides-at-huge-height | Heuristic argument that a rogue zero at ordinate `~10^9999` cannot hide under compression; no formal non-hiding theorem. |
| `GAP_PROGRAM2_FORMALIZATION` | Formal non-hiding theorem for Program 2 | The contradiction-by-detectability route lacks a formal amplification/non-hiding theorem. Blocks the optional `OBL_ROGUE_DETECTABILITY`. |
| `GAP_WITNESS_MAP_REVIEW` | Provisional witness map | The mapping of experiments to obligations (§7) is provisional. Must be re-examined before Sprint 2a. Until then, no experiment is canonized as a uniquely privileged witness. |

---

## 12. Implementation roadmap (consumers of this spec)

Dependency order. This workstream (Workstream 1) is complete once this document is approved.

### Sprint 2.0 — WITNESS_MAP_REVIEW
- **Blocking for all of Sprint 2.** No schema, UI, or docs code changes.
- Freeze the obligation list in §6 / §7.
- Re-examine which experiments legitimately witness which obligations. Confirm or revise the provisional mapping in §7.
- Output: an approved `ProofObligation[]` array and a confirmed experiment→obligation map.

### Sprint 2a — Schema migration
- Introduce `ExperimentFunction`, `ExperimentOutcome`, `EpistemicLevel`, `InferenceRails`, `ProofObligation`, `OpenGap`, `ProofProgram` in [lib/types.ts](lib/types.ts).
- Rewrite [verifier.py `_theory_fit()`](verifier.py#L127) as `_classify(experiment, outcome)` that emits the new axes plus mandatory rails. Keep the fidelity-tier policy unchanged (SMOKE suppression, STANDARD provisional flag).
- **Preserve** the `stage` field; **remove** `StageFit` and the stage-level `overall` theory rollup.
- Retain `theory_fit` as a deprecated shim for one release (UI hides it; verifier still writes it for backward compatibility with older dashboards).
- Unify the duplicated `ROLE_MAP` between [verifier.py:88](verifier.py#L88) and [components/ExperimentSidebar.tsx:24](components/ExperimentSidebar.tsx#L24) into a single source of truth derived from the schema.

### Sprint 2b — UI reframe
- Rewrite [components/StageBanner.tsx](components/StageBanner.tsx) as `components/ProofProgramMap.tsx`. Theorem candidate → obligations → open gaps.
- Add `components/IntroPanel.tsx` with the required onboarding sentence.
- Add `components/OpenGapsPanel.tsx`.
- Update per-experiment badges in [app/page.tsx:220–233](app/page.tsx#L220-L233) to render `function + outcome` and an inference-rails excerpt.
- Fix the EXP_1 / EXP_1C copy conflation at [app/page.tsx:354](app/page.tsx#L354).

### Sprint 2c — Sidebar reorganization
- [components/ExperimentSidebar.tsx](components/ExperimentSidebar.tsx) gains a primary grouping by `function`. `stage` remains available as a secondary filter/toggle.

### Sprint 3a — Docs alignment
- Rewrite [THEORY.md](THEORY.md), [README.md](README.md), [MATH_README.md](MATH_README.md) per §9 above.
- Audit per-experiment in-app copy against `allowed_conclusion` / `disallowed_conclusion`.

### Sprint 3b — Research API + MCP
- Implement the endpoints in §10.
- Implement the MCP tool wrapper.
- Validate: the four-question invariant at the end of §10 must hold for an agent consuming the API.

### Post-implementation verification
1. `grep` the repo for `theory_fit`, `SUPPORTS`, `REFUTES`, `CONTROL_BROKEN`, `"load-bearing"`, `"evidentiary hero"`, `"stages are not coequal"`. After Sprint 3a, these strings should appear only in deprecation notes or commit history.
2. Every `ExperimentVerdict` in the current artifact must carry non-empty `inference.allowed_conclusion` and `inference.disallowed_conclusion`. Every `disallowed_conclusion` must contain at least one theorem-level disclaimer.
3. The UI must render at least one inference rail next to every result.
4. An agent calling the research API must be able to answer §10's four-question invariant without scraping HTML.

---

_End of PROOF_PROGRAM_SPEC.md_

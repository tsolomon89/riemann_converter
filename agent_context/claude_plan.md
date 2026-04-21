 Plan — Workstream 1: Ontology & Research Semantics Spec
Context
The Riemann Converter app has drifted into treating every experiment as if it renders a verdict on "the theory" (SUPPORTS / REFUTES / CANDIDATE / etc.). That model was layered in by AI-generated scaffolding (coordinate equivariance, β-stability, brittleness — dressed up as gauge → lattice → brittleness → control stages, with a theory_fit verdict axis). The core claim the human is actually investigating is simpler and more conservative: a nontrivial multiplicative gauge may preserve the RH-relevant structure, so a compressed view and the uncompressed view are not different cases. Almost everything else in the app is a witness, plumbing, or a future-research probe — not a theory verdict.

This workstream is planning-only. The deliverable is a single canonical ontology/spec document in the repo. No schema, UI, or docs changes yet. Sprints 2 and 3 consume this spec.

What I found in the repo (current-state inventory)
Theory-verdict terminology (baked into data + UI):

lib/types.ts — TheoryFit = "SUPPORTS" | "REFUTES" | "CANDIDATE" | "INFORMATIVE" | "CONTROL_BROKEN" | "INCONCLUSIVE"
lib/types.ts:159 — ExperimentRole = "ENABLER" | "PATHFINDER" | "DETECTOR" | "FALSIFICATION_CONTROL"
lib/types.ts:125 — TheoryStage = "gauge" | "lattice" | "brittleness" | "control"
lib/types.ts:166 — StageFit = "SUPPORTS" | "REFUTES" | "CANDIDATE" | "PARTIAL" | "INCONCLUSIVE"
Decision logic that forces mechanical outcomes into theory verdicts:

verifier.py:127-145 — _theory_fit() translates every experiment's PASS/FAIL into a SUPPORTS/REFUTES/CANDIDATE verdict on the theory. This is the single most load-bearing source of drift.
verifier.py:88-100 — ROLE_MAP (hard-coded and duplicated in ExperimentSidebar.tsx:24).
UI surfaces that imply theory support/refutation:

components/StageBanner.tsx:129 — label reads "Theory Fit · Gauge → Lattice → Brittleness".
components/StageBanner.tsx:157 — overall verdict is remapped PASS → SUPPORTS, FAIL → REFUTES.
app/page.tsx:220-233 — per-experiment badges: "SUPPORTS", "REFUTES", "CANDIDATE", "INFORMATIVE", "CONTROL BROKEN".
app/page.tsx:354 — EXP1 overlay description conflates coordinate gauge with zero-scaling hypothesis.
components/ExperimentSidebar.tsx:81-121 — sidebar is organized as Stage 1 · Gauge → Stage 2 · Lattice → Stage 3 · Brittleness → Control, implying ordered proof progress.
Docs that overclaim or use load-bearing language:

THEORY.md — calls Claim 3 (β-stability) "the load-bearing one" and Claim 4 (brittleness) "the evidentiary hero of the repo". Acknowledges EXP_8 as "plumbing, not evidence" (good — that pattern should be generalized).
README.md:66-68 — "The stages are not coequal. Brittleness carries the falsifiable content…"
MATH_README.md — same stage vocabulary.
Experiments currently flattened into one verdict surface (11 experiments):

ID	Current role	Current stage	What it's actually doing
EXP_1	ENABLER	gauge	Coordinate equivariance witness
EXP_1B	FALSIFICATION_CONTROL	gauge	Naive operator scaling must break (wrong-group-action control)
EXP_1C	ENABLER	lattice	Zero-scaling hypothesis (distinct claim from EXP_1)
EXP_2	DETECTOR	brittleness	Centrifuge — planted rogue zero
EXP_2B	DETECTOR	brittleness	Rogue-zero isolation residual
EXP_3	FALSIFICATION_CONTROL	control	β=π counterfactual must diverge
EXP_4	PATHFINDER	lattice	Translation-vs-dilation direction choice
EXP_5	PATHFINDER	lattice	Nearest-neighbor zero correspondence
EXP_6	ENABLER	gauge	β̂(k) stability (empirical witness to a proof obligation)
EXP_7	DETECTOR	brittleness	Calibrated ε-sweep sensitivity
EXP_8	ENABLER	lattice	Scaled-zeta identity — author's own THEORY calls this "plumbing, not evidence"
Deliverable
File: PROOF_PROGRAM_SPEC.md at repo root, sibling to THEORY.md / MATH_README.md / REPRODUCE.md.

Name chosen because it tells the reader the document's function (it defines the proof-program ontology), not just that it's a spec. ONTOLOGY_SPEC.md is vaguer; RESEARCH_SEMANTICS_SPEC.md suggests API semantics only.

Proposed document outline (12 sections)
1. Purpose
What this doc is (the frozen ontology for Sprints 2–3).
What it is not (not a proof; not new mathematics; not a UI design doc).
Precedence rule: when this doc conflicts with existing copy in THEORY.md / MATH_README.md / README.md, this doc wins until those are updated in the Docs Alignment workstream.
2. Problem statement
Document the drift in concrete terms: the app currently conflates theorem, proof obligations, witnesses, controls, and pathfinders into a single theory_fit axis. This doc describes a corrected taxonomy. Cite the specific files and fields above.

3. Core theorem candidate
The spec presents two parallel versions: a formal statement and a plain-language paraphrase, both load-bearing.

Formal statement.

There exists a nontrivial multiplicative gauge T_c : s ↦ s·c^k (for some real c > 1, integer k) under which the RH-relevant analytic structure of ζ is preserved strongly enough that the compressed view under T_c and the uncompressed view are the same mathematical case for the purposes of the RH predicate. Equivalently: if ζ has a zero ρ with Re(ρ) ≠ ½, its image under T_c is likewise off-line, and conversely.

Working choice of gauge. This project takes c = τ = 2π as the current working gauge. Uniqueness of τ is not a present proof obligation; whether another c > 1 would also work is an open research question parked outside the critical path (see GAP_TAU_UNIQUENESS).

Plain-language statement.

If the relevant zeta/prime structure can be transported into a compressed scale without changing the RH-relevant behavior, then searching arbitrarily further in the uncompressed scale becomes logically redundant rather than mathematically necessary.

What is not claimed. (a) A formal proof of RH. (b) Extension of verified ordinate coverage beyond Odlyzko's range. (c) That numerical equivariance of reconstructions is itself a transport theorem for the RH predicate. (d) That τ is the unique gauge for which this can hold.

4. Theorem vs proof-obligations vs witness vs control vs pathfinder vs diagnostic
A clear typology, each with a "what it is / what it is not / what conclusions you may draw" block. Key distinctions:

Theorem candidate: one statement. Not a collection.
Proof obligations: mathematical facts that would have to hold for the candidate. Not empirical.
Witnesses: empirical or numerical observations consistent with an obligation. Cannot upgrade to proof.
Controls: sanity checks that the system can fail — a passing control is silent evidence, not positive evidence for the theory.
Pathfinders: direction-selection probes. Their "PASS" picks a branch of research; they do not vote on the theorem.
Regression / plumbing: engine-health checks. A failure means we have a bug, not that the theory is wrong.
5. Canonical ontology
The core ontology the app should adopt. Three orthogonal axes replacing theory_fit:

Axis A — Function (what job does this experiment do in the proof program?):

THEOREM_STATEMENT — anchors the candidate (rare; typically 0 or 1 entries).
PROOF_OBLIGATION_WITNESS — empirical witness to a stated proof obligation (β-stability, critical-line invariance, exact zero transport).
COHERENCE_WITNESS — shows intermediate machinery is internally consistent ("showing the work").
CONTROL — must fail on known-bad input (armed-falsifier check).
PATHFINDER — selects a research direction; outcome is directional, not supporting/refuting.
REGRESSION_CHECK — plumbing / identity verification; failure implies a bug, not a theory update.
EXPLORATORY — probe whose role in the proof program is not yet decided.
Axis B — Outcome (what happened on this run?):

CONSISTENT — outcome aligns with the experiment's expectation (for its function).
INCONSISTENT — outcome disagrees with the experiment's expectation.
DIRECTIONAL — pathfinder returned a decisive branch (name the branch in metrics).
INCONCLUSIVE — noise floor, tolerance, or fidelity tier prevented a call.
IMPLEMENTATION_OK — regression check passed.
IMPLEMENTATION_BROKEN — regression check failed (or a control failed to arm).
Axis C — Epistemic level (what kind of claim does this result license?):

FORMAL — derivation or identity; holds by proof.
EMPIRICAL — measured at finite precision over a finite window.
HEURISTIC — qualitative / visual.
INSTRUMENTAL — about the engine, not about ζ.
Key rule: Only a PROOF_OBLIGATION_WITNESS with outcome CONSISTENT and epistemic level ≥ EMPIRICAL at AUTHORITATIVE fidelity contributes positive evidence toward the theorem candidate. Nothing else — no control pass, no pathfinder call, no regression pass — constitutes evidence for the theorem. Controls and regression passes are preconditions for evidence being trusted, not evidence themselves.

6. Recommended schema semantics
Concrete proposed type changes (still planning; Sprint 2 implements):

// REPLACES: TheoryFit
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

export interface ExperimentVerdict {
  // New axes
  function: ExperimentFunction;
  outcome: ExperimentOutcome;
  epistemic_level: EpistemicLevel;
  obligation_id?: string;       // FK into the ProofObligation table (below)
  direction?: string;            // for PATHFINDER only
  interpretation: string;        // natural-language summary
  metrics: Record<string, unknown>;

  // Mechanical status kept for debugging, but NOT surfaced as theory signal
  raw_status: "PASS" | "FAIL" | "WARN" | "SKIP" | "...";

  // Deprecated — retained for one release to allow migration, then removed
  /** @deprecated use `function` + `outcome` */ theory_fit?: string;
  /** @deprecated use `function` */ role?: string;
  /** @deprecated — experiments are grouped by obligation, not by stage */ stage?: string;
  provisional?: boolean;         // kept; fidelity policy still applies
}
Plus a new top-level object:

export interface ProofObligation {
  id: string;                    // e.g. "OBL_COORD_GAUGE_RIGIDITY"
  title: string;
  statement: string;             // the mathematical claim that would have to hold
  status: "OPEN" | "WITNESSED" | "FORMALLY_PROVEN";
  witnesses: string[];           // experiment IDs whose function=PROOF_OBLIGATION_WITNESS bear on this
  notes?: string;
}

export interface ProofProgram {
  theorem_candidate: { statement: string; non_claims: string[] };
  obligations: ProofObligation[];
  open_gaps: { id: string; title: string; blocker_for?: string[] }[];
}
The existing TheoryStage ("gauge" / "lattice" / "brittleness" / "control") is demoted from a proof-progress ordering to a substance grouping only — useful for UI filters, not for rollup verdicts. The StageBanner's overall field is removed; there is no single project-wide verdict. The summary instead surfaces:

per-obligation status,
count of consistent witnesses per obligation,
a list of open gaps.
7. Reclassification of existing experiments
ID	Current	Proposed function	Proposed outcome example	Obligation it bears on
EXP_1	ENABLER / gauge	COHERENCE_WITNESS	CONSISTENT	OBL_COORD_RECONSTRUCTION_COVARIANCE
EXP_1B	FALSIFICATION_CONTROL	CONTROL	IMPLEMENTATION_OK if it breaks as required	(arms the gauge claim)
EXP_1C	ENABLER / lattice	COHERENCE_WITNESS	CONSISTENT	OBL_ZERO_SCALING_EQUIVALENCE
EXP_2	DETECTOR / brittleness	EXPLORATORY (Program 2 only)	CONSISTENT / INCONSISTENT	OBL_ROGUE_DETECTABILITY (optional obligation)
EXP_2B	DETECTOR / brittleness	EXPLORATORY (Program 2 only)	CONSISTENT	OBL_ROGUE_DETECTABILITY
EXP_3	FALSIFICATION_CONTROL	CONTROL	IMPLEMENTATION_OK	(arms β-stability)
EXP_4	PATHFINDER / lattice	PATHFINDER	DIRECTIONAL (translation | dilation)	n/a — selects a mechanism
EXP_5	PATHFINDER / lattice	PATHFINDER	DIRECTIONAL	n/a
EXP_6	ENABLER / gauge	PROOF_OBLIGATION_WITNESS	CONSISTENT	OBL_BETA_INVARIANCE — the only experiment directly witnessing a load-bearing obligation
EXP_7	DETECTOR / brittleness	EXPLORATORY (Program 2 only)	CONSISTENT	OBL_ROGUE_DETECTABILITY
EXP_8	ENABLER / lattice	REGRESSION_CHECK	IMPLEMENTATION_OK	(none — author-acknowledged plumbing per THEORY §2)
Under this model, at most one experiment (EXP_6) currently produces positive evidence for the theorem candidate. The others support the work in other, legitimate ways. EXP_8 moves out of the ENABLER class entirely, matching what THEORY.md already says about it.

Two research programs named explicitly, so brittleness experiments are not silently promoted into the theorem:

Program 1 — Direct invariance. Canonical and current proof target. Defines the project. Proof obligations: coordinate covariance, zero-scaling equivalence, β-invariance, exact transport of the RH predicate under the gauge.
Program 2 — Contradiction by detectability. Exploratory only. Retained as auxiliary research tooling, diagnostics, and a possible future route. Not on the present proof-critical path. Brittleness experiments (EXP_2 / EXP_2B / EXP_7) live here. The spec is explicit that Program 2 must not be allowed to silently redefine the theorem candidate.
Program 2 is not marked retired — it is retained as exploratory so its experiments remain useful as diagnostics and as a standing alternative route; it is simply excluded from the set of things that currently produce theorem-directed evidence.

8. UI implications (planning only — implementation is Sprint 2)
Retire the "SUPPORTS / REFUTES / CONTROL_BROKEN" badges as theory-level verdicts. Per-experiment badges instead show function + outcome ("Witness · Consistent", "Control · Armed", "Pathfinder → TRANSLATION", "Regression · OK").
Retire the single overall verdict on the StageBanner. Replace with a Proof Program Map: the theorem candidate at the top, then a list of obligations with per-obligation status and witness count, then an Open Gaps panel.
Retire "Theory Fit · Gauge → Lattice → Brittleness" framing — those stages are ordering scaffolding, not cumulative proof progress.
Fix the longstanding EXP_1 / EXP_1C copy conflation (app/page.tsx:354) in the same pass: EXP_1 is coordinate gauge only; zero-scaling language belongs exclusively to EXP_1C.
Add an onboarding IntroPanel that states: "Not every experiment is a verdict on the theory. Some validate implementation, some show the work, some witness proof obligations, and some guide future research."
9. Documentation implications
THEORY.md to be rewritten around the new ontology: core theorem candidate → proof obligations → witness map. Remove "load-bearing" / "evidentiary hero" language (they recenter the theory on AI-added probes).
README.md "Experiments" section reordered by function, not by "stage". Remove "The stages are not coequal" sentence — the new model doesn't have stages in that sense.
MATH_README.md retains derivations; adds a top note aligning its Claim 1-4 numbering with the new obligation IDs.
10. Research API / agent implications
Future API (out of scope for this workstream, mentioned in the spec so Sprint 3 has a target):

GET /api/research/manifest — schema version, fidelity tier, theorem candidate statement, obligation IDs.
GET /api/research/obligations — each obligation with status and witnessing experiments.
GET /api/research/experiments/:id — returns {function, outcome, epistemic_level, obligation_id, direction, ...} — never theory_fit.
GET /api/research/open-gaps — explicit not-yet-shown claims.
MCP wrapper exposes the same semantics as tools; no SUPPORTS/REFUTES vocabulary at the tool boundary.
11. Open gaps / unresolved questions (these appear in the spec as a section)
Named so they stop living inside implicit app copy:

GAP_RH_PREDICATE_TRANSPORT — exact transport of the RH predicate under the gauge is not proved, only witnessed.
GAP_TAU_UNIQUENESS — τ vs any c>1 multiplicative base. Explicitly not a proof obligation. Parked as a research question.
GAP_COVERAGE_TRANSPORT — "no zero hides at height 10^9999" has no proof, only heuristic.
GAP_PROGRAM2_FORMALIZATION — the contradiction-by-detectability route lacks a formal non-hiding theorem.
12. Implementation roadmap for later workstreams
Dependency order (consumers of this spec):

Sprint 2a — Schema migration. Introduce ExperimentFunction, ExperimentOutcome, EpistemicLevel in lib/types.ts; rewrite verifier.py _theory_fit() as _classify(experiment, outcome); add deprecation shims.
Sprint 2b — UI reframe. Rewrite StageBanner.tsx → ProofProgramMap.tsx; update badges in app/page.tsx; fix EXP_1 copy conflation; add OpenGapsPanel.tsx, IntroPanel.tsx.
Sprint 2c — Sidebar reorganization. ExperimentSidebar.tsx regroups by function, not stage.
Sprint 3a — Docs alignment. Rewrite THEORY.md / README.md / MATH_README.md to match this spec.
Sprint 3b — Research API + MCP. Build endpoints and tools exposing the new ontology.
Top 5 ontology decisions (captured here for your review)
Replace theory_fit with a three-axis model (function × outcome × epistemic level). The single-axis "does this support the theory?" question was the source of the drift.
Demote stage from proof-ordering to substance-grouping. "Gauge → Lattice → Brittleness" implied cumulative proof progress; it doesn't have that.
Retire the single overall verdict. There is no project-wide PASS/FAIL. Instead: per-obligation status plus explicit open gaps.
Name Program 1 (direct invariance) and Program 2 (contradiction-by-detectability) explicitly, with Program 1 canonical. Prevents brittleness experiments from silently becoming "the theorem" again.
Only PROOF_OBLIGATION_WITNESS + CONSISTENT + AUTHORITATIVE counts as positive evidence. Controls passing, pathfinders choosing, regression checks passing — those are preconditions, not evidence. Under current experiments this means ~1 of 11 (EXP_6) produces theorem-directed evidence.
Top 5 drift-risk areas in the repo
verifier.py:127 _theory_fit() — central decision logic that mints theory verdicts from mechanical PASS/FAIL. Highest drift risk.
components/StageBanner.tsx:157 — remaps PASS→SUPPORTS, FAIL→REFUTES on the overall field. Most visible UI conflation.
app/page.tsx:220-233 — per-experiment theory-verdict badges repeated for every card.
THEORY.md "load-bearing" / "evidentiary hero" language — centers the project on AI-added probes (β-stability, brittleness) rather than the user's base claim.
Duplicated ROLE_MAP in verifier.py:88 and ExperimentSidebar.tsx:24 — two sources of truth, drift-prone; should become one config.
Decisions confirmed by the user
Filename: PROOF_PROGRAM_SPEC.md at repo root. (Rationale quoted: "this is not just ontology, and not just agent semantics. It is the canonical document for how the project is structured as a proof program.")
Program posture: Program 1 canonical (current proof target); Program 2 exploratory (retained, not retired).
Theorem wording: dual formal + plain-language phrasing in §3, per user's direction. τ is the working gauge; τ-uniqueness is explicitly not a proof obligation.
Verification plan (post-implementation)
Once the spec is written (after plan mode exits), confirm end-to-end by:

Opening PROOF_PROGRAM_SPEC.md and checking it covers all 12 sections with user-confirmed wording.
Grepping the repo for theory_fit, SUPPORTS, REFUTES, load-bearing, evidentiary hero, stages are not coequal to confirm the spec's §2 inventory matches the actual surface area Sprint 2 will need to edit.
Ensuring the spec names the exact file/line targets for Sprint 2 so downstream work has unambiguous entry points.
PROOF_PROGRAM_SPEC.md — Canonical Workstream 1 Spec
Summary
Create one canonical spec at repo root named PROOF_PROGRAM_SPEC.md.
This doc becomes the semantic source of truth for Workstream 1 and re-anchors the app as a proof-program research instrument, not a theory-verdict dashboard.
Locked decisions:
stage remains, but only as noncanonical grouping/navigation.
The new simpler core theorem candidate is canonical.
Existing Claim 1–4 chain is retained as subordinate operational decomposition.
No experiment can directly output a theorem verdict; experiments only affect obligations, diagnostics, direction, or implementation confidence.
theory_fit is demoted to legacy compatibility semantics.
Key Changes (Document Content, Decision-Complete)
1) Purpose
State that the document defines ontology and inference semantics for all human/agent interpretation.
Explicitly ban theorem-level conclusions from UI badges or stage rollups.
2) Problem Statement
Capture current semantic drift in repo artifacts:
Theory-centric axes (theory_fit, stage SUPPORTS/REFUTES) are still headline semantics.
UI surfaces imply theorem verdicts (Stage banner, experiment badges, history flips).
Schema mixes mechanical status, theory interpretation, role, and stage in ways that still invite overclaim.
Name this as a category error: experiment function vs theorem truth-value.
3) Core Theorem Candidate (Canonical)
Canonical theorem framing: a nontrivial multiplicative gauge preserves RH-relevant structure strongly enough that compressed/uncompressed views are one mathematical case for the RH predicate.
Explicitly mark this as the canonical statement.
Mark Claim 1–4 as historically useful but subordinate decomposition.
4) Distinctions Section (Required sharp boundaries)
For each: define what it is, what it is not, role, allowed conclusions.

Core theorem candidate
Proof obligations
Witnesses
Validation / showing-the-work
Controls / diagnostics
Pathfinders
Regression / implementation checks
Open gaps / not-yet-shown claims
5) Canonical Ontology
Define entities and relations:

theorem_candidate (single canonical object)
proof_obligation (multiple; each links to theorem candidate)
experiment (empirical/diagnostic item linked to obligations or instrument health)
open_gap (explicit unresolved claims)
Canonical experiment role enum:

WITNESS
SHOWING_WORK_VALIDATION
CONTROL_DIAGNOSTIC
PATHFINDER
REGRESSION_IMPLEMENTATION_CHECK
Canonical interpretation enum:

CONSISTENT
INCONSISTENT
INCONCLUSIVE
DIRECTIONAL
CONTROL_HEALTHY
CONTROL_BROKEN
REGRESSION_HEALTHY
REGRESSION_BROKEN
Canonical epistemic enum:

FORMAL
EMPIRICAL
HEURISTIC
INSTRUMENTAL
Inference guardrails:

No PATHFINDER, CONTROL_DIAGNOSTIC, or REGRESSION_IMPLEMENTATION_CHECK may be used as direct theorem support/refutation.
stage cannot be used as inference input for theorem truth.
6) Recommended Schema Semantics
Add canonical fields (names locked):

role_in_program (enum above)
interpretation_status (enum above)
epistemic_level (enum above)
claim_target_type (THEOREM_CANDIDATE | PROOF_OBLIGATION | INSTRUMENT_ONLY)
claim_target_ids (array of IDs)
inference_scope (THEOREM_LEVEL_FORBIDDEN | OBLIGATION_LEVEL | INSTRUMENT_HEALTH | RESEARCH_DIRECTION)
allowed_conclusion (short string)
disallowed_conclusion (short string)
Compatibility policy:

Keep stage but redefine as noncanonical grouping axis.
Keep status as mechanical outcome.
Keep theory_fit temporarily as legacy/derived; mark noncanonical and planned de-emphasis.
7) Reclassification of Existing Experiments
EXP_1 Coordinate Equivariance: WITNESS for coordinate-equivariance obligation.
EXP_6 Beta Stability: WITNESS for critical-line-stability obligation.
EXP_1C Zero Scaling: WITNESS / validation for lattice-related obligation (empirical, not theorem verdict).
EXP_2 / EXP_2B: SHOWING_WORK_VALIDATION for brittleness mechanism behavior.
EXP_7: primarily SHOWING_WORK_VALIDATION with detector calibration flavor.
EXP_1B and EXP_3: CONTROL_DIAGNOSTIC.
EXP_4 and EXP_5: PATHFINDER only.
EXP_8: REGRESSION_IMPLEMENTATION_CHECK (plumbing identity/instrument consistency), not independent theorem evidence.
8) UI Implications
Replace “theory-fit as headline” with “role + interpretation + inference scope”.
Stage banner becomes research-track board (grouping only), not theory verdict board.
Every experiment card includes:
“What this can conclude”
“What this cannot conclude”
Add mandatory “Open Gaps / Not Yet Shown” panel.
Keep stage grouping for navigation/history continuity only.
9) Documentation Implications
Normalize README/THEORY/MATH/REPRODUCE around canonical theorem + subordinate obligations.
Add ontology glossary and inference rules.
Remove or rewrite wording that implies dashboard verdict equals theorem verdict.
10) Research API / Agent Implications
Specify future canonical resources (planning only):

theorem_candidate
proof_obligations
experiment_semantics_registry
open_gaps
research_tracks (noncanonical grouping)
run_interpretations with enforced inference scope
Agent rule: never infer theorem verdict from stage, pathfinder, control, or regression items.
11) Open Gaps / Unresolved Questions
Must include at least:

Formal transport of RH predicate from base case to full gauge family not yet proved.
Empirical witness vs formal proof boundary.
Brittleness detectability bounds are empirical, not formal theorem.
Dependence on external verification assumptions.
Tau necessity/uniqueness status (explicitly exploratory unless formalized).
12) Implementation Roadmap (Later Workstreams)
WS2 Schema: add canonical fields, demote legacy fields, introduce theorem/obligation IDs.
WS3 UI: replace verdict-centric surfaces with role/interpretation/inference-scope surfaces.
WS4 Docs: align all narrative layers to ontology.
WS5 API/Agent: expose canonical semantics and inference-safe machine interface.
Test Plan (for later implementation validation)
Classification consistency: each experiment has exactly one canonical role_in_program.
Inference safety: no theorem-level output allowed from pathfinder/control/regression classes.
Compatibility: stage grouping remains functional in UI/history while noncanonical for semantics.
Drift checks: wording lint/test to block “supports/refutes theorem” language outside canonical theorem/obligation contexts.
Agent contract tests: API responses include inference scope and disallowed conclusion text.
Assumptions & Defaults
stage is preserved as noncanonical grouping (not deprecated-away, not semantic authority).
Canonical theorem wording follows your simplified theorem target; Claim 1–4 is subordinate decomposition.
Workstream 1 is planning/spec only; no schema/UI code mutation in this mode.
Target artifact path for execution phase: PROOF_PROGRAM_SPEC.md at repo root.
Highest drift-risk areas to call out in chat once executed: verifier mappings/rollups, StageBanner and sidebar labels, lib/types.ts theory-centric enums, app/page.tsx theorem-language badges/explanatory text, and cross-doc claim wording.
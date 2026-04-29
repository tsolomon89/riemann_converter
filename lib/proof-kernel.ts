/**
 * Proof Kernel types.
 *
 * Represents the base claim, necessary conditions, experiment relevance audit,
 * and proof assembly. This is the claim-down layer that sits above the
 * experiment ladder.
 */

// ---------------------------------------------------------------------------
// Failure Scopes
// ---------------------------------------------------------------------------

export type FailureScope =
  | "KILL_THEORY"           // base claim is impossible
  | "KILL_FORMALIZATION"    // current math formulation is wrong
  | "KILL_WITNESS"          // experiment doesn't witness what it claimed
  | "KILL_ROUTE"            // one proof route fails, another may survive
  | "KILL_IMPLEMENTATION"   // code/instrument is unreliable
  | "NO_THEORETICAL_EFFECT"; // irrelevant to base claim

// ---------------------------------------------------------------------------
// Necessary Conditions
// ---------------------------------------------------------------------------

export type ConditionStatus =
  | "UNFORMALIZED"
  | "FORMALIZED"
  | "WITNESSED"
  | "PROVEN"
  | "FAILED";

export interface NecessaryCondition {
  condition_id: string;        // NC1..NC7
  title: string;
  statement: string;
  why_needed: string;
  status: ConditionStatus;
  failure_scope: FailureScope;
  experiments_that_may_bear: string[];
  experiments_that_do_not_bear: string[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Experiment Relevance
// ---------------------------------------------------------------------------

export type ExperimentClassification =
  | "NECESSARY_WITNESS"
  | "OPTIONAL_WITNESS"
  | "CONTROL"
  | "PATHFINDER"
  | "ILLUSTRATION"
  | "IMPLEMENTATION_CHECK"
  | "MISFRAMED"
  | "IRRELEVANT";

export interface ExperimentRelevance {
  experiment_id: string;
  display_id: string;
  actual_computation: string;
  object_touched: string;
  bears_on_conditions: string[];
  does_not_bear_on: string[];
  classification: ExperimentClassification;
  failure_scope: FailureScope;
  certificate_section: string | null;
  recommended_action: "KEEP" | "DEMOTE" | "RENAME" | "REMOVE" | "REWRITE";
}

// ---------------------------------------------------------------------------
// Base Claim
// ---------------------------------------------------------------------------

export type ObjectCandidate =
  | "explicit_formula_reconstruction"
  | "zero_ensemble"
  | "prime_lattice_relation"
  | "rh_predicate"
  | "transformed_zeta_model";

export interface BaseClaim {
  formal_statement: string;
  plain_statement: string;
  object_candidates: ObjectCandidate[];
  primary_object: ObjectCandidate;
  gauge: {
    base_name: string;
    base_value: number;
    map: string;
    unique: boolean;
  };
  proof_goal: string;
  not_claimed: string[];
  external_premises: string[];
  same_case_criterion_status: "UNFORMALIZED" | "FORMALIZED";
}

// ---------------------------------------------------------------------------
// Proof Assembly (claim-down, not experiment-up)
// ---------------------------------------------------------------------------

export interface ProofAssembly {
  base_claim: BaseClaim;
  necessary_conditions: NecessaryCondition[];
  experiment_relevance: ExperimentRelevance[];
  current_blocker: {
    condition_id: string;
    gap_id: string;
    description: string;
  };
  proof_routes: {
    program_1: { name: string; status: string; description: string };
    program_2: { name: string; status: string; description: string };
  };
}

// ---------------------------------------------------------------------------
// Full Proof Kernel
// ---------------------------------------------------------------------------

export interface ProofKernel {
  proof_assembly: ProofAssembly;
  /** Re-exported from same-object-certificate.ts */
  certificate_status: string;
}

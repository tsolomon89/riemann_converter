/**
 * Same-Object Certificate types.
 *
 * Mirrors the Python schema in proof_kernel/same_object_certificate.py.
 * This is the current-run computational certificate — Level 2 between visualization
 * and formal proof.
 */

export type CertificateStatus =
  | "NOT_BUILT"
  | "SAME_OBJECT_PROXY_CANDIDATE"
  | "SAME_OBJECT_FAILED"
  | "INCONCLUSIVE"
  | "STALE"
  | "MISSING_FOR_RUN";

export type ObjectCandidate =
  | "explicit_formula_reconstruction"
  | "zero_ensemble"
  | "prime_lattice_relation"
  | "rh_predicate"
  | "transformed_zeta_model";

export type SectionResult = "PASS" | "FAIL" | "INCONCLUSIVE" | "NOT_TESTED";

export interface ObjectUnderTest {
  primary: ObjectCandidate;
  secondary: ObjectCandidate[];
  why_selected: string;
  scope_note: string;
}

export interface GaugeSpec {
  base_name: string;
  base_value: number;
  k_values_tested: number[];
  map: string;
}

export interface WindowSpec {
  original_range: [number, number];
  compressed_range_by_k: Record<string, [number, number]>;
  bounded_window_demonstrated: boolean;
  source: string;
}

export interface ZeroHandling {
  source: string;
  display_id: string;
  same_unscaled_zeros_used: boolean;
  scaled_zeros_tested: boolean;
  metrics: {
    p99_abs_dev: number | null;
    p95_residual: number | null;
    max_abs_dev: number | null;
    count_success: number | null;
    count_fail: number | null;
    per_k?: Record<string, Record<string, number>>;
  };
  result: SectionResult;
  note: string;
}

export interface ReconstructionAgreement {
  source: string;
  display_id: string;
  metrics: {
    max_harmonic_drift_vs_k0?: number;
    max_mobius_drift_vs_k0?: number;
    max_y_true_drift_vs_k0?: number;
    stress_max_abs_truth_error?: number;
  };
  result: SectionResult;
  note: string;
}

export interface PredicatePreservation {
  source: string;
  display_id: string;
  metrics: {
    beta_hat_by_k?: Record<string, number>;
    max_beta_drift?: number;
  };
  critical_line_preserved: "YES" | "NO" | "INCONCLUSIVE";
  result: SectionResult;
  note: string;
}

export interface ControlResult {
  source: string;
  display_id: string;
  outcome: string;
  result: SectionResult;
}

export interface Controls {
  wrong_operator_scaling_fails: ControlResult;
  wrong_beta_fails: ControlResult;
}

export interface CounterexampleVisibility {
  sources: string[];
  per_experiment: Record<string, { outcome: string; status: string }>;
  rogue_zero_detected: boolean | null;
  result: SectionResult;
  note: string;
  contributes_to_status: false;
}

export interface RemainingFormalStep {
  lemma_needed: string;
  gap_id: string;
  condition_id: string;
  description: string;
}

export interface WrongTestGuardrail {
  wrong_test: string;
  right_test: string;
  exp10_confirms: string;
}

export interface FidelityInfo {
  dps: number | null;
  zeros: number | null;
  tier: string;
  selected_zero_stored_dps?: number | null;
  selected_tau_stored_dps?: number | null;
}

export interface SameObjectCertificate {
  certificate_id: string;
  status: CertificateStatus;
  timestamp: string;
  run_id?: string;
  created_at?: string;
  artifact_kind?: "certificate";
  schema_version?: string;
  source_artifact_hash?: string;
  code_fingerprint?: Record<string, string>;
  mirrors_run_id?: string;
  freshness?: "CURRENT" | "STALE";
  selected_data_sources?: Record<string, unknown>;
  zero_asset_validation?: Record<string, unknown>;
  fidelity: FidelityInfo;
  object_under_test: ObjectUnderTest;
  gauge: GaugeSpec;
  window: WindowSpec;
  zero_handling: ZeroHandling;
  reconstruction_agreement: ReconstructionAgreement;
  predicate_preservation: PredicatePreservation;
  counterexample_visibility: CounterexampleVisibility;
  controls: Controls;
  allowed_conclusion: string[];
  disallowed_conclusion: string[];
  remaining_formal_step: RemainingFormalStep;
  wrong_test_guardrail: WrongTestGuardrail;
  status_contributing_sections?: Record<string, string>;
  non_contributing_sections?: Record<string, string>;
}

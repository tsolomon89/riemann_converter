export interface DataPoint {
  x: number;
  y_rec?: number;
  y_true?: number;
  y?: number;
  error?: number;
  [key: string]: number | undefined;
}

export interface Experiment1 {
  [key: string]: DataPoint[];
}

export interface Experiment1B {
  variants: {
    gamma_scaled: { [key: string]: DataPoint[] };
    rho_scaled: { [key: string]: DataPoint[] };
  };
}

export interface Experiment1C {
  [key: string]: {
      x_eff: number;
      x_phys: number;
      y_true: number;
      y_coord: number;
      y_op: number;
  }[];
}

export interface Experiment2 {
  "2A": DataPoint[];
  "2B": DataPoint[];
}

export interface Experiment2B {
  x: number;
  diff: number;
  pred_ratio: number;
  obs_ratio: number;
  residual: number;
}

export interface Experiment3 {
  "3A": DataPoint[];
  "3B": DataPoint[];
  "TruePi": DataPoint[];
}

// EXP 4: Translation vs Dilation
export interface Exp4Row {
    k: number;
    delta_pred: number;
    delta_hat: number;
    delta_error: number;
    rmse_trans: number;
    rmse_dil: number;
    winner: "TRANSLATION" | "DILATION";
}

export interface Experiment4 {
    [key: string]: Exp4Row;
}

// EXP 5: Zero Correspondence
export interface Exp5Row {
    count: number;
    mean_z: number;
    median_z: number;
    p95_z: number;
    area_match: number; // frac_below_0_1?
    interpretation: "PASS" | "FAIL";
    [key: string]: any;
}

export interface Experiment5 {
    [key: string]: Exp5Row;
}

// EXP 6: Critical Line Drift
export interface Exp6Row {
    beta_hat: number;
    rmse_opt: number;
    rmse_05: number;
    delta_rmse: number;
}

export interface Experiment6 {
    [key: string]: Exp6Row;
}

// EXP 7: Centrifuge Fix
export interface Exp7Point {
    epsilon: number;
    max_amp: number;
    mean_amp: number;
}

export interface Experiment7 {
    calibrated: Exp7Point[];
}

// EXP 8: Scaled-Zeta Zero Equivalence
export interface Exp8PerKMetrics {
    p99_abs_dev?: number;
    p95_residual?: number;
    max_abs_dev?: number;
    n_tested?: number;
    [key: string]: number | undefined;
}

export interface Exp8PerKRow {
    metrics?: Exp8PerKMetrics;
    status?: string;
    error?: string;
    [key: string]: unknown;
}

export interface Experiment8 {
    per_k: { [k: string]: Exp8PerKRow };
    [key: string]: unknown;
}

// Theoretical stage ordering: Gauge -> Lattice -> Brittleness, plus Control.
//
// Under PROOF_PROGRAM_SPEC.md (§6, "On the stage axis"), `stage` is preserved
// as a *noncanonical* grouping and navigation axis: sidebar sections, filter
// chips, docs anchors. It is FORBIDDEN from carrying theorem semantics:
// no stage-level SUPPORTS/REFUTES rollup, no implied proof-progress ordering,
// no contribution to the theorem candidate. The theorem-directed surface is
// `ProofProgram` (below), grouped by obligation, not by stage.
export type TheoryStage = "gauge" | "lattice" | "brittleness" | "control";

export type VerdictStatus =
  | "PASS"
  | "FAIL"
  | "WARN"
  | "NOTEWORTHY"
  | "INCONCLUSIVE"
  | "INSUFFICIENT_DATA"
  | "INSUFFICIENT_SEPARATION"
  | "SKIP";

/**
 * @deprecated PROOF_PROGRAM_SPEC.md §6: replaced by `ExperimentFunction`
 * (what job does the experiment do?) + `ExperimentOutcome` (what happened?).
 * Retained for one release as a backward-compat shim so existing artifacts and
 * pre-migration UI keep rendering while Sprint 2b rewrites the surfaces.
 */
export type TheoryFit =
    | "SUPPORTS"
    | "REFUTES"
    | "CANDIDATE"
    | "INFORMATIVE"
    | "CONTROL_BROKEN"
    | "INCONCLUSIVE";

/**
 * @deprecated PROOF_PROGRAM_SPEC.md §6: replaced by `ExperimentFunction`.
 * Retained for one release as a backward-compat shim.
 */
export type ExperimentRole =
    | "ENABLER"
    | "PATHFINDER"
    | "DETECTOR"
    | "FALSIFICATION_CONTROL";

/**
 * @deprecated PROOF_PROGRAM_SPEC.md §6: stage-level *theory* rollup is forbidden.
 * Use `ImplementationHealth` for a non-theoretic per-stage aggregate instead.
 * Retained for one release as a backward-compat shim.
 */
export type StageFit =
    | "SUPPORTS"
    | "REFUTES"
    | "CANDIDATE"
    | "PARTIAL"
    | "INCONCLUSIVE";

/**
 * @deprecated PROOF_PROGRAM_SPEC.md §6: the theory-level rollup this encodes
 * is forbidden under the new ontology. Sprint 2b replaces the consuming UI
 * with `ProofProgramMap` driven by `ProofProgram` and `ImplementationHealth`.
 */
export interface StageVerdict {
    status: StageFit | string;
    reason: string;
    members: string[];
    member_fits?: { [expId: string]: TheoryFit | string };
    role_breakdown?: { [role: string]: number };
}

// ---------------------------------------------------------------------------
// CANONICAL ONTOLOGY (Sprint 2a) — PROOF_PROGRAM_SPEC.md §5/§6
// ---------------------------------------------------------------------------

/**
 * Axis A — the job this experiment does in the proof program. Canonical
 * replacement for `ExperimentRole` + the theorem-verdict connotation of
 * `TheoryFit`. See PROOF_PROGRAM_SPEC.md §5.
 */
export type ExperimentFunction =
    | "THEOREM_STATEMENT"
    | "PROOF_OBLIGATION_WITNESS"
    | "COHERENCE_WITNESS"
    | "CONTROL"
    | "PATHFINDER"
    | "REGRESSION_CHECK"
    | "EXPLORATORY";

/**
 * Axis B — what happened on this run. Canonical replacement for the
 * SUPPORTS/REFUTES/CANDIDATE vocabulary. Only (function=PROOF_OBLIGATION_WITNESS
 * + outcome=CONSISTENT + AUTHORITATIVE fidelity) produces theorem-directed
 * evidence; see PROOF_PROGRAM_SPEC.md §5 "Positive-evidence rule".
 */
export type ExperimentOutcome =
    | "CONSISTENT"
    | "INCONSISTENT"
    | "DIRECTIONAL"
    | "INCONCLUSIVE"
    | "IMPLEMENTATION_OK"
    | "IMPLEMENTATION_BROKEN";

/**
 * Axis C — what kind of claim this result licenses. FORMAL holds by proof;
 * EMPIRICAL is measured at finite precision; HEURISTIC is qualitative;
 * INSTRUMENTAL is about the engine, not about zeta.
 */
export type EpistemicLevel = "FORMAL" | "EMPIRICAL" | "HEURISTIC" | "INSTRUMENTAL";

/**
 * Which of the two named research programs this experiment or obligation
 * belongs to. PROGRAM_1 (direct invariance) is canonical; PROGRAM_2
 * (contradiction-by-detectability) is exploratory only. See
 * PROOF_PROGRAM_SPEC.md Decision Log #2 and §7.
 */
export type ProgramId = "PROGRAM_1" | "PROGRAM_2";

/**
 * Mandatory inference guardrails (PROOF_PROGRAM_SPEC.md §5/§6). Every
 * experiment verdict and every proof obligation must populate these.
 * `disallowed_conclusion` MUST include at least one theorem-level overreach
 * disclaimer. Surfaces that render a result must render at least one of
 * `allowed_conclusion` / `disallowed_conclusion` near the verdict.
 */
export interface InferenceRails {
    inference_scope: string;
    allowed_conclusion: string[];
    disallowed_conclusion: string[];
}

/**
 * Status of a proof obligation in the program. `OPEN` means no witness;
 * `WITNESSED` means at least one PROOF_OBLIGATION_WITNESS is CONSISTENT at
 * AUTHORITATIVE fidelity; `FORMALLY_PROVEN` is reserved for a future Lean/Coq
 * artifact and is not currently set by the verifier.
 */
export type ObligationStatus = "OPEN" | "WITNESSED" | "FORMALLY_PROVEN";

export interface ProofObligation {
    id: string;
    title: string;
    statement: string;
    status: ObligationStatus;
    witnesses: string[];
    inference: InferenceRails;
    program: ProgramId;
    notes?: string;
}

export interface OpenGap {
    id: string;
    title: string;
    description: string;
    blocker_for?: string[];
}

export interface ProofProgram {
    theorem_candidate: {
        formal_statement: string;
        plain_language: string;
        non_claims: string[];
        working_gauge: { base: string; unique: boolean };
    };
    obligations: ProofObligation[];
    open_gaps: OpenGap[];
    witness_map_review?: {
        gate_id: string;
        status: string;
        api_contract_ready: boolean;
        notes: string[];
        frozen_mapping?: { experiment_to_obligation: Record<string, string | null | undefined> };
        provisional_experiments?: string[];
        unmapped_witness_candidates?: string[];
    };
}

/**
 * Non-theoretic per-stage aggregate. Replaces the theorem-level role of
 * `StageVerdict`. Answers "is the engine healthy in this grouping?" — not
 * "does the theory hold?". See PROOF_PROGRAM_SPEC.md §6.
 */
export interface ImplementationHealth {
    status: "IMPLEMENTATION_OK" | "IMPLEMENTATION_BROKEN" | "MIXED" | "NO_MEMBERS";
    members: string[];
    reason?: string;
}

/**
 * Per-experiment classification table emitted in `meta.experiment_classification`.
 * This is the single source of truth that replaces the previously duplicated
 * ROLE_MAP between verifier.py and ExperimentSidebar.tsx — UI code should read
 * from this map rather than hardcoding role assignments.
 */
export interface ExperimentClassification {
    function: ExperimentFunction;
    role?: ExperimentRole;          // legacy, kept during deprecation window
    stage: TheoryStage;              // grouping only (see TheoryStage doc)
    program: ProgramId;
    epistemic_level: EpistemicLevel;
    obligation_id?: string;          // set iff function === "PROOF_OBLIGATION_WITNESS"
    /** True while GAP_WITNESS_MAP_REVIEW remains unsigned. */
    mapping_provisional?: boolean;
    inference: InferenceRails;
}

// Fidelity tier declared by the verifier. Below AUTHORITATIVE, the verifier
// either hard-clamps theory_fit to INCONCLUSIVE (SMOKE) or flags ENABLER
// verdicts as provisional (STANDARD). See verifier.compute_fidelity_tier.
export type FidelityTier = "SMOKE" | "STANDARD" | "AUTHORITATIVE";

export interface ExperimentVerdict {
    // === Canonical axes (Sprint 2a, PROOF_PROGRAM_SPEC.md §5/§6) ===========
    /** What job does this experiment do in the proof program? */
    function?: ExperimentFunction;
    /** What happened on this run? */
    outcome?: ExperimentOutcome;
    /** What kind of claim does this result license? */
    epistemic_level?: EpistemicLevel;
    /** Mandatory inference guardrails — surfaces must render at least one. */
    inference?: InferenceRails;
    /** Research program this record belongs to. */
    program?: ProgramId;
    /** Required iff function === "PROOF_OBLIGATION_WITNESS". */
    obligation_id?: string;
    /** True while GAP_WITNESS_MAP_REVIEW remains unsigned. */
    mapping_provisional?: boolean;
    /** Required iff function === "PATHFINDER" && outcome === "DIRECTIONAL". */
    direction?: string;

    // === Preserved fields ==================================================
    /** Noncanonical grouping/navigation axis. Forbidden from theorem rollups. */
    stage?: TheoryStage | string;
    type: string;
    /** Raw mechanical outcome. Kept for debugging; not a theory signal. */
    status: VerdictStatus | string;
    interpretation: string;
    metrics: Record<string, unknown>;
    /** Fidelity-tier provisional flag (policy unchanged in Sprint 2a). */
    provisional?: boolean;

    // === Deprecation shims (retained for one release) ======================
    /** @deprecated use `function` */
    role?: ExperimentRole | string;
    /** @deprecated use `function` + `outcome` */
    theory_fit?: TheoryFit | string;
}

export interface VerdictHistoryEntry {
    timestamp: string;
    schema_version?: string;
    overall: string;
    obligation_statuses?: { [obligationId: string]: string };
    implementation_health_statuses?: { [stage: string]: string };
    /** @deprecated legacy compatibility only; do not drive active UI semantics. */
    stage_verdicts?: { [stage: string]: string };
    code_fingerprint?: { [fname: string]: string };
    zero_source_info?: Record<string, unknown>;
}

export interface ExperimentsData {
  meta: {
    dps: number;
    zeros: number;
    tau: number;
    schema_version?: string;
    reproducibility_instructions?: string;
    verdicts?: {
        [key: string]: string;
    };
    code_fingerprint?: { [fname: string]: string };
    zero_source_info?: Record<string, unknown>;
    /**
     * Single-source-of-truth classification table (Sprint 2a). Replaces the
     * previously duplicated ROLE_MAP in ExperimentSidebar.tsx. UI should read
     * role / function / stage / obligation_id / inference from here.
     */
    experiment_classification?: { [summaryKey: string]: ExperimentClassification };
  };
  summary?: {
      engine_status?: string;
      /** @deprecated PROOF_PROGRAM_SPEC.md Decision Log #6: no project-wide theory verdict. */
      overall: string;
      schema_version?: string;
      fidelity_tier?: FidelityTier;
      fidelity_zeros?: number;
      fidelity_dps?: number;
      experiments: {
          [key: string]: ExperimentVerdict;
      };
      /**
       * @deprecated PROOF_PROGRAM_SPEC.md §6: stage-level theory rollup is forbidden.
       * Retained for one release so the current UI keeps rendering; Sprint 2b
       * replaces the consuming component with `ProofProgramMap`.
       */
      stage_verdicts?: {
          [stage: string]: StageVerdict;
      };
      /** Non-theoretic per-stage engine-health aggregate (canonical replacement). */
      implementation_health?: {
          [stage: string]: ImplementationHealth;
      };
      /** Canonical proof program: theorem candidate, obligations, open gaps. */
      proof_program?: ProofProgram;
      zero_path_decision?: string;
      zero_path_reason?: string;
  };
  experiment_1: Experiment1;
  experiment_1b: Experiment1B;
  experiment_1c: Experiment1C;
  experiment_2: Experiment2;
  experiment_2b: Experiment2B[];
  experiment_3: Experiment3;
  experiment_4?: Experiment4;
  experiment_5?: Experiment5;
  experiment_6?: Experiment6;
  experiment_7?: Experiment7;
  experiment_8?: Experiment8;
}

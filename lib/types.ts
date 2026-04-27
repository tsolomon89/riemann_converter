export interface DataPoint {
  x: number;
  y_rec?: number;
  y_true?: number;
  y?: number;
  error?: number;
  [key: string]: number | undefined;
}

export interface Exp1MainRow {
  X: number;
  x_eff: number;
  tau_power: number;
  y_true: number;
  li: number;
  [key: string]: number | undefined;
}

export interface Exp1PrimeMarker {
  prime: number;
  X: number;
  x_eff: number;
}

export interface Exp1StressRow extends DataPoint {
  eff_x: number;
}

export interface Exp1SchoenfeldRow {
  X: number;
  x_eff: number;
  tau_power: number;
  TruePi: number;
  Li: number;
  LiError: number;
  SchoenfeldBound: number;
  SchoenfeldApplicable: boolean;
  bound_formula?: string;
}

export interface Experiment1 {
  schema_version?: string;
  main?: {
    description?: string;
    config?: {
      k_values?: number[];
      n_values?: number[];
      x_start?: number;
      x_end?: number;
      harmonic_formula?: string;
      mobius_formula?: string;
    };
    by_k?: { [key: string]: Exp1MainRow[] };
    prime_markers_by_k?: { [key: string]: Exp1PrimeMarker[] };
    metrics?: Record<string, unknown>;
  };
  support?: {
    schoenfeld_bound?: {
      description?: string;
      by_k?: { [key: string]: Exp1SchoenfeldRow[] };
      domain?: { x_eff_min?: number };
    };
    scaled_coordinate_stress?: {
      description?: string;
      by_k?: { [key: string]: Exp1StressRow[] };
      metrics?: Record<string, unknown>;
    };
  };
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
    [key: string]: unknown;
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

// EXP 9: Bounded-view demonstration
export interface Exp9Sample {
    index: number;
    gamma: number;
    k_required: number;
    gamma_image: number;
    in_window: boolean;
}

export interface Experiment9 {
    target_window?: { lo: number; hi: number };
    samples?: Exp9Sample[];
    in_window_count?: number;
    total_count?: number;
}

// Experiment 0 — zeta polar trace on the critical line. Pure visualization
// of zeta(1/2 + i*t) as a parametric curve in the complex plane, with loaded
// zeros marked as expected origin crossings. Plus a dual-window overlay
// comparing zeta on an uncompressed interval vs the same zeta evaluated on
// a tau-scaled (compressed) interval — visualizes the user's compression
// thesis directly on zeta itself.
export interface Exp0PolarSample {
    t: number;
    re: number;
    im: number;
}
export interface Exp0ZeroMarker {
    index: number;
    t: number;
    re: number;
    im: number;
    marker: string;
}
export interface Exp0DualSample {
    t_orig?: number;
    t_compressed?: number;
    t?: number;
    re: number;
    im: number;
}
export interface Experiment0 {
    polar_trace?: {
        samples?: Exp0PolarSample[];
        zero_markers?: Exp0ZeroMarker[];
        config?: {
            t_start?: number;
            t_end?: number;
            point_count?: number;
            dps?: number;
        };
    };
    dual_window?: {
        uncompressed?: Exp0DualSample[];
        compressed?: Exp0DualSample[];
        config?: {
            T?: number;
            L?: number;
            k?: number;
            base_name?: string;
            base_value?: number;
            scale?: number;
            compressed_t_range?: [number, number];
        };
    };
}

// Experiment 10 — zeta gauge-transport residual.
// For each multiplicative base c (tau, sqrt2, e, phi, baseline_1p0001) and
// each integer k, samples |zeta(0.5+it) - zeta(0.5+i*c^k*t)| on a t-grid in
// [T0, T0+L]. Quantifies how far zeta is from being gauge-invariant under
// the candidate transport. Operates directly on zeta (not on pi_N), so it
// is a Level-4 informational witness for the user's compression thesis.
export interface Exp10PerKStats {
    count: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    scale: number;
    raw_residuals?: number[];
}
export interface Experiment10 {
    config?: {
        T0: number;
        L: number;
        M: number;
        dps: number;
        bases: string[];
        k_values: number[];
    };
    bases?: {
        [baseName: string]: { [kStr: string]: Exp10PerKStats };
    };
    summary?: {
        best_base_per_k?: { [kStr: string]: string };
        max_residual_per_base?: { [baseName: string]: number };
        sanity_baseline_max_k1?: number;
        tau_max_k1?: number;
        sanity_baseline_ratio?: number;
    };
}

// Theoretical stage ordering: Gauge -> Lattice -> Brittleness, plus Control.
//
// Under PROOF_PROGRAM_SPEC.md (§6, "On the stage axis"), `stage` is preserved
// as a *noncanonical* grouping and navigation axis: sidebar sections, filter
// chips, docs anchors. It is FORBIDDEN from carrying theorem semantics:
// no stage-level SUPPORTS/REFUTES rollup, no implied proof-progress ordering,
// no contribution to the theorem candidate. The theorem-directed surface is
// `ProofProgram` (below), grouped by obligation, not by stage.
export type TheoryStage = "gauge" | "lattice" | "brittleness" | "control" | "demonstration" | "core_visualization" | "transport";

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
    | "FALSIFICATION_CONTROL"
    | "DEMONSTRATION";

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
    | "CORE_CALCULATION"
    | "PROOF_OBLIGATION_WITNESS"
    | "COHERENCE_WITNESS"
    | "CONTROL"
    | "PATHFINDER"
    | "REGRESSION_CHECK"
    | "EXPLORATORY"
    | "RESEARCH_NOTE"
    | "DEMONSTRATION"
    | "VISUALIZATION";

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
    | "INFORMATIONAL"
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
 * Ladder status of a proof obligation (PROOF_TARGET.md, plan Phase B).
 * Computed by verifier._build_proof_program() in topological order:
 *   - `PROVEN`: a formal proof artifact (Lean/Coq hash) is recorded; future
 *     state with no current occupant.
 *   - `WITNESSED`: a PROOF_OBLIGATION_WITNESS produced a CONSISTENT outcome
 *     at AUTHORITATIVE fidelity AND the witness-map review is SIGNED_OFF.
 *   - `BLOCKED`: at least one `depends_on` prereq is not WITNESSED|PROVEN, or
 *     some `open_gap.blocker_for` names this obligation. `blocked_by` lists
 *     the offenders.
 *   - `CONJECTURAL`: default — not addressed, not blocked.
 */
export type ObligationStatus = "PROVEN" | "WITNESSED" | "CONJECTURAL" | "BLOCKED";

export interface ProofObligation {
    id: string;
    title: string;
    statement: string;
    status: ObligationStatus;
    witnesses: string[];
    /** Obligation IDs that must reach WITNESSED|PROVEN before this one can. */
    depends_on?: string[];
    /** Computed per run. Unmet prereqs + referencing `GAP_*` ids. Empty when status != BLOCKED. */
    blocked_by?: string[];
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
        /** Operational consequence of the sharpened theorem target. Rendered
         * beneath `formal_statement` as "Operational corollary". */
        bounded_view_corollary?: string;
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
    stable_id?: string;
    display_id?: string;
    display_name?: string;
    display_group?: string;
    cli_aliases?: string[];
    function: ExperimentFunction;
    role?: ExperimentRole;          // legacy, kept during deprecation window
    stage: TheoryStage;              // grouping only (see TheoryStage doc)
    program: ProgramId;
    epistemic_level: EpistemicLevel;
    obligation_id?: string;          // set iff function === "PROOF_OBLIGATION_WITNESS"
    /** Non-voting association for exploratory/demonstration records. */
    related_obligation_ids?: string[];
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
    stable_id?: string;
    display_id?: string;
    display_name?: string;
    display_group?: string;
    cli_aliases?: string[];
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
    /** Non-voting association for exploratory/demonstration records. */
    related_obligation_ids?: string[];
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
      /** Program 2 outcomes are displayed separately and excluded from theorem rollups. */
      program_2_summary?: {
          [stage: string]: {
              members: string[];
              outcomes: Record<string, ExperimentOutcome | string>;
              note?: string;
          };
      };
      /** Canonical proof program: theorem candidate, obligations, open gaps. */
      proof_program?: ProofProgram;
      zero_path_decision?: string;
      zero_path_reason?: string;
  };
  experiment_0?: Experiment0;
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
  experiment_9?: Experiment9;
  experiment_10?: Experiment10;
}

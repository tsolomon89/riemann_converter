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

// Theory-fit is the theory-centric verdict axis: it answers "does this
// outcome support or refute the conjecture?" rather than "did a numeric
// threshold get hit?". Critically, control experiments invert: a control's
// mechanical PASS (falsifier triggered) maps to theory_fit=SUPPORTS.
// Pathfinder experiments emit INFORMATIVE for any decisive outcome (hit OR
// miss) because their job is to select a path, not to pass/fail the theory.
export type TheoryFit =
    | "SUPPORTS"
    | "REFUTES"
    | "CANDIDATE"
    | "INFORMATIVE"
    | "CONTROL_BROKEN"
    | "INCONCLUSIVE";

// Role of each experiment in the theory chain (orthogonal to `stage`).
//   ENABLER              - PASS establishes a premise in the conformality
//                          -> compression -> RH-contradiction chain.
//   PATHFINDER           - disambiguates a mechanism; any decisive outcome
//                          is INFORMATIVE.
//   DETECTOR             - verifies the rogue-zero detection works.
//   FALSIFICATION_CONTROL - sanity check that the system can fail on
//                          known-bad data.
export type ExperimentRole =
    | "ENABLER"
    | "PATHFINDER"
    | "DETECTOR"
    | "FALSIFICATION_CONTROL";

// Stage-level rollup verdicts (aggregation of member theory_fits).
export type StageFit =
    | "SUPPORTS"
    | "REFUTES"
    | "CANDIDATE"
    | "PARTIAL"
    | "INCONCLUSIVE";

export interface StageVerdict {
    status: StageFit | string;
    reason: string;
    members: string[];
    member_fits?: { [expId: string]: TheoryFit | string };
    role_breakdown?: { [role: string]: number };
}

// Fidelity tier declared by the verifier. Below AUTHORITATIVE, the verifier
// either hard-clamps theory_fit to INCONCLUSIVE (SMOKE) or flags ENABLER
// verdicts as provisional (STANDARD). See verifier.compute_fidelity_tier.
export type FidelityTier = "SMOKE" | "STANDARD" | "AUTHORITATIVE";

export interface ExperimentVerdict {
    stage?: TheoryStage | string;
    role?: ExperimentRole | string;
    type: string;
    status: VerdictStatus | string;
    theory_fit?: TheoryFit | string;
    interpretation: string;
    metrics: Record<string, unknown>;
    provisional?: boolean;
}

export interface VerdictHistoryEntry {
    timestamp: string;
    schema_version?: string;
    overall: string;
    stage_verdicts: { [stage: string]: string };
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
  };
  summary?: {
      engine_status?: string;
      overall: string;
      schema_version?: string;
      fidelity_tier?: FidelityTier;
      fidelity_zeros?: number;
      fidelity_dps?: number;
      experiments: {
          [key: string]: ExperimentVerdict;
      };
      stage_verdicts?: {
          [stage: string]: StageVerdict;
      };
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

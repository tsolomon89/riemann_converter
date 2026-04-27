import type {
    ExperimentClassification,
    ExperimentVerdict,
    ExperimentsData,
    OpenGap,
    ProofObligation,
    VerdictHistoryEntry,
} from "./types";

export type WitnessMapStatus = "PENDING_SIGNOFF" | "SIGNED_OFF";

export interface AuthorityInfo {
    witness_map_status: WitnessMapStatus;
    authoritative: boolean;
    provisional_fields: string[];
}

export interface DeploymentCapabilities {
    read_only_deployment: boolean;
    run_controls_enabled: boolean;
    read_only_reason?: "HOSTED_READ_ONLY" | "ENABLED";
}

export interface ResearchEnvelope<T> {
    authority: AuthorityInfo;
    capabilities: DeploymentCapabilities;
    data: T;
}

export interface ManifestPayload {
    project: string;
    schema_version?: string;
    fidelity_tier?: string;
    obligation_ids: string[];
    open_gap_ids: string[];
    /** Experiments with verdict/data in the current artifact. */
    experiment_ids: string[];
    /** Full known experiment registry, including display IDs and aliases. */
    experiments?: ExperimentClassification[];
    experiment_aliases?: Record<string, string>;
    zero_source_info?: Record<string, unknown>;
    last_run_timestamp?: string;
}

export interface TheoremCandidatePayload {
    formal_statement?: string;
    /** Operational consequence of the sharpened theorem target (PROOF_TARGET.md). */
    bounded_view_corollary?: string;
    plain_language?: string;
    non_claims?: string[];
    working_gauge?: { base?: string; unique?: boolean };
}

export interface ObligationsPayload {
    obligations: ProofObligation[];
}

export interface OpenGapsPayload {
    open_gaps: OpenGap[];
}

export interface ImplementationHealthPayload {
    implementation_health: NonNullable<ExperimentsData["summary"]>["implementation_health"];
}

export interface HistoryPayload {
    total: number;
    entries: VerdictHistoryEntry[];
}

export interface ExperimentPayload {
    experiment_id: string;
    verdict: ExperimentVerdict;
}

export interface SeriesPayload {
    experiment_id: string;
    variant?: string;
    k?: string;
    base?: string;
    fields?: string[];
    downsample: number;
    total_points: number;
    returned_points: number;
    inference_scope?: string;
    points: Record<string, unknown>[];
}

export interface ScaleComparisonItem {
    k: string;
    total_points: number;
    returned_points: number;
    numeric_summary: Record<string, { min: number; max: number; mean: number }>;
}

export interface CompareScalesPayload {
    experiment_id: string;
    scales: ScaleComparisonItem[];
}

export interface StatusDelta {
    key: string;
    from: string;
    to: string;
}

export interface CompareRunsPayload {
    run_a: string;
    run_b: string;
    overall: { from: string; to: string };
    fidelity_tier: { from?: string; to?: string };
    obligation_deltas: StatusDelta[];
    implementation_health_deltas: StatusDelta[];
}

export interface CompareVerdictsPayload {
    run_a: string;
    run_b: string;
    obligation_deltas: StatusDelta[];
    implementation_health_deltas: StatusDelta[];
    stage_verdict_deltas: StatusDelta[];
}

export type CanonicalRunMode =
    | "verify"
    | "smoke"
    | "standard"
    | "authoritative"
    | "overkill"
    | "overkill_full";

export type RunStatus =
    | "IDLE"
    | "QUEUED"
    | "RUNNING"
    | "CANCELLING"
    | "CANCELLED"
    | "SUCCEEDED"
    | "FAILED";

export type RunPhase =
    | "PRECHECK"
    | "ZERO_LOAD"
    | "EXPERIMENT_LOOP"
    | "VERIFY"
    | "ARTIFACT_WRITE"
    | "DONE";

export interface RunProgress {
    phase: RunPhase;
    current_experiment?: string;
    completed_units: number;
    total_units: number;
    percent: number;
    eta_seconds?: number;
    elapsed_seconds: number;
    heartbeat_at: string;
}

export interface RunEvent {
    run_id: string;
    index: number;
    ts: string;
    kind: string;
    phase?: RunPhase;
    state?: string;
    message?: string;
    current_experiment?: string;
    completed_units?: number;
    total_units?: number;
    percent?: number;
    eta_seconds?: number;
    elapsed_seconds?: number;
    payload?: Record<string, unknown>;
}

export interface RunStartPayload {
    run_id: string;
    mode: string;
    status: RunStatus;
    started_at: string;
}

export interface RunStatusPayload {
    run_id?: string;
    mode?: string;
    status: RunStatus;
    started_at?: string;
    finished_at?: string;
    exit_code?: number;
    progress?: RunProgress;
    checkpoint_path?: string;
    checkpoint_compatible?: boolean;
    checkpoint_reason?: string;
    expectation?: string;
    run_config?: Record<string, unknown>;
    prime_source_info?: Record<string, unknown>;
    last_event_index?: number;
    performance?: {
        phase_durations_seconds?: Record<string, number>;
        mode_baseline_seconds?: number;
    };
}

export interface RunLogsPayload {
    run_id: string;
    from: number;
    next: number;
    chunk: string;
    done: boolean;
    status: RunStatus;
}

export interface RunEventsPayload {
    run_id: string;
    from: number;
    next: number;
    events: RunEvent[];
    done: boolean;
    status: RunStatus;
}

export interface RunCancelPayload {
    run_id: string;
    status: RunStatus;
    cancelled_at: string;
}

export interface RunResumePayload {
    run_id: string;
    mode: CanonicalRunMode;
    status: RunStatus;
    resumed_from_checkpoint: boolean;
    checkpoint_path: string;
}

export interface ProgramDocSection {
    id: string;
    title: string;
    source_file: string;
    source_heading: string;
    markdown: string;
    updated_at: string;
}

export interface ProgramDocsPayload {
    refreshed_at: string;
    sections: ProgramDocSection[];
}

export interface McpToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface McpToolListResult {
    tools: McpToolDef[];
}

export interface McpToolCallParams {
    name: string;
    arguments?: Record<string, unknown>;
}

import type {
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

export interface ResearchEnvelope<T> {
    authority: AuthorityInfo;
    data: T;
}

export interface ManifestPayload {
    project: string;
    schema_version?: string;
    fidelity_tier?: string;
    obligation_ids: string[];
    open_gap_ids: string[];
    experiment_ids: string[];
    zero_source_info?: Record<string, unknown>;
    last_run_timestamp?: string;
}

export interface TheoremCandidatePayload {
    formal_statement?: string;
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
    | "overkill";

export type RunStatus = "IDLE" | "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface RunStartPayload {
    run_id: string;
    mode: CanonicalRunMode;
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
}

export interface RunLogsPayload {
    run_id: string;
    from: number;
    next: number;
    chunk: string;
    done: boolean;
    status: RunStatus;
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

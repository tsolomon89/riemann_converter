import type {
    ExperimentVerdict,
    ExperimentsData,
    ProofObligation,
    VerdictHistoryEntry,
} from "./types";
import type {
    CanonicalRunMode,
    CompareRunsPayload,
    CompareScalesPayload,
    CompareVerdictsPayload,
    ExperimentPayload,
    HistoryPayload,
    ImplementationHealthPayload,
    ManifestPayload,
    OpenGapsPayload,
    ObligationsPayload,
    ResearchEnvelope,
    RunLogsPayload,
    RunStartPayload,
    RunStatusPayload,
    ScaleComparisonItem,
    SeriesPayload,
    StatusDelta,
    TheoremCandidatePayload,
} from "./research-types";
import { readArtifact, readHistory, resolveWitnessMapStatus } from "./research-service";
import { getRunLogs, getRunStatus, startCanonicalRun } from "./run-manager";

const EXP_SUMMARY_TO_DATA: Record<string, keyof ExperimentsData> = {
    EXP_1: "experiment_1",
    EXP_1B: "experiment_1b",
    EXP_1C: "experiment_1c",
    EXP_2: "experiment_2",
    EXP_2B: "experiment_2b",
    EXP_3: "experiment_3",
    EXP_4: "experiment_4",
    EXP_5: "experiment_5",
    EXP_6: "experiment_6",
    EXP_7: "experiment_7",
    EXP_8: "experiment_8",
};

export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

const normalizeExperimentId = (value: string): string => {
    const raw = value.trim().toUpperCase();
    if (/^EXP_[0-9]+[A-Z]?$/.test(raw)) return raw;
    if (/^EXP[0-9]+[A-Z]?$/.test(raw)) return raw.replace(/^EXP/, "EXP_");
    throw new ApiError(400, `Invalid experiment id: ${value}`);
};

const toStringArray = (value: string | null): string[] | undefined => {
    if (!value || !value.trim()) return undefined;
    return value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
};

const toInt = (value: string | null, fallback: number): number => {
    if (!value) return fallback;
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num) || num < 0) throw new ApiError(400, `Invalid integer: ${value}`);
    return num;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const diffStatusMaps = (
    a: Record<string, string> | undefined,
    b: Record<string, string> | undefined,
): StatusDelta[] => {
    const keys = new Set<string>([
        ...Object.keys(a ?? {}),
        ...Object.keys(b ?? {}),
    ]);
    const deltas: StatusDelta[] = [];
    for (const key of keys) {
        const from = a?.[key];
        const to = b?.[key];
        if (from === undefined || to === undefined || from === to) continue;
        deltas.push({ key, from, to });
    }
    return deltas.sort((x, y) => x.key.localeCompare(y.key));
};

const buildEnvelope = <T>(
    artifact: ExperimentsData | undefined,
    data: T,
    provisionalFields: string[] = [],
): ResearchEnvelope<T> => {
    const status = resolveWitnessMapStatus(artifact);
    return {
        authority: {
            witness_map_status: status,
            authoritative: status === "SIGNED_OFF",
            provisional_fields: status === "SIGNED_OFF" ? [] : provisionalFields,
        },
        data,
    };
};

const getArtifactOrThrow = (): ExperimentsData => {
    try {
        return readArtifact();
    } catch (err) {
        throw new ApiError(500, `Failed to read artifact: ${String(err)}`);
    }
};

const getHistorySafe = (): VerdictHistoryEntry[] => {
    try {
        return readHistory();
    } catch {
        return [];
    }
};

const numericSummary = (points: Record<string, unknown>[]): Record<string, { min: number; max: number; mean: number }> => {
    const buckets: Record<string, number[]> = {};
    for (const point of points) {
        for (const [key, value] of Object.entries(point)) {
            if (typeof value !== "number" || Number.isNaN(value)) continue;
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(value);
        }
    }
    const summary: Record<string, { min: number; max: number; mean: number }> = {};
    for (const [key, values] of Object.entries(buckets)) {
        if (values.length === 0) continue;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const mean = values.reduce((acc, val) => acc + val, 0) / values.length;
        summary[key] = { min, max, mean };
    }
    return summary;
};

const downsamplePoints = (points: Record<string, unknown>[], target: number): Record<string, unknown>[] => {
    if (points.length <= target || target <= 0) return points;
    const step = Math.ceil(points.length / target);
    return points.filter((_, idx) => idx % step === 0);
};

const applyFieldFilter = (points: Record<string, unknown>[], fields?: string[]): Record<string, unknown>[] => {
    if (!fields || fields.length === 0) return points;
    return points.map((point) => {
        const selected: Record<string, unknown> = {};
        for (const key of fields) {
            if (key in point) selected[key] = point[key];
        }
        return selected;
    });
};

const getSummaryExperiment = (artifact: ExperimentsData, expId: string): ExperimentVerdict => {
    const verdict = artifact.summary?.experiments?.[expId];
    if (!verdict) throw new ApiError(404, `Experiment verdict not found: ${expId}`);
    return verdict;
};

const asPoints = (input: unknown): Record<string, unknown>[] => {
    if (Array.isArray(input)) {
        return input
            .filter((item) => isObject(item))
            .map((item) => deepClone(item));
    }
    if (isObject(input)) {
        const points: Record<string, unknown>[] = [];
        for (const [k, value] of Object.entries(input)) {
            if (Array.isArray(value)) {
                for (const row of value) {
                    if (isObject(row)) points.push({ k, ...deepClone(row) });
                }
                continue;
            }
            if (isObject(value)) points.push({ k, ...deepClone(value) });
        }
        return points;
    }
    return [];
};

const buildSeriesPoints = (
    artifact: ExperimentsData,
    expId: string,
    variant: string | null,
    k: string | null,
): Record<string, unknown>[] => {
    const dataKey = EXP_SUMMARY_TO_DATA[expId];
    const blob = artifact[dataKey];
    if (blob === undefined || blob === null) throw new ApiError(404, `No data for ${expId}`);

    if (expId === "EXP_1" || expId === "EXP_1C") {
        const matrix = blob as Record<string, unknown[]>;
        if (k) {
            if (!matrix[k]) throw new ApiError(400, `k=${k} is not available for ${expId}`);
            return asPoints(matrix[k]).map((row) => ({ k, ...row }));
        }
        return asPoints(matrix);
    }

    if (expId === "EXP_1B") {
        const picked = variant ?? "gamma";
        if (!["gamma", "rho"].includes(picked)) {
            throw new ApiError(400, `variant must be gamma|rho for ${expId}`);
        }
        const inner = (blob as { variants: { gamma_scaled: unknown; rho_scaled: unknown } }).variants;
        const selected = picked === "gamma" ? inner.gamma_scaled : inner.rho_scaled;
        if (k) {
            const matrix = selected as Record<string, unknown>;
            if (!(k in matrix)) throw new ApiError(400, `k=${k} is not available for ${expId}/${picked}`);
            return asPoints((matrix as Record<string, unknown>)[k]).map((row) => ({ k, ...row }));
        }
        return asPoints(selected);
    }

    if (expId === "EXP_2") {
        const picked = (variant ?? "2A").toUpperCase();
        if (!["2A", "2B"].includes(picked)) throw new ApiError(400, `variant must be 2A|2B for ${expId}`);
        return asPoints((blob as Record<string, unknown>)[picked]);
    }

    if (expId === "EXP_3") {
        const picked = variant ?? "3A";
        if (!["3A", "3B", "TruePi"].includes(picked)) {
            throw new ApiError(400, `variant must be 3A|3B|TruePi for ${expId}`);
        }
        return asPoints((blob as Record<string, unknown>)[picked]);
    }

    if (expId === "EXP_2B" || expId === "EXP_7") {
        if (expId === "EXP_7") return asPoints((blob as { calibrated?: unknown }).calibrated ?? []);
        return asPoints(blob);
    }

    if (expId === "EXP_4" || expId === "EXP_5" || expId === "EXP_6") {
        const rows = blob as Record<string, unknown>;
        if (k) {
            if (!(k in rows)) throw new ApiError(400, `k=${k} is not available for ${expId}`);
            return asPoints([(rows as Record<string, unknown>)[k]]).map((row) => ({ k, ...row }));
        }
        return asPoints(rows);
    }

    if (expId === "EXP_8") {
        const perK = (blob as { per_k?: Record<string, unknown> }).per_k ?? {};
        if (k) {
            if (!(k in perK)) throw new ApiError(400, `k=${k} is not available for ${expId}`);
            return asPoints([perK[k]]).map((row) => ({ k, ...row }));
        }
        return asPoints(perK);
    }

    return asPoints(blob);
};

export const getManifestEnvelope = (): ResearchEnvelope<ManifestPayload> => {
    const artifact = getArtifactOrThrow();
    const history = getHistorySafe();
    const obligations = artifact.summary?.proof_program?.obligations ?? [];
    const openGaps = artifact.summary?.proof_program?.open_gaps ?? [];
    const experimentIds = Object.keys(artifact.summary?.experiments ?? {});

    const payload: ManifestPayload = {
        project: "riemann_converter",
        schema_version: artifact.meta?.schema_version ?? artifact.summary?.schema_version,
        fidelity_tier: artifact.summary?.fidelity_tier,
        obligation_ids: obligations.map((obl) => obl.id),
        open_gap_ids: openGaps.map((gap) => gap.id),
        experiment_ids: experimentIds,
        zero_source_info: artifact.meta?.zero_source_info,
        last_run_timestamp: history.length > 0 ? history[history.length - 1].timestamp : undefined,
    };
    return buildEnvelope(artifact, payload);
};

export const getTheoremCandidateEnvelope = (): ResearchEnvelope<TheoremCandidatePayload> => {
    const artifact = getArtifactOrThrow();
    const payload = artifact.summary?.proof_program?.theorem_candidate ?? {};
    return buildEnvelope(artifact, payload);
};

export const getObligationsEnvelope = (): ResearchEnvelope<ObligationsPayload> => {
    const artifact = getArtifactOrThrow();
    const payload: ObligationsPayload = {
        obligations: artifact.summary?.proof_program?.obligations ?? [],
    };
    return buildEnvelope(
        artifact,
        payload,
        ["data.obligations[].status", "data.obligations[].witnesses", "data.obligations[].notes"],
    );
};

export const getObligationEnvelope = (id: string): ResearchEnvelope<ProofObligation> => {
    const artifact = getArtifactOrThrow();
    const obligations = artifact.summary?.proof_program?.obligations ?? [];
    const obligation = obligations.find((entry) => entry.id === id);
    if (!obligation) throw new ApiError(404, `Obligation not found: ${id}`);
    return buildEnvelope(
        artifact,
        obligation,
        ["data.status", "data.witnesses", "data.notes"],
    );
};

export const getOpenGapsEnvelope = (): ResearchEnvelope<OpenGapsPayload> => {
    const artifact = getArtifactOrThrow();
    return buildEnvelope(artifact, {
        open_gaps: artifact.summary?.proof_program?.open_gaps ?? [],
    });
};

export const getImplementationHealthEnvelope = (): ResearchEnvelope<ImplementationHealthPayload> => {
    const artifact = getArtifactOrThrow();
    return buildEnvelope(artifact, {
        implementation_health: artifact.summary?.implementation_health ?? {},
    });
};

export const getHistoryEnvelope = (limitQuery: string | null): ResearchEnvelope<HistoryPayload> => {
    const artifact = getArtifactOrThrow();
    const all = getHistorySafe();
    const limit = Math.max(1, toInt(limitQuery, 50));
    const entries = all.slice(-limit).reverse();
    return buildEnvelope(
        artifact,
        { total: all.length, entries },
        ["data.entries[].obligation_statuses", "data.entries[].implementation_health_statuses"],
    );
};

export const getExperimentEnvelope = (expIdParam: string): ResearchEnvelope<ExperimentPayload> => {
    const artifact = getArtifactOrThrow();
    const expId = normalizeExperimentId(expIdParam);
    const verdict = getSummaryExperiment(artifact, expId);
    return buildEnvelope(
        artifact,
        { experiment_id: expId, verdict },
        ["data.verdict.obligation_id", "data.verdict.mapping_provisional"],
    );
};

export const getSeriesEnvelope = (
    expIdParam: string,
    query: URLSearchParams,
): ResearchEnvelope<SeriesPayload> => {
    const artifact = getArtifactOrThrow();
    const expId = normalizeExperimentId(expIdParam);
    const verdict = getSummaryExperiment(artifact, expId);
    const variant = query.get("variant");
    const k = query.get("k");
    const fields = toStringArray(query.get("fields"));
    const downsample = Math.max(1, toInt(query.get("downsample"), 500));

    const pointsRaw = buildSeriesPoints(artifact, expId, variant, k);
    const pointsFiltered = applyFieldFilter(pointsRaw, fields);
    const sampled = downsamplePoints(pointsFiltered, downsample);
    const payload: SeriesPayload = {
        experiment_id: expId,
        variant: variant ?? undefined,
        k: k ?? undefined,
        fields,
        downsample,
        total_points: pointsRaw.length,
        returned_points: sampled.length,
        inference_scope: verdict.inference?.inference_scope,
        points: sampled,
    };
    return buildEnvelope(
        artifact,
        payload,
        ["data.inference_scope", "data.experiment_id"],
    );
};

export const compareScalesEnvelope = (query: URLSearchParams): ResearchEnvelope<CompareScalesPayload> => {
    const artifact = getArtifactOrThrow();
    const expIdParam = query.get("experiment");
    if (!expIdParam) throw new ApiError(400, "Missing required query: experiment");
    const expId = normalizeExperimentId(expIdParam);
    const downsample = Math.max(1, toInt(query.get("downsample"), 500));
    const kValues = toStringArray(query.get("k"));
    if (!kValues || kValues.length === 0) throw new ApiError(400, "Missing required query: k");

    const scales: ScaleComparisonItem[] = kValues.map((k) => {
        const points = downsamplePoints(
            applyFieldFilter(buildSeriesPoints(artifact, expId, null, k), undefined),
            downsample,
        );
        return {
            k,
            total_points: points.length,
            returned_points: points.length,
            numeric_summary: numericSummary(points),
        };
    });

    return buildEnvelope(artifact, { experiment_id: expId, scales });
};

export const compareRunsEnvelope = (query: URLSearchParams): ResearchEnvelope<CompareRunsPayload> => {
    const artifact = getArtifactOrThrow();
    const runA = query.get("runA");
    const runB = query.get("runB");
    if (!runA || !runB) throw new ApiError(400, "runA and runB are required.");
    const history = getHistorySafe();
    const a = history.find((entry) => entry.timestamp === runA);
    const b = history.find((entry) => entry.timestamp === runB);
    if (!a || !b) throw new ApiError(404, "runA or runB not found in verdict history.");

    const payload: CompareRunsPayload = {
        run_a: runA,
        run_b: runB,
        overall: { from: a.overall, to: b.overall },
        fidelity_tier: {
            from: (a as VerdictHistoryEntry & { fidelity_tier?: string }).fidelity_tier,
            to: (b as VerdictHistoryEntry & { fidelity_tier?: string }).fidelity_tier,
        },
        obligation_deltas: diffStatusMaps(a.obligation_statuses, b.obligation_statuses),
        implementation_health_deltas: diffStatusMaps(
            a.implementation_health_statuses,
            b.implementation_health_statuses,
        ),
    };
    return buildEnvelope(
        artifact,
        payload,
        ["data.obligation_deltas", "data.implementation_health_deltas"],
    );
};

export const compareVerdictsEnvelope = (query: URLSearchParams): ResearchEnvelope<CompareVerdictsPayload> => {
    const artifact = getArtifactOrThrow();
    const runA = query.get("runA");
    const runB = query.get("runB");
    if (!runA || !runB) throw new ApiError(400, "runA and runB are required.");
    const history = getHistorySafe();
    const a = history.find((entry) => entry.timestamp === runA);
    const b = history.find((entry) => entry.timestamp === runB);
    if (!a || !b) throw new ApiError(404, "runA or runB not found in verdict history.");

    return buildEnvelope(
        artifact,
        {
            run_a: runA,
            run_b: runB,
            obligation_deltas: diffStatusMaps(a.obligation_statuses, b.obligation_statuses),
            implementation_health_deltas: diffStatusMaps(
                a.implementation_health_statuses,
                b.implementation_health_statuses,
            ),
            stage_verdict_deltas: diffStatusMaps(a.stage_verdicts, b.stage_verdicts),
        },
        [
            "data.obligation_deltas",
            "data.implementation_health_deltas",
            "data.stage_verdict_deltas",
        ],
    );
};

export const startRunEnvelope = (mode: CanonicalRunMode): ResearchEnvelope<RunStartPayload> => {
    const artifact = getArtifactOrThrow();
    const started = startCanonicalRun(mode, process.cwd());
    if ("status" in started) throw new ApiError(started.status, started.error);
    const run = started.run;
    return buildEnvelope(artifact, {
        run_id: run.run_id,
        mode,
        status: run.status,
        started_at: run.started_at,
    });
};

export const getRunStatusEnvelope = (runId: string | null): ResearchEnvelope<RunStatusPayload> => {
    const artifact = getArtifactOrThrow();
    const run = getRunStatus(runId ?? undefined);
    if (!run) {
        return buildEnvelope(artifact, { status: "IDLE" });
    }
    return buildEnvelope(artifact, run);
};

export const getRunLogsEnvelope = (runId: string | null, from: string | null): ResearchEnvelope<RunLogsPayload> => {
    const artifact = getArtifactOrThrow();
    if (!runId) throw new ApiError(400, "Missing required query: run_id");
    const parsedFrom = toInt(from, 0);
    const logs = getRunLogs(runId, parsedFrom);
    if (!logs) throw new ApiError(404, "Run not found.");
    return buildEnvelope(artifact, logs);
};

export const parseCanonicalMode = (value: unknown): CanonicalRunMode => {
    const mode = String(value ?? "verify").toLowerCase();
    const allowed: CanonicalRunMode[] = [
        "verify",
        "smoke",
        "standard",
        "authoritative",
        "overkill",
    ];
    if (!allowed.includes(mode as CanonicalRunMode)) {
        throw new ApiError(400, `Invalid mode: ${String(value)}`);
    }
    return mode as CanonicalRunMode;
};

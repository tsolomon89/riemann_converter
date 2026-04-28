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
    ProgramDocsPayload,
    ResearchEnvelope,
    RunLogsPayload,
    RunEventsPayload,
    RunCancelPayload,
    RunResumePayload,
    RunStartPayload,
    RunStatusPayload,
    ScaleComparisonItem,
    SeriesPayload,
    StatusDelta,
    TheoremCandidatePayload,
} from "./research-types";
import { getDeploymentCapabilities } from "./deployment-policy";
import { readArtifact, readHistory, readProgramDocsSections, resolveWitnessMapStatus } from "./research-service";
import {
    cancelRun,
    getRunEvents,
    getRunLogs,
    getRunStatus,
    resumeCanonicalRun,
    startCanonicalRun,
    startConfiguredRun,
    type CustomRunConfig,
} from "./run-manager";

const EXP_SUMMARY_TO_DATA: Record<string, keyof ExperimentsData> = {
    EXP_0: "experiment_0",
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
    EXP_9: "experiment_9",
    EXP_10: "experiment_10",
};

const EXP_ALIAS_TO_ID: Record<string, string> = {
    "ZETA-0": "EXP_0",
    POLAR: "EXP_0",
    "POLAR-TRACE": "EXP_0",
    "TRANS-1": "EXP_10",
    TRANSPORT: "EXP_10",
    "ZETA-TRANSPORT": "EXP_10",
    "CORE-1": "EXP_1",
    HARMONIC: "EXP_1",
    "HARMONIC-CONVERTER": "EXP_1",
    CONVERTER: "EXP_1",
    "CTRL-1": "EXP_1B",
    "OPERATOR-CONTROL": "EXP_1B",
    "OPERATOR-SCALING-CONTROL": "EXP_1B",
    "NOTE-1": "EXP_1C",
    "ZERO-REUSE": "EXP_1C",
    "ZERO-REUSE-NOTE": "EXP_1C",
    "P2-1": "EXP_2",
    "ROGUE-CENTRIFUGE": "EXP_2",
    "P2-2": "EXP_2B",
    "ROGUE-ISOLATION": "EXP_2B",
    "CTRL-2": "EXP_3",
    "BETA-CONTROL": "EXP_3",
    "BETA-COUNTERFACTUAL": "EXP_3",
    "PATH-1": "EXP_4",
    "TRANSLATION-DILATION": "EXP_4",
    "PATH-2": "EXP_5",
    "ZERO-CORRESPONDENCE": "EXP_5",
    "VAL-1": "EXP_6",
    "BETA-STABILITY": "EXP_6",
    "BETA-VALIDATION": "EXP_6",
    "P2-3": "EXP_7",
    "CALIBRATED-AMPLIFICATION": "EXP_7",
    "WIT-1": "EXP_8",
    "ZERO-SCALING-WITNESS": "EXP_8",
    "REG-1": "EXP_8",
    "SCALED-ZETA-REGRESSION": "EXP_8",
    "DEMO-1": "EXP_9",
    "BOUNDED-VIEW": "EXP_9",
};

const normalizeAliasKey = (value: string): string =>
    value.trim().toUpperCase().replace(/_/g, "-").replace(/\s+/g, "-");

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
    const alias = EXP_ALIAS_TO_ID[normalizeAliasKey(value)];
    if (alias) return alias;
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

const optionalString = (
    input: Record<string, unknown>,
    key: string,
    fallback?: string,
): string | undefined => {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    return fallback;
};

const optionalNumber = (
    input: Record<string, unknown>,
    key: string,
): number | undefined => {
    const value = input[key];
    if (value === undefined || value === null || value === "") return undefined;
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) throw new ApiError(400, `Invalid numeric custom run value: ${key}`);
    return num;
};

const parseCustomRunConfig = (value: unknown): CustomRunConfig => {
    if (!isObject(value)) throw new ApiError(400, "Missing custom run configuration.");
    return {
        run: optionalString(value, "run", "all") ?? "all",
        zero_source: optionalString(value, "zero_source", "generated"),
        zero_count: optionalNumber(value, "zero_count"),
        dps: optionalNumber(value, "dps"),
        resolution: optionalNumber(value, "resolution"),
        x_start: optionalNumber(value, "x_start"),
        x_end: optionalNumber(value, "x_end"),
        beta_offset: optionalNumber(value, "beta_offset"),
        k_power: optionalNumber(value, "k_power"),
        workers: optionalNumber(value, "workers"),
        prime_min_count: optionalNumber(value, "prime_min_count"),
        prime_target_count: optionalNumber(value, "prime_target_count"),
    };
};

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
    const capabilities = getDeploymentCapabilities();
    return {
        authority: {
            witness_map_status: status,
            authoritative: status === "SIGNED_OFF",
            provisional_fields: status === "SIGNED_OFF" ? [] : provisionalFields,
        },
        capabilities,
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

const getArtifactIfAvailable = (): ExperimentsData | undefined => {
    try {
        return readArtifact();
    } catch {
        return undefined;
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
    base: string | null = null,
): Record<string, unknown>[] => {
    const dataKey = EXP_SUMMARY_TO_DATA[expId];
    const blob = artifact[dataKey];
    if (blob === undefined || blob === null) throw new ApiError(404, `No data for ${expId}`);

    if (expId === "EXP_0") {
        const picked = variant ?? "polar";
        if (!["polar", "zero_markers", "dual", "dual-uncompressed", "dual-compressed"].includes(picked)) {
            throw new ApiError(400, `variant must be polar|zero_markers|dual|dual-uncompressed|dual-compressed for ${expId}`);
        }
        const exp0 = blob as NonNullable<ExperimentsData["experiment_0"]>;
        if (picked === "polar") return asPoints(exp0.polar_trace?.samples ?? []);
        if (picked === "zero_markers") return asPoints(exp0.polar_trace?.zero_markers ?? []);

        const uncompressed = asPoints(exp0.dual_window?.uncompressed ?? [])
            .map((row) => ({ branch: "uncompressed", ...row }));
        const compressed = asPoints(exp0.dual_window?.compressed ?? [])
            .map((row) => ({ branch: "compressed", ...row }));
        if (picked === "dual-uncompressed") return uncompressed;
        if (picked === "dual-compressed") return compressed;
        return [...uncompressed, ...compressed];
    }

    if (expId === "EXP_10") {
        const picked = variant ?? "max-by-k";
        if (!["max-by-k", "residuals"].includes(picked)) {
            throw new ApiError(400, `variant must be max-by-k|residuals for ${expId}`);
        }
        const exp10 = blob as NonNullable<ExperimentsData["experiment_10"]>;
        const bases = exp10.bases ?? {};

        if (picked === "max-by-k") {
            return Object.entries(bases).flatMap(([baseName, perK]) =>
                Object.entries(perK ?? {}).flatMap(([kValue, stats]) => {
                    if (k && k !== kValue) return [];
                    const summary = {
                        count: stats.count,
                        max: stats.max,
                        mean: stats.mean,
                        median: stats.median,
                        p95: stats.p95,
                        scale: stats.scale,
                    };
                    return [{ base: baseName, k: kValue, ...summary }];
                }),
            );
        }

        const baseNames = Object.keys(bases);
        const selectedBase = base ?? exp10.config?.bases?.[0] ?? baseNames[0];
        if (!selectedBase || !(selectedBase in bases)) {
            throw new ApiError(400, `base=${selectedBase ?? ""} is not available for ${expId}/residuals`);
        }
        const perK = bases[selectedBase] ?? {};
        const kNames = Object.keys(perK);
        const configuredK = exp10.config?.k_values;
        const fallbackK = configuredK && configuredK.length > 0
            ? String(configuredK[configuredK.length - 1])
            : kNames[kNames.length - 1];
        const selectedK = k ?? fallbackK;
        if (!selectedK || !(selectedK in perK)) {
            throw new ApiError(400, `k=${selectedK ?? ""} is not available for ${expId}/residuals`);
        }
        const stats = perK[selectedK];
        const residuals = Array.isArray(stats.raw_residuals) ? stats.raw_residuals : [];
        const t0 = exp10.config?.T0 ?? 0;
        const length = exp10.config?.L ?? 0;
        const count = residuals.length;
        const step = count > 1 ? length / (count - 1) : 0;
        return residuals.map((residual, index) => ({
            base: selectedBase,
            k: selectedK,
            index,
            t: t0 + index * step,
            residual,
        }));
    }

    if (expId === "EXP_1") {
        const picked = variant ?? "main";
        if (!["main", "harmonic", "mobius", "stress", "schoenfeld"].includes(picked)) {
            throw new ApiError(400, `variant must be main|harmonic|mobius|stress|schoenfeld for ${expId}`);
        }
        const exp1 = blob as ExperimentsData["experiment_1"];
        if (picked === "schoenfeld") {
            const matrix = exp1.support?.schoenfeld_bound?.by_k;
            if (!matrix) {
                if (k) throw new ApiError(400, `k=${k} is not available for ${expId}/${picked}`);
                return [];
            }
            if (k) {
                if (!matrix[k]) throw new ApiError(400, `k=${k} is not available for ${expId}/${picked}`);
                return asPoints(matrix[k]).map((row) => ({ k, ...row }));
            }
            return Object.entries(matrix).flatMap(([kValue, rows]) =>
                asPoints(rows).map((row) => ({ k: kValue, ...row })),
            );
        }
        const matrix =
            picked === "stress"
                ? exp1.support?.scaled_coordinate_stress?.by_k
                : exp1.main?.by_k;
        if (!matrix) {
            if (k) throw new ApiError(400, `k=${k} is not available for ${expId}/${picked}`);
            return [];
        }
        const rowsFor = (kValue: string, rows: unknown[]) =>
            asPoints(rows).map((row) => {
                if (picked === "main" || picked === "stress") return { k: kValue, ...row };
                const filtered: Record<string, unknown> = { k: kValue };
                const prefix = picked === "harmonic" ? "harmonic_N_" : "mobius_N_";
                for (const [key, value] of Object.entries(row)) {
                    if (
                        key === "X" ||
                        key === "x_eff" ||
                        key === "tau_power" ||
                        key === "y_true" ||
                        key === "li" ||
                        key.startsWith(prefix)
                    ) {
                        filtered[key] = value;
                    }
                }
                return filtered;
            });
        if (k) {
            if (!matrix[k]) throw new ApiError(400, `k=${k} is not available for ${expId}/${picked}`);
            return rowsFor(k, matrix[k] as unknown[]);
        }
        return Object.entries(matrix).flatMap(([kValue, rows]) => rowsFor(kValue, rows as unknown[]));
    }

    if (expId === "EXP_1C") {
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
    const classification = artifact.meta?.experiment_classification ?? {};
    const experiments = Object.entries(classification)
        .map(([stableId, entry]) => ({ stable_id: stableId, ...entry }))
        .sort((a, b) => (a.display_id ?? a.stable_id ?? "").localeCompare(b.display_id ?? b.stable_id ?? ""));
    const experimentAliases = experiments.reduce<Record<string, string>>((acc, entry) => {
        const stableId = entry.stable_id;
        if (!stableId) return acc;
        if (entry.display_id) acc[entry.display_id] = stableId;
        for (const alias of entry.cli_aliases ?? []) {
            acc[alias] = stableId;
        }
        return acc;
    }, {});

    const payload: ManifestPayload = {
        project: "riemann_converter",
        schema_version: artifact.meta?.schema_version ?? artifact.summary?.schema_version,
        fidelity_tier: artifact.summary?.fidelity_tier,
        obligation_ids: obligations.map((obl) => obl.id),
        open_gap_ids: openGaps.map((gap) => gap.id),
        experiment_ids: experimentIds,
        experiments,
        experiment_aliases: experimentAliases,
        zero_source_info: artifact.meta?.zero_source_info,
        last_run_timestamp: history.length > 0 ? history[history.length - 1].timestamp : undefined,
    };
    return buildEnvelope(artifact, payload);
};

export const getProgramDocsEnvelope = (): ResearchEnvelope<ProgramDocsPayload> => {
    let artifact: ExperimentsData | undefined;
    try {
        artifact = getArtifactOrThrow();
    } catch {
        artifact = undefined;
    }
    return buildEnvelope(artifact, {
        refreshed_at: new Date().toISOString(),
        sections: readProgramDocsSections(),
    });
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
        [
            "data.obligations[].status",
            "data.obligations[].witnesses",
            "data.obligations[].notes",
            "data.obligations[].blocked_by",
            "data.obligations[].depends_on",
        ],
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
        [
            "data.status",
            "data.witnesses",
            "data.notes",
            "data.blocked_by",
            "data.depends_on",
        ],
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
    const base = query.get("base");
    const fields = toStringArray(query.get("fields"));
    const downsample = Math.max(1, toInt(query.get("downsample"), 500));

    const pointsRaw = buildSeriesPoints(artifact, expId, variant, k, base);
    const pointsFiltered = applyFieldFilter(pointsRaw, fields);
    const sampled = downsamplePoints(pointsFiltered, downsample);
    const payload: SeriesPayload = {
        experiment_id: expId,
        variant: variant ?? undefined,
        k: k ?? undefined,
        base: base ?? undefined,
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
    const artifact = getArtifactIfAvailable();
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

export const startCustomRunEnvelope = (input: unknown): ResearchEnvelope<RunStartPayload> => {
    const artifact = getArtifactIfAvailable();
    const config = parseCustomRunConfig(input);
    const started = startConfiguredRun(config, process.cwd());
    if ("status" in started) throw new ApiError(started.status, started.error);
    const run = started.run;
    return buildEnvelope(artifact, {
        run_id: run.run_id,
        mode: run.mode ?? `custom:${config.run}`,
        status: run.status,
        started_at: run.started_at,
    });
};

export const getRunStatusEnvelope = (runId: string | null): ResearchEnvelope<RunStatusPayload> => {
    const artifact = getArtifactIfAvailable();
    const run = getRunStatus(runId ?? undefined);
    if (!run) {
        return buildEnvelope(artifact, { status: "IDLE" });
    }
    return buildEnvelope(artifact, run);
};

export const getRunLogsEnvelope = (runId: string | null, from: string | null): ResearchEnvelope<RunLogsPayload> => {
    const artifact = getArtifactIfAvailable();
    if (!runId) throw new ApiError(400, "Missing required query: run_id");
    const parsedFrom = toInt(from, 0);
    const logs = getRunLogs(runId, parsedFrom);
    if (!logs) throw new ApiError(404, "Run not found.");
    return buildEnvelope(artifact, logs);
};

export const getRunEventsEnvelope = (
    runId: string | null,
    from: string | null,
): ResearchEnvelope<RunEventsPayload> => {
    const artifact = getArtifactIfAvailable();
    if (!runId) throw new ApiError(400, "Missing required query: run_id");
    const parsedFrom = toInt(from, 0);
    const events = getRunEvents(runId, parsedFrom);
    if (!events) throw new ApiError(404, "Run not found.");
    return buildEnvelope(artifact, events);
};

export const cancelRunEnvelope = (runId: string | null): ResearchEnvelope<RunCancelPayload> => {
    const artifact = getArtifactIfAvailable();
    const cancelled = cancelRun(runId ?? undefined);
    if ("status" in cancelled) throw new ApiError(cancelled.status, cancelled.error);
    return buildEnvelope(artifact, cancelled.run);
};

export const resumeRunEnvelope = (mode: CanonicalRunMode): ResearchEnvelope<RunResumePayload> => {
    const artifact = getArtifactIfAvailable();
    const resumed = resumeCanonicalRun(mode, process.cwd());
    if ("status" in resumed) throw new ApiError(resumed.status, resumed.error);
    return buildEnvelope(artifact, resumed.run);
};

export const parseCanonicalMode = (value: unknown): CanonicalRunMode => {
    const mode = String(value ?? "verify").toLowerCase();
    const allowed: CanonicalRunMode[] = [
        "verify",
        "smoke",
        "standard",
        "authoritative",
        "overkill",
        "overkill_full",
    ];
    if (!allowed.includes(mode as CanonicalRunMode)) {
        throw new ApiError(400, `Invalid mode: ${String(value)}`);
    }
    return mode as CanonicalRunMode;
};

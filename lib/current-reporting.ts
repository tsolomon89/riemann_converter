import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { checkDataSufficiency, type DataPlannerOutput } from "./data-planner";
import type { ExperimentsData, ExperimentVerdict, VerdictHistoryEntry } from "./types";

export const CURRENT_STATE_SCHEMA_VERSION = "2026.05.current-run.v1";
export const RUN_ARTIFACT_SCHEMA_VERSION = "2026.05.run-artifact.v1";
export const RESET_REASON = "historical run artifacts cleared during active development";
export const DEFAULT_NEXT_ACTION = "run clean Program 1 critical suite";
export const HISTORICAL_COMPARISON_NOTE =
    "Historical run comparison is disabled during active development. Current reports reflect only the latest clean run.";

export type ArtifactKind =
    | "experiments"
    | "certificate"
    | "analysis"
    | "data_sufficiency"
    | "research_plan";

export type ArtifactFreshness = "CURRENT" | "STALE" | "MISSING_FOR_RUN" | "RESET";
export type LatestRunStatus = "NO_CURRENT_RUN" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type CertificateFreshnessStatus = "NOT_BUILT" | "CURRENT" | "STALE" | "MISSING_FOR_RUN";
export type DataAssetsStatus = "AVAILABLE" | "NEEDS_CHECK";
export type ComputeFidelity = "SMOKE" | "STANDARD" | "AUTHORITATIVE";
export type DataFidelity = "READY" | "READY_WITH_WARNINGS" | "INSUFFICIENT";
export type CertificateFidelity = "ELIGIBLE" | "ELIGIBLE_WITH_WARNINGS" | "BLOCKED";
export type ComparisonType =
    | "CONTROLLED_REGRESSION"
    | "EXPECTED_IMPLEMENTATION_DRIFT"
    | "INCOMPARABLE";

export interface CurrentReportingState {
    engine_status: "NO_CURRENT_RUN" | "CURRENT_RUN";
    reason?: string;
    latest_run_id: string | null;
    current_experiments_path: string | null;
    current_certificate_path: string | null;
    certificate_status: "NOT_BUILT" | "CURRENT" | "STALE" | "MISSING_FOR_RUN";
    data_assets_status: DataAssetsStatus;
    historical_comparison_enabled: boolean;
    next_action: string;
    selected_data_sources?: Record<string, unknown> | null;
    note?: string;
    schema_version?: string;
}

export interface LatestRunPayload {
    latest_real_run_id: string | null;
    status: LatestRunStatus;
    started_at: string | null;
    finished_at: string | null;
    experiments_path: string | null;
    certificate_path: string | null;
    certificate_status: CertificateFreshnessStatus;
    analysis_path: string | null;
    is_public_experiments_current: boolean;
    historical_comparison_enabled: boolean;
    next_action: string;
}

export interface ArtifactFreshnessPayload {
    artifact_kind: ArtifactKind;
    run_id: string | null;
    latest_run_id: string | null;
    path: string | null;
    freshness: ArtifactFreshness;
    reason: string;
    source_artifact_hash: string | null;
    expected_source_artifact_hash: string | null;
}

export interface FidelityReport {
    compute_fidelity: ComputeFidelity;
    data_fidelity: DataFidelity;
    certificate_fidelity: CertificateFidelity;
    warnings: string[];
    requested_dps: number | null;
    requested_zero_count: number | null;
    zero_source_declared_decimals: number | null;
    required_stored_dps: number | null;
    data_sufficiency?: DataPlannerOutput;
}

export interface DriftClassification {
    comparison_type: ComparisonType;
    same_code: boolean;
    same_data: boolean;
    same_config: boolean;
    same_schema: boolean;
    same_verifier: boolean;
    interpretation: string;
}

const publicCurrentPath = (cwd: string) => path.join(cwd, "public", "current.json");
const publicExperimentsPath = (cwd: string) => path.join(cwd, "public", "experiments.json");
const publicCertificatePath = (cwd: string) => path.join(cwd, "public", "same_object_certificate.json");
const artifactRunsRoot = (cwd: string) => path.join(cwd, "artifacts", "runs");
const runtimeRunsRoot = (cwd: string) => path.join(cwd, ".runtime", "runs");
const resolveRepoPath = (candidate: string, cwd: string) =>
    path.isAbsolute(candidate) ? candidate : path.join(cwd, candidate);
const repoRelativePath = (candidate: string, cwd: string) => {
    try {
        return path.relative(cwd, candidate).replace(/\\/g, "/");
    } catch {
        return candidate.replace(/\\/g, "/");
    }
};

const artifactFileName: Record<ArtifactKind, string> = {
    experiments: "experiments.json",
    certificate: "certificate.json",
    analysis: "analysis.json",
    data_sufficiency: "data_sufficiency.json",
    research_plan: "research_plan.json",
};

const readJson = <T>(filePath: string): T | null => {
    try {
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, "utf8").trim();
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
};

const stableJson = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value as Record<string, unknown>)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
};

export const sha256Text = (value: string) => createHash("sha256").update(value).digest("hex");

export const hashFile = (filePath: string): string | null => {
    try {
        if (!fs.existsSync(filePath)) return null;
        return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
    } catch {
        return null;
    }
};

const hasCanonicalDataAssets = (cwd: string): boolean => {
    const manifest = readJson<{ assets?: Array<{ kind?: string; valid?: boolean }> }>(
        path.join(cwd, "data", "manifest.json"),
    );
    const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
    const validKinds = new Set(assets.filter((asset) => asset.valid === true).map((asset) => asset.kind));
    return validKinds.has("tau") && validKinds.has("nontrivial_zeta_zeros") && validKinds.has("primes");
};

export const getDataAssetsStatus = (cwd = process.cwd()): DataAssetsStatus =>
    hasCanonicalDataAssets(cwd) ? "AVAILABLE" : "NEEDS_CHECK";

export const createResetCurrentState = (cwd = process.cwd()): CurrentReportingState => ({
    engine_status: "NO_CURRENT_RUN",
    reason: RESET_REASON,
    latest_run_id: null,
    current_experiments_path: null,
    current_certificate_path: null,
    certificate_status: "NOT_BUILT",
    data_assets_status: getDataAssetsStatus(cwd),
    historical_comparison_enabled: false,
    next_action: DEFAULT_NEXT_ACTION,
    note: HISTORICAL_COMPARISON_NOTE,
    schema_version: CURRENT_STATE_SCHEMA_VERSION,
});

export const getCurrentReportingState = (cwd = process.cwd()): CurrentReportingState => {
    const current = readJson<Partial<CurrentReportingState>>(publicCurrentPath(cwd));
    if (!current) return createResetCurrentState(cwd);
    const base: CurrentReportingState = {
        ...createResetCurrentState(cwd),
        ...current,
        latest_run_id: current.latest_run_id ?? null,
        current_experiments_path: current.current_experiments_path ?? null,
        current_certificate_path: current.current_certificate_path ?? null,
        historical_comparison_enabled: Boolean(current.historical_comparison_enabled),
        data_assets_status: current.data_assets_status ?? getDataAssetsStatus(cwd),
        next_action: current.next_action ?? DEFAULT_NEXT_ACTION,
        note: current.note ?? HISTORICAL_COMPARISON_NOTE,
        schema_version: current.schema_version ?? CURRENT_STATE_SCHEMA_VERSION,
    };
    if (!base.latest_run_id || base.engine_status === "NO_CURRENT_RUN") return base;

    const certPath = getRunArtifactPath(base.latest_run_id, "certificate", cwd);
    const cert = readJson<Record<string, unknown>>(certPath);
    const experimentsPath = base.current_experiments_path
        ? resolveRepoPath(base.current_experiments_path, cwd)
        : getRunArtifactPath(base.latest_run_id, "experiments", cwd);
    const expectedSourceHash = hashFile(experimentsPath);
    const certRunId = typeof cert?.run_id === "string" ? cert.run_id : null;
    const certSourceHash =
        typeof cert?.source_artifact_hash === "string" ? cert.source_artifact_hash : null;
    const certificateStatus: CurrentReportingState["certificate_status"] = !cert
        ? "MISSING_FOR_RUN"
        : certRunId !== base.latest_run_id
          ? "STALE"
          : expectedSourceHash && certSourceHash && expectedSourceHash !== certSourceHash
            ? "STALE"
            : "CURRENT";

    return {
        ...base,
        certificate_status: certificateStatus,
        current_certificate_path:
            certificateStatus === "CURRENT"
                ? base.current_certificate_path ?? repoRelativePath(certPath, cwd)
                : base.current_certificate_path,
    };
};

export const getRunArtifactPath = (runId: string, kind: ArtifactKind, cwd = process.cwd()) =>
    path.join(artifactRunsRoot(cwd), runId, artifactFileName[kind]);

const expectedSourcePathForKind = (runId: string, kind: ArtifactKind, cwd: string): string | null => {
    if (kind === "certificate") return getRunArtifactPath(runId, "experiments", cwd);
    if (kind === "analysis") return getRunArtifactPath(runId, "experiments", cwd);
    if (kind === "data_sufficiency" || kind === "research_plan") return getRunArtifactPath(runId, "experiments", cwd);
    return null;
};

export const getArtifactFreshness = (
    kind: ArtifactKind,
    options: { run_id?: string | null; path?: string | null; expected_source_hash?: string | null } = {},
    cwd = process.cwd(),
): ArtifactFreshnessPayload => {
    const current = getCurrentReportingState(cwd);
    const latestRunId = current.latest_run_id;
    const runId = options.run_id ?? latestRunId;

    if (!latestRunId || current.engine_status === "NO_CURRENT_RUN") {
        return {
            artifact_kind: kind,
            run_id: runId ?? null,
            latest_run_id: latestRunId,
            path: options.path ?? null,
            freshness: "RESET",
            reason: "No current run is registered; reset placeholders are expected.",
            source_artifact_hash: null,
            expected_source_artifact_hash: null,
        };
    }

    if (!runId) {
        return {
            artifact_kind: kind,
            run_id: null,
            latest_run_id: latestRunId,
            path: null,
            freshness: "MISSING_FOR_RUN",
            reason: "No run_id was provided for the current artifact check.",
            source_artifact_hash: null,
            expected_source_artifact_hash: null,
        };
    }

    const artifactPath = options.path ?? getRunArtifactPath(runId, kind, cwd);
    if (!fs.existsSync(artifactPath)) {
        return {
            artifact_kind: kind,
            run_id: runId,
            latest_run_id: latestRunId,
            path: artifactPath,
            freshness: "MISSING_FOR_RUN",
            reason: `Artifact ${artifactFileName[kind]} does not exist for ${latestRunId}.`,
            source_artifact_hash: null,
            expected_source_artifact_hash: null,
        };
    }

    const parsed = readJson<Record<string, unknown>>(artifactPath);
    const artifactRunId = typeof parsed?.run_id === "string" ? parsed.run_id : null;
    const sourceHash = typeof parsed?.source_artifact_hash === "string" ? parsed.source_artifact_hash : null;
    const expectedSourcePath = expectedSourcePathForKind(latestRunId, kind, cwd);
    const expectedSourceHash = options.expected_source_hash ?? (expectedSourcePath ? hashFile(expectedSourcePath) : null);

    if (artifactRunId !== latestRunId) {
        return {
            artifact_kind: kind,
            run_id: artifactRunId ?? runId,
            latest_run_id: latestRunId,
            path: artifactPath,
            freshness: "STALE",
            reason: `Artifact run_id ${artifactRunId ?? "(missing)"} does not match latest_run_id ${latestRunId}.`,
            source_artifact_hash: sourceHash,
            expected_source_artifact_hash: expectedSourceHash,
        };
    }

    if (expectedSourceHash && sourceHash && sourceHash !== expectedSourceHash) {
        return {
            artifact_kind: kind,
            run_id: artifactRunId,
            latest_run_id: latestRunId,
            path: artifactPath,
            freshness: "STALE",
            reason: "Artifact source_artifact_hash does not match the current source artifact.",
            source_artifact_hash: sourceHash,
            expected_source_artifact_hash: expectedSourceHash,
        };
    }

    return {
        artifact_kind: kind,
        run_id: artifactRunId,
        latest_run_id: latestRunId,
        path: artifactPath,
        freshness: "CURRENT",
        reason: "Artifact run_id matches the latest run and source hash is current or not required.",
        source_artifact_hash: sourceHash,
        expected_source_artifact_hash: expectedSourceHash,
    };
};

export const getPublicCertificateMirrorStatus = (cwd = process.cwd()): CertificateFreshnessStatus => {
    const current = getCurrentReportingState(cwd);
    if (!current.latest_run_id) return "NOT_BUILT";
    const mirror = readJson<Record<string, unknown>>(publicCertificatePath(cwd));
    if (!mirror) return "MISSING_FOR_RUN";
    if (mirror.mirrors_run_id !== current.latest_run_id) return "STALE";
    if (mirror.freshness === "STALE") return "STALE";
    return "CURRENT";
};

const latestRuntimeStatus = (runId: string, cwd: string) => {
    const statusPath = path.join(runtimeRunsRoot(cwd), `${runId}.status.json`);
    return readJson<{ status?: string; started_at?: string; finished_at?: string }>(statusPath);
};

export const getLatestRunPayload = (cwd = process.cwd()): LatestRunPayload => {
    const current = getCurrentReportingState(cwd);
    if (!current.latest_run_id || current.engine_status === "NO_CURRENT_RUN") {
        return {
            latest_real_run_id: null,
            status: "NO_CURRENT_RUN",
            started_at: null,
            finished_at: null,
            experiments_path: null,
            certificate_path: null,
            certificate_status: "NOT_BUILT",
            analysis_path: null,
            is_public_experiments_current: false,
            historical_comparison_enabled: false,
            next_action: current.next_action,
        };
    }

    const runId = current.latest_run_id;
    const runtime = latestRuntimeStatus(runId, cwd);
    const experimentsPath = current.current_experiments_path ?? getRunArtifactPath(runId, "experiments", cwd);
    const certificateFreshness = getArtifactFreshness("certificate", { run_id: runId }, cwd);
    const certificateStatus: CertificateFreshnessStatus =
        certificateFreshness.freshness === "CURRENT"
            ? "CURRENT"
            : certificateFreshness.freshness === "STALE"
              ? "STALE"
              : "MISSING_FOR_RUN";
    const analysisPath = getRunArtifactPath(runId, "analysis", cwd);
    const publicArtifact = readJson<Record<string, unknown>>(publicExperimentsPath(cwd));
    const publicRunId = typeof publicArtifact?.run_id === "string" ? publicArtifact.run_id : null;
    const publicExperimentsCurrent = publicRunId === runId;
    const inferredStatus =
        runtime?.status === "RUNNING" || runtime?.status === "QUEUED" || runtime?.status === "CANCELLING"
            ? "RUNNING"
            : runtime?.status === "FAILED" || runtime?.status === "CANCELLED"
              ? "FAILED"
              : fs.existsSync(experimentsPath)
                ? "SUCCEEDED"
                : "FAILED";

    return {
        latest_real_run_id: runId,
        status: inferredStatus,
        started_at: runtime?.started_at ?? null,
        finished_at: runtime?.finished_at ?? null,
        experiments_path: experimentsPath,
        certificate_path: certificateStatus === "CURRENT" ? current.current_certificate_path ?? getRunArtifactPath(runId, "certificate", cwd) : null,
        certificate_status: certificateStatus,
        analysis_path: fs.existsSync(analysisPath) ? analysisPath : null,
        is_public_experiments_current: publicExperimentsCurrent,
        historical_comparison_enabled: Boolean(current.historical_comparison_enabled),
        next_action: current.next_action,
    };
};

export const computeFidelityTier = (zeros: unknown, dps: unknown): ComputeFidelity => {
    const z = Number(zeros);
    const d = Number(dps);
    if (!Number.isFinite(z) || !Number.isFinite(d)) return "SMOKE";
    if (z < 500 || d < 35) return "SMOKE";
    if (z < 10000 || d < 50) return "STANDARD";
    return "AUTHORITATIVE";
};

const getDeclaredDecimals = (artifact: ExperimentsData | undefined): number | null => {
    const selected = artifact?.meta?.selected_data_sources as
        | { zero?: { asset?: { stored_dps?: unknown } } }
        | undefined;
    const selectedDps = Number(selected?.zero?.asset?.stored_dps);
    if (Number.isFinite(selectedDps)) return selectedDps;
    const raw = artifact?.meta?.zero_source_info?.declared_decimals;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
};

const isGeneratedZeroSource = (info: Record<string, unknown> | undefined): boolean => {
    const sourceKind = String(info?.source_kind ?? "");
    const sourcePath = String(info?.source_path ?? "");
    return sourceKind.includes("generated") || sourcePath.includes("zeros.generated");
};

const isAcceptedGenerated60kBaseline = (artifact: ExperimentsData | undefined): boolean => {
    const meta = artifact?.meta;
    if (!meta) return false;
    const info = meta.zero_source_info as Record<string, unknown> | undefined;
    const requested = Number(info?.requested_count ?? meta.zeros);
    const loaded = Number(info?.loaded_count ?? meta.zeros);
    const declared = Number(info?.declared_decimals);
    return (
        Number(meta.dps) === 80 &&
        requested === 60_000 &&
        loaded >= 60_000 &&
        info?.valid !== false &&
        isGeneratedZeroSource(info) &&
        Number.isFinite(declared) &&
        declared >= 75
    );
};

export const buildFidelityReport = (
    artifact: ExperimentsData | undefined,
    options: { experiments?: string[] | string; data_sufficiency?: DataPlannerOutput } = {},
): FidelityReport => {
    const requestedDps = Number(artifact?.meta?.dps);
    const requestedZeroCount = Number(artifact?.meta?.zeros);
    const dps = Number.isFinite(requestedDps) && requestedDps > 0 ? requestedDps : null;
    const zeroCount = Number.isFinite(requestedZeroCount) && requestedZeroCount > 0 ? requestedZeroCount : null;
    const compute = computeFidelityTier(zeroCount, dps);
    const warnings: string[] = [];
    const guard = 20;
    const requiredStoredDps = dps === null ? null : dps + guard;
    const declaredDecimals = getDeclaredDecimals(artifact);
    const acceptedGenerated60kBaseline = isAcceptedGenerated60kBaseline(artifact);

    let dataFidelity: DataFidelity = "READY_WITH_WARNINGS";
    let certificateFidelity: CertificateFidelity = "ELIGIBLE_WITH_WARNINGS";

    let dataSufficiency: DataPlannerOutput | undefined = options.data_sufficiency;
    if (dps !== null && zeroCount !== null) {
        dataSufficiency ??= checkDataSufficiency({
            experiments: options.experiments ?? ["EXP_1", "EXP_6", "EXP_8"],
            requested_dps: dps,
            requested_zero_count: zeroCount,
            guard_dps: guard,
        });
        if (dataSufficiency.status === "READY") {
            dataFidelity = "READY";
            certificateFidelity = "ELIGIBLE";
        } else if (dataSufficiency.status === "INSUFFICIENT" || dataSufficiency.status === "BLOCKED") {
            dataFidelity = "INSUFFICIENT";
            certificateFidelity = "BLOCKED";
        } else {
            dataFidelity = "READY_WITH_WARNINGS";
            certificateFidelity = "ELIGIBLE_WITH_WARNINGS";
        }
        warnings.push(...dataSufficiency.warnings);
    }

    if (declaredDecimals !== null && dps !== null) {
        if (declaredDecimals < dps) {
            if (acceptedGenerated60kBaseline && dataSufficiency?.status === "READY") {
                warnings.push(
                    "Generated 60K zero source is accepted for this baseline run but remains below dps+guard certificate preference.",
                );
                if (dataFidelity === "READY") dataFidelity = "READY_WITH_WARNINGS";
                if (certificateFidelity === "ELIGIBLE") certificateFidelity = "ELIGIBLE_WITH_WARNINGS";
            } else {
                warnings.push("Data fidelity warning: zero source precision below certificate policy.");
                dataFidelity = "INSUFFICIENT";
                certificateFidelity = "BLOCKED";
            }
        } else if (requiredStoredDps !== null && declaredDecimals < requiredStoredDps) {
            warnings.push("Zero source precision meets compute dps but not requested dps plus guard precision.");
            if (dataFidelity === "READY") dataFidelity = "READY_WITH_WARNINGS";
            if (certificateFidelity === "ELIGIBLE") certificateFidelity = "ELIGIBLE_WITH_WARNINGS";
        }
    }

    if (declaredDecimals === null && dps !== null) {
        warnings.push("Zero source precision was not declared; certificate fidelity is warning-gated.");
        if (dataFidelity === "READY") dataFidelity = "READY_WITH_WARNINGS";
        if (certificateFidelity === "ELIGIBLE") certificateFidelity = "ELIGIBLE_WITH_WARNINGS";
    }

    return {
        compute_fidelity: compute,
        data_fidelity: dataFidelity,
        certificate_fidelity: certificateFidelity,
        warnings: Array.from(new Set(warnings)),
        requested_dps: dps,
        requested_zero_count: zeroCount,
        zero_source_declared_decimals: declaredDecimals,
        required_stored_dps: requiredStoredDps,
        data_sufficiency: dataSufficiency,
    };
};

export const classifyScopedStatus = (verdict: Pick<ExperimentVerdict, "function" | "program" | "status" | "outcome">): string => {
    const status = String(verdict.status ?? "").toUpperCase();
    const outcome = String(verdict.outcome ?? "").toUpperCase();
    if (verdict.program === "PROGRAM_2") {
        if (status === "SKIP" || !status) return "ROUTE_NOT_RUN";
        if (status === "FAIL" || outcome === "INCONSISTENT" || outcome === "IMPLEMENTATION_BROKEN") return "ROUTE_NEGATIVE";
        if (status === "PASS" || outcome === "CONSISTENT" || outcome === "IMPLEMENTATION_OK") return "ROUTE_PASS";
        return "ROUTE_MIXED";
    }
    if (verdict.function === "CONTROL") {
        if (status === "PASS" || outcome === "IMPLEMENTATION_OK") return "CONTROL_ARMED";
        if (status === "FAIL" || outcome === "IMPLEMENTATION_BROKEN") return "CONTROL_BROKEN";
        return "CONTROL_NOT_RUN";
    }
    if (verdict.function === "PATHFINDER") {
        if (status === "PASS" || status === "FAIL" || outcome === "DIRECTIONAL" || outcome === "INFORMATIONAL") return "PATHFINDER_RESULT";
        return "PATHFINDER_INCONCLUSIVE";
    }
    if (verdict.function === "PROOF_OBLIGATION_WITNESS" || verdict.function === "COHERENCE_WITNESS") {
        if (status === "PASS" || outcome === "CONSISTENT") return "WITNESS_PASS";
        if (status === "FAIL" || outcome === "INCONSISTENT") return "WITNESS_FAIL";
        return "WITNESS_INCONCLUSIVE";
    }
    return status || "NOT_WITNESSED";
};

const sameRecordValue = (a: unknown, b: unknown) => stableJson(a ?? {}) === stableJson(b ?? {});

export const classifyHistoricalComparison = (
    a: Partial<VerdictHistoryEntry> | null | undefined,
    b: Partial<VerdictHistoryEntry> | null | undefined,
): DriftClassification => {
    if (!a || !b) {
        return {
            comparison_type: "INCOMPARABLE",
            same_code: false,
            same_data: false,
            same_config: false,
            same_schema: false,
            same_verifier: false,
            interpretation: "Missing comparison records; do not interpret as controlled regression.",
        };
    }

    const sameCode = sameRecordValue(a.code_fingerprint, b.code_fingerprint);
    const sameData = sameRecordValue(a.zero_source_info, b.zero_source_info);
    const sameSchema = a.schema_version === b.schema_version;
    const sameConfig = sameData;
    const verifierA = (a.code_fingerprint as Record<string, string> | undefined)?.["verifier.py"];
    const verifierB = (b.code_fingerprint as Record<string, string> | undefined)?.["verifier.py"];
    const sameVerifier = Boolean(verifierA && verifierB && verifierA === verifierB);
    const controlled = sameCode && sameData && sameConfig && sameSchema && sameVerifier;

    return {
        comparison_type: controlled ? "CONTROLLED_REGRESSION" : "EXPECTED_IMPLEMENTATION_DRIFT",
        same_code: sameCode,
        same_data: sameData,
        same_config: sameConfig,
        same_schema: sameSchema,
        same_verifier: sameVerifier,
        interpretation: controlled
            ? "Controlled regression comparison: code, data, config, schema, and verifier match."
            : "Expected implementation drift. Do not interpret as controlled regression.",
    };
};

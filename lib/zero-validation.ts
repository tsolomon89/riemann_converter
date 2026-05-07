import fs from "fs";
import path from "path";
import zlib from "zlib";
import type { DataAsset } from "./data-assets";

export const DEFAULT_ZERO_REFERENCE_TOLERANCE = "5e-9";
const OVERKILL_VALIDATION_COUNT = 60_000;
const OVERKILL_REQUIRED_STORED_DPS = 100;

export interface ZeroValidationArtifact {
    asset_id?: string;
    reference_asset_id?: string | null;
    asset_path?: string;
    generated_asset_path?: string | null;
    reference_asset_path?: string;
    asset_hash?: unknown;
    reference_asset_hash?: unknown;
    validated_count: number;
    reference_declared_decimals?: number | null;
    generated_stored_dps?: number | null;
    tolerance: string;
    max_deviation: string | null;
    p95_deviation: string | null;
    failed_indices: number[];
    failed_details?: Array<{
        index: number;
        generated_value: string;
        reference_value: string;
        deviation: string;
        tolerance: string;
    }>;
    status: "PASS" | "FAIL" | "NOT_AVAILABLE";
    valid_for_overkill?: boolean;
    valid_for_authoritative: boolean;
    validation_limit?: number | null;
    created_at?: string;
    reason?: string | null;
    path?: string;
}

const repoPath = (candidate?: string | null) => {
    if (!candidate) return null;
    return path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate);
};

const repoRelative = (candidate: string) => {
    try {
        return path.relative(process.cwd(), candidate).replace(/\\/g, "/");
    } catch {
        return candidate.replace(/\\/g, "/");
    }
};

const assetPath = (asset?: DataAsset | Partial<DataAsset> | null) =>
    repoPath(typeof asset?.source_path === "string" ? asset.source_path : null);

const validationPath = (asset: DataAsset | Partial<DataAsset>) => {
    const source = assetPath(asset);
    if (!source) {
        return path.join(
            process.cwd(),
            "data",
            "zeros",
            "nontrivial",
            `${String(asset.asset_id ?? "unknown_zero_asset")}.validation.json`,
        );
    }
    const base = source.replace(/(\.jsonl|\.txt|\.gz)+$/i, "");
    return `${base}.validation.json`;
};

const readFileText = (filePath: string) => {
    const raw = fs.readFileSync(filePath);
    return filePath.endsWith(".gz") ? zlib.gunzipSync(raw).toString("utf8") : raw.toString("utf8");
};

const numericToken = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return null;
    const token = trimmed.split(/\s+/).pop()?.replace(/^["']|["']$/g, "");
    if (!token) return null;
    return Number.isFinite(Number(token)) ? token : null;
};

const zeroTokens = (filePath: string, maxCount?: number | null) => {
    const out: Array<{ token: string; value: number }> = [];
    for (const line of readFileText(filePath).split(/\r?\n/)) {
        if (maxCount !== undefined && maxCount !== null && out.length >= maxCount) break;
        const token = numericToken(line);
        if (token !== null) out.push({ token, value: Number(token) });
    }
    return out;
};

export const referenceDeclaredDecimals = (referenceAsset?: DataAsset | Partial<DataAsset> | null) => {
    for (const key of ["stored_dps", "usable_dps", "declared_decimals"] as const) {
        const parsed = Number(referenceAsset?.[key]);
        if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed);
    }
    return null;
};

export const toleranceForReferenceAsset = (referenceAsset?: DataAsset | Partial<DataAsset> | null) => {
    const declared = referenceDeclaredDecimals(referenceAsset);
    return declared ? `5e-${declared}` : DEFAULT_ZERO_REFERENCE_TOLERANCE;
};

const percentile = (values: number[], pct: number) => {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0];
    const rank = ((values.length - 1) * pct) / 100;
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    if (lower === upper) return values[lower];
    const fraction = rank - lower;
    return values[lower] + (values[upper] - values[lower]) * fraction;
};

const writeValidation = (asset: DataAsset | Partial<DataAsset>, payload: ZeroValidationArtifact) => {
    const outPath = validationPath(asset);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
    return { ...payload, path: repoRelative(outPath) };
};

const notAvailable = (
    asset: DataAsset | Partial<DataAsset>,
    referenceAsset: DataAsset | Partial<DataAsset> | null | undefined,
    tolerance: string,
    reason: string,
    maxCount?: number | null,
): ZeroValidationArtifact =>
    writeValidation(asset, {
        asset_id: asset.asset_id,
        generated_asset_path: assetPath(asset) ? repoRelative(assetPath(asset) as string) : null,
        reference_asset_id: referenceAsset?.asset_id ?? null,
        reference_asset_path: assetPath(referenceAsset) ? repoRelative(assetPath(referenceAsset) as string) : undefined,
        validated_count: 0,
        reference_declared_decimals: referenceDeclaredDecimals(referenceAsset),
        generated_stored_dps: typeof asset.stored_dps === "number" ? asset.stored_dps : null,
        tolerance,
        max_deviation: null,
        p95_deviation: null,
        failed_indices: [],
        failed_details: [],
        status: "NOT_AVAILABLE",
        valid_for_overkill: false,
        valid_for_authoritative: false,
        validation_limit: maxCount ?? null,
        created_at: new Date().toISOString(),
        reason,
    });

const readJson = <T>(filePath: string): T | null => {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
    } catch {
        return null;
    }
};

const cachedIsCurrent = (
    cached: ZeroValidationArtifact | null,
    asset: DataAsset | Partial<DataAsset>,
    referenceAsset: DataAsset | Partial<DataAsset>,
    tolerance: string,
    maxCount?: number | null,
) => {
    if (!cached) return false;
    if (maxCount !== undefined && maxCount !== null && Number(cached.validation_limit ?? 0) !== maxCount) return false;
    return cached.asset_id === asset.asset_id &&
    cached.reference_asset_id === referenceAsset.asset_id &&
    cached.tolerance === tolerance &&
    cached.asset_hash === asset.hash &&
    cached.reference_asset_hash === referenceAsset.hash &&
    (cached.status === "PASS" || cached.status === "FAIL");
};

export const validateZeroAssetAgainstReference = (
    asset: DataAsset | Partial<DataAsset>,
    referenceAsset: DataAsset | Partial<DataAsset> | null | undefined,
    tolerance = DEFAULT_ZERO_REFERENCE_TOLERANCE,
    maxCount?: number | null,
): ZeroValidationArtifact => {
    const source = assetPath(asset);
    if (!source || !fs.existsSync(source)) {
        return notAvailable(asset, referenceAsset, tolerance, "asset file is unavailable", maxCount);
    }
    const reference = assetPath(referenceAsset);
    if (!referenceAsset || !reference || !fs.existsSync(reference)) {
        return notAvailable(asset, referenceAsset, tolerance, "reference zero asset is unavailable", maxCount);
    }

    const outPath = validationPath(asset);
    const cached = readJson<ZeroValidationArtifact>(outPath);
    if (cachedIsCurrent(cached, asset, referenceAsset, tolerance, maxCount) && cached) {
        return { ...cached, path: repoRelative(outPath) };
    }

    const assetZeros = zeroTokens(source, maxCount);
    const referenceZeros = zeroTokens(reference, maxCount);
    const count = Math.min(assetZeros.length, referenceZeros.length);
    if (count <= 0) {
        return notAvailable(asset, referenceAsset, tolerance, "no overlapping zero indices", maxCount);
    }

    const tol = Number(tolerance);
    const deviations: number[] = [];
    const failed: number[] = [];
    const failedDetails: NonNullable<ZeroValidationArtifact["failed_details"]> = [];
    let maxDeviation = 0;
    for (let idx = 0; idx < count; idx += 1) {
        const deviation = Math.abs(assetZeros[idx].value - referenceZeros[idx].value);
        deviations.push(deviation);
        if (deviation > maxDeviation) maxDeviation = deviation;
        if (deviation > tol) {
            failed.push(idx + 1);
            if (failedDetails.length < 20) {
                failedDetails.push({
                    index: idx + 1,
                    generated_value: assetZeros[idx].token,
                    reference_value: referenceZeros[idx].token,
                    deviation: String(deviation),
                    tolerance,
                });
            }
        }
    }
    deviations.sort((a, b) => a - b);
    const status = failed.length === 0 ? "PASS" : "FAIL";
    const generatedStoredDps = Number(asset.stored_dps ?? 0);
    return writeValidation(asset, {
        asset_id: asset.asset_id,
        reference_asset_id: referenceAsset.asset_id,
        asset_path: repoRelative(source),
        generated_asset_path: repoRelative(source),
        reference_asset_path: repoRelative(reference),
        asset_hash: asset.hash,
        reference_asset_hash: referenceAsset.hash,
        validated_count: count,
        reference_declared_decimals: referenceDeclaredDecimals(referenceAsset),
        generated_stored_dps: Number.isFinite(generatedStoredDps) ? generatedStoredDps : null,
        tolerance,
        max_deviation: String(maxDeviation),
        p95_deviation: String(percentile(deviations, 95)),
        failed_indices: failed,
        failed_details: failedDetails,
        status,
        valid_for_overkill:
            status === "PASS" &&
            count >= OVERKILL_VALIDATION_COUNT &&
            Number.isFinite(generatedStoredDps) &&
            generatedStoredDps >= OVERKILL_REQUIRED_STORED_DPS,
        valid_for_authoritative: status === "PASS",
        validation_limit: maxCount ?? null,
        created_at: new Date().toISOString(),
        reason: status === "PASS" ? null : `${failed.length} zero ordinates exceeded tolerance`,
    });
};

export const readZeroValidationArtifacts = (): ZeroValidationArtifact[] => {
    const dir = path.join(process.cwd(), "data", "zeros", "nontrivial");
    if (!fs.existsSync(dir)) return [];
    const artifacts: ZeroValidationArtifact[] = [];
    for (const name of fs.readdirSync(dir).filter((item) => item.endsWith(".validation.json")).sort()) {
        const filePath = path.join(dir, name);
        const parsed = readJson<ZeroValidationArtifact>(filePath);
        if (parsed) artifacts.push({ ...parsed, path: repoRelative(filePath) });
    }
    return artifacts;
};

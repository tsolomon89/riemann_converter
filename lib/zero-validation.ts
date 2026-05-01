import fs from "fs";
import path from "path";
import zlib from "zlib";
import type { DataAsset } from "./data-assets";

export const DEFAULT_ZERO_REFERENCE_TOLERANCE = "3e-9";

export interface ZeroValidationArtifact {
    asset_id?: string;
    reference_asset_id?: string | null;
    asset_path?: string;
    reference_asset_path?: string;
    asset_hash?: unknown;
    reference_asset_hash?: unknown;
    validated_count: number;
    tolerance: string;
    max_deviation: string | null;
    p95_deviation: string | null;
    failed_indices: number[];
    status: "PASS" | "FAIL" | "NOT_AVAILABLE";
    valid_for_authoritative: boolean;
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

const zeroValues = (filePath: string) =>
    readFileText(filePath)
        .split(/\r?\n/)
        .map(numericToken)
        .filter((token): token is string => token !== null)
        .map((token) => Number(token));

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
): ZeroValidationArtifact =>
    writeValidation(asset, {
        asset_id: asset.asset_id,
        reference_asset_id: referenceAsset?.asset_id ?? null,
        validated_count: 0,
        tolerance,
        max_deviation: null,
        p95_deviation: null,
        failed_indices: [],
        status: "NOT_AVAILABLE",
        valid_for_authoritative: false,
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
) => {
    if (!cached) return false;
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
): ZeroValidationArtifact => {
    const source = assetPath(asset);
    if (!source || !fs.existsSync(source)) {
        return notAvailable(asset, referenceAsset, tolerance, "asset file is unavailable");
    }
    const reference = assetPath(referenceAsset);
    if (!referenceAsset || !reference || !fs.existsSync(reference)) {
        return notAvailable(asset, referenceAsset, tolerance, "reference zero asset is unavailable");
    }

    const outPath = validationPath(asset);
    const cached = readJson<ZeroValidationArtifact>(outPath);
    if (cachedIsCurrent(cached, asset, referenceAsset, tolerance) && cached) {
        return { ...cached, path: repoRelative(outPath) };
    }

    const assetZeros = zeroValues(source);
    const referenceZeros = zeroValues(reference);
    const count = Math.min(assetZeros.length, referenceZeros.length);
    if (count <= 0) {
        return notAvailable(asset, referenceAsset, tolerance, "no overlapping zero indices");
    }

    const tol = Number(tolerance);
    const deviations: number[] = [];
    const failed: number[] = [];
    let maxDeviation = 0;
    for (let idx = 0; idx < count; idx += 1) {
        const deviation = Math.abs(assetZeros[idx] - referenceZeros[idx]);
        deviations.push(deviation);
        if (deviation > maxDeviation) maxDeviation = deviation;
        if (deviation > tol) failed.push(idx + 1);
    }
    deviations.sort((a, b) => a - b);
    const status = failed.length === 0 ? "PASS" : "FAIL";
    return writeValidation(asset, {
        asset_id: asset.asset_id,
        reference_asset_id: referenceAsset.asset_id,
        asset_path: repoRelative(source),
        reference_asset_path: repoRelative(reference),
        asset_hash: asset.hash,
        reference_asset_hash: referenceAsset.hash,
        validated_count: count,
        tolerance,
        max_deviation: String(maxDeviation),
        p95_deviation: String(percentile(deviations, 95)),
        failed_indices: failed,
        status,
        valid_for_authoritative: status === "PASS",
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

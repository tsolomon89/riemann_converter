import fs from "fs";
import path from "path";

export interface DataAsset {
    asset_id?: string;
    kind?: "tau" | "nontrivial_zeta_zeros" | "trivial_zeta_zeros" | "primes" | string;
    role?: string;
    source_path?: string | null;
    generator?: string;
    count?: number | null;
    max_prime?: number | null;
    max_value?: number | string | null;
    stored_dps?: number | null;
    usable_dps?: number | null;
    guard_dps?: number | null;
    strictly_increasing?: boolean | null;
    hash?: string | null;
    created_at?: string;
    valid?: boolean;
    warnings?: string[];
    errors?: string[];
    [key: string]: unknown;
}

export interface DataManifest {
    schema_version?: string;
    project?: string;
    created_at?: string;
    updated_at?: string;
    canonical_root?: string;
    agent_context_is_canonical?: boolean;
    assets?: DataAsset[];
}

export interface DataMigrationReport {
    status: "NOT_RUN" | "COMPLETE" | "PARTIAL" | "FAILED" | string;
    migrated_assets: DataAsset[];
    deprecated_sources: Array<Record<string, unknown>>;
    warnings: string[];
    errors: string[];
    next_action: string | null;
}

const manifestPath = () => path.join(process.cwd(), "data", "manifest.json");
const migrationReportPath = () => path.join(process.cwd(), "public", "data_migration_report.json");

const formulaicTrivialZeroAsset = (): DataAsset => ({
    asset_id: "trivial_zeta_zeros_formula",
    kind: "trivial_zeta_zeros",
    source_path: null,
    generator: "formula",
    formula: "s = -2n",
    count: null,
    max_value: null,
    stored_dps: null,
    usable_dps: null,
    guard_dps: null,
    strictly_increasing: null,
    hash: null,
    valid: true,
    warnings: [],
    errors: [],
});

const readJson = <T>(filePath: string): T | null => {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
    } catch {
        return null;
    }
};

export const readDataManifest = (): DataManifest => {
    const manifest = readJson<DataManifest>(manifestPath()) ?? {
        schema_version: "2026.05.data-assets.v1",
        project: "riemann_converter",
        canonical_root: "data",
        agent_context_is_canonical: false,
        assets: [],
    };
    const assets = Array.isArray(manifest.assets) ? [...manifest.assets] : [];
    if (!assets.some((asset) => asset.kind === "trivial_zeta_zeros")) {
        assets.push(formulaicTrivialZeroAsset());
    }
    return {
        ...manifest,
        canonical_root: manifest.canonical_root ?? "data",
        agent_context_is_canonical: false,
        assets,
    };
};

export const readDataMigrationReport = (): DataMigrationReport => (
    readJson<DataMigrationReport>(migrationReportPath()) ?? {
        status: "NOT_RUN",
        migrated_assets: [],
        deprecated_sources: [],
        warnings: [],
        errors: [],
        next_action: "run_data_migration",
    }
);

export const summarizeDataAssets = (assets: DataAsset[]) => {
    const byKind: Record<string, number> = {};
    for (const asset of assets) {
        const kind = asset.kind ?? "unknown";
        byKind[kind] = (byKind[kind] ?? 0) + 1;
    }
    return {
        asset_count: assets.length,
        by_kind: byKind,
        agent_context_is_canonical: false,
    };
};

export const getDataAssets = () => {
    const manifest = readDataManifest();
    const assets = manifest.assets ?? [];
    const warnings: string[] = [];
    if (assets.some((asset) => String(asset.source_path ?? "").startsWith("agent_context/"))) {
        warnings.push("Registry contains deprecated agent_context paths; canonical runtime assets belong under data/.");
    }
    return {
        summary: summarizeDataAssets(assets),
        manifest,
        warnings,
    };
};

export const validAssetsByKind = (kind: string, manifest = readDataManifest()) =>
    (manifest.assets ?? []).filter((asset) => asset.kind === kind && asset.valid === true);

export const bestAssetByCountDps = (assets: DataAsset[]) =>
    [...assets].sort((a, b) => {
        const aScore = Number(a.count ?? 0) * 100000 + Number(a.stored_dps ?? 0);
        const bScore = Number(b.count ?? 0) * 100000 + Number(b.stored_dps ?? 0);
        return bScore - aScore;
    })[0];

export const bestPrimeAsset = (assets: DataAsset[]) =>
    [...assets].sort((a, b) => {
        const aScore =
            (a.role === "canonical_static_asset" ? 10 ** 12 : 0) +
            Number(a.count ?? 0) * 1000 +
            Number(a.max_prime ?? a.max_value ?? 0);
        const bScore =
            (b.role === "canonical_static_asset" ? 10 ** 12 : 0) +
            Number(b.count ?? 0) * 1000 +
            Number(b.max_prime ?? b.max_value ?? 0);
        return bScore - aScore;
    })[0];

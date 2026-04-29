import {
    bestAssetByCountDps,
    bestPrimeAsset,
    readDataManifest,
    validAssetsByKind,
    type DataAsset,
} from "./data-assets";
import { requirementsForExperiments, type RunRequirementInput, type RequiredAsset } from "./experiment-requirements";

export interface DataPlannerInput extends RunRequirementInput {
    mode?: string;
    experiments?: string[] | string;
    prime_policy?: { prefer_static_asset?: boolean };
}

export interface DataPlannerOutput {
    status: "READY" | "NEEDS_GENERATION" | "INSUFFICIENT" | "BLOCKED";
    mode: string;
    required_assets: RequiredAsset[];
    available_assets: Array<{ required: RequiredAsset; available: Partial<DataAsset> | null }>;
    missing_assets: Array<Record<string, unknown>>;
    insufficient_assets: Array<Record<string, unknown>>;
    generation_plan: Array<{ action: string; command: string }>;
    warnings: string[];
    errors: string[];
    next_action: string | null;
    requirements: ReturnType<typeof requirementsForExperiments>;
}

const assetRef = (asset: DataAsset | undefined): Partial<DataAsset> | null => {
    if (!asset) return null;
    const keys: Array<keyof DataAsset> = [
        "asset_id",
        "kind",
        "role",
        "source_path",
        "count",
        "max_prime",
        "max_value",
        "stored_dps",
        "usable_dps",
        "guard_dps",
        "strictly_increasing",
        "valid",
        "warnings",
        "errors",
    ];
    return Object.fromEntries(keys.filter((key) => key in asset).map((key) => [key, asset[key]])) as Partial<DataAsset>;
};

const overallStatus = (
    missing: Array<Record<string, unknown>>,
    insufficient: Array<Record<string, unknown>>,
): DataPlannerOutput["status"] => {
    if (insufficient.some((item) => item.status === "INVALID" || item.status === "BLOCKED")) return "BLOCKED";
    if (insufficient.some((item) => item.reason === "INSUFFICIENT_PRECISION")) return "INSUFFICIENT";
    if (missing.length > 0 || insufficient.length > 0) return "NEEDS_GENERATION";
    return "READY";
};

export const checkDataSufficiency = (input: DataPlannerInput = {}): DataPlannerOutput => {
    const experimentsRaw = input.experiments ?? ["EXP_1", "EXP_6", "EXP_8"];
    const experiments = Array.isArray(experimentsRaw)
        ? experimentsRaw
        : experimentsRaw.split(",").map((item) => item.trim()).filter(Boolean);
    const requirements = requirementsForExperiments(experiments, {
        ...input,
        requested_dps: Number(input.requested_dps ?? input.dps ?? 80),
        requested_zero_count: Number(input.requested_zero_count ?? input.zeros ?? input.zero_count ?? 100000),
        guard_dps: Number(input.guard_dps ?? 20),
    });
    const manifest = readDataManifest();
    const available_assets: DataPlannerOutput["available_assets"] = [];
    const missing_assets: DataPlannerOutput["missing_assets"] = [];
    const insufficient_assets: DataPlannerOutput["insufficient_assets"] = [];
    const generation_plan: DataPlannerOutput["generation_plan"] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    for (const required of requirements.required_assets) {
        if (required.kind === "tau") {
            const best = bestAssetByCountDps(validAssetsByKind("tau", manifest));
            available_assets.push({ required, available: assetRef(best) });
            if (!best) {
                missing_assets.push({ kind: "tau", required });
                generation_plan.push({
                    action: "generate_tau",
                    command: `python -m proof_kernel.generate_tau --stored-dps ${required.stored_dps}`,
                });
            } else if (Number(best.stored_dps ?? 0) < Number(required.stored_dps ?? 0)) {
                insufficient_assets.push({ kind: "tau", reason: "INSUFFICIENT_PRECISION", status: "INSUFFICIENT_PRECISION", required, available: assetRef(best) });
                generation_plan.push({
                    action: "generate_tau",
                    command: `python -m proof_kernel.generate_tau --stored-dps ${required.stored_dps}`,
                });
            }
            continue;
        }

        if (required.kind === "nontrivial_zeta_zeros") {
            const best = bestAssetByCountDps(validAssetsByKind("nontrivial_zeta_zeros", manifest));
            available_assets.push({ required, available: assetRef(best) });
            if (!best) {
                missing_assets.push({ kind: "nontrivial_zeta_zeros", required });
                generation_plan.push({
                    action: "generate_nontrivial_zeros",
                    command: `python -m proof_kernel.generate_zeros --count ${required.count} --stored-dps ${required.stored_dps}`,
                });
            } else {
                if (Number(best.count ?? 0) < Number(required.count ?? 0)) {
                    insufficient_assets.push({ kind: "nontrivial_zeta_zeros", reason: "INSUFFICIENT_COUNT", status: "NEEDS_EXTENSION", required, available: assetRef(best) });
                    generation_plan.push({
                        action: "generate_nontrivial_zeros",
                        command: `python -m proof_kernel.generate_zeros --count ${required.count} --stored-dps ${required.stored_dps}`,
                    });
                }
                if (Number(best.stored_dps ?? 0) < Number(required.stored_dps ?? 0)) {
                    insufficient_assets.push({ kind: "nontrivial_zeta_zeros", reason: "INSUFFICIENT_PRECISION", status: "INSUFFICIENT_PRECISION", required, available: assetRef(best) });
                    generation_plan.push({
                        action: "generate_nontrivial_zeros",
                        command: `python -m proof_kernel.generate_zeros --count ${required.count} --stored-dps ${required.stored_dps}`,
                    });
                }
            }
            continue;
        }

        if (required.kind === "trivial_zeta_zeros") {
            const best = bestAssetByCountDps(validAssetsByKind("trivial_zeta_zeros", manifest));
            available_assets.push({ required, available: assetRef(best) });
            if (!best) {
                missing_assets.push({ kind: "trivial_zeta_zeros", required });
                errors.push("Trivial zero formula asset is missing from data/manifest.json.");
            }
            continue;
        }

        if (required.kind === "primes") {
            const best = bestPrimeAsset(validAssetsByKind("primes", manifest));
            available_assets.push({ required, available: assetRef(best) });
            if (!best) {
                missing_assets.push({ kind: "primes", required });
                generation_plan.push({
                    action: "generate_primes_fallback",
                    command: `python -m proof_kernel.generate_primes --required-count ${required.count ?? 0} --required-max-prime ${required.max_prime ?? 2}`,
                });
            } else if (
                Number(best.count ?? 0) < Number(required.count ?? 0) ||
                Number(best.max_prime ?? best.max_value ?? 0) < Number(required.max_prime ?? 0)
            ) {
                insufficient_assets.push({ kind: "primes", reason: "INSUFFICIENT_COVERAGE", status: "INSUFFICIENT_COVERAGE", required, available: assetRef(best) });
                generation_plan.push({
                    action: "generate_primes_fallback",
                    command: `python -m proof_kernel.generate_primes --required-count ${required.count ?? 0} --required-max-prime ${required.max_prime ?? 2}`,
                });
            }
        }
    }

    const dedupedPlan = generation_plan.filter((step, index, arr) =>
        arr.findIndex((candidate) => candidate.action === step.action && candidate.command === step.command) === index
    );
    const status = overallStatus(missing_assets, insufficient_assets);

    return {
        status,
        mode: input.mode ?? "same_object_certificate",
        required_assets: requirements.required_assets,
        available_assets,
        missing_assets,
        insufficient_assets,
        generation_plan: dedupedPlan,
        warnings,
        errors,
        next_action: dedupedPlan[0]?.action ?? (status === "READY" ? "run_next_research_step" : null),
        requirements,
    };
};

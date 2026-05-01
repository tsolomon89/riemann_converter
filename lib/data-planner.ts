import {
    bestPrimeAsset,
    readDataManifest,
    validAssetsByKind,
    type DataAsset,
} from "./data-assets";
import { requirementsForExperiments, type RunRequirementInput, type RequiredAsset } from "./experiment-requirements";
import { isRunPreset, resolveRunPreset, type RunPresetContract } from "./run-presets";
import {
    DEFAULT_ZERO_REFERENCE_TOLERANCE,
    readZeroValidationArtifacts,
    validateZeroAssetAgainstReference,
    type ZeroValidationArtifact,
} from "./zero-validation";

export interface DataPlannerInput extends RunRequirementInput {
    mode?: string;
    preset?: string;
    experiments?: string[] | string;
    prime_policy?: Partial<RunPresetContract["prime_policy"]> & { prefer_static_asset?: boolean };
    zero_policy?: Partial<RunPresetContract["zero_policy"]>;
    tau_policy?: Partial<RunPresetContract["tau_policy"]>;
    certificate_policy?: Partial<RunPresetContract["certificate_policy"]>;
}

export interface DataPlannerOutput {
    status: "READY" | "NEEDS_GENERATION" | "INSUFFICIENT" | "BLOCKED";
    mode: string;
    preset?: string | null;
    run_contract?: RunPresetContract | null;
    required_assets: RequiredAsset[];
    selected_assets?: Record<string, {
        asset: Partial<DataAsset> | null;
        reason: string;
        reference_asset?: Partial<DataAsset> | null;
        validation?: ZeroValidationArtifact | null;
        policy?: unknown;
    }>;
    available_assets: Array<{ required: RequiredAsset; available: Partial<DataAsset> | null }>;
    missing_assets: Array<Record<string, unknown>>;
    insufficient_assets: Array<Record<string, unknown>>;
    generation_plan: Array<{ action: string; command: string }>;
    warnings: string[];
    errors: string[];
    next_action: string | null;
    requirements: ReturnType<typeof requirementsForExperiments>;
    policies?: Record<string, unknown>;
}

const assetRef = (asset: DataAsset | undefined): Partial<DataAsset> | null => {
    if (!asset) return null;
    const keys: Array<keyof DataAsset> = [
        "asset_id",
        "kind",
        "role",
        "source_path",
        "source_original_path",
        "generator",
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

const bestAssetForRequirement = (
    assets: DataAsset[],
    required: RequiredAsset,
): DataAsset | undefined =>
    [...assets].sort((a, b) => {
        const requiredCount = Number(required.count ?? 0);
        const requiredDps = Number(required.stored_dps ?? 0);
        const aDps = Number(a.stored_dps ?? 0);
        const bDps = Number(b.stored_dps ?? 0);
        const aCount = Number(a.count ?? 0);
        const bCount = Number(b.count ?? 0);
        return (
            Number(bDps >= requiredDps) - Number(aDps >= requiredDps) ||
            Number(bCount >= requiredCount) - Number(aCount >= requiredCount) ||
            bDps - aDps ||
            bCount - aCount
        );
    })[0];

const assetSortKey = (asset: DataAsset) => [
    Number(asset.stored_dps ?? 0),
    Number(asset.count ?? 0),
    String(asset.asset_id ?? ""),
] as const;

const compareAssetsByDpsCount = (a: DataAsset, b: DataAsset) =>
    assetSortKey(b)[0] - assetSortKey(a)[0] ||
    assetSortKey(b)[1] - assetSortKey(a)[1] ||
    assetSortKey(b)[2].localeCompare(assetSortKey(a)[2]);

const isGeneratedZeroAsset = (asset: DataAsset) => {
    const text = ["asset_id", "source_path", "source_original_path", "generator"]
        .map((key) => String(asset[key] ?? ""))
        .join(" ")
        .toLowerCase();
    if (text.includes("generated")) return true;
    const generator = String(asset.generator ?? "").toLowerCase();
    return ["python-flint", "mpmath", "siegelz", "zetazero"].some((token) => generator.includes(token));
};

const isReferenceZeroAsset = (asset: DataAsset) => {
    if (isGeneratedZeroAsset(asset)) return false;
    const text = ["asset_id", "source_path", "source_original_path", "generator", "role"]
        .map((key) => String(asset[key] ?? ""))
        .join(" ")
        .toLowerCase();
    return ["odlyzko", "reference", "zeros_"].some((token) => text.includes(token));
};

const bestReferenceZeroAsset = (assets: DataAsset[], requiredCount: number) =>
    assets
        .filter((asset) => isReferenceZeroAsset(asset) && Number(asset.count ?? 0) >= requiredCount)
        .sort(compareAssetsByDpsCount)[0];

const selectZeroAsset = (
    assets: DataAsset[],
    required: RequiredAsset,
    zeroPolicy: RunPresetContract["zero_policy"],
) => {
    const requiredCount = Number(required.count ?? 0);
    const requiredDps = Number(required.stored_dps ?? 0);
    const referenceAsset = bestReferenceZeroAsset(assets, requiredCount);
    const tolerance = zeroPolicy.crosscheck_tolerance ?? DEFAULT_ZERO_REFERENCE_TOLERANCE;
    const strictBlock = Boolean((zeroPolicy as { block_on_policy_failure?: boolean }).block_on_policy_failure || (zeroPolicy.require_odlyzko_crosscheck && !zeroPolicy.allow_lower_precision_fallback));
    const warnings: string[] = [];
    const blockers: Array<Record<string, unknown>> = [];
    let validation: ZeroValidationArtifact | null = null;

    const strongGenerated = assets
        .filter((asset) =>
            isGeneratedZeroAsset(asset) &&
            Number(asset.count ?? 0) >= requiredCount &&
            Number(asset.stored_dps ?? 0) >= requiredDps)
        .sort(compareAssetsByDpsCount);

    if (strongGenerated[0]) {
        const selected = strongGenerated[0];
        if (zeroPolicy.require_odlyzko_crosscheck) {
            validation = validateZeroAssetAgainstReference(selected, referenceAsset, tolerance);
            if (validation.status !== "PASS") {
                blockers.push({
                    kind: "nontrivial_zeta_zeros",
                    reason: validation.status === "NOT_AVAILABLE"
                        ? "ODLYZKO_REFERENCE_UNAVAILABLE"
                        : "ODLYZKO_CROSSCHECK_FAILED",
                    status: "BLOCKED",
                    required,
                    available: assetRef(selected),
                    validation,
                });
            } else if (Number(validation.validated_count ?? 0) < requiredCount) {
                blockers.push({
                    kind: "nontrivial_zeta_zeros",
                    reason: "ODLYZKO_CROSSCHECK_INCOMPLETE",
                    status: "BLOCKED",
                    required,
                    available: assetRef(selected),
                    validation,
                });
            }
        }
        return {
            selected,
            reason: "highest valid generated high-dps asset satisfying count + dps + guard",
            referenceAsset,
            validation,
            warnings,
            blockers,
        };
    }

    const strongReference = assets
        .filter((asset) =>
            isReferenceZeroAsset(asset) &&
            Number(asset.count ?? 0) >= requiredCount &&
            Number(asset.stored_dps ?? 0) >= requiredDps)
        .sort(compareAssetsByDpsCount);
    if (strongReference[0]) {
        const selected = strongReference[0];
        validation = {
            asset_id: selected.asset_id,
            reference_asset_id: selected.asset_id,
            validated_count: Number(selected.count ?? 0),
            tolerance: "self",
            max_deviation: "0",
            p95_deviation: "0",
            failed_indices: [],
            status: "PASS",
            valid_for_authoritative: true,
            reason: "selected reference asset",
        };
        return {
            selected,
            reason: "highest valid Odlyzko/reference asset satisfying count + precision",
            referenceAsset: selected,
            validation,
            warnings,
            blockers,
        };
    }

    const fallback = bestAssetForRequirement(
        assets.filter((asset) => Number(asset.count ?? 0) >= requiredCount),
        required,
    ) ?? bestAssetForRequirement(assets, required);
    if (fallback && zeroPolicy.allow_lower_precision_fallback) {
        warnings.push("Selected lower-precision nontrivial zero source because the preset allows fallback.");
        return {
            selected: fallback,
            reason: "lower-precision fallback allowed by preset",
            referenceAsset,
            validation,
            warnings,
            blockers,
            precisionFallback: true,
        };
    }

    if (fallback && Number(fallback.count ?? 0) < requiredCount && Number(fallback.stored_dps ?? 0) >= requiredDps) {
        return {
            selected: fallback,
            reason: "best available zero source requires count extension",
            referenceAsset,
            validation,
            warnings,
            blockers,
            precisionFallback: false,
        };
    }

    blockers.push({
        kind: "nontrivial_zeta_zeros",
        reason: "INSUFFICIENT_PRECISION",
        status: strictBlock ? "BLOCKED" : "INSUFFICIENT_PRECISION",
        required,
        available: assetRef(fallback),
        ...(fallback
            ? {
                message:
                    `Run blocked. Preset requires nontrivial zero asset with >=${requiredDps} stored dps ` +
                    `and Odlyzko cross-check PASS. Selected source has only ${Number(fallback.stored_dps ?? 0)} declared decimals.`,
            }
            : {}),
    });
    return {
        selected: fallback,
        reason: "no acceptable zero source satisfies count + dps + guard",
        referenceAsset,
        validation,
        warnings,
        blockers,
        precisionFallback: false,
    };
};

export const checkDataSufficiency = (input: DataPlannerInput = {}): DataPlannerOutput => {
    const presetName = input.preset ?? (isRunPreset(input.mode) ? input.mode : undefined);
    const contract = presetName ? resolveRunPreset(presetName) : null;
    const experimentsRaw = input.experiments ?? ["EXP_1", "EXP_6", "EXP_8"];
    const experiments = Array.isArray(experimentsRaw)
        ? experimentsRaw
        : experimentsRaw.split(",").map((item) => item.trim()).filter(Boolean);
    const requestedDps = Number(input.requested_dps ?? input.dps ?? contract?.requested_dps ?? 80);
    const requestedZeroCount = Number(input.requested_zero_count ?? input.zeros ?? input.zero_count ?? contract?.requested_zero_count ?? 100000);
    const guardDps = Number(input.guard_dps ?? contract?.guard_dps ?? 20);
    const requirements = requirementsForExperiments(experiments, {
        ...input,
        requested_dps: requestedDps,
        requested_zero_count: requestedZeroCount,
        guard_dps: guardDps,
    });
    const manifest = readDataManifest();
    const available_assets: DataPlannerOutput["available_assets"] = [];
    const missing_assets: DataPlannerOutput["missing_assets"] = [];
    const insufficient_assets: DataPlannerOutput["insufficient_assets"] = [];
    const generation_plan: DataPlannerOutput["generation_plan"] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    const selected_assets: NonNullable<DataPlannerOutput["selected_assets"]> = {};
    const zeroPolicy: RunPresetContract["zero_policy"] = {
        selection: "highest_available",
        allow_lower_precision_fallback: false,
        require_odlyzko_crosscheck: false,
        ...(contract?.zero_policy ?? {}),
        ...(input.zero_policy ?? {}),
    };
    const tauPolicy = {
        selection: "highest_available",
        require_dps_plus_guard: true,
        ...(contract?.tau_policy ?? {}),
        ...(input.tau_policy ?? {}),
    };
    const primePolicy = {
        selection: "canonical_7m",
        require_sufficient_max_prime: true,
        ...(contract?.prime_policy ?? {}),
        ...(input.prime_policy ?? {}),
    };
    const certificatePolicy = {
        require_raw_high_precision_artifacts: false,
        ...(contract?.certificate_policy ?? {}),
        ...(input.certificate_policy ?? {}),
    };

    for (const required of requirements.required_assets) {
        if (required.kind === "tau") {
            const best = bestAssetForRequirement(validAssetsByKind("tau", manifest), required);
            available_assets.push({ required, available: assetRef(best) });
            selected_assets.tau = {
                asset: assetRef(best),
                reason: "highest valid tau asset satisfying dps + guard",
                policy: tauPolicy,
            };
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
            const selection = selectZeroAsset(validAssetsByKind("nontrivial_zeta_zeros", manifest), required, zeroPolicy);
            const best = selection.selected;
            available_assets.push({ required, available: assetRef(best) });
            selected_assets.zero = {
                asset: assetRef(best),
                reason: selection.reason,
                reference_asset: assetRef(selection.referenceAsset),
                validation: selection.validation,
                policy: zeroPolicy,
            };
            warnings.push(...selection.warnings);
            insufficient_assets.push(...selection.blockers);
            if (!best) {
                missing_assets.push({ kind: "nontrivial_zeta_zeros", required });
                generation_plan.push({
                    action: "generate_nontrivial_zeros",
                    command: `python -m proof_kernel.generate_zeros --count ${required.count} --stored-dps ${required.stored_dps}`,
                });
            } else if (selection.blockers.length === 0) {
                if (Number(best.count ?? 0) < Number(required.count ?? 0)) {
                    insufficient_assets.push({ kind: "nontrivial_zeta_zeros", reason: "INSUFFICIENT_COUNT", status: "NEEDS_EXTENSION", required, available: assetRef(best) });
                    generation_plan.push({
                        action: "generate_nontrivial_zeros",
                        command: `python -m proof_kernel.generate_zeros --count ${required.count} --stored-dps ${required.stored_dps}`,
                    });
                }
                if (Number(best.stored_dps ?? 0) < Number(required.stored_dps ?? 0) && !selection.precisionFallback) {
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
            const best = bestAssetForRequirement(validAssetsByKind("trivial_zeta_zeros", manifest), required);
            available_assets.push({ required, available: assetRef(best) });
            selected_assets.trivial_zeros = {
                asset: assetRef(best),
                reason: "formulaic trivial zeros",
            };
            if (!best) {
                missing_assets.push({ kind: "trivial_zeta_zeros", required });
                errors.push("Trivial zero formula asset is missing from data/manifest.json.");
            }
            continue;
        }

        if (required.kind === "primes") {
            const best = bestPrimeAsset(validAssetsByKind("primes", manifest));
            available_assets.push({ required, available: assetRef(best) });
            selected_assets.prime = {
                asset: assetRef(best),
                reason: best?.role === "canonical_static_asset" ? "canonical 7M prime asset" : "highest valid prime asset",
                policy: primePolicy,
            };
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
        preset: contract?.preset ?? null,
        run_contract: contract,
        required_assets: requirements.required_assets,
        selected_assets,
        available_assets,
        missing_assets,
        insufficient_assets,
        generation_plan: dedupedPlan,
        warnings,
        errors,
        next_action: dedupedPlan[0]?.action ?? (status === "READY" ? "run_next_research_step" : null),
        requirements,
        policies: {
            zero_policy: zeroPolicy,
            tau_policy: tauPolicy,
            prime_policy: primePolicy,
            certificate_policy: certificatePolicy,
        },
    };
};

const blockReason = (plan: DataPlannerOutput) => {
    if (plan.status === "READY") return "Run status: READY";
    const insufficient = plan.insufficient_assets[0];
    if (insufficient) {
        if (typeof insufficient.message === "string") return insufficient.message;
        const required = insufficient.required as { stored_dps?: number } | undefined;
        const available = insufficient.available as { stored_dps?: number } | undefined;
        if (insufficient.reason === "ODLYZKO_CROSSCHECK_FAILED") {
            const validation = insufficient.validation as { status?: string } | undefined;
            return `Run blocked. Preset ${plan.preset} requires Odlyzko cross-check PASS; validation status is ${validation?.status}.`;
        }
        if (insufficient.reason === "ODLYZKO_REFERENCE_UNAVAILABLE") {
            return `Run blocked. Preset ${plan.preset} requires an Odlyzko/reference zero asset for cross-check, but none is available.`;
        }
        if (insufficient.reason === "ODLYZKO_CROSSCHECK_INCOMPLETE") {
            const validation = insufficient.validation as { validated_count?: number } | undefined;
            const requiredCount = (insufficient.required as { count?: number } | undefined)?.count;
            return `Run blocked. Preset ${plan.preset} requires Odlyzko cross-check over ${requiredCount} zeros; validation covered ${validation?.validated_count}.`;
        }
        if (insufficient.kind === "nontrivial_zeta_zeros" && insufficient.reason === "INSUFFICIENT_PRECISION") {
            return (
                `Run blocked. Preset ${plan.preset} requires nontrivial zero asset with >=${required?.stored_dps} stored dps ` +
                `and Odlyzko cross-check PASS. Selected source has only ${available?.stored_dps} declared decimals.`
            );
        }
        return `Run blocked. Required ${String(insufficient.kind)} asset failed policy: ${String(insufficient.reason)}.`;
    }
    const missing = plan.missing_assets[0];
    if (missing) return `Run blocked. Required ${String(missing.kind)} asset is missing.`;
    if (plan.errors[0]) return `Run blocked. ${plan.errors[0]}`;
    return "Run blocked. Data preflight failed.";
};

const preflightNextAction = (plan: DataPlannerOutput) => {
    if (plan.status === "READY") return "run_next_research_step";
    const zero = plan.selected_assets?.zero?.asset;
    const required = plan.required_assets.find((asset) => asset.kind === "nontrivial_zeta_zeros");
    const selectedDps = Number(zero?.stored_dps ?? 0);
    const requiredDps = Number(required?.stored_dps ?? 0);
    if (zero && selectedDps < requiredDps) return "generate_high_dps_zero_asset";
    if (plan.insufficient_assets.some((item) => item.reason === "ODLYZKO_CROSSCHECK_FAILED")) {
        return "validate_against_odlyzko_reference";
    }
    if (plan.insufficient_assets.some((item) => item.reason === "ODLYZKO_REFERENCE_UNAVAILABLE")) {
        return "add_odlyzko_reference_asset";
    }
    return plan.next_action ?? "fix_data_preflight";
};

export interface RunPreflightOutput {
    preset: string;
    status: "READY" | "BLOCKED";
    run_status: "READY" | "BLOCKED";
    reason: string;
    contract: RunPresetContract;
    selected_assets: NonNullable<DataPlannerOutput["selected_assets"]>;
    data_sufficiency: DataPlannerOutput;
    warnings: string[];
    errors: string[];
    next_action: string;
}

export const runPreflight = (input: DataPlannerInput = {}): RunPreflightOutput => {
    const preset = input.preset ?? (isRunPreset(input.mode) ? input.mode : "standard");
    const contract = resolveRunPreset(preset);
    const plan = checkDataSufficiency({ ...contract, ...input, preset: contract.preset });
    const status = plan.status === "READY" ? "READY" : "BLOCKED";
    return {
        preset: contract.preset,
        status,
        run_status: status,
        reason: status === "READY" ? "highest valid assets satisfy preset policies" : blockReason(plan),
        contract,
        selected_assets: plan.selected_assets ?? {},
        data_sufficiency: plan,
        warnings: plan.warnings,
        errors: plan.errors,
        next_action: preflightNextAction(plan),
    };
};

export const getSelectedDataSource = (input: DataPlannerInput = {}) => {
    const preflight = runPreflight(input);
    return {
        preset: preflight.preset,
        status: preflight.status,
        reason: preflight.reason,
        selected_assets: preflight.selected_assets,
        zero_source: preflight.selected_assets.zero?.asset?.source_path,
        tau_source: preflight.selected_assets.tau?.asset?.asset_id,
        prime_source: preflight.selected_assets.prime?.asset?.source_path,
        odlyzko_crosscheck: preflight.selected_assets.zero?.validation?.status,
    };
};

export const validateZeroAssets = () => {
    const manifest = readDataManifest();
    const zeros = validAssetsByKind("nontrivial_zeta_zeros", manifest);
    const reference = bestReferenceZeroAsset(zeros, 1);
    const validations = zeros
        .filter(isGeneratedZeroAsset)
        .map((asset) => validateZeroAssetAgainstReference(asset, reference, DEFAULT_ZERO_REFERENCE_TOLERANCE));
    return {
        reference_asset: assetRef(reference),
        validations,
        existing_validation_artifacts: readZeroValidationArtifacts(),
    };
};

export type RunPresetId = "smoke" | "standard" | "authoritative" | "overkill" | "overkill_full";

export interface RunPresetContract {
    preset: RunPresetId;
    requested_dps: number;
    requested_zero_count: number;
    guard_dps: number;
    zero_policy: {
        selection: "highest_available";
        allow_lower_precision_fallback: boolean;
        require_odlyzko_crosscheck: boolean;
        crosscheck_tolerance?: string;
    };
    tau_policy: {
        selection: "highest_available";
        require_dps_plus_guard: boolean;
    };
    prime_policy: {
        selection: "canonical_7m";
        require_sufficient_max_prime: boolean;
    };
    certificate_policy: {
        require_raw_high_precision_artifacts: boolean;
    };
    runtime_policy: {
        run: string;
        quick: boolean;
        resolution: number;
        x_start: number | null;
        x_end: number | null;
        k_values: string;
        n_test: number;
        prime_min_count: number;
        prime_target_count: number;
    };
}

const basePolicies = () => ({
    zero_policy: {
        selection: "highest_available" as const,
        allow_lower_precision_fallback: true,
        require_odlyzko_crosscheck: false,
    },
    tau_policy: {
        selection: "highest_available" as const,
        require_dps_plus_guard: true,
    },
    prime_policy: {
        selection: "canonical_7m" as const,
        require_sufficient_max_prime: true,
    },
    certificate_policy: {
        require_raw_high_precision_artifacts: false,
    },
    runtime_policy: {
        run: "all",
        quick: false,
        resolution: 500,
        x_start: null as number | null,
        x_end: null as number | null,
        k_values: "0,1,2",
        n_test: 500,
        prime_min_count: 0,
        prime_target_count: 0,
    },
});

const contract = (
    preset: RunPresetId,
    requestedDps: number,
    requestedZeroCount: number,
    guardDps: number,
    options: {
        allowLowerPrecisionFallback: boolean;
        requireOdlyzkoCrosscheck: boolean;
        requireRawHighPrecisionArtifacts: boolean;
        runtimePolicy?: Partial<RunPresetContract["runtime_policy"]>;
    },
): RunPresetContract => {
    const base = basePolicies();
    return {
        preset,
        requested_dps: requestedDps,
        requested_zero_count: requestedZeroCount,
        guard_dps: guardDps,
        zero_policy: {
            ...base.zero_policy,
            allow_lower_precision_fallback: options.allowLowerPrecisionFallback,
            require_odlyzko_crosscheck: options.requireOdlyzkoCrosscheck,
        },
        tau_policy: base.tau_policy,
        prime_policy: base.prime_policy,
        certificate_policy: {
            require_raw_high_precision_artifacts: options.requireRawHighPrecisionArtifacts,
        },
        runtime_policy: {
            ...base.runtime_policy,
            ...(options.runtimePolicy ?? {}),
        },
    };
};

const PRESETS: Record<RunPresetId, RunPresetContract> = {
    smoke: contract("smoke", 30, 100, 0, {
        allowLowerPrecisionFallback: true,
        requireOdlyzkoCrosscheck: false,
        requireRawHighPrecisionArtifacts: false,
        runtimePolicy: { quick: true },
    }),
    standard: contract("standard", 40, 2000, 20, {
        allowLowerPrecisionFallback: true,
        requireOdlyzkoCrosscheck: false,
        requireRawHighPrecisionArtifacts: false,
    }),
    authoritative: contract("authoritative", 80, 100000, 20, {
        allowLowerPrecisionFallback: false,
        requireOdlyzkoCrosscheck: true,
        requireRawHighPrecisionArtifacts: true,
        runtimePolicy: { prime_min_count: 1_000_000, prime_target_count: 1_000_000 },
    }),
    overkill: contract("overkill", 80, 60000, 20, {
        allowLowerPrecisionFallback: false,
        requireOdlyzkoCrosscheck: true,
        requireRawHighPrecisionArtifacts: true,
        runtimePolicy: { prime_min_count: 1_000_000, prime_target_count: 7_000_000 },
    }),
    overkill_full: contract("overkill_full", 80, 100000, 20, {
        allowLowerPrecisionFallback: false,
        requireOdlyzkoCrosscheck: true,
        requireRawHighPrecisionArtifacts: true,
        runtimePolicy: { prime_min_count: 1_000_000, prime_target_count: 7_000_000, x_start: 2, x_end: 50 },
    }),
};

export const isRunPreset = (value: unknown): value is RunPresetId =>
    typeof value === "string" && value.toLowerCase() in PRESETS;

export const resolveRunPreset = (
    preset: RunPresetId | string = "standard",
    overrides: Partial<RunPresetContract> = {},
): RunPresetContract => {
    const presetId = String(preset).toLowerCase() as RunPresetId;
    const base = PRESETS[presetId];
    if (!base) throw new Error(`Unknown run preset: ${preset}`);
    return {
        ...structuredClone(base),
        ...overrides,
        zero_policy: { ...base.zero_policy, ...(overrides.zero_policy ?? {}) },
        tau_policy: { ...base.tau_policy, ...(overrides.tau_policy ?? {}) },
        prime_policy: { ...base.prime_policy, ...(overrides.prime_policy ?? {}) },
        certificate_policy: { ...base.certificate_policy, ...(overrides.certificate_policy ?? {}) },
        runtime_policy: { ...base.runtime_policy, ...(overrides.runtime_policy ?? {}) },
    };
};

export const getRunPresets = () =>
    (["smoke", "standard", "authoritative", "overkill", "overkill_full"] as RunPresetId[]).map((preset) =>
        resolveRunPreset(preset),
    );

export const PRECISION_POLICY = {
    default_guard_dps: 20,
    authoritative_min_dps: 80,
    asset_required_dps_rule: "experiment_dps + guard_dps",
    tau_required_dps_rule: "experiment_dps + guard_dps",
    zero_required_dps_rule: "experiment_dps + guard_dps",
    display_float_policy: "allowed_for_ui_only",
    certificate_policy: "prefer_raw_high_precision_artifacts",
} as const;

export const getPrecisionPolicy = () => ({ ...PRECISION_POLICY });

export const requiredStoredDps = (requestedDps: number, guardDps: number = PRECISION_POLICY.default_guard_dps) =>
    Math.trunc(requestedDps) + Math.trunc(guardDps);

import { requiredStoredDps } from "./precision-policy";

export interface RunRequirementInput {
    requested_dps?: number;
    dps?: number;
    requested_zero_count?: number;
    zero_count?: number;
    zeros?: number;
    guard_dps?: number;
    x_end?: number;
    k_values?: number[] | string;
    n_test?: number;
    sample_count?: number;
    prime_min_count?: number;
    prime_target_count?: number;
    tau?: number;
    [key: string]: unknown;
}

export interface RequiredAsset {
    kind: "tau" | "nontrivial_zeta_zeros" | "trivial_zeta_zeros" | "primes";
    count?: number;
    stored_dps?: number;
    max_prime?: number;
    max_value?: number;
    formula?: string;
}

const ALIASES: Record<string, string> = {
    "1": "EXP_1",
    EXP1: "EXP_1",
    "CORE-1": "EXP_1",
    "6": "EXP_6",
    EXP6: "EXP_6",
    "VAL-1": "EXP_6",
    "8": "EXP_8",
    EXP8: "EXP_8",
    "WIT-1": "EXP_8",
    "REG-1": "EXP_8",
    "9": "EXP_9",
    EXP9: "EXP_9",
    "DEMO-1": "EXP_9",
    "2": "EXP_2",
    EXP2: "EXP_2",
    "P2-1": "EXP_2",
    "2B": "EXP_2B",
    EXP2B: "EXP_2B",
    "P2-2": "EXP_2B",
    "7": "EXP_7",
    EXP7: "EXP_7",
    "P2-3": "EXP_7",
};

export const normalizeExperimentId = (value: string) => {
    const raw = value.trim().toUpperCase().replace(/_/g, "-");
    if (/^EXP-[0-9]+[A-Z]?$/.test(raw)) return raw.replace("EXP-", "EXP_");
    if (/^EXP[0-9]+[A-Z]?$/.test(raw)) return raw.replace(/^EXP/, "EXP_");
    return ALIASES[raw] ?? raw.replace(/-/g, "_");
};

const parseKValues = (value: RunRequirementInput["k_values"]): number[] => {
    if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
    if (typeof value === "string") {
        const parsed = value.split(",").map((item) => Number(item.trim())).filter(Number.isFinite);
        return parsed.length > 0 ? parsed : [0, 1, 2];
    }
    return [0, 1, 2];
};

const primeMaxForScaledX = (run: RunRequirementInput) => {
    const xEnd = Number(run.x_end ?? 50);
    const tau = Number(run.tau ?? 6.283185307179586);
    const maxK = Math.max(...parseKValues(run.k_values), 0);
    return Math.ceil(xEnd * tau ** maxK);
};

export const experimentRequirementCatalog = () => ({
    EXP_1: {
        display_id: "CORE-1",
        program: "PROGRAM_1",
        critical_path: true,
        requirements: {
            nontrivial_zeros: { count: "run.zero_count", stored_dps: "run.dps + guard_dps" },
            tau: { stored_dps: "run.dps + guard_dps" },
            primes: { max_value: "derived from x_end and k range" },
            trivial_zeros: { formula: "s = -2n" },
        },
    },
    EXP_6: {
        display_id: "VAL-1",
        program: "PROGRAM_1",
        critical_path: true,
        requirements: {
            nontrivial_zeros: { count: "run.zero_count", stored_dps: "run.dps + guard_dps" },
            tau: { stored_dps: "run.dps + guard_dps" },
            primes: { max_value: "derived from x_end * max(tau^k)" },
            trivial_zeros: { formula: "s = -2n" },
        },
    },
    EXP_8: {
        display_id: "WIT-1",
        program: "PROGRAM_1",
        critical_path: true,
        requirements: {
            nontrivial_zeros: { count: "run.n_test", stored_dps: "run.dps + guard_dps" },
            tau: { stored_dps: "run.dps + guard_dps" },
        },
    },
    EXP_9: {
        display_id: "DEMO-1",
        program: "PROGRAM_1",
        critical_path: false,
        requirements: {
            tau: { stored_dps: "run.dps + guard_dps" },
            nontrivial_zeros: { count: "sample_count", stored_dps: "run.dps + guard_dps" },
        },
    },
    EXP_2: { display_id: "P2-1", program: "PROGRAM_2", critical_path: false },
    EXP_2B: { display_id: "P2-2", program: "PROGRAM_2", critical_path: false },
    EXP_7: { display_id: "P2-3", program: "PROGRAM_2", critical_path: false },
});

export const requirementsForExperiments = (experiments: string[], run: RunRequirementInput) => {
    const normalized = experiments.map(normalizeExperimentId);
    const requestedDps = Number(run.requested_dps ?? run.dps ?? 80);
    const guardDps = Number(run.guard_dps ?? 20);
    const requiredDps = requiredStoredDps(requestedDps, guardDps);
    const zeroCount = Number(run.requested_zero_count ?? run.zero_count ?? run.zeros ?? 0);
    const nTest = Number(run.n_test ?? zeroCount);
    const sampleCount = Number(run.sample_count ?? 100);
    const primeCount = Math.max(Number(run.prime_target_count ?? 0), Number(run.prime_min_count ?? 0));

    let needsTau = false;
    let needsNontrivial = false;
    let needsTrivial = false;
    let needsPrimes = false;
    let requiredZeroCount = 0;
    let requiredPrimeMax = 0;
    const catalog = experimentRequirementCatalog() as Record<string, unknown>;
    const declarations: Record<string, unknown> = {};

    for (const expId of normalized) {
        if (!(expId in catalog)) continue;
        declarations[expId] = catalog[expId];
        if (["EXP_1", "EXP_6", "EXP_8", "EXP_9", "EXP_2", "EXP_2B", "EXP_7"].includes(expId)) {
            needsTau = true;
            needsNontrivial = true;
        }
        if (["EXP_1", "EXP_6"].includes(expId)) {
            needsTrivial = true;
            needsPrimes = true;
            requiredZeroCount = Math.max(requiredZeroCount, zeroCount);
            requiredPrimeMax = Math.max(requiredPrimeMax, primeMaxForScaledX(run));
        } else if (expId === "EXP_8") {
            requiredZeroCount = Math.max(requiredZeroCount, nTest || zeroCount);
        } else if (expId === "EXP_9") {
            requiredZeroCount = Math.max(requiredZeroCount, sampleCount);
        } else {
            requiredZeroCount = Math.max(requiredZeroCount, zeroCount);
        }
    }

    const requiredAssets: RequiredAsset[] = [];
    if (needsTau) requiredAssets.push({ kind: "tau", stored_dps: requiredDps });
    if (needsNontrivial) {
        requiredAssets.push({ kind: "nontrivial_zeta_zeros", count: requiredZeroCount, stored_dps: requiredDps });
    }
    if (needsTrivial || normalized.length > 0) requiredAssets.push({ kind: "trivial_zeta_zeros", formula: "s = -2n" });
    if (needsPrimes) {
        requiredAssets.push({ kind: "primes", count: primeCount, max_prime: requiredPrimeMax, max_value: requiredPrimeMax });
    }

    return {
        experiments: normalized,
        declarations,
        required_assets: requiredAssets,
        required_stored_dps: requiredDps,
        guard_dps: guardDps,
        requested_dps: requestedDps,
    };
};

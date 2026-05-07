import { checkDataSufficiency, type DataPlannerOutput } from "./data-planner";
import { buildResearchPlan, type ResearchPlanOutput } from "./research-plan";
import type { ExperimentsData } from "./types";
import type { SameObjectCertificate } from "./same-object-certificate";

export interface NextActionOutput {
    next_action: string;
    command?: string | null;
    target?: string;
    why?: string;
    blocks: string[];
    data_sufficiency: DataPlannerOutput;
    research_plan: ResearchPlanOutput;
}

const dataWhy = (ds: DataPlannerOutput) => {
    const missing = ds.missing_assets[0];
    if (missing) return `Required ${String(missing.kind)} asset is missing for the requested run.`;
    const insufficient = ds.insufficient_assets[0];
    if (insufficient) {
        const required = insufficient.required as { stored_dps?: number; count?: number } | undefined;
        const available = insufficient.available as { stored_dps?: number; count?: number } | undefined;
        if (insufficient.reason === "INSUFFICIENT_PRECISION") {
            return `Requested run requires stored_dps >= ${required?.stored_dps}; current asset has stored_dps=${available?.stored_dps}.`;
        }
        if (insufficient.reason === "INSUFFICIENT_COUNT") {
            return `Requested run requires ${required?.count} zeros; current asset has count=${available?.count}.`;
        }
        return `Required ${String(insufficient.kind)} asset is insufficient: ${String(insufficient.reason)}.`;
    }
    return "Data preflight is not ready.";
};

const overkill60kRunCompleted = (artifact?: ExperimentsData) => {
    if (isOverkill60kBaselineArtifact(artifact)) return true;

    const contract = artifact?.meta?.run_contract as
        | { preset?: string; requested_zero_count?: number; requested_dps?: number; guard_dps?: number }
        | undefined;
    const selectedZero = (artifact?.meta?.selected_data_sources as
        | { zero?: { validation?: { status?: string; validated_count?: number }; asset?: { stored_dps?: number } } }
        | undefined)?.zero;
    return (
        contract?.preset === "overkill" &&
        Number(contract.requested_zero_count) === 60_000 &&
        Number(contract.requested_dps) === 80 &&
        Number(contract.guard_dps ?? 20) === 20 &&
        selectedZero?.validation?.status === "PASS" &&
        Number(selectedZero.validation.validated_count ?? 0) >= 60_000 &&
        Number(selectedZero.asset?.stored_dps ?? 0) >= 100
    );
};

const isGeneratedZeroSource = (info?: Record<string, unknown>) => {
    const sourceKind = String(info?.source_kind ?? "");
    const sourcePath = String(info?.source_path ?? "");
    return sourceKind.includes("generated") || sourcePath.includes("zeros.generated");
};

const isOverkill60kBaselineArtifact = (artifact?: ExperimentsData) => {
    const meta = artifact?.meta;
    if (!meta) return false;
    const info = meta.zero_source_info;
    const requested = Number(info?.requested_count ?? meta.zeros);
    const loaded = Number(info?.loaded_count ?? meta.zeros);
    const declared = Number(info?.declared_decimals);
    return (
        Number(meta.dps) === 80 &&
        requested === 60_000 &&
        loaded >= 60_000 &&
        info?.valid !== false &&
        isGeneratedZeroSource(info) &&
        (!Number.isFinite(declared) || declared >= 75)
    );
};

const blockedDataNextAction = (ds: DataPlannerOutput) => {
    const reasons = new Set(ds.insufficient_assets.map((item) => item.reason));
    if (reasons.has("ODLYZKO_CROSSCHECK_FAILED")) return "INVESTIGATE_ZERO_MISMATCH";
    if (reasons.has("ODLYZKO_REFERENCE_UNAVAILABLE") || reasons.has("ODLYZKO_CROSSCHECK_INCOMPLETE")) {
        return "VALIDATE_GENERATED_ZEROS_AGAINST_ODLYZKO";
    }
    if (reasons.has("INSUFFICIENT_COUNT") && ds.preset === "overkill") return "EXTEND_ZERO_ASSET_TO_60000";
    const step = ds.generation_plan[0];
    return String(step?.action ?? ds.next_action ?? "FIX_DATA").toUpperCase();
};

export const buildNextAction = (
    dataSufficiency: DataPlannerOutput = checkDataSufficiency(),
    artifact?: ExperimentsData,
    certificate?: SameObjectCertificate | null,
): NextActionOutput => {
    const researchPlan = buildResearchPlan(dataSufficiency, artifact, certificate);
    const runContract = artifact?.meta?.run_contract as
        | { preset?: string; requested_dps?: number; guard_dps?: number }
        | undefined;
    const declaredDecimals = Number(
        ((artifact?.meta?.selected_data_sources as { zero?: { asset?: { stored_dps?: unknown } } } | undefined)
            ?.zero?.asset?.stored_dps) ??
        artifact?.meta?.zero_source_info?.declared_decimals,
    );
    const requiredDps = Number(runContract?.requested_dps ?? artifact?.meta?.dps ?? 0) +
        Number(runContract?.guard_dps ?? 20);
    const plannerSelectedDps = Number(dataSufficiency.selected_assets?.zero?.asset?.stored_dps);
    const plannerHasStrongerSource = Number.isFinite(plannerSelectedDps) && plannerSelectedDps >= requiredDps;
    const strictPreset = runContract?.preset &&
        ["overkill", "authoritative", "overkill_full"].includes(runContract.preset);
    const overkill60kBaseline = isOverkill60kBaselineArtifact(artifact);
    if (
        Number.isFinite(declaredDecimals) &&
        declaredDecimals < requiredDps &&
        !overkill60kBaseline &&
        (strictPreset || plannerHasStrongerSource)
    ) {
        return {
            next_action: "FIX_PRESET_SOURCE_RESOLVER",
            command: null,
            why:
                `${strictPreset ? `Preset ${runContract?.preset}` : "Run"} used a zero source with ${declaredDecimals} declared decimals; ` +
                `required >=${requiredDps}. Fix preset/source resolver before proof work.`,
            blocks: ["DATA_PREFLIGHT"],
            data_sufficiency: dataSufficiency,
            research_plan: researchPlan,
        };
    }
    if (dataSufficiency.status !== "READY") {
        const step = dataSufficiency.generation_plan[0];
        return {
            next_action: blockedDataNextAction(dataSufficiency),
            command: step?.command,
            why: dataWhy(dataSufficiency),
            blocks: researchPlan.blocked_nodes,
            data_sufficiency: dataSufficiency,
            research_plan: researchPlan,
        };
    }
    if (dataSufficiency.preset === "overkill" && !overkill60kRunCompleted(artifact)) {
        return {
            next_action: "RERUN_OVERKILL_60K_WITH_VALIDATED_HIGH_DPS_ZEROS",
            command: "python experiment_engine.py --preset overkill --zero-count 60000 --dps 80",
            why: "Overkill 60K preflight is ready; a clean overkill 60K run has not completed yet.",
            blocks: ["RUN_OVERKILL_60K"],
            data_sufficiency: dataSufficiency,
            research_plan: researchPlan,
        };
    }
    if (researchPlan.recommended_next_action === "RECOMMEND_NC3_NC4_FORMALIZATION") {
        return {
            next_action: "WRITE_FORMAL_LEMMA",
            target: "NC3/NC4",
            command: null,
            why: researchPlan.why,
            blocks: ["FORMAL_PROOF_CLOSURE"],
            data_sufficiency: dataSufficiency,
            research_plan: researchPlan,
        };
    }
    return {
        next_action: researchPlan.recommended_next_action,
        command: researchPlan.commands[0],
        why: researchPlan.why,
        blocks: researchPlan.blocked_nodes,
        data_sufficiency: dataSufficiency,
        research_plan: researchPlan,
    };
};

export const explainWhyThisExperimentNext = (action: NextActionOutput) => ({
    structured: action,
    explanation: action.why,
    blocked_by: action.blocks,
    recommended_next_action: action.next_action,
});

export const explainWhyStopExperimenting = (action: NextActionOutput) => ({
    structured: action,
    explanation: action.next_action === "WRITE_FORMAL_LEMMA"
        ? action.research_plan.stop_condition
        : "Do not stop empirical testing yet; a data, experiment, or certificate blocker remains.",
    blocked_by: action.blocks,
    recommended_next_action: action.next_action,
});

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

export const buildNextAction = (
    dataSufficiency: DataPlannerOutput = checkDataSufficiency(),
    artifact?: ExperimentsData,
    certificate?: SameObjectCertificate | null,
): NextActionOutput => {
    const researchPlan = buildResearchPlan(dataSufficiency, artifact, certificate);
    if (dataSufficiency.status !== "READY") {
        const step = dataSufficiency.generation_plan[0];
        return {
            next_action: String(step?.action ?? dataSufficiency.next_action ?? "FIX_DATA").toUpperCase(),
            command: step?.command,
            why: dataWhy(dataSufficiency),
            blocks: researchPlan.blocked_nodes,
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

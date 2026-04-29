import { checkDataSufficiency, type DataPlannerOutput } from "./data-planner";
import type { ExperimentsData } from "./types";
import type { SameObjectCertificate } from "./same-object-certificate";

export interface ResearchPlanOutput {
    current_node: string;
    completed_nodes: string[];
    blocked_nodes: string[];
    recommended_next_action: string;
    why: string;
    commands: string[];
    expected_artifacts: string[];
    stop_condition: string;
    proof_work_recommended: boolean;
}

const experimentPassed = (artifact: ExperimentsData | undefined, expId: string) => {
    const exp = artifact?.summary?.experiments?.[expId];
    return exp?.outcome === "CONSISTENT" || exp?.outcome === "IMPLEMENTATION_OK" || exp?.status === "PASS";
};

const experimentFailed = (artifact: ExperimentsData | undefined, expId: string) => {
    const exp = artifact?.summary?.experiments?.[expId];
    return exp?.outcome === "INCONSISTENT" || exp?.outcome === "IMPLEMENTATION_BROKEN" || exp?.status === "FAIL";
};

export const buildResearchPlan = (
    dataSufficiency: DataPlannerOutput = checkDataSufficiency(),
    artifact?: ExperimentsData,
    certificate?: SameObjectCertificate | null,
): ResearchPlanOutput => {
    if (dataSufficiency.status !== "READY") {
        return {
            current_node: "DATA_PREFLIGHT",
            completed_nodes: [],
            blocked_nodes: ["RUN_CORE_1", "RUN_EXP_8", "RUN_EXP_6", "BUILD_SAME_OBJECT_CERTIFICATE"],
            recommended_next_action: dataSufficiency.next_action ?? "FIX_DATA",
            why: "Data preflight is not ready; fix data coverage or precision before running more experiments.",
            commands: dataSufficiency.generation_plan.map((step) => step.command),
            expected_artifacts: ["data/manifest.json", "public/data_migration_report.json"],
            stop_condition: "Data assets satisfy count, coverage, and requested_dps + guard_dps.",
            proof_work_recommended: false,
        };
    }

    const completed = ["DATA_PREFLIGHT"];
    if (experimentFailed(artifact, "EXP_1")) {
        return {
            current_node: "RUN_CORE_1",
            completed_nodes: completed,
            blocked_nodes: ["RUN_EXP_8", "RUN_EXP_6", "BUILD_SAME_OBJECT_CERTIFICATE"],
            recommended_next_action: "DIAGNOSE_CONVERTER_FORMALIZATION",
            why: "CORE-1 failed, so downstream certificate work is blocked.",
            commands: [],
            expected_artifacts: [],
            stop_condition: "CORE-1 passes or the converter failure is scoped.",
            proof_work_recommended: false,
        };
    }
    if (!experimentPassed(artifact, "EXP_1")) {
        return {
            current_node: "RUN_CORE_1",
            completed_nodes: completed,
            blocked_nodes: ["RUN_EXP_8", "RUN_EXP_6", "BUILD_SAME_OBJECT_CERTIFICATE"],
            recommended_next_action: "RUN_CORE_1",
            why: "Data is ready and CORE-1 has not passed yet.",
            commands: ["python experiment_engine.py --run exp1"],
            expected_artifacts: ["public/experiments.json", "artifacts/runs/<run_id>/raw.json"],
            stop_condition: "CORE-1 passes or exposes a converter formalization defect.",
            proof_work_recommended: false,
        };
    }
    completed.push("RUN_CORE_1");

    if (experimentFailed(artifact, "EXP_8")) {
        return {
            current_node: "RUN_EXP_8",
            completed_nodes: completed,
            blocked_nodes: ["ZERO_CORRESPONDENCE_READY", "BUILD_SAME_OBJECT_CERTIFICATE"],
            recommended_next_action: "DIAGNOSE_ZERO_CORRESPONDENCE",
            why: "WIT-1 failed; zero correspondence is the current blocker.",
            commands: [],
            expected_artifacts: [],
            stop_condition: "WIT-1 is repaired or scoped as certificate-blocking.",
            proof_work_recommended: false,
        };
    }
    if (!experimentPassed(artifact, "EXP_8")) {
        return {
            current_node: "RUN_EXP_8",
            completed_nodes: completed,
            blocked_nodes: ["ZERO_CORRESPONDENCE_READY", "BUILD_SAME_OBJECT_CERTIFICATE"],
            recommended_next_action: "RUN_EXP_8",
            why: "CORE-1 passes. Zero correspondence has not been tested at matching fidelity.",
            commands: ["python experiment_engine.py --run exp8"],
            expected_artifacts: ["public/experiments.json", "artifacts/runs/<run_id>/raw.json"],
            stop_condition: "WIT-1 passes or identifies a zero-correspondence defect.",
            proof_work_recommended: false,
        };
    }
    completed.push("RUN_EXP_8", "ZERO_CORRESPONDENCE_READY");

    if (experimentFailed(artifact, "EXP_6")) {
        return {
            current_node: "RUN_EXP_6",
            completed_nodes: completed,
            blocked_nodes: ["PREDICATE_PROXY_READY", "BUILD_SAME_OBJECT_CERTIFICATE"],
            recommended_next_action: "DIAGNOSE_PREDICATE_TRANSPORT",
            why: "VAL-1 failed; predicate transport is the current blocker.",
            commands: [],
            expected_artifacts: [],
            stop_condition: "VAL-1 is repaired or scoped as certificate-blocking.",
            proof_work_recommended: false,
        };
    }
    if (!experimentPassed(artifact, "EXP_6")) {
        return {
            current_node: "RUN_EXP_6",
            completed_nodes: completed,
            blocked_nodes: ["PREDICATE_PROXY_READY", "BUILD_SAME_OBJECT_CERTIFICATE"],
            recommended_next_action: "RUN_EXP_6",
            why: "CORE-1 and WIT-1 pass. Predicate preservation has not been tested at matching fidelity.",
            commands: ["python experiment_engine.py --run exp6"],
            expected_artifacts: ["public/experiments.json", "artifacts/runs/<run_id>/raw.json"],
            stop_condition: "VAL-1 passes or identifies a predicate-transport defect.",
            proof_work_recommended: false,
        };
    }
    completed.push("RUN_EXP_6", "PREDICATE_PROXY_READY");

    const certStatus = certificate?.status ?? "NOT_READY";
    if (certStatus === "SAME_OBJECT_FAILED") {
        return {
            current_node: "BUILD_SAME_OBJECT_CERTIFICATE",
            completed_nodes: completed,
            blocked_nodes: ["RECOMMEND_NC3_NC4_FORMALIZATION"],
            recommended_next_action: "DIAGNOSE_CERTIFICATE_FAILURE",
            why: "The Same-Object Certificate failed; diagnose its failed section.",
            commands: [],
            expected_artifacts: ["public/same_object_certificate.json"],
            stop_condition: "Certificate failure is scoped.",
            proof_work_recommended: false,
        };
    }
    if (certStatus !== "SAME_OBJECT_CANDIDATE") {
        return {
            current_node: "BUILD_SAME_OBJECT_CERTIFICATE",
            completed_nodes: completed,
            blocked_nodes: [],
            recommended_next_action: certStatus === "INCONCLUSIVE" ? "RECOMMEND_HIGHER_FIDELITY_OR_SPECIFIC_RERUN" : "BUILD_SAME_OBJECT_CERTIFICATE",
            why: certStatus === "INCONCLUSIVE"
                ? "The certificate is inconclusive; use targeted reruns or higher fidelity."
                : "The critical experiments pass; assemble the Same-Object Certificate before running more tests.",
            commands: certStatus === "INCONCLUSIVE" ? [] : ["python -m proof_kernel.same_object_certificate"],
            expected_artifacts: ["public/same_object_certificate.json"],
            stop_condition: "Certificate reaches SAME_OBJECT_CANDIDATE, SAME_OBJECT_FAILED, or INCONCLUSIVE.",
            proof_work_recommended: false,
        };
    }

    completed.push("BUILD_SAME_OBJECT_CERTIFICATE", "SAME_OBJECT_CANDIDATE");
    if (certificate?.fidelity?.tier === "AUTHORITATIVE") {
        return {
            current_node: "WRITE_NC3_NC4",
            completed_nodes: completed,
            blocked_nodes: ["FORMAL_PROOF_CLOSURE"],
            recommended_next_action: "RECOMMEND_NC3_NC4_FORMALIZATION",
            why: "Same-Object Certificate passes at AUTHORITATIVE fidelity. Further empirical tests are lower priority than NC3/NC4 formalization.",
            commands: [],
            expected_artifacts: ["proof artifact for NC3/NC4", "proof assembly update"],
            stop_condition: "Stop running more empirical tests unless increasing fidelity or targeting a named blocker.",
            proof_work_recommended: true,
        };
    }

    return {
        current_node: "BUILD_SAME_OBJECT_CERTIFICATE",
        completed_nodes: completed,
        blocked_nodes: [],
        recommended_next_action: "RECOMMEND_HIGHER_FIDELITY_OR_SPECIFIC_RERUN",
        why: "The certificate is a candidate but not at AUTHORITATIVE fidelity.",
        commands: [],
        expected_artifacts: ["public/same_object_certificate.json"],
        stop_condition: "Reach AUTHORITATIVE fidelity or identify a named blocker.",
        proof_work_recommended: false,
    };
};

export const optionalProgram2Branch = (selected: boolean) => ({
    node: "RUN_PROGRAM_2_CONTRADICTION_TRACK",
    enabled: selected,
    why: "Program 2 remains optional unless the contradiction route or NC6 investigation is selected.",
});

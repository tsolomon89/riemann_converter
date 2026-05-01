/**
 * Baseline hypothesis registry (TS side).
 *
 * Mirror of proof_kernel/hypothesis_registry.py. Reads the JSON registry files
 * under proof_kernel/hypotheses/ at runtime. Server-only (uses fs); never call
 * from browser bundles.
 *
 * The registry is read-only here. Agent-proposed revisions go through the
 * hypothesis_proposals workflow.
 */

import fs from "fs";
import path from "path";

export const HYPOTHESIS_REGISTRY_SCHEMA_VERSION = "2026.05.hypothesis-registry.v1";

export type HypothesisProgram = "PROGRAM_1" | "PROGRAM_2" | "NONE";

export type HypothesisRole =
    | "witness"
    | "control"
    | "pathfinder"
    | "demonstration"
    | "exploratory"
    | "visualization";

export type BaselineStatus =
    | "CONFIRMED"
    | "FAILED"
    | "INCOMPLETE"
    | "INCONCLUSIVE"
    | "NOT_APPLICABLE";

export interface ExpectedSignature {
    primary_metric: string;
    expected_value: string;
    tolerance: string;
    pass_rule: string;
}

export interface BaselineHypothesis {
    hypothesis_id: string;
    experiment_ids: string[];
    display_id: string;
    program: HypothesisProgram;
    role: HypothesisRole;
    plain_statement: string;
    object_under_test: string;
    expected_signature: ExpectedSignature;
    why_this_matters: string;
    failure_means: string[];
    failure_does_not_mean: string[];
    possible_alternative_hypotheses: string[];
    candidate_lemma_name?: string;
    intended_inference_if_passed?: string[];
    disallowed_conclusions?: string[];
}

export interface HypothesisRegistry {
    schema_version: string;
    byHypothesisId: Record<string, BaselineHypothesis>;
    byExperimentId: Record<string, BaselineHypothesis>;
    byDisplayId: Record<string, BaselineHypothesis>;
    all: BaselineHypothesis[];
    sources: string[];
}

export const REGISTRY_FILES = [
    "program_1.json",
    "program_2.json",
    "controls.json",
    "pathfinders.json",
    "demonstrations.json",
] as const;

export const REQUIRED_EXPERIMENT_IDS = [
    "EXP_0",
    "EXP_1",
    "EXP_1B",
    "EXP_1C",
    "EXP_2",
    "EXP_2B",
    "EXP_3",
    "EXP_4",
    "EXP_5",
    "EXP_6",
    "EXP_7",
    "EXP_8",
    "EXP_9",
    "EXP_10",
] as const;

const VALID_ROLES: ReadonlySet<HypothesisRole> = new Set([
    "witness",
    "control",
    "pathfinder",
    "demonstration",
    "exploratory",
    "visualization",
]);

const VALID_PROGRAMS: ReadonlySet<HypothesisProgram> = new Set([
    "PROGRAM_1",
    "PROGRAM_2",
    "NONE",
]);

function registryDir(repoRoot: string): string {
    return path.join(repoRoot, "proof_kernel", "hypotheses");
}

let cached: { repoRoot: string; overlayFingerprint: string; registry: HypothesisRegistry } | null = null;

const OVERLAY_FILENAME = "_accepted_overlays.json";

function overlayFingerprint(repoRoot: string): string {
    const fp = path.join(registryDir(repoRoot), OVERLAY_FILENAME);
    try {
        const stat = fs.statSync(fp);
        return `${stat.mtimeMs}:${stat.size}`;
    } catch {
        return "absent";
    }
}

interface OverlayEntry {
    proposal_id?: string;
    accepted_by?: string;
    accepted_at?: string;
    old_baseline_hash?: string;
    new_baseline_hash?: string;
    accepted_baseline?: Record<string, unknown>;
}

function readOverlayMap(repoRoot: string): Record<string, OverlayEntry> {
    const fp = path.join(registryDir(repoRoot), OVERLAY_FILENAME);
    if (!fs.existsSync(fp)) return {};
    try {
        const raw = JSON.parse(fs.readFileSync(fp, "utf-8")) as { overlays?: Record<string, OverlayEntry> };
        return raw.overlays ?? {};
    } catch {
        return {};
    }
}

function applyOverlays(
    base: HypothesisRegistry,
    repoRoot: string,
): HypothesisRegistry {
    const overlays = readOverlayMap(repoRoot);
    if (!Object.keys(overlays).length) return base;

    const byHyp: Record<string, BaselineHypothesis> = { ...base.byHypothesisId };
    const byExp: Record<string, BaselineHypothesis> = { ...base.byExperimentId };
    const byDisp: Record<string, BaselineHypothesis> = { ...base.byDisplayId };
    let all: BaselineHypothesis[] = [...base.all];

    for (const [hypId, ov] of Object.entries(overlays)) {
        const accepted = ov.accepted_baseline;
        if (!accepted || typeof accepted !== "object") continue;
        const previous = byHyp[hypId] ?? ({} as BaselineHypothesis);
        const merged = {
            ...previous,
            ...(accepted as Partial<BaselineHypothesis>),
            _overlay_provenance: {
                from_proposal_id: ov.proposal_id,
                accepted_by: ov.accepted_by,
                accepted_at: ov.accepted_at,
                old_baseline_hash: ov.old_baseline_hash,
                new_baseline_hash: ov.new_baseline_hash,
            },
        } as BaselineHypothesis & { _overlay_provenance: unknown };
        byHyp[hypId] = merged;
        for (const expId of merged.experiment_ids ?? []) byExp[expId] = merged;
        if (merged.display_id) byDisp[merged.display_id] = merged;
        const idx = all.findIndex((h) => h.hypothesis_id === hypId);
        if (idx >= 0) all[idx] = merged;
        else all = [...all, merged];
    }
    return {
        ...base,
        byHypothesisId: byHyp,
        byExperimentId: byExp,
        byDisplayId: byDisp,
        all,
    };
}

export function loadHypothesisRegistry(repoRoot: string = process.cwd()): HypothesisRegistry {
    const fingerprint = overlayFingerprint(repoRoot);
    if (cached && cached.repoRoot === repoRoot && cached.overlayFingerprint === fingerprint) {
        return cached.registry;
    }
    const dir = registryDir(repoRoot);
    const byHyp: Record<string, BaselineHypothesis> = {};
    const byExp: Record<string, BaselineHypothesis> = {};
    const byDisp: Record<string, BaselineHypothesis> = {};
    const all: BaselineHypothesis[] = [];
    const sources: string[] = [];

    for (const filename of REGISTRY_FILES) {
        const fp = path.join(dir, filename);
        if (!fs.existsSync(fp)) continue;
        sources.push(filename);
        let payload: { hypotheses?: BaselineHypothesis[] };
        try {
            payload = JSON.parse(fs.readFileSync(fp, "utf-8"));
        } catch (err) {
            throw new Error(`failed to parse ${filename}: ${(err as Error).message}`);
        }
        for (const entry of payload.hypotheses ?? []) {
            if (!entry.hypothesis_id) {
                throw new Error(`${filename}: hypothesis missing hypothesis_id`);
            }
            if (byHyp[entry.hypothesis_id]) {
                throw new Error(`duplicate hypothesis_id: ${entry.hypothesis_id}`);
            }
            if (!VALID_PROGRAMS.has(entry.program)) {
                throw new Error(`${entry.hypothesis_id}: invalid program ${entry.program}`);
            }
            if (!VALID_ROLES.has(entry.role)) {
                throw new Error(`${entry.hypothesis_id}: invalid role ${entry.role}`);
            }
            byHyp[entry.hypothesis_id] = entry;
            all.push(entry);
            if (entry.display_id) byDisp[entry.display_id] = entry;
            for (const expId of entry.experiment_ids ?? []) {
                if (byExp[expId]) {
                    throw new Error(
                        `experiment ${expId} mapped to multiple hypotheses: ${byExp[expId].hypothesis_id} and ${entry.hypothesis_id}`,
                    );
                }
                byExp[expId] = entry;
            }
        }
    }

    const baseRegistry: HypothesisRegistry = {
        schema_version: HYPOTHESIS_REGISTRY_SCHEMA_VERSION,
        byHypothesisId: byHyp,
        byExperimentId: byExp,
        byDisplayId: byDisp,
        all,
        sources,
    };
    const registry = applyOverlays(baseRegistry, repoRoot);
    cached = { repoRoot, overlayFingerprint: fingerprint, registry };
    return registry;
}

export function clearHypothesisRegistryCache(): void {
    cached = null;
}

export function getBaselineForExperiment(
    expId: string,
    repoRoot: string = process.cwd(),
): BaselineHypothesis | null {
    return loadHypothesisRegistry(repoRoot).byExperimentId[expId] ?? null;
}

export function getBaselineByHypothesisId(
    id: string,
    repoRoot: string = process.cwd(),
): BaselineHypothesis | null {
    return loadHypothesisRegistry(repoRoot).byHypothesisId[id] ?? null;
}

export function listBaselineHypotheses(
    repoRoot: string = process.cwd(),
): BaselineHypothesis[] {
    return loadHypothesisRegistry(repoRoot).all;
}

export interface HypothesisCoverageReport {
    covered: boolean;
    missing: string[];
    extra: string[];
    total: number;
    required: readonly string[];
}

export function hypothesisCoverageReport(
    repoRoot: string = process.cwd(),
): HypothesisCoverageReport {
    const reg = loadHypothesisRegistry(repoRoot);
    const present = new Set(Object.keys(reg.byExperimentId));
    const missing = REQUIRED_EXPERIMENT_IDS.filter((id) => !present.has(id));
    const extra = Array.from(present).filter(
        (id) => !(REQUIRED_EXPERIMENT_IDS as readonly string[]).includes(id),
    );
    return {
        covered: missing.length === 0,
        missing,
        extra,
        total: present.size,
        required: REQUIRED_EXPERIMENT_IDS,
    };
}

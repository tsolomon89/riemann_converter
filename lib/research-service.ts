import fs from "fs";
import path from "path";
import type { ExperimentsData, VerdictHistoryEntry } from "./types";
import type { WitnessMapStatus } from "./research-types";

const ARTIFACT_PATHS = [
    path.join(process.cwd(), "public", "experiments.json"),
    path.join(process.cwd(), "dashboard", "public", "experiments.json"),
];

const HISTORY_PATHS = [
    path.join(process.cwd(), "public", "verdict_history.jsonl"),
    path.join(process.cwd(), "dashboard", "public", "verdict_history.jsonl"),
];

const readFirstExisting = (candidates: string[]) => {
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
};

export const readArtifact = (): ExperimentsData => {
    const artifactPath = readFirstExisting(ARTIFACT_PATHS);
    if (!artifactPath) throw new Error("experiments.json not found.");
    const raw = fs.readFileSync(artifactPath, "utf8");
    return JSON.parse(raw) as ExperimentsData;
};

export const readHistory = (): VerdictHistoryEntry[] => {
    const historyPath = readFirstExisting(HISTORY_PATHS);
    if (!historyPath) return [];
    const raw = fs.readFileSync(historyPath, "utf8");
    return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            try {
                return JSON.parse(line) as VerdictHistoryEntry;
            } catch {
                return null;
            }
        })
        .filter((entry): entry is VerdictHistoryEntry => entry !== null);
};

export const resolveWitnessMapStatus = (artifact?: ExperimentsData): WitnessMapStatus => {
    const raw = artifact?.summary?.proof_program?.witness_map_review?.status;
    if (raw === "SIGNED_OFF") return "SIGNED_OFF";
    return "PENDING_SIGNOFF";
};


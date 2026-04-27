import fs from "fs";
import path from "path";
import type { ExperimentsData, VerdictHistoryEntry } from "./types";
import type { ProgramDocSection, WitnessMapStatus } from "./research-types";

const ARTIFACT_PATHS = [
    path.join(process.cwd(), "public", "experiments.json"),
];

const HISTORY_PATHS = [
    path.join(process.cwd(), "public", "verdict_history.jsonl"),
];

type ProgramDocSource = {
    id: string;
    title: string;
    sourceFile: string;
    sourceHeading: string;
};

const PROGRAM_DOC_SOURCES: ProgramDocSource[] = [
    {
        id: "readme-core-framing",
        title: "Core framing",
        sourceFile: "README.md",
        sourceHeading: "Riemann Scale-Gauge Research Instrument",
    },
    {
        id: "readme-prior-work",
        title: "Relationship to prior work",
        sourceFile: "README.md",
        sourceHeading: "Relationship to prior work",
    },
    {
        id: "alignment-proof-target",
        title: "What we are trying to prove",
        sourceFile: "agent_context/project_alignment.md",
        sourceHeading: "What you are actually trying to prove",
    },
];

const readFirstExisting = (candidates: string[]) => {
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
};

let cachedArtifact: ExperimentsData | null = null;

export const readArtifact = (): ExperimentsData => {
    const availablePaths = ARTIFACT_PATHS.filter((candidate) => fs.existsSync(candidate));
    if (availablePaths.length === 0) throw new Error("experiments.json not found.");

    const errors: string[] = [];
    for (const artifactPath of availablePaths) {
        try {
            const raw = fs.readFileSync(artifactPath, "utf8");
            const parsed = JSON.parse(raw) as ExperimentsData;
            cachedArtifact = parsed;
            return parsed;
        } catch (err) {
            errors.push(`${path.basename(artifactPath)} => ${String(err)}`);
        }
    }

    if (cachedArtifact) return cachedArtifact;
    throw new Error(`Unable to parse artifact JSON (${errors.join(" | ")})`);
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

const normalizeHeading = (value: string): string =>
    value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[`*_#]/g, "")
        .replace(/[^\w\s-]/g, "")
        .trim();

const extractMarkdownSection = (markdown: string, targetHeading: string): string | null => {
    const lines = markdown.split(/\r?\n/);
    const wanted = normalizeHeading(targetHeading);
    let start = -1;
    let level = 0;

    for (let idx = 0; idx < lines.length; idx += 1) {
        const line = lines[idx].trim();
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (!match) continue;
        const headingText = match[2].trim();
        if (normalizeHeading(headingText) === wanted) {
            start = idx + 1;
            level = match[1].length;
            break;
        }
    }

    if (start < 0) return null;

    let end = lines.length;
    for (let idx = start; idx < lines.length; idx += 1) {
        const line = lines[idx].trim();
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (!match) continue;
        const headingLevel = match[1].length;
        const shouldStop = level === 1 ? true : headingLevel <= level;
        if (shouldStop) {
            end = idx;
            break;
        }
    }

    const body = lines.slice(start, end).join("\n").trim();
    return body.length > 0 ? body : null;
};

export const readProgramDocsSections = (): ProgramDocSection[] => {
    const sections: ProgramDocSection[] = [];

    for (const source of PROGRAM_DOC_SOURCES) {
        const absolutePath = path.join(process.cwd(), source.sourceFile);
        if (!fs.existsSync(absolutePath)) continue;

        const raw = fs.readFileSync(absolutePath, "utf8");
        const section = extractMarkdownSection(raw, source.sourceHeading);
        if (!section) continue;

        const stat = fs.statSync(absolutePath);
        sections.push({
            id: source.id,
            title: source.title,
            source_file: source.sourceFile,
            source_heading: source.sourceHeading,
            markdown: section,
            updated_at: stat.mtime.toISOString(),
        });
    }

    return sections;
};

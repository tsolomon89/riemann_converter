import fs from "fs";
import path from "path";
import os from "os";
import { createHash } from "crypto";
import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import type {
    CanonicalRunMode,
    RunCancelPayload,
    RunEvent,
    RunEventsPayload,
    RunLogsPayload,
    RunPhase,
    RunProgress,
    RunResumePayload,
    RunStatus,
    RunStatusPayload,
} from "./research-types";

type SpawnFn = (command: string, args?: string[], options?: Parameters<typeof spawn>[2]) => ChildProcess;
type ActiveRunStatusPayload = RunStatusPayload & { run_id: string; started_at: string };

interface ModeBaseline {
    samples: number;
    mean_seconds: number;
    last_seconds: number;
}

interface CheckpointSnapshot {
    mode?: string;
    compatibility_hash?: string;
    config?: Record<string, unknown>;
}

interface RunRecord {
    id: string;
    mode?: string;
    status: RunStatus;
    started_at: string;
    finished_at?: string;
    exit_code?: number;
    logs: string;
    events: RunEvent[];
    progress: RunProgress;
    process: ChildProcess | null;
    line_buffer: string;
    cwd: string;
    checkpoint_path?: string;
    checkpoint_compatible?: boolean;
    checkpoint_reason?: string;
    expectation?: string;
    run_config?: Record<string, unknown>;
    prime_source_info?: Record<string, unknown>;
    phase_durations_seconds: Record<string, number>;
    mode_baseline_seconds?: number;
    log_file: string;
    events_file: string;
    status_file: string;
    heartbeat_timer: NodeJS.Timeout | null;
    force_kill_timer: NodeJS.Timeout | null;
}

export interface CustomRunConfig {
    run: string;
    zero_source?: string;
    zero_count?: number;
    dps?: number;
    resolution?: number;
    x_start?: number;
    x_end?: number;
    beta_offset?: number;
    k_power?: number;
    workers?: number;
    prime_min_count?: number;
    prime_target_count?: number;
}

interface RunState {
    runs: Map<string, RunRecord>;
    current_run_id: string | null;
}

declare global {
    var __researchRunState: RunState | undefined;
}

const RUN_EVENT_PREFIX = "@@RUN_EVENT@@";
const SCHEMA_VERSION = "2026.05.0";
const HEARTBEAT_MS = 5000;
const FORCE_KILL_MS = 6000;

let spawnImpl: SpawnFn = spawn as SpawnFn;

const getState = (): RunState => {
    if (!globalThis.__researchRunState) {
        globalThis.__researchRunState = {
            runs: new Map<string, RunRecord>(),
            current_run_id: null,
        };
    }
    return globalThis.__researchRunState;
};

const nowIso = () => new Date().toISOString();
const generateRunId = () => `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const toNumber = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const runtimeRoot = (cwd: string) => path.join(cwd, ".runtime");
const runsRoot = (cwd: string) => path.join(runtimeRoot(cwd), "runs");
const checkpointsRoot = (cwd: string) => path.join(runtimeRoot(cwd), "checkpoints");
const baselinesFile = (cwd: string) => path.join(runtimeRoot(cwd), "mode-baselines.json");

const checkpointPathForMode = (mode: string, cwd: string) =>
    path.join(checkpointsRoot(cwd), `canonical-${mode}.checkpoint.json`);

const hashCompatibilityPayload = (payload: Record<string, unknown>) => {
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    return createHash("sha256").update(canonical).digest("hex");
};

const defaultWorkerCount = () => Math.max(1, (os.cpus()?.length ?? 1) - 1);

const DEFAULT_RUN_KNOBS = {
    resolution: 500,
    x_start: null as number | null,
    x_end: null as number | null,
    beta_offset: 0.0001,
    k_power: -20,
    k_values: "0,1,2",
    n_test: 500,
};

const HANDOFF_X_RANGE = {
    x_start: 2,
    x_end: 50,
};

const CANONICAL_ZERO_100K_SOURCE = "file:data/zeros/nontrivial/zeros_100K_three_ten_power_neg_nine.gz";

const withDefaultRunKnobs = (payload: Record<string, unknown>, overrides: Partial<typeof DEFAULT_RUN_KNOBS> = {}) => ({
    ...payload,
    ...DEFAULT_RUN_KNOBS,
    ...overrides,
});

const expectedCompatibilityPayload = (mode: CanonicalRunMode): Record<string, unknown> => {
    if (mode === "verify") {
        return withDefaultRunKnobs({
            schema_version: SCHEMA_VERSION,
            run: "verify",
            quick: false,
            zero_source: "generated",
            zero_count: 20000,
            dps: 50,
            workers: defaultWorkerCount(),
            prime_min_count: 0,
            prime_target_count: 0,
        });
    }
    if (mode === "smoke") {
        return withDefaultRunKnobs({
            schema_version: SCHEMA_VERSION,
            run: "all",
            quick: true,
            zero_source: "generated",
            zero_count: 100,
            dps: 30,
            workers: defaultWorkerCount(),
            prime_min_count: 0,
            prime_target_count: 0,
        });
    }
    if (mode === "standard") {
        return withDefaultRunKnobs({
            schema_version: SCHEMA_VERSION,
            run: "all",
            quick: false,
            zero_source: "generated",
            zero_count: 2000,
            dps: 40,
            workers: defaultWorkerCount(),
            prime_min_count: 0,
            prime_target_count: 0,
        });
    }
    if (mode === "overkill") {
        return withDefaultRunKnobs({
            schema_version: SCHEMA_VERSION,
            run: "all",
            quick: false,
            zero_source: CANONICAL_ZERO_100K_SOURCE,
            zero_count: 20000,
            dps: 80,
            workers: defaultWorkerCount(),
            prime_min_count: 1_000_000,
            prime_target_count: 1_000_000,
        });
    }
    if (mode === "overkill_full") {
        return withDefaultRunKnobs({
            schema_version: SCHEMA_VERSION,
            run: "all",
            quick: false,
            zero_source: CANONICAL_ZERO_100K_SOURCE,
            zero_count: 20000,
            dps: 80,
            workers: defaultWorkerCount(),
            prime_min_count: 1_000_000,
            prime_target_count: 7_000_000,
        }, HANDOFF_X_RANGE);
    }
    return withDefaultRunKnobs({
        schema_version: SCHEMA_VERSION,
        run: "all",
        quick: false,
        zero_source: "generated",
        zero_count: 20000,
        dps: 50,
        workers: defaultWorkerCount(),
        prime_min_count: 0,
        prime_target_count: 0,
    });
};

const ensureRuntimeDirs = (cwd: string) => {
    fs.mkdirSync(runsRoot(cwd), { recursive: true });
    fs.mkdirSync(checkpointsRoot(cwd), { recursive: true });
};

const readJsonObject = <T>(filePath: string): T | null => {
    try {
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, "utf8").trim();
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
};

const appendJsonl = (filePath: string, payload: unknown) => {
    fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`);
};

const readJsonl = <T>(filePath: string): T[] => {
    try {
        if (!fs.existsSync(filePath)) return [];
        const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
        return lines.map((line) => JSON.parse(line) as T);
    } catch {
        return [];
    }
};

const readModeBaselines = (cwd: string): Record<string, ModeBaseline> =>
    readJsonObject<Record<string, ModeBaseline>>(baselinesFile(cwd)) ?? {};

const writeModeBaselines = (cwd: string, baselines: Record<string, ModeBaseline>) => {
    fs.writeFileSync(baselinesFile(cwd), JSON.stringify(baselines, null, 2));
};

const getModeExpectation = (mode: string | undefined): string | undefined => {
    if (!mode) return undefined;
    if (mode.startsWith("custom:")) {
        return "Custom sidebar run using selected experiments and parameter overrides.";
    }
    switch (mode) {
        case "verify":
            return "Re-grade existing artifact only (seconds).";
        case "smoke":
            return "Quick plumbing check (~1 min).";
        case "standard":
            return "Iterative-dev fidelity (~5 min).";
        case "authoritative":
            return "Reviewer-grade evidence run (20-40 min).";
        case "overkill":
            return "High-precision stress run (1h+).";
        case "overkill_full":
            return "High-precision stress run with full prime file (1h+).";
        default:
            return undefined;
    }
};

const normalizeCustomRunScope = (value: string | undefined): string | null => {
    const run = (value || "all").trim().toLowerCase();
    if (!run) return "all";
    return /^[a-z0-9_,.-]+$/.test(run) ? run : null;
};

const appendOptionalNumberArg = (
    args: string[],
    name: string,
    value: number | undefined,
) => {
    if (value === undefined) return;
    if (!Number.isFinite(value)) return;
    args.push(name, String(value));
};

const buildCustomRunArgs = (config: CustomRunConfig): string[] | null => {
    const runScope = normalizeCustomRunScope(config.run);
    if (!runScope) return null;
    const zeroSource = config.zero_source?.trim() || "generated";
    const args = [
        "-u",
        "experiment_engine.py",
        "--run",
        runScope,
        "--zero-source",
        zeroSource,
        "--emit-run-events",
    ];

    appendOptionalNumberArg(args, "--zero-count", config.zero_count);
    appendOptionalNumberArg(args, "--dps", config.dps);
    appendOptionalNumberArg(args, "--resolution", config.resolution);
    appendOptionalNumberArg(args, "--x-start", config.x_start);
    appendOptionalNumberArg(args, "--x-end", config.x_end);
    appendOptionalNumberArg(args, "--beta-offset", config.beta_offset);
    appendOptionalNumberArg(args, "--k-power", config.k_power);
    appendOptionalNumberArg(args, "--workers", config.workers);
    appendOptionalNumberArg(args, "--prime-min-count", config.prime_min_count);
    appendOptionalNumberArg(args, "--prime-target-count", config.prime_target_count);
    return args;
};

const canonicalArgsForMode = (
    mode: CanonicalRunMode,
    checkpointPath: string,
    resumeFromCheckpoint: boolean,
): string[] => {
    if (mode === "verify") {
        return ["-u", "verifier.py", "--emit-run-events"];
    }

    const common = [
        "-u",
        "experiment_engine.py",
        "--run",
        "all",
        "--emit-run-events",
        "--skip-unchanged",
        "--checkpoint-out",
        checkpointPath,
    ];
    if (resumeFromCheckpoint) {
        common.push("--resume-checkpoint", checkpointPath);
    }

    switch (mode) {
        case "smoke":
            return [...common, "--quick"];
        case "standard":
            return [...common, "--zero-count", "2000", "--dps", "40"];
        case "authoritative":
            return common;
        case "overkill":
            return [
                ...common,
                "--zero-source",
                CANONICAL_ZERO_100K_SOURCE,
                "--dps",
                "80",
                "--prime-min-count",
                "1000000",
                "--prime-target-count",
                "1000000",
            ];
        case "overkill_full":
            return [
                ...common,
                "--zero-source",
                CANONICAL_ZERO_100K_SOURCE,
                "--zero-count",
                "20000",
                "--dps",
                "80",
                "--resolution",
                "500",
                "--x-start",
                "2",
                "--x-end",
                "50",
                "--prime-min-count",
                "1000000",
                "--prime-target-count",
                "7000000",
            ];
    }
};

const createConflictError = () => ({
    status: 409 as const,
    error: "A run is already in progress.",
});

const createDefaultProgress = (): RunProgress => ({
    phase: "PRECHECK",
    completed_units: 0,
    total_units: 100,
    percent: 0,
    elapsed_seconds: 0,
    heartbeat_at: nowIso(),
});

const elapsedSeconds = (record: RunRecord) =>
    Math.max(
        0,
        (Date.now() - new Date(record.started_at).getTime()) / 1000,
    );

const safeWriteStatus = (record: RunRecord) => {
    const payload = {
        run_id: record.id,
        mode: record.mode,
        status: record.status,
        started_at: record.started_at,
        finished_at: record.finished_at,
        exit_code: record.exit_code,
        checkpoint_path: record.checkpoint_path,
        checkpoint_compatible: record.checkpoint_compatible,
        checkpoint_reason: record.checkpoint_reason,
        expectation: record.expectation,
        run_config: record.run_config,
        prime_source_info: record.prime_source_info,
        progress: record.progress,
        last_event_index: Math.max(0, record.events.length - 1),
        performance: {
            phase_durations_seconds: record.phase_durations_seconds,
            mode_baseline_seconds: record.mode_baseline_seconds,
        },
    };
    fs.writeFileSync(record.status_file, JSON.stringify(payload, null, 2));
};

const applyProgress = (
    record: RunRecord,
    update: Partial<RunProgress> & {
        completed_units?: number;
        total_units?: number;
        percent?: number;
    },
) => {
    const prev = record.progress;
    const elapsed = elapsedSeconds(record);

    let totalUnits = update.total_units ?? prev.total_units;
    if (!Number.isFinite(totalUnits) || totalUnits <= 0) totalUnits = prev.total_units || 100;

    let completedUnits = update.completed_units ?? prev.completed_units;
    if (!Number.isFinite(completedUnits) || completedUnits < 0) completedUnits = prev.completed_units;
    completedUnits = Math.min(completedUnits, totalUnits);

    const inferredPercent = (completedUnits / totalUnits) * 100;
    let nextPercent = update.percent ?? inferredPercent;
    if (!Number.isFinite(nextPercent)) nextPercent = prev.percent;
    nextPercent = clampPercent(nextPercent);
    // monotonic percent: never decrease
    nextPercent = Math.max(prev.percent, nextPercent);

    let etaSeconds = update.eta_seconds;
    if (etaSeconds === undefined) {
        if (nextPercent > 0 && nextPercent < 100) {
            etaSeconds = Math.max(0, (elapsed * (100 - nextPercent)) / nextPercent);
        } else if (record.mode_baseline_seconds !== undefined) {
            etaSeconds = Math.max(0, record.mode_baseline_seconds - elapsed);
        }
    }

    record.progress = {
        phase: update.phase ?? prev.phase,
        current_experiment: update.current_experiment ?? prev.current_experiment,
        completed_units: completedUnits,
        total_units: totalUnits,
        percent: nextPercent,
        eta_seconds: etaSeconds,
        elapsed_seconds: elapsed,
        heartbeat_at: nowIso(),
    };
};

const addEvent = (
    record: RunRecord,
    partial: Omit<RunEvent, "run_id" | "index" | "ts">,
) => {
    const event: RunEvent = {
        run_id: record.id,
        index: record.events.length,
        ts: nowIso(),
        ...partial,
    };

    if (
        event.phase !== undefined ||
        event.current_experiment !== undefined ||
        event.completed_units !== undefined ||
        event.total_units !== undefined ||
        event.percent !== undefined ||
        event.eta_seconds !== undefined
    ) {
        applyProgress(record, {
            phase: event.phase,
            current_experiment: event.current_experiment,
            completed_units: event.completed_units,
            total_units: event.total_units,
            percent: event.percent,
            eta_seconds: event.eta_seconds,
        });
        event.elapsed_seconds = record.progress.elapsed_seconds;
        event.eta_seconds = record.progress.eta_seconds;
        event.percent = record.progress.percent;
    }

    if (event.payload?.phase_duration_seconds && event.phase) {
        const duration = toNumber(event.payload.phase_duration_seconds);
        if (duration !== undefined) {
            record.phase_durations_seconds[event.phase] = duration;
        }
    }

    record.events.push(event);
    appendJsonl(record.events_file, event);
    safeWriteStatus(record);
    return event;
};

const appendRawLog = (record: RunRecord, line: string) => {
    record.logs += line;
    appendJsonl(record.log_file, { ts: nowIso(), line });
};

const parsePhase = (value: unknown): RunPhase | undefined => {
    if (typeof value !== "string") return undefined;
    const v = value.toUpperCase();
    if (
        v === "PRECHECK" ||
        v === "ZERO_LOAD" ||
        v === "EXPERIMENT_LOOP" ||
        v === "VERIFY" ||
        v === "ARTIFACT_WRITE" ||
        v === "DONE"
    ) {
        return v;
    }
    return undefined;
};

const handleStructuredEventLine = (record: RunRecord, line: string): boolean => {
    if (!line.startsWith(RUN_EVENT_PREFIX)) return false;
    const payloadRaw = line.slice(RUN_EVENT_PREFIX.length).trim();
    if (!payloadRaw) return false;
    try {
        const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
        const phase = parsePhase(payload.phase);
        const completedUnits = toNumber(payload.completed_units);
        const totalUnits = toNumber(payload.total_units);
        const percent = toNumber(payload.percent);
        const etaSeconds = toNumber(payload.eta_seconds);
        const currentExperiment =
            typeof payload.current_experiment === "string"
                ? payload.current_experiment
                : undefined;
        const state = typeof payload.state === "string" ? payload.state : undefined;
        const message = typeof payload.message === "string" ? payload.message : undefined;
        const kind = typeof payload.kind === "string" ? payload.kind : "PY_EVENT";
        const nestedPayload = asRecord(payload.payload);
        const payloadForConfig = nestedPayload ?? payload;

        const workers = toNumber(payloadForConfig.workers);
        const primeMinCount = toNumber(payloadForConfig.prime_min_count);
        const primeTargetCount = toNumber(payloadForConfig.prime_target_count);
        if (
            workers !== undefined ||
            primeMinCount !== undefined ||
            primeTargetCount !== undefined
        ) {
            record.run_config = {
                ...(record.run_config ?? {}),
                ...(workers !== undefined ? { workers } : {}),
                ...(primeMinCount !== undefined ? { prime_min_count: primeMinCount } : {}),
                ...(primeTargetCount !== undefined ? { prime_target_count: primeTargetCount } : {}),
            };
        }

        const primeSourceInfo =
            asRecord(payloadForConfig.prime_source_info) ?? asRecord(payload.prime_source_info);
        if (primeSourceInfo) {
            record.prime_source_info = primeSourceInfo;
        }

        addEvent(record, {
            kind,
            phase,
            state,
            message,
            current_experiment: currentExperiment,
            completed_units: completedUnits,
            total_units: totalUnits,
            percent,
            eta_seconds: etaSeconds,
            payload,
        });
        return true;
    } catch {
        appendRawLog(record, `${line}\n`);
        return true;
    }
};

const handleStdoutChunk = (record: RunRecord, chunk: string) => {
    const normalized = chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    record.line_buffer += normalized;
    const lines = record.line_buffer.split("\n");
    record.line_buffer = lines.pop() ?? "";
    for (const line of lines) {
        if (!handleStructuredEventLine(record, line)) {
            appendRawLog(record, `${line}\n`);
        }
    }
};

const flushStdoutBuffer = (record: RunRecord) => {
    if (!record.line_buffer) return;
    if (!handleStructuredEventLine(record, record.line_buffer)) {
        appendRawLog(record, `${record.line_buffer}\n`);
    }
    record.line_buffer = "";
};

const stopTimers = (record: RunRecord) => {
    if (record.heartbeat_timer) {
        clearInterval(record.heartbeat_timer);
        record.heartbeat_timer = null;
    }
    if (record.force_kill_timer) {
        clearTimeout(record.force_kill_timer);
        record.force_kill_timer = null;
    }
};

const updateModeBaseline = (record: RunRecord) => {
    if (!record.mode || record.status !== "SUCCEEDED") return;
    const elapsed = elapsedSeconds(record);
    const baselines = readModeBaselines(record.cwd);
    const prev = baselines[record.mode];
    if (!prev) {
        baselines[record.mode] = {
            samples: 1,
            mean_seconds: elapsed,
            last_seconds: elapsed,
        };
    } else {
        const samples = prev.samples + 1;
        const mean = ((prev.mean_seconds * prev.samples) + elapsed) / samples;
        baselines[record.mode] = {
            samples,
            mean_seconds: mean,
            last_seconds: elapsed,
        };
    }
    writeModeBaselines(record.cwd, baselines);
};

const markTerminal = (record: RunRecord, status: RunStatus, exitCode?: number) => {
    record.status = status;
    record.finished_at = nowIso();
    record.exit_code = exitCode;
    if (status === "SUCCEEDED") {
        applyProgress(record, {
            phase: "DONE",
            completed_units: record.progress.total_units,
            percent: 100,
        });
    }
    addEvent(record, {
        kind: "LIFECYCLE",
        phase: status === "SUCCEEDED" ? "DONE" : record.progress.phase,
        state: status.toLowerCase(),
        message: `[run] ${status.toLowerCase()}${exitCode !== undefined ? ` (code=${exitCode})` : ""}`,
        payload: { status, exit_code: exitCode },
    });
    updateModeBaseline(record);
    stopTimers(record);
    safeWriteStatus(record);
    const state = getState();
    if (state.current_run_id === record.id) {
        state.current_run_id = null;
    }
};

const startHeartbeat = (record: RunRecord) => {
    record.heartbeat_timer = setInterval(() => {
        if (!(record.status === "RUNNING" || record.status === "CANCELLING" || record.status === "QUEUED")) {
            stopTimers(record);
            return;
        }
        applyProgress(record, {});
        addEvent(record, {
            kind: "HEARTBEAT",
            phase: record.progress.phase,
            state: "tick",
            message: "still running",
            current_experiment: record.progress.current_experiment,
            completed_units: record.progress.completed_units,
            total_units: record.progress.total_units,
            percent: record.progress.percent,
            eta_seconds: record.progress.eta_seconds,
            payload: { still_running: true },
        });
    }, HEARTBEAT_MS);
};

const readCheckpointSnapshot = (checkpointPath: string): CheckpointSnapshot | null =>
    readJsonObject<CheckpointSnapshot>(checkpointPath);

const startProcess = (
    mode: string,
    args: string[],
    cwd: string,
    options?: {
        checkpoint_path?: string;
        checkpoint_compatible?: boolean;
        checkpoint_reason?: string;
        run_config?: Record<string, unknown>;
    },
): { run: RunRecord } | { status: 409; error: string } => {
    const state = getState();
    if (state.current_run_id) {
        const current = state.runs.get(state.current_run_id);
        if (
            current &&
            (current.status === "QUEUED" ||
                current.status === "RUNNING" ||
                current.status === "CANCELLING")
        ) {
            return createConflictError();
        }
    }

    ensureRuntimeDirs(cwd);
    const runId = generateRunId();
    const runDir = runsRoot(cwd);
    const statusPath = path.join(runDir, `${runId}.status.json`);
    const logsPath = path.join(runDir, `${runId}.logs.jsonl`);
    const eventsPath = path.join(runDir, `${runId}.events.jsonl`);
    const baselines = readModeBaselines(cwd);

    const run: RunRecord = {
        id: runId,
        mode,
        status: "QUEUED",
        started_at: nowIso(),
        logs: "",
        events: [],
        progress: createDefaultProgress(),
        process: null,
        line_buffer: "",
        cwd,
        checkpoint_path: options?.checkpoint_path,
        checkpoint_compatible: options?.checkpoint_compatible,
        checkpoint_reason: options?.checkpoint_reason,
        expectation: getModeExpectation(mode),
        run_config: options?.run_config,
        prime_source_info: undefined,
        phase_durations_seconds: {},
        mode_baseline_seconds: baselines[mode]?.mean_seconds,
        log_file: logsPath,
        events_file: eventsPath,
        status_file: statusPath,
        heartbeat_timer: null,
        force_kill_timer: null,
    };

    state.current_run_id = run.id;
    state.runs.set(run.id, run);

    addEvent(run, {
        kind: "LIFECYCLE",
        phase: "PRECHECK",
        state: "queued",
        message: `[run] queued mode=${mode}`,
        payload: {
            args,
            cwd,
            checkpoint_path: run.checkpoint_path,
            checkpoint_compatible: run.checkpoint_compatible,
        },
    });

    const child = spawnImpl("python", args, {
        cwd,
        env: {
            ...process.env,
            RIEMANN_RUN_ID: run.id,
            RIEMANN_RUN_EVENT_PREFIX: RUN_EVENT_PREFIX,
            RIEMANN_CANONICAL_MODE: mode,
        },
    });
    run.process = child;
    run.status = "RUNNING";
    appendRawLog(run, `[run] started args=${args.join(" ")} cwd=${cwd}\n`);
    addEvent(run, {
        kind: "LIFECYCLE",
        phase: "PRECHECK",
        state: "running",
        message: "[run] started",
        payload: { args, cwd },
    });
    startHeartbeat(run);

    child.stdout?.on("data", (data) => handleStdoutChunk(run, data.toString()));
    child.stderr?.on("data", (data) => appendRawLog(run, `[STDERR] ${data.toString()}`));

    child.on("error", (err) => {
        appendRawLog(run, `[run] failed to start: ${err.message}\n`);
        markTerminal(run, "FAILED", -1);
    });

    child.on("close", (code) => {
        flushStdoutBuffer(run);
        appendRawLog(run, `[run] exited code=${typeof code === "number" ? code : -1}\n`);
        if (run.status === "CANCELLING") {
            markTerminal(run, "CANCELLED", typeof code === "number" ? code : -1);
            return;
        }
        const normalizedCode = typeof code === "number" ? code : -1;
        markTerminal(run, normalizedCode === 0 ? "SUCCEEDED" : "FAILED", normalizedCode);
    });

    return { run };
};

const toRunStatus = (run: RunRecord): ActiveRunStatusPayload => ({
    run_id: run.id,
    mode: run.mode,
    status: run.status,
    started_at: run.started_at,
    finished_at: run.finished_at,
    exit_code: run.exit_code,
    progress: run.progress,
    checkpoint_path: run.checkpoint_path,
    checkpoint_compatible: run.checkpoint_compatible,
    checkpoint_reason: run.checkpoint_reason,
    expectation: run.expectation,
    run_config: run.run_config,
    prime_source_info: run.prime_source_info,
    last_event_index: Math.max(0, run.events.length - 1),
    performance: {
        phase_durations_seconds: run.phase_durations_seconds,
        mode_baseline_seconds: run.mode_baseline_seconds,
    },
});

const hydrateStatusFromDisk = (runId: string, cwd = process.cwd()): ActiveRunStatusPayload | null => {
    const statusPath = path.join(runsRoot(cwd), `${runId}.status.json`);
    const status = readJsonObject<ActiveRunStatusPayload>(statusPath);
    if (!status) return null;
    return status;
};

const hydrateLogsFromDisk = (runId: string, cwd = process.cwd()) => {
    const logPath = path.join(runsRoot(cwd), `${runId}.logs.jsonl`);
    const rows = readJsonl<{ line?: string }>(logPath);
    const combined = rows.map((r) => r.line ?? "").join("");
    return combined;
};

const hydrateEventsFromDisk = (runId: string, cwd = process.cwd()): RunEvent[] => {
    const eventsPath = path.join(runsRoot(cwd), `${runId}.events.jsonl`);
    return readJsonl<RunEvent>(eventsPath);
};

const resolveCheckpointCompatibility = (
    mode: CanonicalRunMode,
    cwd: string,
): {
    checkpoint_path: string;
    compatible: boolean;
    reason?: string;
} => {
    const checkpointPath = checkpointPathForMode(mode, cwd);
    if (mode === "verify") {
        return {
            checkpoint_path: checkpointPath,
            compatible: true,
            reason: "verify mode does not require checkpoints",
        };
    }
    if (!fs.existsSync(checkpointPath)) {
        return {
            checkpoint_path: checkpointPath,
            compatible: false,
            reason: "checkpoint file not found",
        };
    }
    const snapshot = readCheckpointSnapshot(checkpointPath);
    if (!snapshot) {
        return {
            checkpoint_path: checkpointPath,
            compatible: false,
            reason: "checkpoint file unreadable",
        };
    }
    if (snapshot.mode && snapshot.mode !== mode) {
        return {
            checkpoint_path: checkpointPath,
            compatible: false,
            reason: `checkpoint mode mismatch (${snapshot.mode} != ${mode})`,
        };
    }
    const expectedHash = hashCompatibilityPayload(expectedCompatibilityPayload(mode));
    if (typeof snapshot.compatibility_hash === "string") {
        if (snapshot.compatibility_hash !== expectedHash) {
            return {
                checkpoint_path: checkpointPath,
                compatible: false,
                reason: "checkpoint compatibility hash mismatch",
            };
        }
    } else if (snapshot.config) {
        const configHash = hashCompatibilityPayload(snapshot.config);
        if (configHash !== expectedHash) {
            return {
                checkpoint_path: checkpointPath,
                compatible: false,
                reason: "checkpoint config mismatch",
            };
        }
    }
    return {
        checkpoint_path: checkpointPath,
        compatible: true,
    };
};

export const startCanonicalRun = (
    mode: CanonicalRunMode,
    cwd = process.cwd(),
): { run: ActiveRunStatusPayload } | { status: 409; error: string } => {
    const checkpointPath = checkpointPathForMode(mode, cwd);
    const args = canonicalArgsForMode(mode, checkpointPath, false);
    const started = startProcess(mode, args, cwd, {
        checkpoint_path: checkpointPath,
        checkpoint_compatible: fs.existsSync(checkpointPath),
        checkpoint_reason: fs.existsSync(checkpointPath) ? undefined : "checkpoint will be created on run",
    });
    if ("status" in started) return started;
    return { run: toRunStatus(started.run) };
};

export const resumeCanonicalRun = (
    mode: CanonicalRunMode,
    cwd = process.cwd(),
): { run: RunResumePayload } | { status: 404 | 409; error: string } => {
    const compatibility = resolveCheckpointCompatibility(mode, cwd);
    if (!compatibility.compatible) {
        return {
            status: compatibility.reason === "checkpoint file not found" ? 404 : 409,
            error: compatibility.reason ?? "checkpoint is not compatible",
        };
    }
    const args = canonicalArgsForMode(mode, compatibility.checkpoint_path, true);
    const started = startProcess(mode, args, cwd, {
        checkpoint_path: compatibility.checkpoint_path,
        checkpoint_compatible: true,
    });
    if ("status" in started) return started;
    const run = toRunStatus(started.run);
    return {
        run: {
            run_id: run.run_id,
            mode,
            status: run.status,
            resumed_from_checkpoint: mode !== "verify",
            checkpoint_path: compatibility.checkpoint_path,
        },
    };
};

export const startCustomRun = (
    mode: string,
    args: string[],
    cwd = process.cwd(),
): { run: ActiveRunStatusPayload } | { status: 409; error: string } => {
    const started = startProcess(mode, args, cwd);
    if ("status" in started) return started;
    return { run: toRunStatus(started.run) };
};

export const startConfiguredRun = (
    config: CustomRunConfig,
    cwd = process.cwd(),
): { run: ActiveRunStatusPayload } | { status: 400 | 409; error: string } => {
    const runScope = normalizeCustomRunScope(config.run);
    if (!runScope) {
        return {
            status: 400,
            error: "Invalid custom run scope.",
        };
    }
    const args = buildCustomRunArgs({ ...config, run: runScope });
    if (!args) {
        return {
            status: 400,
            error: "Invalid custom run configuration.",
        };
    }
    const started = startProcess(`custom:${runScope}`, args, cwd, {
        run_config: {
            ...config,
            run: runScope,
            zero_source: config.zero_source?.trim() || "generated",
        },
    });
    if ("status" in started) return started;
    return { run: toRunStatus(started.run) };
};

export const cancelRun = (
    runId?: string,
): { run: RunCancelPayload } | { status: 404 | 409; error: string } => {
    const state = getState();
    const id = runId ?? state.current_run_id ?? null;
    if (!id) return { status: 404, error: "Run not found." };
    const run = state.runs.get(id);
    if (!run) return { status: 404, error: "Run not found." };

    if (run.status === "CANCELLING") {
        return {
            run: {
                run_id: run.id,
                status: run.status,
                cancelled_at: nowIso(),
            },
        };
    }
    if (!(run.status === "RUNNING" || run.status === "QUEUED")) {
        return { status: 409, error: `Run is not cancellable in status=${run.status}.` };
    }

    run.status = "CANCELLING";
    addEvent(run, {
        kind: "CONTROL",
        state: "cancel_requested",
        message: "[run] cancellation requested",
        payload: { signal: "SIGTERM" },
    });

    if (run.process && !run.process.killed) {
        try {
            run.process.kill("SIGTERM");
        } catch {
            // no-op; close handler will settle
        }
        run.force_kill_timer = setTimeout(() => {
            if (run.process && !run.process.killed && run.status === "CANCELLING") {
                try {
                    run.process.kill("SIGKILL");
                    addEvent(run, {
                        kind: "CONTROL",
                        state: "force_kill",
                        message: "[run] force-killed after cancel grace period",
                        payload: { signal: "SIGKILL" },
                    });
                } catch {
                    // no-op
                }
            }
        }, FORCE_KILL_MS);
    }

    return {
        run: {
            run_id: run.id,
            status: run.status,
            cancelled_at: nowIso(),
        },
    };
};

export const getRunStatus = (runId?: string): ActiveRunStatusPayload | null => {
    const state = getState();
    const id = runId ?? state.current_run_id ?? null;
    if (!id) return null;
    const run = state.runs.get(id);
    if (run) return toRunStatus(run);
    return hydrateStatusFromDisk(id);
};

export const getRunLogs = (runId: string, from = 0): RunLogsPayload | null => {
    const state = getState();
    const run = state.runs.get(runId);
    const status = run?.status ?? hydrateStatusFromDisk(runId)?.status;
    if (!status) return null;

    const sourceLogs = run ? run.logs : hydrateLogsFromDisk(runId);
    const safeFrom = Number.isFinite(from) && from >= 0 ? Math.floor(from) : 0;
    const chunk = sourceLogs.slice(safeFrom);
    const next = sourceLogs.length;
    const done =
        (status === "SUCCEEDED" ||
            status === "FAILED" ||
            status === "CANCELLED") &&
        next <= safeFrom;
    return {
        run_id: runId,
        from: safeFrom,
        next,
        chunk,
        done,
        status,
    };
};

export const getRunEvents = (runId: string, from = 0): RunEventsPayload | null => {
    const state = getState();
    const run = state.runs.get(runId);
    const status = run?.status ?? hydrateStatusFromDisk(runId)?.status;
    if (!status) return null;
    const events = run ? run.events : hydrateEventsFromDisk(runId);
    const safeFrom = Number.isFinite(from) && from >= 0 ? Math.floor(from) : 0;
    const rows = events.slice(safeFrom);
    const next = events.length;
    const done =
        (status === "SUCCEEDED" ||
            status === "FAILED" ||
            status === "CANCELLED") &&
        next <= safeFrom;
    return {
        run_id: runId,
        from: safeFrom,
        next,
        events: rows,
        done,
        status,
    };
};

export const __setSpawnImplForTests = (fn: SpawnFn | null) => {
    spawnImpl = fn ?? (spawn as SpawnFn);
};

export const __resetRunStateForTests = () => {
    const state = getState();
    for (const run of state.runs.values()) {
        stopTimers(run);
    }
    globalThis.__researchRunState = {
        runs: new Map<string, RunRecord>(),
        current_run_id: null,
    };
};

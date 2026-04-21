import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import type { CanonicalRunMode, RunLogsPayload, RunStatus, RunStatusPayload } from "./research-types";

type SpawnFn = typeof spawn;

interface RunRecord {
    id: string;
    mode?: string;
    status: RunStatus;
    started_at: string;
    finished_at?: string;
    exit_code?: number;
    logs: string;
    process: ChildProcess | null;
}

interface RunState {
    runs: Map<string, RunRecord>;
    current_run_id: string | null;
}

declare global {
    var __researchRunState: RunState | undefined;
}

let spawnImpl: SpawnFn = spawn;

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

const canonicalArgsForMode = (mode: CanonicalRunMode): string[] => {
    switch (mode) {
        case "verify":
            return ["-u", "verifier.py"];
        case "smoke":
            return ["-u", "experiment_engine.py", "--run", "all", "--quick"];
        case "standard":
            return ["-u", "experiment_engine.py", "--run", "all", "--zero-count", "2000", "--dps", "40"];
        case "authoritative":
            return ["-u", "experiment_engine.py", "--run", "all"];
        case "overkill":
            return [
                "-u",
                "experiment_engine.py",
                "--run",
                "all",
                "--zero-source",
                "file:agent_context/zeros_100K_three_ten_power_neg_nine.gz",
                "--dps",
                "80",
            ];
    }
};

const createConflictError = () => ({
    status: 409 as const,
    error: "A run is already in progress.",
});

const appendLog = (record: RunRecord, line: string) => {
    record.logs += line;
};

const startProcess = (
    mode: string,
    args: string[],
    cwd: string,
): { run: RunRecord } | { status: 409; error: string } => {
    const state = getState();
    if (state.current_run_id) {
        const current = state.runs.get(state.current_run_id);
        if (current && (current.status === "QUEUED" || current.status === "RUNNING")) {
            return createConflictError();
        }
    }

    const run: RunRecord = {
        id: generateRunId(),
        mode,
        status: "QUEUED",
        started_at: nowIso(),
        logs: "",
        process: null,
    };
    appendLog(run, `[run] queued mode=${mode}\n`);

    state.current_run_id = run.id;
    state.runs.set(run.id, run);

    const child = spawnImpl("python", args, { cwd });
    run.process = child;
    run.status = "RUNNING";
    appendLog(run, `[run] started args=${args.join(" ")} cwd=${cwd}\n`);

    child.stdout.on("data", (data) => appendLog(run, data.toString()));
    child.stderr.on("data", (data) => appendLog(run, `[STDERR] ${data.toString()}`));
    child.on("error", (err) => {
        run.status = "FAILED";
        run.finished_at = nowIso();
        run.exit_code = -1;
        appendLog(run, `[run] failed to start: ${err.message}\n`);
        if (state.current_run_id === run.id) state.current_run_id = null;
    });
    child.on("close", (code) => {
        run.exit_code = typeof code === "number" ? code : -1;
        run.status = code === 0 ? "SUCCEEDED" : "FAILED";
        run.finished_at = nowIso();
        appendLog(run, `[run] exited code=${run.exit_code}\n`);
        if (state.current_run_id === run.id) state.current_run_id = null;
    });

    return { run };
};

export const startCanonicalRun = (
    mode: CanonicalRunMode,
    cwd = process.cwd(),
): { run: RunStatusPayload } | { status: 409; error: string } => {
    const started = startProcess(mode, canonicalArgsForMode(mode), cwd);
    if ("status" in started) return started;
    return { run: toRunStatus(started.run) };
};

export const startCustomRun = (
    mode: string,
    args: string[],
    cwd = process.cwd(),
): { run: RunStatusPayload } | { status: 409; error: string } => {
    const started = startProcess(mode, args, cwd);
    if ("status" in started) return started;
    return { run: toRunStatus(started.run) };
};

const toRunStatus = (run: RunRecord): RunStatusPayload => ({
    run_id: run.id,
    mode: run.mode,
    status: run.status,
    started_at: run.started_at,
    finished_at: run.finished_at,
    exit_code: run.exit_code,
});

export const getRunStatus = (runId?: string): RunStatusPayload | null => {
    const state = getState();
    const id = runId ?? state.current_run_id ?? null;
    if (!id) return null;
    const run = state.runs.get(id);
    if (!run) return null;
    return toRunStatus(run);
};

export const getRunLogs = (runId: string, from = 0): RunLogsPayload | null => {
    const state = getState();
    const run = state.runs.get(runId);
    if (!run) return null;
    const safeFrom = Number.isFinite(from) && from >= 0 ? Math.floor(from) : 0;
    const chunk = run.logs.slice(safeFrom);
    const next = run.logs.length;
    const done = (run.status === "SUCCEEDED" || run.status === "FAILED") && next <= safeFrom;
    return {
        run_id: runId,
        from: safeFrom,
        next,
        chunk,
        done,
        status: run.status,
    };
};

export const __setSpawnImplForTests = (fn: SpawnFn | null) => {
    spawnImpl = fn ?? spawn;
};

export const __resetRunStateForTests = () => {
    globalThis.__researchRunState = {
        runs: new Map<string, RunRecord>(),
        current_run_id: null,
    };
};

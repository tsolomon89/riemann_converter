"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Wind, Gauge, Play, Rocket, X, Square, RotateCcw } from "lucide-react";
import clsx from "clsx";

type Mode = "verify" | "smoke" | "standard" | "authoritative" | "overkill" | "overkill_full";
type RunStatus =
    | "IDLE"
    | "QUEUED"
    | "RUNNING"
    | "CANCELLING"
    | "CANCELLED"
    | "SUCCEEDED"
    | "FAILED";
type RunPhase =
    | "PRECHECK"
    | "ZERO_LOAD"
    | "EXPERIMENT_LOOP"
    | "VERIFY"
    | "ARTIFACT_WRITE"
    | "DONE";

interface RunProgress {
    phase: RunPhase;
    current_experiment?: string;
    completed_units: number;
    total_units: number;
    percent: number;
    eta_seconds?: number;
    elapsed_seconds: number;
    heartbeat_at: string;
}

interface RunStatusPayload {
    run_id?: string;
    mode?: string;
    status: RunStatus;
    started_at?: string;
    finished_at?: string;
    exit_code?: number;
    progress?: RunProgress;
    expectation?: string;
    run_config?: Record<string, unknown>;
    prime_source_info?: Record<string, unknown>;
}

interface RunLogsPayload {
    run_id: string;
    from: number;
    next: number;
    chunk: string;
    done: boolean;
    status: RunStatus;
}

interface RunEvent {
    run_id: string;
    index: number;
    ts: string;
    kind: string;
    phase?: RunPhase;
    state?: string;
    message?: string;
    current_experiment?: string;
    percent?: number;
}

interface RunEventsPayload {
    run_id: string;
    from: number;
    next: number;
    events: RunEvent[];
    done: boolean;
    status: RunStatus;
}

interface RunStartPayload {
    run_id: string;
    mode: Mode;
    status: RunStatus;
    started_at: string;
}

interface RunResumePayload {
    run_id: string;
    mode: Mode;
    status: RunStatus;
    resumed_from_checkpoint: boolean;
    checkpoint_path: string;
}

interface Envelope<T> {
    data: T;
}

interface Props {
    onFinished?: () => void;
    onExperimentCompleted?: (experimentId: string) => void;
}

const MODE_ORDER: Mode[] = ["verify", "smoke", "standard", "authoritative", "overkill", "overkill_full"];
const PHASE_ORDER: RunPhase[] = [
    "PRECHECK",
    "ZERO_LOAD",
    "EXPERIMENT_LOOP",
    "VERIFY",
    "ARTIFACT_WRITE",
    "DONE",
];
const ACTIVE_STATUSES = new Set<RunStatus>(["QUEUED", "RUNNING", "CANCELLING"]);
const RUN_ID_STORAGE_KEY = "riemann.active_run_id";
const MAX_TRANSIENT_POLL_FAILURES = 15;
const POLL_FAILURE_LOG_INTERVAL = 5;

const MODE_LABELS: Record<Mode, { label: string; icon: React.ReactNode; hint: string }> = {
    verify: {
        label: "Re-grade",
        icon: <RefreshCw size={12} />,
        hint: "Re-run verifier.py only against existing artifact (seconds). No recompute.",
    },
    smoke: {
        label: "Smoke",
        icon: <Wind size={12} />,
        hint: "100 zeros, dps=30 (~1 min). Plumbing check - expect noisy INCONCLUSIVE / INCONSISTENT outcomes; DO NOT cite as evidence.",
    },
    standard: {
        label: "Standard",
        icon: <Gauge size={12} />,
        hint: "2000 zeros, dps=40 (~5 min). Iterative-dev fidelity; reasonable signal but not reviewer-grade.",
    },
    authoritative: {
        label: "Authoritative",
        icon: <Play size={12} />,
        hint: "20k zeros, dps=50 (20-40 min). THE evidence run - cite these verdicts.",
    },
    overkill: {
        label: "Overkill",
        icon: <Rocket size={12} />,
        hint: "Odlyzko 100k zeros, dps=80 (1h+). Stress test against high-precision external source.",
    },
    overkill_full: {
        label: "Overkill Full",
        icon: <Rocket size={12} />,
        hint: "Odlyzko 100k zeros, dps=80, full prime file target (7M). Highest-stress runtime profile.",
    },
};

const terminalStatuses = new Set<RunStatus>(["SUCCEEDED", "FAILED", "CANCELLED"]);

const fmtSeconds = (value?: number) => {
    if (value === undefined || !Number.isFinite(value)) return "n/a";
    const rounded = Math.max(0, Math.floor(value));
    const m = Math.floor(rounded / 60);
    const s = rounded % 60;
    return `${m}m ${s}s`;
};

const parseRunIdFromLog = (line: string): string | null => {
    const m = line.match(/run_id=([a-zA-Z0-9_-]+)/);
    return m?.[1] ?? null;
};

const asMode = (value: unknown): Mode | null => {
    if (typeof value !== "string") return null;
    return MODE_ORDER.includes(value as Mode) ? (value as Mode) : null;
};

export default function RerunButton({ onFinished, onExperimentCompleted }: Props) {
    const [running, setRunning] = useState<Mode | null>(null);
    const [lastMode, setLastMode] = useState<Mode | null>(null);
    const [runId, setRunId] = useState<string | null>(null);
    const [runStatus, setRunStatus] = useState<RunStatusPayload | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [events, setEvents] = useState<RunEvent[]>([]);
    const [logsOpen, setLogsOpen] = useState(false);
    const [lastRunTimestamp, setLastRunTimestamp] = useState<string | null>(null);
    const [resumeReady, setResumeReady] = useState(false);
    const runAuthToken = process.env.NEXT_PUBLIC_RESEARCH_RUN_TOKEN?.trim();

    const logsOffsetRef = useRef(0);
    const eventsOffsetRef = useRef(0);
    const pollTimerRef = useRef<number | null>(null);
    const pollInFlightRef = useRef(false);
    const seenEventIdsRef = useRef<Set<string>>(new Set());
    const pollFailureCountRef = useRef(0);

    const requestHeaders = () => {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        if (runAuthToken) headers.Authorization = `Bearer ${runAuthToken}`;
        return headers;
    };

    const stopPolling = useCallback(() => {
        if (pollTimerRef.current !== null) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }, []);

    const resetRunBuffers = () => {
        logsOffsetRef.current = 0;
        eventsOffsetRef.current = 0;
        seenEventIdsRef.current = new Set();
        pollFailureCountRef.current = 0;
        setLogs([]);
        setEvents([]);
    };

    const appendLog = useCallback((line: string) => {
        setLogs((prev) => [...prev, line]);
    }, []);

    const recordPollFailure = useCallback((message: string) => {
        pollFailureCountRef.current += 1;
        const failures = pollFailureCountRef.current;
        if (failures === 1 || failures % POLL_FAILURE_LOG_INTERVAL === 0) {
            appendLog(`${message} [retry ${failures}/${MAX_TRANSIENT_POLL_FAILURES}]\n`);
        }
        if (failures >= MAX_TRANSIENT_POLL_FAILURES) {
            appendLog(`[ui] polling stopped after ${failures} consecutive failures\n`);
            stopPolling();
            setRunning(null);
            setRunStatus(null);
            return true;
        }
        return false;
    }, [appendLog, stopPolling]);

    const refreshManifestTimestamp = useCallback(async () => {
        try {
            const res = await fetch("/api/research/manifest", { cache: "no-store" });
            if (!res.ok) return;
            const payload = (await res.json()) as { data?: { last_run_timestamp?: string } };
            setLastRunTimestamp(payload.data?.last_run_timestamp ?? null);
        } catch {
            // best-effort
        }
    }, []);

    const pollRun = useCallback(async (targetRunId: string) => {
        if (pollInFlightRef.current) return;
        pollInFlightRef.current = true;
        try {
            const statusRes = await fetch(`/api/research/run?run_id=${encodeURIComponent(targetRunId)}`, {
                headers: runAuthToken ? { Authorization: `Bearer ${runAuthToken}` } : undefined,
                cache: "no-store",
            });
            if (!statusRes.ok) {
                const body = (await statusRes.json().catch(() => ({}))) as { error?: string };
                recordPollFailure(
                    `[ui] status poll failed (${statusRes.status}): ${body.error ?? "unknown"}`,
                );
                return;
            }
            pollFailureCountRef.current = 0;
            const statusPayload = (await statusRes.json()) as Envelope<RunStatusPayload>;
            const currentStatus = statusPayload.data;
            setRunStatus(currentStatus);

            const logsRes = await fetch(
                `/api/research/run/logs?run_id=${encodeURIComponent(targetRunId)}&from=${logsOffsetRef.current}`,
                {
                    headers: runAuthToken ? { Authorization: `Bearer ${runAuthToken}` } : undefined,
                    cache: "no-store",
                },
            );
            if (logsRes.ok) {
                const logsPayload = (await logsRes.json()) as Envelope<RunLogsPayload>;
                const page = logsPayload.data;
                if (page.chunk) {
                    appendLog(page.chunk);
                    const discovered = parseRunIdFromLog(page.chunk);
                    if (discovered && !runId) setRunId(discovered);
                }
                logsOffsetRef.current = page.next;
            }

            const eventsRes = await fetch(
                `/api/research/run/events?run_id=${encodeURIComponent(targetRunId)}&from=${eventsOffsetRef.current}`,
                {
                    headers: runAuthToken ? { Authorization: `Bearer ${runAuthToken}` } : undefined,
                    cache: "no-store",
                },
            );
            if (eventsRes.ok) {
                const eventsPayload = (await eventsRes.json()) as Envelope<RunEventsPayload>;
                const page = eventsPayload.data;
                if (page.events.length > 0) {
                    const uniqueEvents: RunEvent[] = [];
                    for (const event of page.events) {
                        const eventId = `${event.run_id}:${event.index}`;
                        if (seenEventIdsRef.current.has(eventId)) continue;
                        seenEventIdsRef.current.add(eventId);
                        uniqueEvents.push(event);
                    }
                    if (uniqueEvents.length > 0) {
                        setEvents((prev) => [...prev, ...uniqueEvents].slice(-80));
                        for (const event of uniqueEvents) {
                            if (
                                event.phase === "EXPERIMENT_LOOP" &&
                                event.state === "done_experiment" &&
                                event.current_experiment
                            ) {
                                onExperimentCompleted?.(event.current_experiment);
                            }
                        }
                    }
                }
                eventsOffsetRef.current = page.next;
            }

            if (terminalStatuses.has(currentStatus.status)) {
                stopPolling();
                setRunning(null);
                setResumeReady(currentStatus.status === "CANCELLED");
                if (currentStatus.status === "SUCCEEDED") {
                    onFinished?.();
                    await refreshManifestTimestamp();
                }
                appendLog(`[ui] run ${currentStatus.status.toLowerCase()}\n`);
            }
        } catch (err) {
            recordPollFailure(`[ui] poll error: ${String(err)}`);
        } finally {
            pollInFlightRef.current = false;
        }
    }, [
        appendLog,
        onExperimentCompleted,
        onFinished,
        recordPollFailure,
        refreshManifestTimestamp,
        runAuthToken,
        runId,
        stopPolling,
    ]);

    useEffect(() => {
        const status = runStatus?.status;
        const shouldPoll = !!runId && (running !== null || !!(status && ACTIVE_STATUSES.has(status)));
        if (!runId || !shouldPoll) return;
        stopPolling();
        void pollRun(runId);
        pollTimerRef.current = window.setInterval(() => {
            void pollRun(runId);
        }, 2000);
        return () => {
            stopPolling();
        };
    }, [pollRun, runId, running, runStatus?.status, stopPolling]);

    useEffect(() => () => stopPolling(), [stopPolling]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (runId) {
            window.sessionStorage.setItem(RUN_ID_STORAGE_KEY, runId);
        } else {
            window.sessionStorage.removeItem(RUN_ID_STORAGE_KEY);
        }
    }, [runId]);

    useEffect(() => {
        let cancelled = false;

        const attach = async () => {
            const tryLoad = async (candidateRunId?: string): Promise<RunStatusPayload | null> => {
                const query = candidateRunId
                    ? `?run_id=${encodeURIComponent(candidateRunId)}`
                    : "";
                const response = await fetch(`/api/research/run${query}`, {
                    headers: runAuthToken ? { Authorization: `Bearer ${runAuthToken}` } : undefined,
                    cache: "no-store",
                });
                if (!response.ok) return null;
                const body = (await response.json()) as Envelope<RunStatusPayload>;
                return body.data ?? null;
            };

            let status = await tryLoad();
            if (!status && typeof window !== "undefined") {
                const storedRunId = window.sessionStorage.getItem(RUN_ID_STORAGE_KEY) ?? undefined;
                if (storedRunId) status = await tryLoad(storedRunId);
            }
            if (!status || cancelled) return;

            const mode = asMode(status.mode);
            setRunStatus(status);
            setRunId(status.run_id ?? null);
            setLastMode(mode);
            setResumeReady(status.status === "CANCELLED");

            if (ACTIVE_STATUSES.has(status.status)) {
                setRunning(mode);
                setLogsOpen(true);
                appendLog(
                    `[ui] reattached to active run ${status.run_id ?? "(unknown)"} (${status.status.toLowerCase()})\n`,
                );
            }
        };

        void attach();

        return () => {
            cancelled = true;
        };
    }, [appendLog, runAuthToken]);

    const runMode = async (mode: Mode) => {
        if (running) return;
        setRunning(mode);
        setLastMode(mode);
        setResumeReady(false);
        setLogsOpen(true);
        resetRunBuffers();
        setRunStatus(null);
        appendLog(`[ui] starting ${mode}...\n`);
        try {
            const response = await fetch("/api/research/run", {
                method: "POST",
                headers: requestHeaders(),
                body: JSON.stringify({ mode }),
            });
            if (!response.ok) {
                const body = (await response.json().catch(() => ({}))) as { error?: string };
                appendLog(`[ui] request failed (${response.status}): ${body.error ?? "run request failed"}\n`);
                setRunning(null);
                return;
            }
            const payload = (await response.json()) as Envelope<RunStartPayload>;
            const started = payload.data;
            setRunId(started.run_id);
            setRunStatus(started);
            appendLog(`[ui] run started: ${started.run_id}\n`);
        } catch (err) {
            appendLog(`[ui] ERROR: ${String(err)}\n`);
            setRunning(null);
        }
    };

    const cancelActiveRun = async () => {
        if (!runId) return;
        try {
            const response = await fetch("/api/research/run/cancel", {
                method: "POST",
                headers: requestHeaders(),
                body: JSON.stringify({ run_id: runId }),
            });
            const body = (await response.json().catch(() => ({}))) as { error?: string; data?: { status?: string } };
            if (!response.ok) {
                appendLog(`[ui] cancel failed (${response.status}): ${body.error ?? "cancel failed"}\n`);
                return;
            }
            appendLog(`[ui] cancel requested for run_id=${runId}\n`);
            setRunStatus((prev) => (prev ? { ...prev, status: "CANCELLING" } : prev));
        } catch (err) {
            appendLog(`[ui] cancel error: ${String(err)}\n`);
        }
    };

    const resumeLastMode = async () => {
        if (!lastMode || running) return;
        setLogsOpen(true);
        resetRunBuffers();
        appendLog(`[ui] resuming ${lastMode} from checkpoint...\n`);
        try {
            const response = await fetch("/api/research/run/resume", {
                method: "POST",
                headers: requestHeaders(),
                body: JSON.stringify({ mode: lastMode }),
            });
            const body = (await response.json().catch(() => ({}))) as Envelope<RunResumePayload> & {
                error?: string;
            };
            if (!response.ok) {
                appendLog(`[ui] resume failed (${response.status}): ${body.error ?? "resume failed"}\n`);
                return;
            }
            const resumed = body.data;
            setRunning(resumed.mode);
            setRunId(resumed.run_id);
            setRunStatus({
                run_id: resumed.run_id,
                mode: resumed.mode,
                status: resumed.status,
            });
            setResumeReady(false);
            appendLog(`[ui] resumed run: ${resumed.run_id}\n`);
        } catch (err) {
            appendLog(`[ui] resume error: ${String(err)}\n`);
        }
    };

    const activePhase = runStatus?.progress?.phase;
    const heartbeatAgeSec = runStatus?.progress?.heartbeat_at
        ? Math.max(
              0,
              Math.floor((Date.now() - new Date(runStatus.progress.heartbeat_at).getTime()) / 1000),
          )
        : undefined;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
                {MODE_ORDER.map((mode) => {
                    const meta = MODE_LABELS[mode];
                    const isActive = running === mode;
                    const disabled = running !== null && !isActive;
                    return (
                        <button
                            key={mode}
                            onClick={() => runMode(mode)}
                            disabled={disabled}
                            title={meta.hint}
                            className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[10px] font-mono uppercase tracking-wider transition-all",
                                isActive
                                    ? "bg-blue-900/40 border-blue-500/50 text-blue-200"
                                    : disabled
                                      ? "bg-gray-900/40 border-white/5 text-gray-600 cursor-not-allowed"
                                      : "bg-gray-900/40 border-white/10 text-gray-300 hover:border-blue-500/40 hover:text-blue-200",
                            )}
                        >
                            <span className={clsx(isActive && "animate-spin")}>{meta.icon}</span>
                            {isActive ? `${meta.label}...` : meta.label}
                        </button>
                    );
                })}

                {running && runId && (
                    <button
                        onClick={cancelActiveRun}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[10px] font-mono uppercase tracking-wider transition-all bg-red-900/30 border-red-500/50 text-red-200 hover:bg-red-900/50"
                        title="Cancel active run"
                    >
                        <Square size={11} />
                        Cancel
                    </button>
                )}

                {!running && resumeReady && lastMode && (
                    <button
                        onClick={resumeLastMode}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[10px] font-mono uppercase tracking-wider transition-all bg-amber-900/20 border-amber-500/50 text-amber-200 hover:bg-amber-900/40"
                        title="Resume from checkpoint"
                    >
                        <RotateCcw size={11} />
                        Resume
                    </button>
                )}
            </div>

            {runStatus && (
                <div className="rounded-md border border-white/10 bg-black/40 p-3 text-[10px] font-mono text-gray-300 space-y-2">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>Status: <strong>{runStatus.status}</strong></span>
                        <span>Mode: <strong>{runStatus.mode ?? running ?? "-"}</strong></span>
                        <span>Run ID: <strong>{runStatus.run_id ?? runId ?? "-"}</strong></span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-400">
                        <span>Progress: {runStatus.progress ? `${runStatus.progress.percent.toFixed(1)}%` : "n/a"}</span>
                        <span>Elapsed: {fmtSeconds(runStatus.progress?.elapsed_seconds)}</span>
                        <span>ETA: {fmtSeconds(runStatus.progress?.eta_seconds)}</span>
                        <span>Heartbeat: {heartbeatAgeSec !== undefined ? `${heartbeatAgeSec}s ago` : "n/a"}</span>
                        {typeof runStatus.run_config?.workers === "number" && (
                            <span>Workers: {runStatus.run_config.workers}</span>
                        )}
                        {typeof runStatus.run_config?.prime_min_count === "number" && (
                            <span>Prime Min: {runStatus.run_config.prime_min_count}</span>
                        )}
                        {typeof runStatus.run_config?.prime_target_count === "number" && (
                            <span>Prime Target: {runStatus.run_config.prime_target_count}</span>
                        )}
                    </div>
                    {runStatus.progress?.current_experiment && (
                        <div className="text-blue-200">
                            Active experiment: {runStatus.progress.current_experiment}
                        </div>
                    )}
                    {runStatus.prime_source_info && (
                        <div className="text-[10px] text-gray-400">
                            Prime source: {String(runStatus.prime_source_info.source_kind ?? "unknown")}
                            {typeof runStatus.prime_source_info.loaded_count === "number" ? `, loaded=${runStatus.prime_source_info.loaded_count}` : ""}
                            {typeof runStatus.prime_source_info.max_prime === "number" ? `, max=${runStatus.prime_source_info.max_prime}` : ""}
                            {typeof runStatus.prime_source_info.bad_rows === "number" ? `, bad_rows=${runStatus.prime_source_info.bad_rows}` : ""}
                        </div>
                    )}
                    {runStatus.expectation && (
                        <div className="text-[10px] text-gray-400 italic">Expectation: {runStatus.expectation}</div>
                    )}

                    <div className="flex flex-wrap gap-1">
                        {PHASE_ORDER.map((phase) => {
                            const currentIndex = activePhase ? PHASE_ORDER.indexOf(activePhase) : -1;
                            const idx = PHASE_ORDER.indexOf(phase);
                            const complete =
                                runStatus.status === "SUCCEEDED"
                                    ? true
                                    : currentIndex >= 0 && idx < currentIndex;
                            const active = phase === activePhase;
                            return (
                                <span
                                    key={phase}
                                    className={clsx(
                                        "px-1.5 py-0.5 rounded border",
                                        active
                                            ? "border-blue-500/60 bg-blue-900/30 text-blue-200"
                                            : complete
                                              ? "border-emerald-500/50 bg-emerald-900/20 text-emerald-200"
                                              : "border-white/10 bg-gray-900/30 text-gray-500",
                                    )}
                                >
                                    {phase}
                                </span>
                            );
                        })}
                    </div>

                    {lastRunTimestamp && runStatus.status === "SUCCEEDED" && (
                        <div className="text-emerald-200">
                            Artifact updated at: {lastRunTimestamp}
                        </div>
                    )}
                </div>
            )}

            {logsOpen && (logs.length > 0 || events.length > 0) && (
                <div className="bg-black/60 border border-white/10 rounded-md p-3 max-h-64 overflow-y-auto text-[10px] font-mono text-gray-300 relative space-y-2">
                    <button
                        onClick={() => setLogsOpen(false)}
                        className="absolute top-1 right-1 text-gray-500 hover:text-gray-200"
                        title="Hide log panel"
                    >
                        <X size={12} />
                    </button>

                    {events.length > 0 && (
                        <div className="border-b border-white/10 pb-2 mb-2">
                            <div className="text-gray-500 uppercase tracking-wider mb-1">Recent Events</div>
                            {events.slice(-6).map((event) => (
                                <div key={`${event.run_id}-${event.index}-${event.ts}`} className="text-gray-400">
                                    [{event.phase ?? "RUN"}] {event.state ?? event.kind} {event.message ?? ""}
                                    {event.percent !== undefined ? ` (${event.percent.toFixed(1)}%)` : ""}
                                </div>
                            ))}
                        </div>
                    )}

                    <pre className="whitespace-pre-wrap">{logs.join("")}</pre>
                </div>
            )}
        </div>
    );
}

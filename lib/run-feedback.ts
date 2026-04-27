import type { RunEvent, RunStatus, RunStatusPayload } from "./research-types";

export type RunLogSource = "stream" | "api" | null;

export const ACTIVE_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
    "QUEUED",
    "RUNNING",
    "CANCELLING",
]);

export const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
]);

export const isActiveRunStatus = (status: RunStatus | undefined): boolean =>
    status !== undefined && ACTIVE_RUN_STATUSES.has(status);

export const shouldAttachToActiveRun = (
    status: RunStatusPayload | null | undefined,
): status is RunStatusPayload & { run_id: string } =>
    typeof status?.run_id === "string" &&
    status.run_id.length > 0 &&
    isActiveRunStatus(status.status);

export const deriveRunActive = ({
    localStreamRunning,
    attachedStatus,
}: {
    localStreamRunning: boolean;
    attachedStatus: RunStatusPayload | null;
}): boolean => localStreamRunning || isActiveRunStatus(attachedStatus?.status);

export const shouldPollApiLogs = (source: RunLogSource): boolean => source === "api";

export const runEventKey = (event: Pick<RunEvent, "run_id" | "index">): string =>
    `${event.run_id}:${event.index}`;

export const appendUniqueRunEvents = (
    incoming: RunEvent[],
    seenEventIds: Set<string>,
): RunEvent[] => {
    const unique: RunEvent[] = [];
    for (const event of incoming) {
        const key = runEventKey(event);
        if (seenEventIds.has(key)) continue;
        seenEventIds.add(key);
        unique.push(event);
    }
    return unique;
};

import type { RunEvent, RunStatusPayload } from "../lib/research-types";
import {
    appendUniqueRunEvents,
    deriveRunActive,
    runEventKey,
    shouldAttachToActiveRun,
    shouldPollApiLogs,
} from "../lib/run-feedback";

describe("run feedback helpers", () => {
    it("identifies attachable active runs", () => {
        const active: RunStatusPayload = {
            run_id: "run_123",
            status: "RUNNING",
        };
        const idle: RunStatusPayload = {
            run_id: "run_999",
            status: "IDLE",
        };
        const missingId: RunStatusPayload = {
            status: "RUNNING",
        };

        expect(shouldAttachToActiveRun(active)).toBe(true);
        expect(shouldAttachToActiveRun(idle)).toBe(false);
        expect(shouldAttachToActiveRun(missingId)).toBe(false);
    });

    it("derives runActive from local stream state and attached status", () => {
        expect(deriveRunActive({ localStreamRunning: true, attachedStatus: null })).toBe(true);
        expect(
            deriveRunActive({
                localStreamRunning: false,
                attachedStatus: { status: "QUEUED", run_id: "run_1" },
            }),
        ).toBe(true);
        expect(
            deriveRunActive({
                localStreamRunning: false,
                attachedStatus: { status: "SUCCEEDED", run_id: "run_1" },
            }),
        ).toBe(false);
    });

    it("enforces stream-vs-api log source behavior", () => {
        expect(shouldPollApiLogs("api")).toBe(true);
        expect(shouldPollApiLogs("stream")).toBe(false);
        expect(shouldPollApiLogs(null)).toBe(false);
    });

    it("dedupes events by run_id:index", () => {
        const seen = new Set<string>();
        const e1: RunEvent = {
            run_id: "run_1",
            index: 1,
            ts: "2026-04-24T00:00:00.000Z",
            kind: "PROGRESS",
        };
        const e2: RunEvent = {
            run_id: "run_1",
            index: 2,
            ts: "2026-04-24T00:00:01.000Z",
            kind: "HEARTBEAT",
        };
        const dup: RunEvent = {
            run_id: "run_1",
            index: 1,
            ts: "2026-04-24T00:00:02.000Z",
            kind: "PROGRESS",
        };

        const first = appendUniqueRunEvents([e1, e2], seen);
        const second = appendUniqueRunEvents([dup], seen);

        expect(runEventKey(e1)).toBe("run_1:1");
        expect(first).toEqual([e1, e2]);
        expect(second).toEqual([]);
        expect(seen.size).toBe(2);
    });
});

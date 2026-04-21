import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";
import {
    __resetRunStateForTests,
    __setSpawnImplForTests,
    getRunLogs,
    getRunStatus,
    startCanonicalRun,
} from "../lib/run-manager";

class FakeChild extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
}

describe("run manager", () => {
    beforeEach(() => {
        __resetRunStateForTests();
        __setSpawnImplForTests(null);
    });

    afterEach(() => {
        __setSpawnImplForTests(null);
    });

    it("enforces single in-flight run", () => {
        const fake = new FakeChild();
        __setSpawnImplForTests(() => fake as unknown as ChildProcess);

        const started = startCanonicalRun("verify");
        expect("run" in started).toBe(true);
        if (!("run" in started)) return;

        const conflict = startCanonicalRun("smoke");
        expect("status" in conflict).toBe(true);
        if (!("status" in conflict)) return;
        expect(conflict.status).toBe(409);

        fake.emit("close", 0);
        const next = startCanonicalRun("smoke");
        expect("run" in next).toBe(true);
    });

    it("tracks deterministic status transitions and log pagination", () => {
        const fake = new FakeChild();
        __setSpawnImplForTests(() => fake as unknown as ChildProcess);

        const started = startCanonicalRun("verify");
        expect("run" in started).toBe(true);
        if (!("run" in started)) return;

        const runId = started.run.run_id;
        expect(getRunStatus(runId)?.status).toBe("RUNNING");

        fake.stdout.emit("data", Buffer.from("line-1\n"));
        fake.stderr.emit("data", Buffer.from("warn-1\n"));
        let page = getRunLogs(runId, 0);
        expect(page).not.toBeNull();
        if (!page) return;
        expect(page.chunk).toContain("line-1");
        const nextOffset = page.next;

        page = getRunLogs(runId, nextOffset);
        expect(page?.chunk ?? "").toBe("");

        fake.emit("close", 0);
        expect(getRunStatus(runId)?.status).toBe("SUCCEEDED");

        const donePage = getRunLogs(runId, getRunLogs(runId, 0)?.next ?? 0);
        expect(donePage?.done).toBe(true);
    });
});

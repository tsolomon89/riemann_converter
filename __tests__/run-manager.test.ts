import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {
    __resetRunStateForTests,
    __setSpawnImplForTests,
    cancelRun,
    getRunEvents,
    getRunLogs,
    getRunStatus,
    resumeCanonicalRun,
    startCanonicalRun,
} from "../lib/run-manager";

class FakeChild extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    killed = false;
    kill() {
        this.killed = true;
        return true;
    }
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
        fake.stdout.emit(
            "data",
            Buffer.from('@@RUN_EVENT@@{"kind":"CONFIG","phase":"PRECHECK","payload":{"workers":7,"prime_min_count":1000000,"prime_target_count":7000000}}\n'),
        );
        fake.stdout.emit(
            "data",
            Buffer.from('@@RUN_EVENT@@{"kind":"RESOURCE","phase":"EXPERIMENT_LOOP","payload":{"prime_source_info":{"source_kind":"prime_file","loaded_count":1000000,"max_prime":15485863,"bad_rows":2}}}\n'),
        );
        fake.stdout.emit(
            "data",
            Buffer.from('@@RUN_EVENT@@{"kind":"PROGRESS","phase":"EXPERIMENT_LOOP","completed_units":50,"total_units":100,"percent":47.5}\n'),
        );
        fake.stderr.emit("data", Buffer.from("warn-1\n"));
        let page = getRunLogs(runId, 0);
        expect(page).not.toBeNull();
        if (!page) return;
        expect(page.chunk).toContain("line-1");
        const nextOffset = page.next;

        page = getRunLogs(runId, nextOffset);
        expect(page?.chunk ?? "").toBe("");

        const events = getRunEvents(runId, 0);
        expect(events).not.toBeNull();
        expect(events?.events.some((event) => event.kind === "PROGRESS")).toBe(true);
        const status = getRunStatus(runId);
        expect(status?.run_config).toMatchObject({
            workers: 7,
            prime_min_count: 1000000,
            prime_target_count: 7000000,
        });
        expect(status?.prime_source_info).toMatchObject({
            source_kind: "prime_file",
            loaded_count: 1000000,
            max_prime: 15485863,
            bad_rows: 2,
        });

        fake.emit("close", 0);
        expect(getRunStatus(runId)?.status).toBe("SUCCEEDED");

        const donePage = getRunLogs(runId, getRunLogs(runId, 0)?.next ?? 0);
        expect(donePage?.done).toBe(true);
    });

    it("supports cancellation transitions", () => {
        const fake = new FakeChild();
        __setSpawnImplForTests(() => fake as unknown as ChildProcess);

        const started = startCanonicalRun("verify");
        expect("run" in started).toBe(true);
        if (!("run" in started)) return;
        const runId = started.run.run_id;

        const cancelled = cancelRun(runId);
        expect("run" in cancelled).toBe(true);
        if (!("run" in cancelled)) return;
        expect(cancelled.run.status).toBe("CANCELLING");

        fake.emit("close", 143);
        expect(getRunStatus(runId)?.status).toBe("CANCELLED");
    });

    it("resume returns a deterministic checkpoint error when missing", () => {
        const resumed = resumeCanonicalRun("overkill");
        expect("status" in resumed).toBe(true);
        if (!("status" in resumed)) return;
        expect([404, 409]).toContain(resumed.status);
    });

    it("resume rejects checkpoint config that omits new worker/prime fields", () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "riemann-runmgr-"));
        const checkpointDir = path.join(tmpRoot, ".runtime", "checkpoints");
        const checkpointPath = path.join(checkpointDir, "canonical-overkill.checkpoint.json");
        fs.mkdirSync(checkpointDir, { recursive: true });
        fs.writeFileSync(
            checkpointPath,
            JSON.stringify(
                {
                    schema_version: "2026.05.0",
                    mode: "overkill",
                    // Intentionally missing workers/prime policy to force compatibility mismatch.
                    config: {
                        schema_version: "2026.05.0",
                        run: "all",
                        quick: false,
                        zero_source: "file:data/zeros/nontrivial/zeros_100K_three_ten_power_neg_nine.gz",
                        zero_count: 20000,
                        dps: 80,
                    },
                },
                null,
                2,
            ),
        );

        try {
            const resumed = resumeCanonicalRun("overkill", tmpRoot);
            expect("status" in resumed).toBe(true);
            if (!("status" in resumed)) return;
            expect(resumed.status).toBe(409);
            expect(resumed.error).toMatch(/compatibility hash mismatch|config mismatch/);
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    it("overkill canonical args include 1M prime policy", () => {
        const fake = new FakeChild();
        let capturedArgs: string[] = [];
        __setSpawnImplForTests(
            ((...spawnArgs: unknown[]) => {
                capturedArgs = Array.isArray(spawnArgs[1]) ? [...(spawnArgs[1] as string[])] : [];
                return fake as unknown as ChildProcess;
            }) as unknown as Parameters<typeof __setSpawnImplForTests>[0],
        );

        const started = startCanonicalRun("overkill");
        expect("run" in started).toBe(true);
        expect(capturedArgs).toEqual(expect.arrayContaining([
            "--run",
            "all",
            "--prime-min-count",
            "1000000",
            "--prime-target-count",
            "1000000",
        ]));

        fake.emit("close", 0);
    });

    it("overkill_full canonical args include 7M prime target", () => {
        const fake = new FakeChild();
        let capturedArgs: string[] = [];
        __setSpawnImplForTests(
            ((...spawnArgs: unknown[]) => {
                capturedArgs = Array.isArray(spawnArgs[1]) ? [...(spawnArgs[1] as string[])] : [];
                return fake as unknown as ChildProcess;
            }) as unknown as Parameters<typeof __setSpawnImplForTests>[0],
        );

        const started = startCanonicalRun("overkill_full");
        expect("run" in started).toBe(true);
        expect(capturedArgs).toEqual(expect.arrayContaining([
            "--run",
            "all",
            "--prime-min-count",
            "1000000",
            "--prime-target-count",
            "7000000",
        ]));

        fake.emit("close", 0);
    });
});

/**
 * Local-fs fallback for the MCP bridge: when the Next.js HTTP endpoint is
 * unreachable, read-only tools should be answered from public/* artifacts.
 * Run-control tools should produce a visible `result` envelope (not a silent
 * JSON-RPC error) explaining the dev-server requirement.
 *
 * NOTE: this test loads `mcp-bridge.mjs` (ESM) via dynamic import. ts-jest
 * runs in CJS, so jest must be invoked with experimental VM modules enabled:
 *
 *   NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/mcp-bridge-fallback.test.ts
 *
 * The rest of the test suite does not need this flag.
 */

import path from "node:path";
import { pathToFileURL } from "node:url";

// ts-jest compiles to CJS and rewrites `import()` to `require()`. To actually
// load the ESM bridge module we have to bypass the transform with `eval`.
const loadBridge = async () => {
    const url = pathToFileURL(path.resolve(__dirname, "..", "mcp-bridge.mjs")).href;
    return await (0, eval)(`import("${url}")`);
};

describe("mcp-bridge local-fs fallback", () => {
    test("READ_ONLY_TOOLS membership", async () => {
        const { __test__ } = await loadBridge();
        for (const name of [
            "get_manifest",
            "get_theorem_candidate",
            "get_obligations",
            "get_obligation",
            "get_open_gaps",
            "get_implementation_health",
            "get_history",
            "get_experiment",
        ]) {
            expect(__test__.READ_ONLY_TOOLS.has(name)).toBe(true);
        }
    });

    test("RUN_CONTROL_TOOLS membership", async () => {
        const { __test__ } = await loadBridge();
        for (const name of [
            "start_run",
            "start_custom_run",
            "resume_run",
            "cancel_run",
            "get_run_status",
            "get_run_logs",
            "get_run_events",
        ]) {
            expect(__test__.RUN_CONTROL_TOOLS.has(name)).toBe(true);
        }
    });

    test("fallbackPayload(get_history) returns history array", async () => {
        const { __test__ } = await loadBridge();
        const out = __test__.fallbackPayload("get_history", { limit: 1 });
        expect(Array.isArray(out)).toBe(true);
        expect(out.length).toBeGreaterThanOrEqual(0);
    });

    test("fallbackPayload(get_manifest) exposes experiment display aliases", async () => {
        const { __test__ } = await loadBridge();
        const out = __test__.fallbackPayload("get_manifest", {});
        expect(out.experiment_aliases["CORE-1"]).toBe("EXP_1");
        expect(out.experiment_aliases["core-1"]).toBe("EXP_1");
        expect(out.experiment_aliases["DEMO-1"]).toBe("EXP_9");
        expect(out.experiments.some((exp: { stable_id?: string; display_id?: string }) =>
            exp.stable_id === "EXP_1" && exp.display_id === "CORE-1",
        )).toBe(true);
    });

    test("fallbackPayload(get_obligation) returns the requested obligation", async () => {
        const { __test__ } = await loadBridge();
        const out = __test__.fallbackPayload("get_obligation", { id: "OBL_BETA_INVARIANCE" });
        expect(out).not.toBeNull();
        expect(out.id).toBe("OBL_BETA_INVARIANCE");
        expect(Array.isArray(out.witnesses)).toBe(true);
    });

    test("fallbackPayload(get_experiment) reflects the current artifact state", async () => {
        const { __test__ } = await loadBridge();
        const out = __test__.fallbackPayload("get_experiment", { id: "EXP_6" });
        if (out === null) {
            expect(out).toBeNull();
            return;
        }
        expect(out.function).toBe("PROOF_OBLIGATION_WITNESS");
        expect(out.obligation_id).toBe("OBL_BETA_INVARIANCE");
        expect(out.mapping_provisional).toBe(true);
    });

    test("fallbackPayload(get_experiment) resolves display aliases", async () => {
        const { __test__ } = await loadBridge();
        const stable = __test__.fallbackPayload("get_experiment", { id: "EXP_1" });
        const alias = __test__.fallbackPayload("get_experiment", { id: "CORE-1" });
        expect(alias).toEqual(stable);
    });

    test("tryFallback emits a tools/call result for a read-only tool when HTTP is down", async () => {
        const { __test__ } = await loadBridge();
        const captured: string[] = [];
        const origLog = console.log;
        console.log = (s: string) => captured.push(s);
        try {
            const handled = __test__.tryFallback({
                jsonrpc: "2.0",
                id: 42,
                method: "tools/call",
                params: { name: "get_obligations", arguments: {} },
            });
            expect(handled).toBe(true);
        } finally {
            console.log = origLog;
        }
        expect(captured).toHaveLength(1);
        const parsed = JSON.parse(captured[0]);
        expect(parsed.id).toBe(42);
        expect(parsed.result.content[0].type).toBe("text");
        expect(parsed.result.content[0].text).toContain("mcp-bridge fallback");
        expect(parsed.result.isError).toBeUndefined();
    });

    test("tryFallback emits a visible isError result for a run-control tool when HTTP is down", async () => {
        const { __test__ } = await loadBridge();
        const captured: string[] = [];
        const origLog = console.log;
        console.log = (s: string) => captured.push(s);
        try {
            const handled = __test__.tryFallback({
                jsonrpc: "2.0",
                id: 99,
                method: "tools/call",
                params: { name: "start_run", arguments: { mode: "smoke" } },
            });
            expect(handled).toBe(true);
        } finally {
            console.log = origLog;
        }
        expect(captured).toHaveLength(1);
        const parsed = JSON.parse(captured[0]);
        expect(parsed.id).toBe(99);
        expect(parsed.result.isError).toBe(true);
        expect(parsed.result.content[0].text).toMatch(/start_run/);
        expect(parsed.result.content[0].text).toMatch(/npm run dev/);
    });

    test("tryFallback returns false (does not handle) for unknown tools", async () => {
        const { __test__ } = await loadBridge();
        const handled = __test__.tryFallback({
            jsonrpc: "2.0",
            id: 7,
            method: "tools/call",
            params: { name: "nonexistent_tool", arguments: {} },
        });
        expect(handled).toBe(false);
    });
});

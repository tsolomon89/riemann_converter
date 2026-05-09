/**
 * Local-fs fallback for the MCP bridge: when the Next.js HTTP endpoint is
 * unreachable, read-only tools should be answered from public/* artifacts.
 * Run-control tools should produce a visible `result` envelope (not a silent
 * JSON-RPC error) explaining the dev-server requirement.
 *
 * The bridge is ESM (.mjs). Rather than relying on Jest's experimental ESM
 * mode, this test boots the bridge in a long-lived Node child process and
 * communicates via newline-delimited JSON over stdin/stdout. As a result the
 * suite passes under both `npx jest` and `npm run test:js`.
 */

import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import path from "node:path";

interface LoaderRequest { id: number; op: string; args?: unknown[] }
interface LoaderResponse { id: number | "ready"; ok: boolean; result?: unknown; error?: string }

class BridgeLoader {
    private proc!: ChildProcessWithoutNullStreams;
    private buffer = "";
    private pending = new Map<number, (resp: LoaderResponse) => void>();
    private nextId = 1;
    private readyPromise: Promise<void>;

    constructor() {
        const loaderPath = path.resolve(__dirname, "_helpers", "mcp-bridge-loader.mjs");
        this.proc = spawn(process.execPath, [loaderPath], {
            cwd: path.resolve(__dirname, ".."),
            stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env },
        });
        this.proc.stderr.on("data", (chunk: Buffer) => {
            // Surface child-side errors so debugging the loader doesn't require digging.
            process.stderr.write(`[bridge-loader] ${chunk.toString()}`);
        });
        this.readyPromise = new Promise((resolve, reject) => {
            const onReady = (resp: LoaderResponse) => {
                if (resp.id === "ready") {
                    resolve();
                    return;
                }
                reject(new Error(`unexpected pre-ready message: ${JSON.stringify(resp)}`));
            };
            this.pending.set(-1, onReady);
            this.proc.once("error", reject);
            this.proc.once("exit", (code) => {
                if (code !== 0 && this.pending.size > 0) {
                    reject(new Error(`bridge loader exited prematurely with code ${code}`));
                }
            });
        });
        this.proc.stdout.on("data", (chunk: Buffer) => {
            this.buffer += chunk.toString();
            let idx: number;
            while ((idx = this.buffer.indexOf("\n")) >= 0) {
                const line = this.buffer.slice(0, idx).trim();
                this.buffer = this.buffer.slice(idx + 1);
                if (!line) continue;
                let resp: LoaderResponse;
                try {
                    resp = JSON.parse(line) as LoaderResponse;
                } catch {
                    continue;
                }
                if (resp.id === "ready") {
                    const r = this.pending.get(-1);
                    if (r) {
                        this.pending.delete(-1);
                        r(resp);
                    }
                    continue;
                }
                const cb = this.pending.get(resp.id as number);
                if (cb) {
                    this.pending.delete(resp.id as number);
                    cb(resp);
                }
            }
        });
    }

    ready(): Promise<void> { return this.readyPromise; }

    call<T = unknown>(op: string, args: unknown[] = []): Promise<T> {
        const id = this.nextId++;
        const req: LoaderRequest = { id, op, args };
        return new Promise((resolve, reject) => {
            this.pending.set(id, (resp) => {
                if (resp.ok) resolve(resp.result as T);
                else reject(new Error(resp.error ?? "unknown loader error"));
            });
            this.proc.stdin.write(JSON.stringify(req) + "\n");
        });
    }

    async close(): Promise<void> {
        if (this.proc.killed) return;
        this.proc.stdin.end();
        await new Promise<void>((resolve) => this.proc.once("exit", () => resolve()));
    }
}

let bridge: BridgeLoader;

beforeAll(async () => {
    bridge = new BridgeLoader();
    await bridge.ready();
});

afterAll(async () => {
    await bridge.close();
});

const hasTool = (set: string, name: string) => bridge.call<boolean>("has_tool", [set, name]);
const fallbackPayload = (name: string, args: Record<string, unknown> = {}) =>
    bridge.call<Record<string, unknown> | null>("fallback_payload", [name, args]);
const tryFallback = (req: Record<string, unknown>) =>
    bridge.call<{ handled: boolean; captured: string[] }>("try_fallback", [req]);
const normalizeHttp = (req: Record<string, unknown>, text: string) =>
    bridge.call<string>("normalize_http_response", [req, text]);

describe("mcp-bridge local-fs fallback", () => {
    test("READ_ONLY_TOOLS membership", async () => {
        for (const name of [
            "get_manifest",
            "get_theorem_candidate",
            "get_obligations",
            "get_obligation",
            "get_open_gaps",
            "get_implementation_health",
            "get_history",
            "get_experiment",
            "get_same_object_certificate",
        ]) {
            expect(await hasTool("READ_ONLY_TOOLS", name)).toBe(true);
        }
    });

    test("RUN_CONTROL_TOOLS membership", async () => {
        for (const name of [
            "start_run",
            "start_custom_run",
            "resume_run",
            "cancel_run",
            "get_run_status",
            "get_run_logs",
            "get_run_events",
        ]) {
            expect(await hasTool("RUN_CONTROL_TOOLS", name)).toBe(true);
        }
    });

    test("READ_ONLY_TOOLS includes proof-discovery read tools", async () => {
        for (const name of [
            "list_experiment_reviews",
            "get_experiment_review",
            "get_experiment_raw_data",
            "get_experiment_model_comparison",
            "list_candidate_lemmas",
            "get_candidate_lemma",
            "list_baseline_hypotheses",
            "get_baseline_hypothesis",
            "get_proof_discovery_index",
            "list_hypothesis_proposals",
            "get_hypothesis_proposal",
        ]) {
            expect(await hasTool("READ_ONLY_TOOLS", name)).toBe(true);
        }
    });

    test("MUTATION_TOOLS membership and disjoint from READ_ONLY_TOOLS", async () => {
        const mutationNames = await bridge.call<string[]>("tool_set_to_array", ["MUTATION_TOOLS"]);
        for (const name of [
            "propose_baseline_update",
            "accept_hypothesis_proposal",
            "reject_hypothesis_proposal",
        ]) {
            expect(mutationNames).toContain(name);
        }
        for (const name of mutationNames) {
            expect(await hasTool("READ_ONLY_TOOLS", name)).toBe(false);
        }
    });

    test("fallbackPayload(get_history) returns current-run history payload", async () => {
        const out = (await fallbackPayload("get_history", { limit: 1 })) as {
            entries: unknown[]; total: number; historical_comparison_enabled: boolean;
        };
        expect(Array.isArray(out.entries)).toBe(true);
        expect(out.total).toBeGreaterThanOrEqual(0);
        expect(out.historical_comparison_enabled).toBe(false);
    });

    test("fallbackPayload(get_manifest) exposes experiment display aliases", async () => {
        const out = (await fallbackPayload("get_manifest", {})) as {
            experiment_aliases: Record<string, string>;
            experiments: { stable_id?: string; display_id?: string }[];
        };
        expect(out.experiment_aliases["CORE-1"]).toBe("EXP_1");
        expect(out.experiment_aliases["core-1"]).toBe("EXP_1");
        expect(out.experiment_aliases["DEMO-1"]).toBe("EXP_9");
        expect(out.experiments.some((exp) => exp.stable_id === "EXP_1" && exp.display_id === "CORE-1")).toBe(true);
    });

    test("fallbackPayload(get_obligation) returns the requested obligation", async () => {
        const out = (await fallbackPayload("get_obligation", { id: "OBL_BETA_INVARIANCE" })) as {
            id: string; witnesses: unknown[];
        };
        expect(out).not.toBeNull();
        expect(out.id).toBe("OBL_BETA_INVARIANCE");
        expect(Array.isArray(out.witnesses)).toBe(true);
    });

    test("fallbackPayload(get_experiment) reflects the current artifact state", async () => {
        const out = (await fallbackPayload("get_experiment", { id: "EXP_6" })) as
            | { function: string; obligation_id: string; mapping_provisional?: boolean }
            | null;
        if (out === null) {
            expect(out).toBeNull();
            return;
        }
        expect(out.function).toBe("PROOF_OBLIGATION_WITNESS");
        expect(out.obligation_id).toBe("OBL_BETA_INVARIANCE");
        if ("mapping_provisional" in out) {
            expect(typeof out.mapping_provisional).toBe("boolean");
        }
    });

    test("fallbackPayload(get_experiment) resolves display aliases", async () => {
        const stable = await fallbackPayload("get_experiment", { id: "EXP_1" });
        const alias = await fallbackPayload("get_experiment", { id: "CORE-1" });
        expect(alias).toEqual(stable);
    });

    test("fallbackPayload(list_baseline_hypotheses) returns proof-discovery envelope", async () => {
        const out = (await fallbackPayload("list_baseline_hypotheses", {})) as {
            ok: boolean; schema_version: string; data: { baselines: unknown[] }; errors: string[];
        };
        expect(out).not.toBeNull();
        expect(out.ok).toBe(true);
        expect(out.schema_version).toMatch(/proof-discovery-api/);
        expect(Array.isArray(out.data.baselines)).toBe(true);
        expect(out.data.baselines.length).toBeGreaterThanOrEqual(14);
        expect(out.errors).toEqual([]);
    });

    test("fallbackPayload(get_baseline_hypothesis) resolves stable + display + alias ids", async () => {
        for (const id of ["EXP_2B", "P2-2", "p2-2", "rogue-isolation"]) {
            const out = (await fallbackPayload("get_baseline_hypothesis", { id })) as {
                ok: boolean; data: { experiment_ids: string[] };
            };
            expect(out.ok).toBe(true);
            expect(out.data.experiment_ids).toContain("EXP_2B");
        }
    });

    test("fallbackPayload(get_baseline_hypothesis) on invalid id returns ok=false envelope (no throw)", async () => {
        const out = (await fallbackPayload("get_baseline_hypothesis", { id: "NOT_AN_ID" })) as {
            ok: boolean; data: unknown; errors: string[];
        };
        expect(out.ok).toBe(false);
        expect(out.errors.length).toBeGreaterThan(0);
        expect(out.data).toBeNull();
    });

    test("tryFallback emits a tools/call result for a read-only tool when HTTP is down", async () => {
        const { handled, captured } = await tryFallback({
            jsonrpc: "2.0",
            id: 42,
            method: "tools/call",
            params: { name: "get_obligations", arguments: {} },
        });
        expect(handled).toBe(true);
        expect(captured).toHaveLength(1);
        const parsed = JSON.parse(captured[0]);
        expect(parsed.id).toBe(42);
        expect(parsed.result.content[0].type).toBe("text");
        expect(parsed.result.content[0].text).toContain("mcp-bridge fallback");
        expect(parsed.result.isError).toBeUndefined();
    });

    test("tryFallback emits a visible isError result for a run-control tool when HTTP is down", async () => {
        const { handled, captured } = await tryFallback({
            jsonrpc: "2.0",
            id: 99,
            method: "tools/call",
            params: { name: "start_run", arguments: { mode: "smoke" } },
        });
        expect(handled).toBe(true);
        expect(captured).toHaveLength(1);
        const parsed = JSON.parse(captured[0]);
        expect(parsed.id).toBe(99);
        expect(parsed.result.isError).toBe(true);
        expect(parsed.result.content[0].text).toMatch(/start_run/);
        expect(parsed.result.content[0].text).toMatch(/npm run dev/);
    });

    test("tryFallback emits visible isError envelopes for proposal mutation tools", async () => {
        for (const name of ["propose_baseline_update", "accept_hypothesis_proposal", "reject_hypothesis_proposal"]) {
            const { handled, captured } = await tryFallback({
                jsonrpc: "2.0",
                id: 11,
                method: "tools/call",
                params: { name, arguments: {} },
            });
            expect(handled).toBe(true);
            expect(captured).toHaveLength(1);
            const parsed = JSON.parse(captured[0]);
            expect(parsed.result.isError).toBe(true);
            expect(parsed.result.content[0].text).toMatch(name);
            expect(parsed.result.content[0].text.toLowerCase()).toMatch(/auth gate|http server/);
        }
    });

    test("tryFallback returns false (does not handle) for unknown tools", async () => {
        const { handled } = await tryFallback({
            jsonrpc: "2.0",
            id: 7,
            method: "tools/call",
            params: { name: "nonexistent_tool", arguments: {} },
        });
        expect(handled).toBe(false);
    });

    test("normalizeHttpMcpResponseText wraps plain tool results from HTTP MCP endpoints", async () => {
        const out = await normalizeHttp(
            {
                jsonrpc: "2.0",
                id: 11,
                method: "tools/call",
                params: { name: "get_latest_run", arguments: {} },
            },
            JSON.stringify({
                jsonrpc: "2.0",
                id: 11,
                result: { status: "NO_CURRENT_RUN" },
            }),
        );
        const parsed = JSON.parse(out);
        expect(parsed.result.content[0].type).toBe("text");
        const payload = JSON.parse(parsed.result.content[0].text);
        expect(payload).toMatchObject({
            ok: true,
            data: { status: "NO_CURRENT_RUN" },
            warnings: [],
            errors: [],
        });
    });
});

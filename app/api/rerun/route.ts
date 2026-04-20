import { spawn, ChildProcess } from "child_process";
import path from "path";

export const dynamic = "force-dynamic";

// Concurrent-run guard. Prevents two overlapping full engine runs (which
// would clobber each other's writes to dashboard/public/experiments.json).
// Stored on globalThis so it survives Next.js hot-reload during dev.
declare global {
    // eslint-disable-next-line no-var
    var __rerunInflight: ChildProcess | null | undefined;
}

const setInflight = (proc: ChildProcess | null) => {
    globalThis.__rerunInflight = proc;
};
const getInflight = (): ChildProcess | null => globalThis.__rerunInflight ?? null;

// Five fidelity tiers exposed to the GUI. Each maps to a hardcoded argv list;
// no free-text passthrough, so the API surface stays auditable.
//
//   verify        - re-grade existing artifact (seconds)
//   smoke         - 100 zeros, dps=30 (~1min). Plumbing check only.
//   standard      - 2000 zeros, dps=40 (~5min). Iterative-dev fidelity.
//   authoritative - 20k zeros, dps=50 (20-40min). Evidence-grade run.
//   overkill      - Odlyzko 100k zeros, dps=80 (1h+). Stress test.
type Mode = "verify" | "smoke" | "standard" | "authoritative" | "overkill";

const MODES: Mode[] = ["verify", "smoke", "standard", "authoritative", "overkill"];

function argvForMode(mode: Mode, cwd: string): string[] {
    const verifier = path.resolve(cwd, "verifier.py");
    const engine = path.resolve(cwd, "experiment_engine.py");
    switch (mode) {
        case "verify":
            return ["-u", verifier];
        case "smoke":
            return ["-u", engine, "--run", "all", "--quick"];
        case "standard":
            return ["-u", engine, "--run", "all", "--zero-count", "2000", "--dps", "40"];
        case "authoritative":
            return ["-u", engine, "--run", "all"];
        case "overkill":
            return [
                "-u",
                engine,
                "--run",
                "all",
                "--zero-source",
                "file:agent_context/zeros_100K_three_ten_power_neg_nine.gz",
                "--dps",
                "80",
            ];
    }
}

function spawnForMode(mode: Mode, cwd: string) {
    return spawn("python", argvForMode(mode, cwd), { cwd });
}

export async function POST(request: Request) {
    const body = (await request.json().catch(() => ({}))) as { mode?: string };
    const mode: Mode = MODES.includes(body.mode as Mode) ? (body.mode as Mode) : "verify";

    const existing = getInflight();
    if (existing && existing.exitCode === null) {
        return new Response(
            JSON.stringify({ error: "A re-run is already in progress." }),
            { status: 409, headers: { "Content-Type": "application/json" } }
        );
    }

    const encoder = new TextEncoder();
    const cwd = path.resolve(process.cwd(), "..");

    const stream = new ReadableStream({
        start(controller) {
            const proc = spawnForMode(mode, cwd);
            setInflight(proc);

            const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
            send(`[rerun] mode=${mode} cwd=${cwd}\n`);

            proc.stdout.on("data", (d) => send(d.toString()));
            proc.stderr.on("data", (d) => send(`[STDERR] ${d.toString()}`));
            proc.on("close", (code) => {
                send(`\n[rerun] process exited with code ${code}\n`);
                setInflight(null);
                controller.close();
            });
            proc.on("error", (err) => {
                send(`\n[rerun] failed to start: ${err.message}\n`);
                setInflight(null);
                controller.close();
            });
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Transfer-Encoding": "chunked",
            "Cache-Control": "no-store",
        },
    });
}

export async function GET() {
    const existing = getInflight();
    return new Response(
        JSON.stringify({
            inflight: existing ? existing.exitCode === null : false,
            pid: existing?.pid ?? null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
    );
}

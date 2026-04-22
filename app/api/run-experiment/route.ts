import path from "path";
import { assertRunAuth } from "../../../lib/run-auth";
import { getRunLogs, getRunStatus, startCustomRun } from "../../../lib/run-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const streamRunLogs = (runId: string) => {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            let offset = 0;
            const timer = setInterval(() => {
                const page = getRunLogs(runId, offset);
                if (!page) {
                    controller.enqueue(encoder.encode("[run] log stream unavailable\n"));
                    clearInterval(timer);
                    controller.close();
                    return;
                }
                if (page.chunk) controller.enqueue(encoder.encode(page.chunk));
                offset = page.next;
                if (page.done) {
                    clearInterval(timer);
                    controller.close();
                }
            }, 120);
        },
    });
};

export async function GET(request: Request) {
    const auth = assertRunAuth(request);
    if (auth) return auth;

    const { searchParams } = new URL(request.url);
    const runScope = searchParams.get("run") || "all";
    const zeroSource = searchParams.get("zero_source") || "generated";
    const zeroCount = searchParams.get("zero_count");
    const dps = searchParams.get("dps");
    const resolution = searchParams.get("resolution");
    const xStart = searchParams.get("x_start");
    const xEnd = searchParams.get("x_end");
    const betaOffset = searchParams.get("beta_offset");
    const kPower = searchParams.get("k_power");

    const args = [
        "-u",
        path.resolve(process.cwd(), "experiment_engine.py"),
        "--run",
        runScope,
        "--zero-source",
        zeroSource,
    ];

    if (zeroCount) args.push("--zero-count", zeroCount);
    if (dps) args.push("--dps", dps);
    if (resolution) args.push("--resolution", resolution);
    if (xStart) args.push("--x-start", xStart);
    if (xEnd) args.push("--x-end", xEnd);
    if (betaOffset) args.push("--beta-offset", betaOffset);
    if (kPower) args.push("--k-power", kPower);

    const started = startCustomRun(`legacy:${runScope}`, args, process.cwd());
    if ("status" in started) {
        return new Response(
            JSON.stringify({ error: started.error }),
            { status: started.status, headers: { "Content-Type": "application/json" } },
        );
    }

    const runId = started.run.run_id;
    if (!runId) {
        return new Response(
            JSON.stringify({ error: "Run manager returned an invalid run identifier." }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        );
    }

    const run = getRunStatus(runId);
    const stream = streamRunLogs(runId);
    const prefix = `[run-experiment] run_id=${runId} status=${run?.status ?? "UNKNOWN"}\n`;
    const first = new TextEncoder().encode(prefix);
    const combined = new ReadableStream({
        start(controller) {
            controller.enqueue(first);
            const reader = stream.getReader();
            const pump = (): void => {
                reader.read().then(({ done, value }) => {
                    if (done) {
                        controller.close();
                        return;
                    }
                    if (value) controller.enqueue(value);
                    pump();
                });
            };
            pump();
        },
    });

    return new Response(combined, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Transfer-Encoding": "chunked",
            "Cache-Control": "no-store",
        },
    });
}

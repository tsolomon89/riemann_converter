import { assertRunAuth } from "../../../lib/run-auth";
import { getRunLogs, getRunStatus, startCanonicalRun } from "../../../lib/run-manager";
import type { CanonicalRunMode } from "../../../lib/research-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MODES: CanonicalRunMode[] = [
    "verify",
    "smoke",
    "standard",
    "authoritative",
    "overkill",
];

const parseMode = (value: string | undefined): CanonicalRunMode =>
    MODES.includes(value as CanonicalRunMode) ? (value as CanonicalRunMode) : "verify";

const streamRunLogs = (runId: string) => {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            let offset = 0;
            const timer = setInterval(() => {
                const page = getRunLogs(runId, offset);
                if (!page) {
                    controller.enqueue(encoder.encode("[rerun] log stream unavailable\n"));
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

export async function POST(request: Request) {
    const auth = assertRunAuth(request);
    if (auth) return auth;

    const body = (await request.json().catch(() => ({}))) as { mode?: string };
    const mode = parseMode(body.mode);
    const started = startCanonicalRun(mode, process.cwd());
    if ("status" in started) {
        return new Response(
            JSON.stringify({ error: started.error }),
            { status: started.status, headers: { "Content-Type": "application/json" } },
        );
    }

    const run = getRunStatus(started.run.run_id);
    const stream = streamRunLogs(started.run.run_id);
    const prefix = `[rerun] run_id=${started.run.run_id} mode=${mode} status=${run?.status ?? "UNKNOWN"}\n`;
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

export async function GET(request: Request) {
    const auth = assertRunAuth(request);
    if (auth) return auth;

    const url = new URL(request.url);
    const runId = url.searchParams.get("run_id");
    const run = getRunStatus(runId ?? undefined);
    return new Response(
        JSON.stringify({
            inflight: run ? run.status === "QUEUED" || run.status === "RUNNING" : false,
            run,
        }),
        { headers: { "Content-Type": "application/json" } },
    );
}


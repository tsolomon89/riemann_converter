import { GET, POST } from "../app/api/research/[...segments]/route";
import { readHistory } from "../lib/research-service";

jest.mock("../lib/run-manager", () => ({
    startCanonicalRun: jest.fn(() => ({
        run: {
            run_id: "run_test",
            mode: "verify",
            status: "RUNNING",
            started_at: "2026-04-21T00:00:00.000Z",
        },
    })),
    startConfiguredRun: jest.fn((config: Record<string, unknown>) => ({
        run: {
            run_id: "run_custom",
            mode: `custom:${config.run ?? "all"}`,
            status: "RUNNING",
            started_at: "2026-04-21T00:00:00.000Z",
            run_config: config,
        },
    })),
    getRunStatus: jest.fn(() => ({
        run_id: "run_test",
        mode: "verify",
        status: "RUNNING",
        started_at: "2026-04-21T00:00:00.000Z",
    })),
    getRunLogs: jest.fn((_id: string, from: number) => ({
        run_id: "run_test",
        from,
        next: from,
        chunk: "",
        done: true,
        status: "RUNNING",
    })),
    getRunEvents: jest.fn((_id: string, from: number) => ({
        run_id: "run_test",
        from,
        next: from + 1,
        events: [
            {
                run_id: "run_test",
                index: from,
                ts: "2026-04-21T00:00:00.000Z",
                kind: "PROGRESS",
                phase: "EXPERIMENT_LOOP",
                percent: 25,
            },
        ],
        done: false,
        status: "RUNNING",
    })),
    cancelRun: jest.fn(() => ({
        run: {
            run_id: "run_test",
            status: "CANCELLING",
            cancelled_at: "2026-04-21T00:00:00.000Z",
        },
    })),
    resumeCanonicalRun: jest.fn(() => ({
        run: {
            run_id: "run_resumed",
            mode: "verify",
            status: "RUNNING",
            resumed_from_checkpoint: true,
            checkpoint_path: ".runtime/checkpoints/canonical-verify.checkpoint.json",
        },
    })),
}));

const ctx = (...segments: string[]) => ({ params: { segments } });

const parse = async (response: Response) => {
    const body = await response.json();
    return { status: response.status, body };
};

const expectEnvelope = (body: unknown) => {
    const typed = body as { authority?: unknown; capabilities?: unknown; data?: unknown };
    expect(typed).toHaveProperty("authority");
    expect(typed).toHaveProperty("capabilities");
    expect(typed).toHaveProperty("data");
};

const runManagerMock = jest.requireMock("../lib/run-manager") as {
    getRunStatus: jest.Mock;
    startConfiguredRun: jest.Mock;
};
const BASE_ENV = {
    NODE_ENV: process.env.NODE_ENV,
    RESEARCH_RUN_TOKEN: process.env.RESEARCH_RUN_TOKEN,
    RESEARCH_READ_ONLY: process.env.RESEARCH_READ_ONLY,
    RESEARCH_ENABLE_HOSTED_RUNS: process.env.RESEARCH_ENABLE_HOSTED_RUNS,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
};

const setEnv = (key: keyof typeof BASE_ENV, value: string | undefined) => {
    const env = process.env as Record<string, string | undefined>;
    if (value === undefined) {
        delete env[key];
        return;
    }
    env[key] = value;
};

const restoreEnv = () => {
    setEnv("NODE_ENV", BASE_ENV.NODE_ENV);
    setEnv("RESEARCH_RUN_TOKEN", BASE_ENV.RESEARCH_RUN_TOKEN);
    setEnv("RESEARCH_READ_ONLY", BASE_ENV.RESEARCH_READ_ONLY);
    setEnv("RESEARCH_ENABLE_HOSTED_RUNS", BASE_ENV.RESEARCH_ENABLE_HOSTED_RUNS);
    setEnv("VERCEL", BASE_ENV.VERCEL);
    setEnv("VERCEL_ENV", BASE_ENV.VERCEL_ENV);
};

describe("/api/research contract routes", () => {
    afterEach(() => {
        restoreEnv();
    });

    it("blocks run routes in read-only deployments", async () => {
        process.env.RESEARCH_READ_ONLY = "";
        process.env.RESEARCH_ENABLE_HOSTED_RUNS = "";
        process.env.VERCEL = "1";
        process.env.VERCEL_ENV = "production";

        const start = await POST(
            new Request("http://localhost/api/research/run", {
                method: "POST",
                body: JSON.stringify({ mode: "verify" }),
                headers: { "Content-Type": "application/json" },
            }),
            ctx("run"),
        );
        expect(start.status).toBe(403);
        expect(await start.json()).toMatchObject({ code: "READ_ONLY_DEPLOYMENT" });

        const status = await GET(
            new Request("http://localhost/api/research/run?run_id=run_test"),
            ctx("run"),
        );
        expect(status.status).toBe(403);
        expect(await status.json()).toMatchObject({ code: "READ_ONLY_DEPLOYMENT" });

        const logs = await GET(
            new Request("http://localhost/api/research/run/logs?run_id=run_test&from=0"),
            ctx("run", "logs"),
        );
        expect(logs.status).toBe(403);
        expect(await logs.json()).toMatchObject({ code: "READ_ONLY_DEPLOYMENT" });

        const events = await GET(
            new Request("http://localhost/api/research/run/events?run_id=run_test&from=0"),
            ctx("run", "events"),
        );
        expect(events.status).toBe(403);
        expect(await events.json()).toMatchObject({ code: "READ_ONLY_DEPLOYMENT" });

        const cancel = await POST(
            new Request("http://localhost/api/research/run/cancel", {
                method: "POST",
                body: JSON.stringify({ run_id: "run_test" }),
                headers: { "Content-Type": "application/json" },
            }),
            ctx("run", "cancel"),
        );
        expect(cancel.status).toBe(403);
        expect(await cancel.json()).toMatchObject({ code: "READ_ONLY_DEPLOYMENT" });

        const resume = await POST(
            new Request("http://localhost/api/research/run/resume", {
                method: "POST",
                body: JSON.stringify({ mode: "verify" }),
                headers: { "Content-Type": "application/json" },
            }),
            ctx("run", "resume"),
        );
        expect(resume.status).toBe(403);
        expect(await resume.json()).toMatchObject({ code: "READ_ONLY_DEPLOYMENT" });
    });

    it("returns envelope for manifest", async () => {
        const res = await GET(new Request("http://localhost/api/research/manifest"), ctx("manifest"));
        const { status, body } = await parse(res);
        expect(status).toBe(200);
        expectEnvelope(body);
    });

    it("returns envelope for theorem-candidate", async () => {
        const res = await GET(
            new Request("http://localhost/api/research/theorem-candidate"),
            ctx("theorem-candidate"),
        );
        const { status, body } = await parse(res);
        expect(status).toBe(200);
        expectEnvelope(body);
    });

    it("returns envelope for obligations and obligation by id", async () => {
        const listRes = await GET(new Request("http://localhost/api/research/obligations"), ctx("obligations"));
        const list = await parse(listRes);
        expect(list.status).toBe(200);
        expectEnvelope(list.body);
        const first = (list.body as { data: { obligations: Array<{ id: string }> } }).data.obligations[0];
        expect(first?.id).toBeTruthy();

        const oneRes = await GET(
            new Request(`http://localhost/api/research/obligations/${first.id}`),
            ctx("obligations", first.id),
        );
        const one = await parse(oneRes);
        expect(one.status).toBe(200);
        expectEnvelope(one.body);
    });

    it("returns envelope for open-gaps and implementation-health", async () => {
        const gaps = await parse(
            await GET(new Request("http://localhost/api/research/open-gaps"), ctx("open-gaps")),
        );
        expect(gaps.status).toBe(200);
        expectEnvelope(gaps.body);

        const health = await parse(
            await GET(
                new Request("http://localhost/api/research/implementation-health"),
                ctx("implementation-health"),
            ),
        );
        expect(health.status).toBe(200);
        expectEnvelope(health.body);
    });

    it("returns envelope for history", async () => {
        const res = await GET(
            new Request("http://localhost/api/research/history?limit=5"),
            ctx("history"),
        );
        const { status, body } = await parse(res);
        expect(status).toBe(200);
        expectEnvelope(body);
    });

    it("returns envelope for experiment and series", async () => {
        const manifest = await parse(
            await GET(new Request("http://localhost/api/research/manifest"), ctx("manifest")),
        );
        const experimentIds =
            (manifest.body as { data?: { experiment_ids?: string[] } }).data?.experiment_ids ?? [];
        if (experimentIds.length === 0) {
            expect(experimentIds).toEqual([]);
            return;
        }
        const referenceExperiment = experimentIds.includes("EXP_1")
            ? "EXP_1"
            : experimentIds[0];

        const exp = await parse(
            await GET(
                new Request(`http://localhost/api/research/experiments/${referenceExperiment}`),
                ctx("experiments", referenceExperiment),
            ),
        );
        expect(exp.status).toBe(200);
        expectEnvelope(exp.body);

        if (experimentIds.includes("EXP_1")) {
            const series = await parse(
                await GET(
                    new Request("http://localhost/api/research/experiments/EXP_1/series?k=0&downsample=50"),
                    ctx("experiments", "EXP_1", "series"),
                ),
            );
            expect(series.status).toBe(200);
            expectEnvelope(series.body);
        }
    });

    it("returns 400 for unsupported query combinations", async () => {
        const manifest = await parse(
            await GET(new Request("http://localhost/api/research/manifest"), ctx("manifest")),
        );
        const experimentIds =
            (manifest.body as { data?: { experiment_ids?: string[] } }).data?.experiment_ids ?? [];

        if (experimentIds.includes("EXP_1B")) {
            const invalid = await parse(
                await GET(
                    new Request("http://localhost/api/research/experiments/EXP_1B/series?variant=bad"),
                    ctx("experiments", "EXP_1B", "series"),
                ),
            );
            expect(invalid.status).toBe(400);
            return;
        }

        if (experimentIds.includes("EXP_2")) {
            const invalid = await parse(
                await GET(
                    new Request("http://localhost/api/research/experiments/EXP_2/series?variant=bad"),
                    ctx("experiments", "EXP_2", "series"),
                ),
            );
            expect(invalid.status).toBe(400);
            return;
        }

        if (experimentIds.includes("EXP_3")) {
            const invalid = await parse(
                await GET(
                    new Request("http://localhost/api/research/experiments/EXP_3/series?variant=bad"),
                    ctx("experiments", "EXP_3", "series"),
                ),
            );
            expect(invalid.status).toBe(400);
        }
    });

    it("returns envelope for compare routes", async () => {
        const manifest = await parse(
            await GET(new Request("http://localhost/api/research/manifest"), ctx("manifest")),
        );
        const experimentIds =
            (manifest.body as { data?: { experiment_ids?: string[] } }).data?.experiment_ids ?? [];

        if (experimentIds.includes("EXP_1")) {
            const scales = await parse(
                await GET(
                    new Request("http://localhost/api/research/compare/scales?experiment=EXP_1&k=-1,0,1"),
                    ctx("compare", "scales"),
                ),
            );
            expect(scales.status).toBe(200);
            expectEnvelope(scales.body);
        }

        const history = readHistory();
        if (history.length < 2) {
            expect(history.length).toBeLessThan(2);
            return;
        }
        const runA = history[history.length - 1].timestamp;
        const runB = history[history.length - 2].timestamp;

        const runs = await parse(
            await GET(
                new Request(`http://localhost/api/research/compare/runs?runA=${encodeURIComponent(runA)}&runB=${encodeURIComponent(runB)}`),
                ctx("compare", "runs"),
            ),
        );
        expect(runs.status).toBe(200);
        expectEnvelope(runs.body);

        const verdicts = await parse(
            await GET(
                new Request(`http://localhost/api/research/compare/verdicts?runA=${encodeURIComponent(runA)}&runB=${encodeURIComponent(runB)}`),
                ctx("compare", "verdicts"),
            ),
        );
        expect(verdicts.status).toBe(200);
        expectEnvelope(verdicts.body);
    });

    it("returns deterministic IDLE payload when no run exists", async () => {
        runManagerMock.getRunStatus.mockReturnValueOnce(null);
        const res = await GET(new Request("http://localhost/api/research/run"), ctx("run"));
        const { status, body } = await parse(res);
        expect(status).toBe(200);
        expectEnvelope(body);
        expect((body as { data: { status: string } }).data.status).toBe("IDLE");
    });

    it("run routes require auth in production", async () => {
        const oldNodeEnv = process.env.NODE_ENV;
        const oldToken = process.env.RESEARCH_RUN_TOKEN;
        const oldReadOnly = process.env.RESEARCH_READ_ONLY;
        const oldEnableHosted = process.env.RESEARCH_ENABLE_HOSTED_RUNS;
        const oldVercel = process.env.VERCEL;
        const oldVercelEnv = process.env.VERCEL_ENV;
        setEnv("NODE_ENV", "production");
        process.env.RESEARCH_RUN_TOKEN = "secret-token";
        process.env.RESEARCH_READ_ONLY = "";
        process.env.RESEARCH_ENABLE_HOSTED_RUNS = "true";
        process.env.VERCEL = "";
        process.env.VERCEL_ENV = "";
        try {
            const unauth = await POST(
                new Request("http://localhost/api/research/run", {
                    method: "POST",
                    body: JSON.stringify({ mode: "verify" }),
                    headers: { "Content-Type": "application/json" },
                }),
                ctx("run"),
            );
            expect(unauth.status).toBe(401);

            const auth = await POST(
                new Request("http://localhost/api/research/run", {
                    method: "POST",
                    body: JSON.stringify({ mode: "verify" }),
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: "Bearer secret-token",
                    },
                }),
                ctx("run"),
            );
            expect(auth.status).toBe(202);

            const statusUnauth = await GET(
                new Request("http://localhost/api/research/run?run_id=run_test"),
                ctx("run"),
            );
            expect(statusUnauth.status).toBe(401);

            const logsUnauth = await GET(
                new Request("http://localhost/api/research/run/logs?run_id=run_test&from=0"),
                ctx("run", "logs"),
            );
            expect(logsUnauth.status).toBe(401);

            const eventsUnauth = await GET(
                new Request("http://localhost/api/research/run/events?run_id=run_test&from=0"),
                ctx("run", "events"),
            );
            expect(eventsUnauth.status).toBe(401);

            const cancelUnauth = await POST(
                new Request("http://localhost/api/research/run/cancel", {
                    method: "POST",
                    body: JSON.stringify({ run_id: "run_test" }),
                    headers: { "Content-Type": "application/json" },
                }),
                ctx("run", "cancel"),
            );
            expect(cancelUnauth.status).toBe(401);

            const resumeUnauth = await POST(
                new Request("http://localhost/api/research/run/resume", {
                    method: "POST",
                    body: JSON.stringify({ mode: "verify" }),
                    headers: { "Content-Type": "application/json" },
                }),
                ctx("run", "resume"),
            );
            expect(resumeUnauth.status).toBe(401);
        } finally {
            setEnv("NODE_ENV", oldNodeEnv);
            setEnv("RESEARCH_RUN_TOKEN", oldToken);
            setEnv("RESEARCH_READ_ONLY", oldReadOnly);
            setEnv("RESEARCH_ENABLE_HOSTED_RUNS", oldEnableHosted);
            setEnv("VERCEL", oldVercel);
            setEnv("VERCEL_ENV", oldVercelEnv);
        }
    });

    it("supports run events/cancel/resume routes", async () => {
        process.env.RESEARCH_READ_ONLY = "";
        process.env.RESEARCH_ENABLE_HOSTED_RUNS = "true";
        process.env.VERCEL = "";
        process.env.VERCEL_ENV = "";

        const events = await GET(
            new Request("http://localhost/api/research/run/events?run_id=run_test&from=0"),
            ctx("run", "events"),
        );
        expect(events.status).toBe(200);
        expectEnvelope(await events.json());

        const cancel = await POST(
            new Request("http://localhost/api/research/run/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ run_id: "run_test" }),
            }),
            ctx("run", "cancel"),
        );
        expect(cancel.status).toBe(200);
        expectEnvelope(await cancel.json());

        const resume = await POST(
            new Request("http://localhost/api/research/run/resume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "verify" }),
            }),
            ctx("run", "resume"),
        );
        expect(resume.status).toBe(202);
        expectEnvelope(await resume.json());
    });

    it("starts custom sidebar runs through the unified research run route", async () => {
        process.env.RESEARCH_READ_ONLY = "";
        process.env.RESEARCH_ENABLE_HOSTED_RUNS = "true";
        process.env.VERCEL = "";
        process.env.VERCEL_ENV = "";

        const res = await POST(
            new Request("http://localhost/api/research/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    kind: "custom",
                    custom: {
                        run: "1,6",
                        zero_source: "generated",
                        zero_count: 100,
                        dps: 30,
                    },
                }),
            }),
            ctx("run"),
        );
        expect(res.status).toBe(202);
        const body = await res.json();
        expectEnvelope(body);
        expect(body.data).toMatchObject({
            run_id: "run_custom",
            mode: "custom:1,6",
            status: "RUNNING",
        });
        expect(runManagerMock.startConfiguredRun).toHaveBeenCalledWith(
            expect.objectContaining({
                run: "1,6",
                zero_source: "generated",
                zero_count: 100,
                dps: 30,
            }),
            expect.any(String),
        );
    });
});

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
}));

const ctx = (...segments: string[]) => ({ params: { segments } });

const parse = async (response: Response) => {
    const body = await response.json();
    return { status: response.status, body };
};

const expectEnvelope = (body: unknown) => {
    const typed = body as { authority?: unknown; data?: unknown };
    expect(typed).toHaveProperty("authority");
    expect(typed).toHaveProperty("data");
};

const runManagerMock = jest.requireMock("../lib/run-manager") as {
    getRunStatus: jest.Mock;
};

describe("/api/research contract routes", () => {
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
        const exp = await parse(
            await GET(new Request("http://localhost/api/research/experiments/EXP_1"), ctx("experiments", "EXP_1")),
        );
        expect(exp.status).toBe(200);
        expectEnvelope(exp.body);

        const series = await parse(
            await GET(
                new Request("http://localhost/api/research/experiments/EXP_1/series?k=0&downsample=50"),
                ctx("experiments", "EXP_1", "series"),
            ),
        );
        expect(series.status).toBe(200);
        expectEnvelope(series.body);
    });

    it("returns 400 for unsupported query combinations", async () => {
        const invalid = await parse(
            await GET(
                new Request("http://localhost/api/research/experiments/EXP_1B/series?variant=bad"),
                ctx("experiments", "EXP_1B", "series"),
            ),
        );
        expect(invalid.status).toBe(400);
    });

    it("returns envelope for compare routes", async () => {
        const scales = await parse(
            await GET(
                new Request("http://localhost/api/research/compare/scales?experiment=EXP_1&k=-1,0,1"),
                ctx("compare", "scales"),
            ),
        );
        expect(scales.status).toBe(200);
        expectEnvelope(scales.body);

        const history = readHistory();
        expect(history.length).toBeGreaterThan(1);
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
        process.env.NODE_ENV = "production";
        process.env.RESEARCH_RUN_TOKEN = "secret-token";
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
        } finally {
            process.env.NODE_ENV = oldNodeEnv;
            process.env.RESEARCH_RUN_TOKEN = oldToken;
        }
    });
});

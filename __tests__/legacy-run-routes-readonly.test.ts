import { GET as GET_RERUN, POST as POST_RERUN } from "../app/api/rerun/route";

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
    getRunLogs: jest.fn(() => ({
        run_id: "run_test",
        from: 0,
        next: 0,
        chunk: "",
        done: true,
        status: "RUNNING",
    })),
}));

const BASE_ENV = {
    RESEARCH_READ_ONLY: process.env.RESEARCH_READ_ONLY,
    RESEARCH_ENABLE_HOSTED_RUNS: process.env.RESEARCH_ENABLE_HOSTED_RUNS,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
};

const setEnv = (key: keyof typeof BASE_ENV, value: string | undefined) => {
    if (value === undefined) {
        delete process.env[key];
        return;
    }
    process.env[key] = value;
};

const restoreEnv = () => {
    setEnv("RESEARCH_READ_ONLY", BASE_ENV.RESEARCH_READ_ONLY);
    setEnv("RESEARCH_ENABLE_HOSTED_RUNS", BASE_ENV.RESEARCH_ENABLE_HOSTED_RUNS);
    setEnv("VERCEL", BASE_ENV.VERCEL);
    setEnv("VERCEL_ENV", BASE_ENV.VERCEL_ENV);
};

describe("compat run routes respect read-only policy", () => {
    afterEach(() => {
        restoreEnv();
    });

    it("blocks /api/rerun GET+POST in read-only mode", async () => {
        process.env.RESEARCH_READ_ONLY = "";
        process.env.RESEARCH_ENABLE_HOSTED_RUNS = "";
        process.env.VERCEL = "1";
        process.env.VERCEL_ENV = "production";

        const post = await POST_RERUN(
            new Request("http://localhost/api/rerun", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "verify" }),
            }),
        );
        expect(post.status).toBe(403);
        expect(await post.json()).toMatchObject({ code: "READ_ONLY_DEPLOYMENT" });

        const get = await GET_RERUN(new Request("http://localhost/api/rerun?run_id=run_test"));
        expect(get.status).toBe(403);
        expect(await get.json()).toMatchObject({ code: "READ_ONLY_DEPLOYMENT" });
    });
});

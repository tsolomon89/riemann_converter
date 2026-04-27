import {
    READ_ONLY_DEPLOYMENT_CODE,
    READ_ONLY_DEPLOYMENT_MESSAGE,
    getDeploymentCapabilities,
    getReadOnlyErrorPayload,
} from "../lib/deployment-policy";

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

describe("deployment policy", () => {
    afterEach(() => {
        restoreEnv();
    });

    it("enables run controls for local dev defaults", () => {
        delete process.env.RESEARCH_READ_ONLY;
        delete process.env.RESEARCH_ENABLE_HOSTED_RUNS;
        delete process.env.VERCEL;
        delete process.env.VERCEL_ENV;

        const caps = getDeploymentCapabilities();
        expect(caps.read_only_deployment).toBe(false);
        expect(caps.run_controls_enabled).toBe(true);
        expect(caps.read_only_reason).toBe("ENABLED");
    });

    it("defaults Vercel deployments to read-only", () => {
        process.env.VERCEL = "1";
        process.env.VERCEL_ENV = "production";
        process.env.RESEARCH_READ_ONLY = "";
        process.env.RESEARCH_ENABLE_HOSTED_RUNS = "";

        const caps = getDeploymentCapabilities();
        expect(caps.read_only_deployment).toBe(true);
        expect(caps.run_controls_enabled).toBe(false);
        expect(caps.read_only_reason).toBe("HOSTED_READ_ONLY");
    });

    it("allows hosted override when explicitly enabled", () => {
        process.env.VERCEL = "1";
        process.env.VERCEL_ENV = "preview";
        process.env.RESEARCH_READ_ONLY = "";
        process.env.RESEARCH_ENABLE_HOSTED_RUNS = "true";

        const caps = getDeploymentCapabilities();
        expect(caps.read_only_deployment).toBe(false);
        expect(caps.run_controls_enabled).toBe(true);
        expect(caps.read_only_reason).toBe("ENABLED");
    });

    it("forces read-only when RESEARCH_READ_ONLY is true", () => {
        process.env.VERCEL = "";
        process.env.VERCEL_ENV = "";
        process.env.RESEARCH_ENABLE_HOSTED_RUNS = "true";
        process.env.RESEARCH_READ_ONLY = "true";

        const caps = getDeploymentCapabilities();
        expect(caps.read_only_deployment).toBe(true);
        expect(caps.run_controls_enabled).toBe(false);
        expect(caps.read_only_reason).toBe("HOSTED_READ_ONLY");
    });

    it("uses the standardized read-only error payload", () => {
        const payload = getReadOnlyErrorPayload();
        expect(payload).toEqual({
            error: READ_ONLY_DEPLOYMENT_MESSAGE,
            code: READ_ONLY_DEPLOYMENT_CODE,
        });
    });
});


export type DeploymentReadOnlyReason = "HOSTED_READ_ONLY" | "ENABLED";

export interface DeploymentCapabilities {
    read_only_deployment: boolean;
    run_controls_enabled: boolean;
    read_only_reason?: DeploymentReadOnlyReason;
}

export const READ_ONLY_DEPLOYMENT_CODE = "READ_ONLY_DEPLOYMENT";
export const READ_ONLY_DEPLOYMENT_MESSAGE =
    "Hosted deployment is read-only. Fork/download from GitHub to run experiments locally.";

const TRUE_LIKE = new Set(["1", "true", "yes", "on"]);

const envFlagTrue = (value: string | undefined) =>
    value ? TRUE_LIKE.has(value.trim().toLowerCase()) : false;

const isHostedVercel = () =>
    envFlagTrue(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);

export const getDeploymentCapabilities = (): DeploymentCapabilities => {
    const forcedReadOnly = envFlagTrue(process.env.RESEARCH_READ_ONLY);
    const hostedRunOptIn = envFlagTrue(process.env.RESEARCH_ENABLE_HOSTED_RUNS);

    if (forcedReadOnly) {
        return {
            read_only_deployment: true,
            run_controls_enabled: false,
            read_only_reason: "HOSTED_READ_ONLY",
        };
    }

    if (isHostedVercel() && !hostedRunOptIn) {
        return {
            read_only_deployment: true,
            run_controls_enabled: false,
            read_only_reason: "HOSTED_READ_ONLY",
        };
    }

    return {
        read_only_deployment: false,
        run_controls_enabled: true,
        read_only_reason: "ENABLED",
    };
};

export const getReadOnlyErrorPayload = () => ({
    error: READ_ONLY_DEPLOYMENT_MESSAGE,
    code: READ_ONLY_DEPLOYMENT_CODE,
});

export const getReadOnlyErrorResponse = () =>
    new Response(JSON.stringify(getReadOnlyErrorPayload()), {
        status: 403,
        headers: { "Content-Type": "application/json" },
    });


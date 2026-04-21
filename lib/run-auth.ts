const LOCAL_NODE_ENVS = new Set(["development", "test"]);

export const isRunAuthEnforced = () =>
    !LOCAL_NODE_ENVS.has(process.env.NODE_ENV ?? "development");

const parseBearer = (value: string | null): string | null => {
    if (!value) return null;
    const [scheme, token] = value.split(" ");
    if (!scheme || !token) return null;
    if (scheme.toLowerCase() !== "bearer") return null;
    return token.trim();
};

export const assertRunAuth = (request: Request): Response | null => {
    if (!isRunAuthEnforced()) return null;

    const expected = process.env.RESEARCH_RUN_TOKEN;
    if (!expected) {
        return new Response(
            JSON.stringify({ error: "RESEARCH_RUN_TOKEN is not configured." }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            },
        );
    }

    const token = parseBearer(request.headers.get("authorization"));
    if (!token || token !== expected) {
        return new Response(
            JSON.stringify({ error: "Unauthorized." }),
            {
                status: 401,
                headers: { "Content-Type": "application/json" },
            },
        );
    }

    return null;
};


import { NextResponse } from "next/server";
import {
    ApiError,
    compareRunsEnvelope,
    compareScalesEnvelope,
    compareVerdictsEnvelope,
    getExperimentEnvelope,
    getHistoryEnvelope,
    getImplementationHealthEnvelope,
    getManifestEnvelope,
    getObligationEnvelope,
    getObligationsEnvelope,
    getOpenGapsEnvelope,
    getRunLogsEnvelope,
    getRunStatusEnvelope,
    getSeriesEnvelope,
    getTheoremCandidateEnvelope,
    parseCanonicalMode,
    startRunEnvelope,
} from "../../../../lib/research-api";
import { assertRunAuth } from "../../../../lib/run-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params?: { segments?: string[] } | Promise<{ segments?: string[] }> };

const resolveSegments = async (context: RouteContext): Promise<string[]> => {
    const params = context.params ? await context.params : {};
    const segments = params?.segments;
    return Array.isArray(segments) ? segments : [];
};

const handleError = (error: unknown) => {
    if (error instanceof ApiError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: `Internal error: ${String(error)}` }, { status: 500 });
};

const dispatchGet = async (request: Request, segments: string[]) => {
    const [head, id, tail] = segments;
    const url = new URL(request.url);

    if (segments.length === 1 && head === "manifest") {
        return NextResponse.json(getManifestEnvelope());
    }
    if (segments.length === 1 && head === "theorem-candidate") {
        return NextResponse.json(getTheoremCandidateEnvelope());
    }
    if (segments.length === 1 && head === "obligations") {
        return NextResponse.json(getObligationsEnvelope());
    }
    if (segments.length === 2 && head === "obligations" && id) {
        return NextResponse.json(getObligationEnvelope(id));
    }
    if (segments.length === 1 && head === "open-gaps") {
        return NextResponse.json(getOpenGapsEnvelope());
    }
    if (segments.length === 1 && head === "implementation-health") {
        return NextResponse.json(getImplementationHealthEnvelope());
    }
    if (segments.length === 1 && head === "history") {
        return NextResponse.json(getHistoryEnvelope(url.searchParams.get("limit")));
    }
    if (segments.length === 2 && head === "experiments" && id) {
        return NextResponse.json(getExperimentEnvelope(id));
    }
    if (segments.length === 3 && head === "experiments" && id && tail === "series") {
        return NextResponse.json(getSeriesEnvelope(id, url.searchParams));
    }
    if (segments.length === 2 && head === "compare" && id === "scales") {
        return NextResponse.json(compareScalesEnvelope(url.searchParams));
    }
    if (segments.length === 2 && head === "compare" && id === "runs") {
        return NextResponse.json(compareRunsEnvelope(url.searchParams));
    }
    if (segments.length === 2 && head === "compare" && id === "verdicts") {
        return NextResponse.json(compareVerdictsEnvelope(url.searchParams));
    }
    if (segments.length === 1 && head === "run") {
        const auth = assertRunAuth(request);
        if (auth) return auth;
        return NextResponse.json(getRunStatusEnvelope(url.searchParams.get("run_id")));
    }
    if (segments.length === 2 && head === "run" && id === "logs") {
        const auth = assertRunAuth(request);
        if (auth) return auth;
        return NextResponse.json(
            getRunLogsEnvelope(url.searchParams.get("run_id"), url.searchParams.get("from")),
        );
    }

    return NextResponse.json({ error: "Not found." }, { status: 404 });
};

const dispatchPost = async (request: Request, segments: string[]) => {
    const [head] = segments;
    if (segments.length === 1 && head === "run") {
        const auth = assertRunAuth(request);
        if (auth) return auth;
        const body = (await request.json().catch(() => ({}))) as { mode?: unknown };
        const mode = parseCanonicalMode(body.mode);
        return NextResponse.json(startRunEnvelope(mode), { status: 202 });
    }
    return NextResponse.json({ error: "Not found." }, { status: 404 });
};

export async function GET(request: Request, context: RouteContext) {
    try {
        const segments = await resolveSegments(context);
        return await dispatchGet(request, segments);
    } catch (error) {
        return handleError(error);
    }
}

export async function POST(request: Request, context: RouteContext) {
    try {
        const segments = await resolveSegments(context);
        return await dispatchPost(request, segments);
    } catch (error) {
        return handleError(error);
    }
}


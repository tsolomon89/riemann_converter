import { NextResponse } from "next/server";
import { getManifestEnvelope } from "../../../lib/research-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
    return NextResponse.json(getManifestEnvelope());
}


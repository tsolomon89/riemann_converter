import { GET } from "../app/api/research/[...segments]/route";
import { POST as MCP_POST } from "../app/mcp/route";
import { buildNextAction } from "../lib/next-action";
import type { DataPlannerOutput } from "../lib/data-planner";
import type { ExperimentsData } from "../lib/types";

const ctx = (...segments: string[]) => ({ params: { segments } });

const parse = async (response: Response) => response.json() as Promise<Record<string, unknown>>;

const mcpCall = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await MCP_POST(
        new Request("http://localhost/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: { name, arguments: args },
            }),
        }),
    );
    return res.json();
};

type McpToolBody = {
    result?: {
        content?: Array<{ type?: string; text?: string }>;
    };
};

const unwrapMcpData = (body: McpToolBody) => {
    if (!body.result) throw new Error("MCP response did not include result.");
    expect(body.result.content?.[0]?.type).toBe("text");
    const text = body.result.content?.[0]?.text;
    expect(typeof text).toBe("string");
    const parsed = JSON.parse(text as string);
    expect(parsed).toMatchObject({
        ok: true,
        warnings: expect.any(Array),
        errors: [],
    });
    return parsed.data;
};

describe("research pathfinding API and MCP surfaces", () => {
    it("exposes data assets, sufficiency, plan, next action, and precision policy routes", async () => {
        for (const route of [
            "data-assets",
            "data-sufficiency",
            "research-plan",
            "next-action",
            "precision-policy",
            "data-migration-report",
        ]) {
            const body = await parse(
                await GET(new Request(`http://localhost/api/research/${route}`), ctx(route)),
            );
            expect(body).toHaveProperty("authority");
            expect(body).toHaveProperty("capabilities");
            expect(body).toHaveProperty("data");
        }
    });

    it("MCP exposes matching next-action tools", async () => {
        const listed = await MCP_POST(
            new Request("http://localhost/mcp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "tools/list",
                    params: {},
                }),
            }),
        );
        const body = await listed.json();
        const names = ((body.result?.tools ?? []) as Array<{ name?: string }>).map((tool) => tool.name);
        for (const name of [
            "get_data_assets",
            "check_data_sufficiency",
            "get_precision_policy",
            "get_research_plan",
            "get_next_action",
            "explain_why_this_experiment_next",
            "explain_why_stop_experimenting",
            "get_data_migration_report",
        ]) {
            expect(names).toContain(name);
        }
    });

    it("MCP next action returns the same structured semantics as the HTTP route", async () => {
        const http = await parse(
            await GET(new Request("http://localhost/api/research/next-action"), ctx("next-action")),
        );
        const mcp = await mcpCall("get_next_action");
        const mcpData = unwrapMcpData(mcp);
        expect(mcpData.data.next.next_action).toBe(
            (http.data as { next: { next_action: string } }).next.next_action,
        );
    });

    it("next action fixes data-source selection before proof work when a high-dps source was bypassed", () => {
        const dataSufficiency: DataPlannerOutput = {
            status: "READY",
            mode: "same_object_certificate",
            required_assets: [{ kind: "nontrivial_zeta_zeros", count: 100000, stored_dps: 100 }],
            selected_assets: {
                zero: {
                    asset: {
                        source_path: "data/zeros/nontrivial/zeros.generated.dps_100.jsonl",
                        stored_dps: 100,
                    },
                    reason: "highest valid generated high-dps asset satisfying count + dps + guard",
                },
            },
            available_assets: [],
            missing_assets: [],
            insufficient_assets: [],
            generation_plan: [],
            warnings: [],
            errors: [],
            next_action: "run_next_research_step",
            requirements: {
                experiments: [],
                declarations: {},
                required_assets: [],
                required_stored_dps: 100,
                guard_dps: 20,
                requested_dps: 80,
            },
        };
        const artifact = {
            meta: {
                dps: 80,
                zeros: 100000,
                tau: 6.28,
                zero_source_info: {
                    source_path: "data/zeros/nontrivial/zeros_100K_three_ten_power_neg_nine.gz",
                    declared_decimals: 9,
                },
            },
        } as unknown as ExperimentsData;

        expect(buildNextAction(dataSufficiency, artifact, null)).toMatchObject({
            next_action: "FIX_PRESET_SOURCE_RESOLVER",
            blocks: ["DATA_PREFLIGHT"],
        });
    });
});
